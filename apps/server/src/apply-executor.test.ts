import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Proposal, ProposalItem, RepositoryAdapter, RepositoryFile, Snapshot, SnapshotMeta, SnapshotStore } from '@likec4-ai/core-domain';
import { openDatabase, FsSnapshotStore } from '@likec4-ai/persistence';
import { LocalRepositoryAdapter } from '@likec4-ai/repo-local-adapter';
import { ApplyConflictError, ApplyWriteError, executeApply } from './apply-executor.js';

function item(overrides: Partial<ProposalItem> & Pick<ProposalItem, 'id' | 'decision'>): ProposalItem {
  return {
    type: 'new-element',
    title: 'Item',
    explanation: { what: 'w', why: 'y', impact: 'i', confidence: 0.8, assumptions: [] },
    sources: [],
    ...overrides,
  };
}

function proposal(items: ProposalItem[]): Proposal {
  return { id: 'p1', sessionId: 's1', createdAt: new Date().toISOString(), items, status: 'under-review' };
}

class FakeRepositoryAdapter implements RepositoryAdapter {
  readonly kind = 'local' as const;
  files: Map<string, string>;
  writeFilesCalls = 0;
  writeFilesShouldThrow = false;

  constructor(initial: RepositoryFile[]) {
    this.files = new Map(initial.map((f) => [f.path, f.content]));
  }
  async testConnection() {
    return { ok: true };
  }
  async listLikeC4Files(): Promise<string[]> {
    return [...this.files.keys()];
  }
  async readFile(path: string): Promise<RepositoryFile> {
    return { path, content: this.files.get(path) ?? '' };
  }
  async readAll(): Promise<RepositoryFile[]> {
    return [...this.files.entries()].map(([path, content]) => ({ path, content }));
  }
  async writeFiles(files: RepositoryFile[]): Promise<void> {
    this.writeFilesCalls++;
    if (this.writeFilesShouldThrow) {
      // Однократный сбой — имитирует транзиентный обрыв записи, а не постоянно сломанный адаптер,
      // иначе последующий auto-rollback (сам вызывающий writeFiles) тоже не смог бы записать.
      this.writeFilesShouldThrow = false;
      throw new Error('disk full');
    }
    for (const f of files) this.files.set(f.path, f.content);
  }
  async deleteFiles(paths: string[]): Promise<void> {
    for (const p of paths) this.files.delete(p);
  }
  async getRevisionInfo() {
    return { capturedAt: new Date().toISOString() };
  }
}

class FakeSnapshotStore implements SnapshotStore {
  snapshots = new Map<string, RepositoryFile[]>();
  createCalls = 0;

  async create(_projectId: string, files: RepositoryFile[], _meta: SnapshotMeta): Promise<Snapshot> {
    this.createCalls++;
    const id = `snap-${this.createCalls}`;
    this.snapshots.set(id, files);
    return { id, projectId: _projectId, meta: _meta, fileHashes: {}, storageRef: id };
  }
  async restore(snapshotId: string): Promise<RepositoryFile[]> {
    const files = this.snapshots.get(snapshotId);
    if (!files) throw new Error(`unknown snapshot ${snapshotId}`);
    return files;
  }
  async list(): Promise<Snapshot[]> {
    return [];
  }
}

test('hash-check conflict: a file changed on disk since analysis blocks Apply before any snapshot/write', async () => {
  const repositoryAdapter = new FakeRepositoryAdapter([{ path: 'model.c4', content: 'CHANGED ON DISK' }]);
  const snapshotStore = new FakeSnapshotStore();

  await assert.rejects(
    () =>
      executeApply({
        repositoryAdapter,
        snapshotStore,
        projectId: 'p1',
        sessionId: 's1',
        existingFiles: [{ path: 'model.c4', content: 'ORIGINAL' }],
        diff: [{ path: 'model.c4', changeType: 'modified', before: 'ORIGINAL', after: 'NEW' }],
        proposal: proposal([]),
      }),
    (err: unknown) => {
      assert.ok(err instanceof ApplyConflictError);
      assert.deepEqual(err.paths, ['model.c4']);
      return true;
    },
  );

  assert.equal(snapshotStore.createCalls, 0, 'no snapshot should be created once a conflict is detected');
  assert.equal(repositoryAdapter.writeFilesCalls, 0, 'no write should be attempted once a conflict is detected');
  assert.equal(repositoryAdapter.files.get('model.c4'), 'CHANGED ON DISK', 'the conflicting file must be left untouched');
});

test('happy path: writes added/modified files, deletes removed ones, and returns a correct ApplyResult', async () => {
  const repositoryAdapter = new FakeRepositoryAdapter([
    { path: 'model.c4', content: 'old' },
    { path: 'obsolete.c4', content: 'gone soon' },
  ]);
  const snapshotStore = new FakeSnapshotStore();

  const result = await executeApply({
    repositoryAdapter,
    snapshotStore,
    projectId: 'p1',
    sessionId: 's1',
    existingFiles: [
      { path: 'model.c4', content: 'old' },
      { path: 'obsolete.c4', content: 'gone soon' },
    ],
    diff: [
      { path: 'model.c4', changeType: 'modified', before: 'old', after: 'new' },
      { path: 'generated/new.c4', changeType: 'added', after: 'brand new' },
      { path: 'obsolete.c4', changeType: 'deleted', before: 'gone soon' },
    ],
    proposal: proposal([item({ id: 'i1', decision: 'approved' }), item({ id: 'i2', decision: 'rejected' })]),
  });

  assert.equal(repositoryAdapter.files.get('model.c4'), 'new');
  assert.equal(repositoryAdapter.files.get('generated/new.c4'), 'brand new');
  assert.equal(repositoryAdapter.files.has('obsolete.c4'), false);
  assert.equal(snapshotStore.createCalls, 1);
  assert.deepEqual(result.appliedItemIds, ['i1']);
  assert.deepEqual(result.rejectedItemIds, ['i2']);
  assert.deepEqual(result.filesChanged.sort(), ['generated/new.c4', 'model.c4', 'obsolete.c4'].sort());
  assert.equal(result.rollbackAvailable, true);
});

test('a write failure mid-batch triggers auto-rollback instead of leaving a partially-applied repo', async () => {
  const repositoryAdapter = new FakeRepositoryAdapter([{ path: 'model.c4', content: 'old' }]);
  repositoryAdapter.writeFilesShouldThrow = true;
  const snapshotStore = new FakeSnapshotStore();

  await assert.rejects(
    () =>
      executeApply({
        repositoryAdapter,
        snapshotStore,
        projectId: 'p1',
        sessionId: 's1',
        existingFiles: [{ path: 'model.c4', content: 'old' }],
        diff: [{ path: 'model.c4', changeType: 'modified', before: 'old', after: 'new' }],
        proposal: proposal([]),
      }),
    (err: unknown) => {
      assert.ok(err instanceof ApplyWriteError);
      assert.equal(err.rolledBack, true);
      return true;
    },
  );

  assert.equal(repositoryAdapter.files.get('model.c4'), 'old', 'auto-rollback must restore the pre-apply content');
});

test('integration: a real LocalRepositoryAdapter left mid-batch by a failing write is fully restored on disk, byte-for-byte', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'likec4-ai-apply-executor-'));
  const dbDir = await mkdtemp(join(tmpdir(), 'likec4-ai-apply-executor-db-'));
  try {
    await writeFile(join(rootDir, 'model.c4'), 'original model content');
    await mkdir(join(rootDir, 'services'), { recursive: true });
    await writeFile(join(rootDir, 'services', 'order.c4'), 'original order content');

    const db = await openDatabase(join(dbDir, 'app.db'));
    const snapshotStore = new FsSnapshotStore({ db, snapshotsRootDir: join(dbDir, 'snapshots') });
    const realAdapter = new LocalRepositoryAdapter({ rootDir });

    // Оборачиваем реальный адаптер: первый writeFiles() реально пишет ОДИН файл (имитируя, что
    // часть пачки успела примениться), затем бросает — как будто процесс/диск оборвался посреди
    // остальной записи. deleteFiles/readAll/listLikeC4Files делегируются реальному адаптеру как есть.
    const partiallyFailingAdapter: RepositoryAdapter = {
      kind: 'local',
      testConnection: () => realAdapter.testConnection(),
      listLikeC4Files: () => realAdapter.listLikeC4Files(),
      readFile: (p) => realAdapter.readFile(p),
      readAll: () => realAdapter.readAll(),
      deleteFiles: (paths) => realAdapter.deleteFiles(paths),
      getRevisionInfo: () => realAdapter.getRevisionInfo(),
      writeFiles: async (files) => {
        await realAdapter.writeFiles([files[0]!]);
        throw new Error('simulated crash mid-batch');
      },
    };

    await assert.rejects(() =>
      executeApply({
        repositoryAdapter: partiallyFailingAdapter,
        snapshotStore,
        projectId: 'p1',
        sessionId: 's1',
        existingFiles: [
          { path: 'model.c4', content: 'original model content' },
          { path: 'services/order.c4', content: 'original order content' },
        ],
        diff: [
          { path: 'model.c4', changeType: 'modified', before: 'original model content', after: 'HALF-APPLIED' },
          { path: 'services/order.c4', changeType: 'modified', before: 'original order content', after: 'should never land' },
        ],
        proposal: proposal([]),
      }),
    );

    const modelAfter = await readFile(join(rootDir, 'model.c4'), 'utf8');
    const orderAfter = await readFile(join(rootDir, 'services', 'order.c4'), 'utf8');
    assert.equal(modelAfter, 'original model content', 'the file that WAS partially written must be rolled back too');
    assert.equal(orderAfter, 'original order content', 'the file that was never reached must remain untouched');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    await rm(dbDir, { recursive: true, force: true });
  }
});
