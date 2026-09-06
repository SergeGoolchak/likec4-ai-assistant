import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  ArchitectureElement,
  ArchitectureGraph,
  ArchitectureRule,
  ExtractedRequirement,
  LLMCallOptions,
  LLMMessage,
  LLMProvider,
  LLMResult,
} from '@likec4-ai/core-domain';
import { LLMChangeEngine } from './llm-change-engine.js';

const SOURCE_REF = { file: 'model.c4', startLine: 1, endLine: 1 };

/**
 * "Золотые" сценарии для entity matching — не мок случайного поведения, а
 * заранее известные правильные ответы на конкретные пары (требование,
 * модель), которыми мы фиксируем ожидаемое поведение движка. Качество
 * СУЖДЕНИЯ реальной модели эти тесты не проверяют (это в принципе нельзя
 * сделать без обращения к настоящему API) — они проверяют, что движок
 * корректно использует то, что вернула модель: лексический предфильтр,
 * порог уверенности, защиту от галлюцинаций по несуществующим id.
 */
class ScriptedLLMProvider implements LLMProvider {
  readonly id = 'scripted';
  readonly model = 'scripted';
  readonly isLocal = true;
  #script: unknown[];
  callCount = 0;
  lastMessages: LLMMessage[] = [];

  constructor(script: unknown[]) {
    this.#script = script;
  }

  async complete(): Promise<LLMResult<string>> {
    throw new Error('ScriptedLLMProvider.complete is not used by ChangeEngine');
  }

  async completeJSON<T>(messages: LLMMessage[], _options: LLMCallOptions): Promise<LLMResult<T>> {
    this.lastMessages = messages;
    const next = this.#script[this.callCount++];
    if (next === undefined) throw new Error('ScriptedLLMProvider: ran out of scripted responses');
    return { content: next as T, usage: { promptTokens: 0, completionTokens: 0 } };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

function element(overrides: Partial<ArchitectureElement> & Pick<ArchitectureElement, 'id' | 'kind' | 'title'>): ArchitectureElement {
  return { tags: [], metadata: {}, sourceRef: SOURCE_REF, ...overrides };
}

function fixtureGraph(): ArchitectureGraph {
  const elements = new Map<string, ArchitectureElement>([
    ['orderService', element({ id: 'orderService', kind: 'service', title: 'Order Service', description: 'Handles order lifecycle and persistence' })],
    ['paymentService', element({ id: 'paymentService', kind: 'service', title: 'Payment Service', description: 'Processes card payments' })],
    ['orderDb', element({ id: 'orderDb', kind: 'database', title: 'Order DB' })],
  ]);
  return {
    elements,
    relationships: new Map(),
    views: new Map(),
    byKind: new Map(),
    byTag: new Map(),
    neighborsIndex: new Map(),
    sourceFileOf: new Map(),
  };
}

function requirement(overrides: Partial<ExtractedRequirement> & Pick<ExtractedRequirement, 'id' | 'summary' | 'category'>): ExtractedRequirement {
  return { rawText: overrides.summary, sourceSections: [], ...overrides };
}

test('golden case: a reworded requirement confidently matches the existing element it describes', async () => {
  const llm = new ScriptedLLMProvider([{ matchedElementId: 'orderService', confidence: 0.92, rationale: 'Same concept, different wording' }]);
  const engine = new LLMChangeEngine({ llmProvider: llm });

  const req = requirement({
    id: 'r1',
    summary: 'Persist and manage customer orders',
    rawText: 'The system must create, update and track customer orders throughout their lifecycle.',
    category: 'modified-service',
  });

  const [result] = await engine.matchEntities({ requirements: [req], graph: fixtureGraph() });

  assert.equal(result?.matchedElementId, 'orderService');
  assert.equal(result?.confidence, 0.92);
  assert.equal(llm.callCount, 1);
});

test('regression: the LLM prompt includes candidate title/kind/description, not bare ids', async () => {
  const llm = new ScriptedLLMProvider([{ matchedElementId: 'orderService', confidence: 0.9, rationale: 'match' }]);
  const engine = new LLMChangeEngine({ llmProvider: llm });

  await engine.matchEntities({
    requirements: [requirement({ id: 'r1', summary: 'Order lifecycle change', category: 'modified-service' })],
    graph: fixtureGraph(),
  });

  const userMessage = llm.lastMessages.find((m) => m.role === 'user')?.content ?? '';
  assert.match(userMessage, /Order Service/);
  assert.match(userMessage, /kind: service/);
  assert.match(userMessage, /Handles order lifecycle and persistence/);
});

test('golden case: a requirement with no lexical overlap at all is treated as new without calling the LLM', async () => {
  const llm = new ScriptedLLMProvider([]);
  const engine = new LLMChangeEngine({ llmProvider: llm });

  const req = requirement({
    id: 'r2',
    summary: 'Detect fraudulent transactions in real time',
    rawText: 'Add anomaly scoring for incoming transaction attempts using a rules engine.',
    category: 'new-service',
  });

  const [result] = await engine.matchEntities({ requirements: [req], graph: fixtureGraph() });

  assert.equal(result?.matchedElementId, undefined);
  assert.equal(result?.confidence, 0);
  assert.equal(llm.callCount, 0, 'must not spend an LLM call when there are zero plausible candidates');
});

test('golden case: a low-confidence judgment is passed through, not silently discarded or promoted', async () => {
  const llm = new ScriptedLLMProvider([{ matchedElementId: 'paymentService', confidence: 0.4, rationale: 'Possibly billing-related, but uncertain' }]);
  const engine = new LLMChangeEngine({ llmProvider: llm });

  const req = requirement({
    id: 'r3',
    summary: 'Charge the customer card for subscription renewals',
    rawText: 'Recurring billing must charge the saved card on the renewal date.',
    category: 'modified-service',
  });

  const [result] = await engine.matchEntities({ requirements: [req], graph: fixtureGraph() });

  assert.equal(result?.matchedElementId, 'paymentService');
  assert.equal(result?.confidence, 0.4);
});

test('hallucination guard: a matchedElementId outside the offered candidates is rejected, not trusted', async () => {
  const llm = new ScriptedLLMProvider([{ matchedElementId: 'nonExistentElement', confidence: 0.9, rationale: 'made up' }]);
  const engine = new LLMChangeEngine({ llmProvider: llm });

  const req = requirement({ id: 'r4', summary: 'Order Service must expose refund status', category: 'modified-service' });

  const [result] = await engine.matchEntities({ requirements: [req], graph: fixtureGraph() });

  assert.equal(result?.matchedElementId, undefined);
  assert.equal(result?.confidence, 0);
  assert.match(result?.rationale ?? '', /nonExistentElement/);
});

test('detectGaps downgrades a category-implied "new" element to "modified" once a real match is found (ФТ7)', async () => {
  const engine = new LLMChangeEngine({ llmProvider: new ScriptedLLMProvider([]) });
  const graph = fixtureGraph();
  const req = requirement({ id: 'r1', summary: 'Add order tracking', category: 'new-service' });

  const [candidate] = await engine.detectGaps({
    requirements: [req],
    matches: [{ requirementId: 'r1', matchedElementId: 'orderService', confidence: 0.9, rationale: 'match' }],
    graph,
    rules: [],
  });

  assert.equal(candidate?.type, 'modified-element');
  assert.equal(candidate?.matchedElementId, 'orderService');
  assert.equal(candidate?.needsClarification, false);
});

test('detectGaps flags needsClarification for both no-match and low-confidence-match cases', async () => {
  const engine = new LLMChangeEngine({ llmProvider: new ScriptedLLMProvider([]) });
  const graph = fixtureGraph();
  const reqA = requirement({ id: 'a', summary: 'New fraud service', category: 'new-service' });
  const reqB = requirement({ id: 'b', summary: 'Billing tweak', category: 'modified-service' });

  const candidates = await engine.detectGaps({
    requirements: [reqA, reqB],
    matches: [
      { requirementId: 'a', confidence: 0 },
      { requirementId: 'b', matchedElementId: 'paymentService', confidence: 0.4, rationale: 'uncertain' },
    ] as never,
    graph,
    rules: [],
  });

  assert.equal(candidates.every((c) => c.needsClarification), true);
});

test('detectGaps attaches applicable Architecture Rules as sources based on the matched element kind', async () => {
  const engine = new LLMChangeEngine({ llmProvider: new ScriptedLLMProvider([]) });
  const graph = fixtureGraph();
  const req = requirement({ id: 'r1', summary: 'Order Service change', category: 'modified-service' });
  const rules: ArchitectureRule[] = [
    { id: 'rule-1', appliesToKinds: ['service'], title: 'Service ownership', description: 'Every service needs an owner', severity: 'must' },
    { id: 'rule-2', appliesToKinds: ['database'], title: 'DB rule', description: 'irrelevant here', severity: 'should' },
  ];

  const [candidate] = await engine.detectGaps({
    requirements: [req],
    matches: [{ requirementId: 'r1', matchedElementId: 'orderService', confidence: 0.9, rationale: 'match' }],
    graph,
    rules,
  });

  const ruleSourceIds = candidate?.sources.filter((s) => s.kind === 'architecture-rules').map((s) => s.refId);
  assert.deepEqual(ruleSourceIds, ['rule-1']);
});

test('resolveConflicts merges confident duplicate targets but escalates when any of them is uncertain', async () => {
  const engine = new LLMChangeEngine({ llmProvider: new ScriptedLLMProvider([]) });

  const confidentPair = [
    { id: 'c1', type: 'modified-element', requirementIds: ['r1'], matchedElementId: 'orderService', description: '', sources: [], needsClarification: false },
    { id: 'c2', type: 'modified-element', requirementIds: ['r2'], matchedElementId: 'orderService', description: '', sources: [], needsClarification: false },
  ] as never;
  const confidentResolutions = await engine.resolveConflicts(confidentPair);
  assert.ok(confidentResolutions.every((r) => r.resolved === true));

  const uncertainPair = [
    { id: 'c3', type: 'modified-element', requirementIds: ['r3'], matchedElementId: 'paymentService', description: '', sources: [], needsClarification: false },
    { id: 'c4', type: 'modified-element', requirementIds: ['r4'], matchedElementId: 'paymentService', description: '', sources: [], needsClarification: true },
  ] as never;
  const uncertainResolutions = await engine.resolveConflicts(uncertainPair);
  assert.ok(uncertainResolutions.every((r) => r.resolved === false && r.remainingConflict?.requiresUserDecision === true));
});

test('resolveConflicts leaves non-colliding candidates (including brand-new elements) untouched', async () => {
  const engine = new LLMChangeEngine({ llmProvider: new ScriptedLLMProvider([]) });
  const candidates = [
    { id: 'c1', type: 'new-element', requirementIds: ['r1'], description: '', sources: [], needsClarification: false },
    { id: 'c2', type: 'modified-element', requirementIds: ['r2'], matchedElementId: 'orderService', description: '', sources: [], needsClarification: false },
  ] as never;

  const resolutions = await engine.resolveConflicts(candidates);
  assert.ok(resolutions.every((r) => r.resolved === true && r.remainingConflict === undefined));
});
