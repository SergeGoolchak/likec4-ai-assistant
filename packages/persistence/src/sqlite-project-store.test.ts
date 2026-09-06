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
      confluenceBaseUrl: undefined,
      aiModel: undefined,
      aiBaseUrl: undefined,
      createdAt: '2026-09-03T00:00:00.000Z',
      lastAnalysisAt: undefined,
      lastModifiedAt: undefined,
    });
  });
});

test('stores and updates the Confluence base URL', async () => {
  await withStore(async (store) => {
    await store.create({
      id: 'p1',
      name: 'A',
      localRepositoryPath: '/a',
      confluenceBaseUrl: 'https://confluence.example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    assert.equal((await store.get('p1'))?.confluenceBaseUrl, 'https://confluence.example.com');

    await store.update('p1', { confluenceBaseUrl: 'https://confluence2.example.com' });
    assert.equal((await store.get('p1'))?.confluenceBaseUrl, 'https://confluence2.example.com');
  });
});

test('stores and updates the AI model', async () => {
  await withStore(async (store) => {
    await store.create({ id: 'p1', name: 'A', localRepositoryPath: '/a', aiModel: 'gpt-4o-mini', createdAt: '2026-01-01T00:00:00.000Z' });
    assert.equal((await store.get('p1'))?.aiModel, 'gpt-4o-mini');

    await store.update('p1', { aiModel: 'gpt-4o' });
    assert.equal((await store.get('p1'))?.aiModel, 'gpt-4o');
  });
});

test('stores and updates the AI base URL (for OpenAI-compatible local/self-hosted servers)', async () => {
  await withStore(async (store) => {
    await store.create({
      id: 'p1',
      name: 'A',
      localRepositoryPath: '/a',
      aiBaseUrl: 'http://localhost:11434/v1',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal((await store.get('p1'))?.aiBaseUrl, 'http://localhost:11434/v1');

    await store.update('p1', { aiBaseUrl: undefined });
    assert.equal((await store.get('p1'))?.aiBaseUrl, undefined);
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
