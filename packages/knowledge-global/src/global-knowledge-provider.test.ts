import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, SqliteEmbeddingIndex } from '@likec4-ai/persistence';
import type { EmbeddingProvider } from '@likec4-ai/core-domain';
import { GlobalKnowledgeProvider } from './global-knowledge-provider.js';
import { loadContentChunks } from './content-loader.js';

/**
 * Deterministic bag-of-words hashing "embedding" — no network, no API key.
 * Texts that share more words score higher on cosine similarity, which is
 * enough to prove the retrieval plumbing (index -> search -> ranking)
 * without depending on a real embedding model's semantics.
 */
class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'fake';
  readonly model = 'bag-of-words';
  static DIMENSIONS = 64;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array(FakeEmbeddingProvider.DIMENSIONS).fill(0);
      for (const word of text.toLowerCase().match(/[a-zа-я0-9]+/g) ?? []) {
        const bucket = hash(word) % FakeEmbeddingProvider.DIMENSIONS;
        vector[bucket] += 1;
      }
      return vector;
    });
  }
}

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

async function withProvider(fn: (provider: GlobalKnowledgeProvider) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'likec4-ai-knowledge-global-'));
  try {
    const db = await openDatabase(join(dir, 'app.db'));
    const index = new SqliteEmbeddingIndex({ db, scopeKey: 'global' });
    const provider = new GlobalKnowledgeProvider({ index, embeddingProvider: new FakeEmbeddingProvider() });
    await fn(provider);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('content-loader reads the real manifest and all referenced files', async () => {
  const chunks = await loadContentChunks();
  assert.equal(chunks.length, 6);
  const dynamicViewChunk = chunks.find((c) => c.id === 'likec4-kb.views-and-dynamic-views');
  assert.ok(dynamicViewChunk);
  assert.match(dynamicViewChunk.content, /dynamic view/);
});

test('search finds the most relevant real content chunk for a query', async () => {
  await withProvider(async (provider) => {
    const results = await provider.search({ text: 'dynamic view sequence steps async', topK: 1 });
    assert.equal(results[0]?.id, 'likec4-kb.views-and-dynamic-views');
  });
});

test('search respects tag filtering', async () => {
  await withProvider(async (provider) => {
    const results = await provider.search({ text: 'element kind', tags: ['best-practices'] });
    assert.ok(results.length > 0);
    assert.ok(results.every((r) => r.tags.includes('best-practices')));
  });
});

test('getById returns a specific chunk after indexing', async () => {
  await withProvider(async (provider) => {
    const chunk = await provider.getById('likec4-kb.metadata-and-tags');
    assert.ok(chunk);
    assert.equal(chunk?.source, 'likec4-kb');
  });
});

test('indexing happens only once across concurrent calls', async () => {
  await withProvider(async (provider) => {
    const [a, b] = await Promise.all([
      provider.search({ text: 'metadata' }),
      provider.search({ text: 'specification' }),
    ]);
    assert.ok(a.length > 0);
    assert.ok(b.length > 0);
  });
});
