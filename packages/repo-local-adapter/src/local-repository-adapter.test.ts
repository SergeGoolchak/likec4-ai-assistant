import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { LocalRepositoryAdapter } from './local-repository-adapter.js';

const execFileAsync = promisify(execFile);

async function withTempProject(fn: (rootDir: string) => Promise<void>): Promise<void> {
  const rootDir = await mkdtemp(join(tmpdir(), 'likec4-ai-local-repo-'));
  try {
    await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test('testConnection succeeds for an existing directory and fails for a missing one', async () => {
  await withTempProject(async (rootDir) => {
    const adapter = new LocalRepositoryAdapter({ rootDir });
    assert.equal((await adapter.testConnection()).ok, true);

    const missing = new LocalRepositoryAdapter({ rootDir: join(rootDir, 'does-not-exist') });
    const result = await missing.testConnection();
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });
});

test('listLikeC4Files finds .c4 and .likec4 files, skips node_modules, and returns relative paths', async () => {
  await withTempProject(async (rootDir) => {
    await mkdir(join(rootDir, 'services'), { recursive: true });
    await mkdir(join(rootDir, 'node_modules', 'something'), { recursive: true });
    await writeFile(join(rootDir, 'model.c4'), 'specification {}');
    await writeFile(join(rootDir, 'services', 'order.likec4'), 'specification {}');
    await writeFile(join(rootDir, 'node_modules', 'something', 'ignored.c4'), 'specification {}');
    await writeFile(join(rootDir, 'README.md'), '# not likec4');

    const adapter = new LocalRepositoryAdapter({ rootDir });
    const files = await adapter.listLikeC4Files();

    assert.deepEqual(files.sort(), ['model.c4', 'services/order.likec4']);
  });
});

test('readAll reads full content of every discovered file', async () => {
  await withTempProject(async (rootDir) => {
    await writeFile(join(rootDir, 'a.c4'), 'A');
    await writeFile(join(rootDir, 'b.c4'), 'B');

    const adapter = new LocalRepositoryAdapter({ rootDir });
    const files = await adapter.readAll();

    assert.deepEqual(
      files.sort((a, b) => a.path.localeCompare(b.path)),
      [
        { path: 'a.c4', content: 'A' },
        { path: 'b.c4', content: 'B' },
      ],
    );
  });
});

test('writeFiles atomically writes new and overwrites existing files', async () => {
  await withTempProject(async (rootDir) => {
    await writeFile(join(rootDir, 'existing.c4'), 'old content');
    const adapter = new LocalRepositoryAdapter({ rootDir });

    await adapter.writeFiles([
      { path: 'existing.c4', content: 'new content' },
      { path: 'nested/new.c4', content: 'brand new' },
    ]);

    assert.equal(await readFile(join(rootDir, 'existing.c4'), 'utf8'), 'new content');
    assert.equal(await readFile(join(rootDir, 'nested', 'new.c4'), 'utf8'), 'brand new');
  });
});

test('deleteFiles removes the given files and leaves everything else untouched (Rollback, Milestone 10)', async () => {
  await withTempProject(async (rootDir) => {
    await writeFile(join(rootDir, 'keep.c4'), 'keep me');
    await mkdir(join(rootDir, 'generated'), { recursive: true });
    await writeFile(join(rootDir, 'generated', 'new.c4'), 'delete me');
    const adapter = new LocalRepositoryAdapter({ rootDir });

    await adapter.deleteFiles(['generated/new.c4']);

    assert.deepEqual(await adapter.listLikeC4Files(), ['keep.c4']);
  });
});

test('deleteFiles does not throw for a path that is already missing (idempotent, like force rm)', async () => {
  await withTempProject(async (rootDir) => {
    const adapter = new LocalRepositoryAdapter({ rootDir });
    await assert.doesNotReject(() => adapter.deleteFiles(['does-not-exist.c4']));
  });
});

test('getRevisionInfo returns capturedAt without branch/commit for a non-git folder', async () => {
  await withTempProject(async (rootDir) => {
    const adapter = new LocalRepositoryAdapter({ rootDir });
    const info = await adapter.getRevisionInfo();

    assert.equal(info.branch, undefined);
    assert.equal(info.commit, undefined);
    assert.ok(info.capturedAt);
  });
});

test('getRevisionInfo returns branch and commit for an actual git repository', async () => {
  await withTempProject(async (rootDir) => {
    await writeFile(join(rootDir, 'model.c4'), 'specification {}');
    await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: rootDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: rootDir });
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: rootDir });
    await execFileAsync('git', ['add', '.'], { cwd: rootDir });
    await execFileAsync('git', ['commit', '-q', '-m', 'initial'], { cwd: rootDir });
    const { stdout: expectedCommit } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: rootDir });

    const adapter = new LocalRepositoryAdapter({ rootDir });
    const info = await adapter.getRevisionInfo();

    assert.equal(info.branch, 'main');
    assert.equal(info.commit, expectedCommit.trim());
  });
});
