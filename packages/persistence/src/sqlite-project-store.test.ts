import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './database.js';
import { SqliteProjectStore } from './sqlite-project-store.js';

async function withStore(fn: (store: SqliteProjectStore) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'likec4-ai-project-store-'));
  try {
    const db = await openDatabase(join(dir, 'app.db'));
    await fn(new SqliteProjectStore(db));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('creates and retrieves a project', async () => {
  await withStore(async (store) => {
    await store.create({
      id: 'p1',
      name: 'Payments Platform',
      description: 'Core payments architecture',
      localRepositoryPath: '/Users/dev/payments-likec4',
      createdAt: '2026-09-03T00:00:00.000Z',
    });

    const project = await store.get('p1');
    assert.deepEqual(project, {
      id: 'p1',
      name: 'Payments Platform',
      description: 'Core payments architecture',
      localRepositoryPath: '/Users/dev/payments-likec4',
      createdAt: '2026-09-03T00:00:00.000Z',
      lastAnalysisAt: undefined,
      lastModifiedAt: undefined,
    });
  });
});

test('list returns all projects, newest first', async () => {
  await withStore(async (store) => {
    await store.create({ id: 'p1', name: 'A', localRepositoryPath: '/a', createdAt: '2026-01-01T00:00:00.000Z' });
    await store.create({ id: 'p2', name: 'B', localRepositoryPath: '/b', createdAt: '2026-02-01T00:00:00.000Z' });

    const projects = await store.list();
    assert.deepEqual(
      projects.map((p) => p.id),
      ['p2', 'p1'],
    );
  });
});

test('update merges fields without requiring a full record', async () => {
  await withStore(async (store) => {
    await store.create({ id: 'p1', name: 'A', localRepositoryPath: '/a', createdAt: '2026-01-01T00:00:00.000Z' });
    await store.update('p1', { lastAnalysisAt: '2026-03-01T00:00:00.000Z' });

    const project = await store.get('p1');
    assert.equal(project?.lastAnalysisAt, '2026-03-01T00:00:00.000Z');
    assert.equal(project?.name, 'A');
  });
});

test('delete removes a project', async () => {
  await withStore(async (store) => {
    await store.create({ id: 'p1', name: 'A', localRepositoryPath: '/a', createdAt: '2026-01-01T00:00:00.000Z' });
    await store.delete('p1');
    assert.equal(await store.get('p1'), null);
  });
});

test('get returns null for an unknown id', async () => {
  await withStore(async (store) => {
    assert.equal(await store.get('missing'), null);
  });
});
