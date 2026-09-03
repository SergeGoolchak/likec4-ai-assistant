import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, SqliteEmbeddingIndex } from '@likec4-ai/persistence';
import type { ArchitectureGraph, ArchitectureRule, EmbeddingProvider } from '@likec4-ai/core-domain';
import { ProjectKnowledgeProvider } from './project-knowledge-provider.js';

/** Deterministic bag-of-words hashing "embedding" — see knowledge-global for the same pattern and why. */
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

function emptyGraph(): ArchitectureGraph {
  return {
    elements: new Map(),
    relationships: new Map(),
    views: new Map(),
    byKind: new Map(),
    byTag: new Map(),
    neighborsIndex: new Map(),
    sourceFileOf: new Map(),
  };
}

function graphWith(elements: ArchitectureGraph['elements']): ArchitectureGraph {
  return { ...emptyGraph(), elements };
}

const SOURCE_REF = { file: 'model.c4', startLine: 1, endLine: 1 };

async function withProvider(fn: (provider: ProjectKnowledgeProvider) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'likec4-ai-knowledge-project-'));
  try {
    const db = await openDatabase(join(dir, 'app.db'));
    const index = new SqliteEmbeddingIndex({ db, scopeKey: 'p1' });
    const provider = new ProjectKnowledgeProvider({ index, embeddingProvider: new FakeEmbeddingProvider() });
    await fn(provider);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('reindexFromGraph makes elements and rules searchable', async () => {
  await withProvider(async (provider) => {
    const graph = graphWith(
      new Map([
        [
          'orderService',
          {
            id: 'orderService',
            kind: 'service',
            title: 'Order Service',
            description: 'Handles order lifecycle',
            tags: [],
            metadata: {},
            sourceRef: SOURCE_REF,
          },
        ],
      ]),
    );
    const rules: ArchitectureRule[] = [
      {
        id: 'r1',
        appliesToKinds: ['rest-api'],
        title: 'REST naming',
        description: 'REST endpoints must be verb-first',
        severity: 'must',
      },
    ];

    await provider.reindexFromGraph(graph, rules);

    const elementResult = await provider.search({ text: 'order lifecycle service', topK: 1 });
    assert.equal(elementResult[0]?.id, 'element:orderService');

    const ruleResult = await provider.search({ text: 'REST endpoints verb-first naming', topK: 1 });
    assert.equal(ruleResult[0]?.id, 'rule:r1');
  });
});

test('rules are filterable by applicable kind via tags (Milestone 3 DoD)', async () => {
  await withProvider(async (provider) => {
    const rules: ArchitectureRule[] = [
      { id: 'rest-rule', appliesToKinds: ['rest-api'], title: 'REST rule', description: 'REST rule text', severity: 'must' },
      { id: 'db-rule', appliesToKinds: ['database'], title: 'DB rule', description: 'DB rule text', severity: 'should' },
    ];
    await provider.reindexFromGraph(emptyGraph(), rules);

    const restOnly = await provider.search({ text: 'rule', tags: ['rest-api'] });
    assert.deepEqual(
      restOnly.map((r) => r.id),
      ['rule:rest-rule'],
    );
  });
});

test('reindexing prunes elements removed from the model but keeps manual notes', async () => {
  await withProvider(async (provider) => {
    const element = {
      id: 'orderService',
      kind: 'service',
      title: 'Order Service',
      tags: [],
      metadata: {},
      sourceRef: SOURCE_REF,
    };
    await provider.reindexFromGraph(graphWith(new Map([['orderService', element]])), []);
    await provider.upsert([
      { id: 'note:context', source: 'project-kb', title: 'Manual context', content: 'Team prefers gRPC internally', tags: [], metadata: {} },
    ]);

    // orderService no longer exists in the model on the next parse.
    await provider.reindexFromGraph(emptyGraph(), []);

    assert.equal(await provider.getById('element:orderService'), null);
    assert.ok(await provider.getById('note:context'));
  });
});
