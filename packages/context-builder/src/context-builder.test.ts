import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  ArchitectureElement,
  ArchitectureGraph,
  ArchitectureRelationship,
  ArchitectureRule,
  KnowledgeChunk,
  KnowledgeProvider,
  KnowledgeQuery,
  LLMProvider,
} from '@likec4-ai/core-domain';
import { ContextBuilder } from './context-builder.js';
import { sliceGraph, relationshipsAmong } from './graph-slice.js';

const SOURCE_REF = { file: 'model.c4', startLine: 1, endLine: 1 };

function element(overrides: Partial<ArchitectureElement> & Pick<ArchitectureElement, 'id' | 'kind' | 'title'>): ArchitectureElement {
  return { tags: [], metadata: {}, sourceRef: SOURCE_REF, ...overrides };
}

function relationship(id: string, sourceId: string, targetId: string): ArchitectureRelationship {
  return { id, sourceId, targetId, tags: [], sourceRef: SOURCE_REF };
}

/** paymentsPlatform > {orderService, paymentService, orderDb}; orderService -> paymentService -> notificationService (depth 2); orderService -> orderDb. */
function fixtureGraph(): ArchitectureGraph {
  const elements = new Map<string, ArchitectureElement>([
    ['paymentsPlatform', element({ id: 'paymentsPlatform', kind: 'system', title: 'Payments Platform' })],
    ['orderService', element({ id: 'orderService', kind: 'service', title: 'Order Service', parentId: 'paymentsPlatform' })],
    ['paymentService', element({ id: 'paymentService', kind: 'service', title: 'Payment Service', parentId: 'paymentsPlatform' })],
    ['orderDb', element({ id: 'orderDb', kind: 'database', title: 'Order DB', parentId: 'paymentsPlatform' })],
    ['notificationService', element({ id: 'notificationService', kind: 'service', title: 'Notification Service' })],
  ]);
  const relationships = new Map<string, ArchitectureRelationship>([
    ['r1', relationship('r1', 'orderService', 'paymentService')],
    ['r2', relationship('r2', 'orderService', 'orderDb')],
    ['r3', relationship('r3', 'paymentService', 'notificationService')],
  ]);
  const neighborsIndex = new Map<string, { incoming: string[]; outgoing: string[] }>([
    ['paymentsPlatform', { incoming: [], outgoing: [] }],
    ['orderService', { incoming: [], outgoing: ['r1', 'r2'] }],
    ['paymentService', { incoming: ['r1'], outgoing: ['r3'] }],
    ['orderDb', { incoming: ['r2'], outgoing: [] }],
    ['notificationService', { incoming: ['r3'], outgoing: [] }],
  ]);
  return {
    elements,
    relationships,
    views: new Map(),
    byKind: new Map(),
    byTag: new Map(),
    neighborsIndex,
    sourceFileOf: new Map(),
  };
}

class FakeLLMProvider implements LLMProvider {
  readonly id = 'fake';
  readonly model = 'fake';
  readonly isLocal = true;
  async complete(): Promise<never> {
    throw new Error('not used in these tests');
  }
  async completeJSON(): Promise<never> {
    throw new Error('not used in these tests');
  }
  /** Deterministic: ~1 token per 10 chars, easy to reason about in budget tests. */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 10);
  }
}

class FakeKnowledgeProvider implements KnowledgeProvider {
  readonly scope;
  #chunks: KnowledgeChunk[];
  constructor(scope: 'global' | 'project', chunks: KnowledgeChunk[]) {
    this.scope = scope;
    this.#chunks = chunks;
  }
  async search(_query: KnowledgeQuery): Promise<KnowledgeChunk[]> {
    return this.#chunks;
  }
  async getById(id: string): Promise<KnowledgeChunk | null> {
    return this.#chunks.find((c) => c.id === id) ?? null;
  }
}

test('sliceGraph reaches depth-2 neighbors and pulls in the parent chain', () => {
  const graph = fixtureGraph();
  const ids = sliceGraph(graph, ['orderService'], 2);
  assert.deepEqual(new Set(ids), new Set(['orderService', 'paymentService', 'orderDb', 'notificationService', 'paymentsPlatform']));
});

test('sliceGraph at depth 1 does not reach the second hop', () => {
  const graph = fixtureGraph();
  const ids = sliceGraph(graph, ['orderService'], 1);
  assert.equal(ids.includes('notificationService'), false);
  assert.ok(ids.includes('paymentService'));
});

test('relationshipsAmong only returns relationships whose both endpoints are included', () => {
  const graph = fixtureGraph();
  const rels = relationshipsAmong(graph, new Set(['orderService', 'paymentService']));
  assert.deepEqual(
    rels.map((r) => r.id),
    ['r1'],
  );
});

test('build() assembles elements, relationships, applicable rules, and knowledge chunks', async () => {
  const graph = fixtureGraph();
  const rules: ArchitectureRule[] = [
    { id: 'rule-service', appliesToKinds: ['service'], title: 'Service rule', description: 'Services need an owner', severity: 'must' },
    { id: 'rule-queue', appliesToKinds: ['queue'], title: 'Queue rule', description: 'irrelevant here', severity: 'should' },
  ];
  const knowledgeProviders = [
    new FakeKnowledgeProvider('global', [{ id: 'kb1', source: 'likec4-kb', title: 'KB', content: 'some doc', tags: [], metadata: {} }]),
  ];

  const builder = new ContextBuilder({ llmProvider: new FakeLLMProvider() });
  const result = await builder.build({
    focusText: 'order service change',
    graph,
    candidateElementIds: ['orderService'],
    rules,
    knowledgeProviders,
    maxTokens: 10_000,
  });

  assert.deepEqual(
    result.elements.map((e) => e.id).sort(),
    ['notificationService', 'orderDb', 'orderService', 'paymentService', 'paymentsPlatform'],
  );
  assert.equal(result.applicableRules.length, 1);
  assert.equal(result.applicableRules[0]?.id, 'rule-service');
  assert.equal(result.knowledgeChunks.length, 1);
  assert.equal(result.omittedElementCount, 0);
  assert.ok(result.estimatedTokens > 0);
});

test('build() trims elements to the token budget but always keeps at least the first one', async () => {
  const graph = fixtureGraph();
  const builder = new ContextBuilder({ llmProvider: new FakeLLMProvider() });

  const result = await builder.build({
    focusText: 'x',
    graph,
    candidateElementIds: ['orderService'],
    maxTokens: 1, // smaller than even a single rendered element
  });

  assert.equal(result.elements.length, 1);
  assert.equal(result.elements[0]?.id, 'orderService');
  assert.ok(result.omittedElementCount > 0);
});

test('build() works with no candidate elements (empty seed) without throwing', async () => {
  const graph = fixtureGraph();
  const builder = new ContextBuilder({ llmProvider: new FakeLLMProvider() });
  const result = await builder.build({ focusText: 'x', graph });
  assert.deepEqual(result.elements, []);
  assert.deepEqual(result.relationships, []);
});
