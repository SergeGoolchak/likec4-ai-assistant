import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './database.js';
import { FsSnapshotStore } from './fs-snapshot-store.js';

async function withStore(fn: (store: FsSnapshotStore) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'likec4-ai-snapshot-store-'));
  try {
    const db = await openDatabase(join(dir, 'app.db'));
    const store = new FsSnapshotStore({ db, snapshotsRootDir: join(dir, 'snapshots') });
    await fn(store);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const ORIGINAL_FILES = [
  { path: 'model.c4', content: 'specification {}\nmodel {}\n' },
  { path: 'nested/views.c4', content: 'views { view index { include * } }\n' },
];

test('restore returns files byte-for-byte identical to what was snapshotted', async () => {
  await withStore(async (store) => {
    const snapshot = await store.create('p1', ORIGINAL_FILES, { reason: 'pre-apply', createdAt: '2026-09-03T00:00:00.000Z' });

    const restored = await store.restore(snapshot.id);

    assert.deepEqual(
      restored.sort((a, b) => a.path.localeCompare(b.path)),
      [...ORIGINAL_FILES].sort((a, b) => a.path.localeCompare(b.path)),
    );
  });
});

test('create records a sha256 hash per file', async () => {
  await withStore(async (store) => {
    const snapshot = await store.create('p1', ORIGINAL_FILES, { reason: 'manual', createdAt: '2026-09-03T00:00:00.000Z' });

    assert.equal(Object.keys(snapshot.fileHashes).length, 2);
    assert.match(snapshot.fileHashes['model.c4'] ?? '', /^[0-9a-f]{64}$/);
  });
});

test('list returns snapshots for a project, newest first', async () => {
  await withStore(async (store) => {
    await store.create('p1', ORIGINAL_FILES, { reason: 'manual', createdAt: '2026-01-01T00:00:00.000Z' });
    await store.create('p1', ORIGINAL_FILES, { reason: 'pre-apply', createdAt: '2026-02-01T00:00:00.000Z' });
    await store.create('p2', ORIGINAL_FILES, { reason: 'manual', createdAt: '2026-01-15T00:00:00.000Z' });

    const snapshots = await store.list('p1');
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0]?.meta.reason, 'pre-apply');
  });
});

test('restore throws a clear error for an unknown snapshot id', async () => {
  await withStore(async (store) => {
    await assert.rejects(() => store.restore('does-not-exist'), /Snapshot not found/);
  });
});
