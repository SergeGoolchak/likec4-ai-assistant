import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './database.js';
import { SqliteEmbeddingIndex, type StoredChunkInput } from './sqlite-embedding-index.js';

async function withIndex(scopeKey: string, fn: (index: SqliteEmbeddingIndex) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'likec4-ai-embedding-index-'));
  try {
    const db = await openDatabase(join(dir, 'app.db'));
    await fn(new SqliteEmbeddingIndex({ db, scopeKey }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function chunk(overrides: Partial<StoredChunkInput> & Pick<StoredChunkInput, 'id' | 'embedding'>): StoredChunkInput {
  return {
    source: 'likec4-kb',
    title: overrides.id,
    content: overrides.id,
    tags: [],
    metadata: {},
    ...overrides,
  };
}

test('search ranks the closest embedding first', async () => {
  await withIndex('global', async (index) => {
    index.replaceAll([
      chunk({ id: 'a', embedding: [1, 0, 0] }),
      chunk({ id: 'b', embedding: [0, 1, 0] }),
      chunk({ id: 'c', embedding: [0.9, 0.1, 0] }),
    ]);

    const results = index.search([1, 0, 0], { topK: 2 });
    assert.deepEqual(
      results.map((r) => r.id),
      ['a', 'c'],
    );
  });
});

test('tags act as a hard filter, not just a relevance signal', async () => {
  await withIndex('global', async (index) => {
    index.replaceAll([
      chunk({ id: 'rest-rule', embedding: [1, 0, 0], tags: ['rest-api'] }),
      chunk({ id: 'db-rule', embedding: [0.99, 0.01, 0], tags: ['database'] }),
    ]);

    const results = index.search([1, 0, 0], { tags: ['rest-api'] });
    assert.deepEqual(
      results.map((r) => r.id),
      ['rest-rule'],
    );
  });
});

test('scopeKey isolates chunks between the global index and a project index', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'likec4-ai-embedding-index-'));
  try {
    const db = await openDatabase(join(dir, 'app.db'));
    const global = new SqliteEmbeddingIndex({ db, scopeKey: 'global' });
    const project = new SqliteEmbeddingIndex({ db, scopeKey: 'p1' });

    global.replaceAll([chunk({ id: 'g1', embedding: [1, 0, 0] })]);
    project.replaceAll([chunk({ id: 'p1-chunk', embedding: [1, 0, 0] })]);

    assert.equal(global.getById('p1-chunk'), null);
    assert.equal(project.getById('g1'), null);
    assert.ok(global.getById('g1'));
    assert.ok(project.getById('p1-chunk'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the same chunk id in two different scopes does not collide (regression: id alone must not be the primary key)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'likec4-ai-embedding-index-'));
  try {
    const db = await openDatabase(join(dir, 'app.db'));
    const projectA = new SqliteEmbeddingIndex({ db, scopeKey: 'project-a' });
    const projectB = new SqliteEmbeddingIndex({ db, scopeKey: 'project-b' });

    // Two unrelated projects both happen to have an element called "orderService" — a very plausible real-world collision.
    projectA.replaceAll([chunk({ id: 'element:orderService', embedding: [1, 0, 0], title: 'Project A order service' })]);
    projectB.upsert([chunk({ id: 'element:orderService', embedding: [0, 1, 0], title: 'Project B order service' })]);

    assert.equal(projectA.getById('element:orderService')?.title, 'Project A order service');
    assert.equal(projectB.getById('element:orderService')?.title, 'Project B order service');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('replaceByIdPrefixes drops stale auto-derived chunks but preserves manually added ones', async () => {
  await withIndex('p1', async (index) => {
    index.upsert([
      chunk({ id: 'element:orderService', embedding: [1, 0, 0] }),
      chunk({ id: 'element:paymentService', embedding: [0, 1, 0] }),
      chunk({ id: 'note:manual-context', embedding: [0, 0, 1] }),
    ]);

    // paymentService was removed from the model; orderService is re-indexed (possibly updated).
    index.replaceByIdPrefixes(['element:', 'rule:'], [chunk({ id: 'element:orderService', embedding: [1, 1, 0], title: 'Updated' })]);

    assert.equal(index.getById('element:paymentService'), null);
    assert.equal(index.getById('element:orderService')?.title, 'Updated');
    assert.ok(index.getById('note:manual-context'));
  });
});

test('upsert updates a single chunk in place without touching the rest of the scope', async () => {
  await withIndex('p1', async (index) => {
    index.replaceAll([chunk({ id: 'a', embedding: [1, 0, 0], title: 'Original' })]);
    index.upsert([chunk({ id: 'b', embedding: [0, 1, 0], title: 'New note' })]);
    index.upsert([chunk({ id: 'a', embedding: [1, 0, 0], title: 'Updated' })]);

    assert.equal(index.getById('a')?.title, 'Updated');
    assert.equal(index.getById('b')?.title, 'New note');
  });
});

test('replaceAll fully replaces previous content for the scope', async () => {
  await withIndex('global', async (index) => {
    index.replaceAll([chunk({ id: 'old', embedding: [1, 0, 0] })]);
    index.replaceAll([chunk({ id: 'new', embedding: [1, 0, 0] })]);

    assert.equal(index.getById('old'), null);
    assert.ok(index.getById('new'));
  });
});

test('isEmpty reflects whether the scope currently has any chunks', async () => {
  await withIndex('global', async (index) => {
    assert.equal(index.isEmpty(), true);
    index.replaceAll([chunk({ id: 'a', embedding: [1, 0, 0] })]);
    assert.equal(index.isEmpty(), false);
  });
});
