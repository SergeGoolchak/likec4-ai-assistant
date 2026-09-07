import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  ArchitectureChangeCandidate,
  ArchitectureElement,
  ArchitectureGraph,
  ClarificationQuestion,
  LLMCallOptions,
  LLMMessage,
  LLMProvider,
  LLMResult,
} from '@likec4-ai/core-domain';
import { LLMProposalGenerator } from './llm-proposal-generator.js';

const SOURCE_REF = { file: 'model.c4', startLine: 1, endLine: 1 };

/** Тот же паттерн golden-test, что и в LLMChangeEngine (Milestone 6) — фиксированные ответы, а не мок случайного поведения. */
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
    throw new Error('not used');
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
    ['orderService', element({ id: 'orderService', kind: 'service', title: 'Order Service', description: 'Handles order lifecycle' })],
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

function candidate(overrides: Partial<ArchitectureChangeCandidate> & Pick<ArchitectureChangeCandidate, 'id'>): ArchitectureChangeCandidate {
  return {
    type: 'new-element',
    requirementIds: [],
    description: 'Новый элемент архитектуры на основе требования',
    sources: [{ kind: 'confluence-section', refId: 's1', label: 'Раздел спецификации' }],
    needsClarification: false,
    ...overrides,
  };
}

const DRAFT_RESPONSE = {
  title: 'Refund Service',
  what: 'Новый сервис обработки возвратов',
  why: 'Явно указано в спецификации',
  impact: 'Добавляет отдельный сервис в модель',
  confidence: 0.8,
  assumptions: [],
  proposedLikeC4Code: 'service refundService "Refund Service"',
};

test('generates an item with non-empty sources and a full explanation for a plain new-element candidate', async () => {
  const llm = new ScriptedLLMProvider([DRAFT_RESPONSE]);
  const generator = new LLMProposalGenerator({ llmProvider: llm });

  const c = candidate({ id: 'c1' });
  const [item] = await generator.generate({ candidates: [c], ambiguities: [], graph: fixtureGraph(), rules: [] });

  assert.equal(item?.id, 'c1');
  assert.equal(item?.type, 'new-element');
  assert.equal(item?.title, 'Refund Service');
  assert.equal(item?.decision, 'pending');
  assert.ok(item?.sources.length && item.sources.length > 0);
  assert.equal(item?.explanation.what, DRAFT_RESPONSE.what);
  assert.equal(item?.explanation.confidence, 0.8);
});

test('an empty candidate list produces an empty proposal without calling the LLM', async () => {
  const llm = new ScriptedLLMProvider([]);
  const generator = new LLMProposalGenerator({ llmProvider: llm });

  const items = await generator.generate({ candidates: [], ambiguities: [], graph: fixtureGraph(), rules: [] });

  assert.deepEqual(items, []);
  assert.equal(llm.callCount, 0);
});

test('a "reject-match" answer flips a modified-element candidate to new-element and clears the target', async () => {
  const llm = new ScriptedLLMProvider([DRAFT_RESPONSE]);
  const generator = new LLMProposalGenerator({ llmProvider: llm });

  const c = candidate({ id: 'c1', type: 'modified-element', matchedElementId: 'orderService' });
  const question: ClarificationQuestion = {
    id: 'q1',
    originKind: 'ai-assumption-needs-confirmation',
    text: 'Это правда orderService?',
    whyNeeded: 'confidence low',
    relatedProposalItemIds: ['c1'],
    options: [
      { id: 'confirm-match', label: 'Да' },
      { id: 'reject-match', label: 'Нет, это новый элемент' },
    ],
    allowFreeText: true,
    status: 'answered',
    answer: { selectedOptionId: 'reject-match', answeredAt: new Date().toISOString() },
  };

  const [item] = await generator.generate({ candidates: [c], ambiguities: [question], graph: fixtureGraph(), rules: [] });

  assert.equal(item?.type, 'new-element');
  assert.equal(item?.targetElementId, undefined);
  // Ответ пользователя должен попасть в источники — иначе решение теряется бесследно.
  assert.ok(item?.sources.some((s) => s.kind === 'user-answer'));
});

test('a "confirm-match" answer keeps the candidate as a modified-element and still cites the answer as a source', async () => {
  const llm = new ScriptedLLMProvider([DRAFT_RESPONSE]);
  const generator = new LLMProposalGenerator({ llmProvider: llm });

  const c = candidate({ id: 'c1', type: 'modified-element', matchedElementId: 'orderService' });
  const question: ClarificationQuestion = {
    id: 'q1',
    originKind: 'ai-assumption-needs-confirmation',
    text: 'Это правда orderService?',
    whyNeeded: 'confidence low',
    relatedProposalItemIds: ['c1'],
    options: [{ id: 'confirm-match', label: 'Да, это тот же элемент' }],
    allowFreeText: true,
    status: 'answered',
    answer: { selectedOptionId: 'confirm-match', answeredAt: new Date().toISOString() },
  };

  const [item] = await generator.generate({ candidates: [c], ambiguities: [question], graph: fixtureGraph(), rules: [] });

  assert.equal(item?.type, 'modified-element');
  assert.equal(item?.targetElementId, 'orderService');
  assert.ok(item?.sources.some((s) => s.kind === 'user-answer' && s.excerpt?.includes('Да, это тот же элемент')));
});

test('a "merge" answer on a conflict question combines two candidates into a single item with unioned sources', async () => {
  const llm = new ScriptedLLMProvider([DRAFT_RESPONSE]);
  const generator = new LLMProposalGenerator({ llmProvider: llm });

  const c1 = candidate({ id: 'c1', matchedElementId: 'orderService', sources: [{ kind: 'confluence-section', refId: 's1', label: 'A' }] });
  const c2 = candidate({ id: 'c2', matchedElementId: 'orderService', sources: [{ kind: 'confluence-section', refId: 's2', label: 'B' }] });
  const conflictQuestion: ClarificationQuestion = {
    id: 'q1',
    originKind: 'user-decision-needed',
    text: 'Два требования метят в orderService',
    whyNeeded: 'conflict',
    relatedProposalItemIds: ['c1', 'c2'],
    options: [
      { id: 'keep-separate', label: 'Отдельно' },
      { id: 'merge', label: 'Объединить' },
    ],
    allowFreeText: true,
    status: 'answered',
    answer: { selectedOptionId: 'merge', answeredAt: new Date().toISOString() },
  };

  const items = await generator.generate({ candidates: [c1, c2], ambiguities: [conflictQuestion], graph: fixtureGraph(), rules: [] });

  assert.equal(items.length, 1, 'two merged candidates must produce exactly one item');
  assert.equal(items[0]?.id, 'c1');
  assert.equal(llm.callCount, 1, 'merged candidates draft in a single LLM call, not one per candidate');
  const refIds = items[0]?.sources.map((s) => s.refId);
  assert.ok(refIds?.includes('s1') && refIds.includes('s2'), 'sources from both merged candidates must both survive');
});

test('a "keep-separate" answer on a conflict question generates two independent items, one LLM call each', async () => {
  const llm = new ScriptedLLMProvider([DRAFT_RESPONSE, { ...DRAFT_RESPONSE, title: 'Second item' }]);
  const generator = new LLMProposalGenerator({ llmProvider: llm });

  const c1 = candidate({ id: 'c1', matchedElementId: 'orderService' });
  const c2 = candidate({ id: 'c2', matchedElementId: 'orderService' });
  const conflictQuestion: ClarificationQuestion = {
    id: 'q1',
    originKind: 'user-decision-needed',
    text: 'Два требования метят в orderService',
    whyNeeded: 'conflict',
    relatedProposalItemIds: ['c1', 'c2'],
    options: [
      { id: 'keep-separate', label: 'Отдельно' },
      { id: 'merge', label: 'Объединить' },
    ],
    allowFreeText: true,
    status: 'answered',
    answer: { selectedOptionId: 'keep-separate', answeredAt: new Date().toISOString() },
  };

  const items = await generator.generate({ candidates: [c1, c2], ambiguities: [conflictQuestion], graph: fixtureGraph(), rules: [] });

  assert.equal(items.length, 2);
  assert.equal(llm.callCount, 2);
});

test('a deferred or "marked unknown" question does not change the candidate but is folded into assumptions via a user-answer source', async () => {
  const llm = new ScriptedLLMProvider([DRAFT_RESPONSE]);
  const generator = new LLMProposalGenerator({ llmProvider: llm });

  const c = candidate({ id: 'c1' });
  const question: ClarificationQuestion = {
    id: 'q1',
    originKind: 'ai-assumption-needs-confirmation',
    text: 'Это новый элемент?',
    whyNeeded: 'confidence low',
    relatedProposalItemIds: ['c1'],
    options: [{ id: 'confirm-new', label: 'Да' }],
    allowFreeText: true,
    status: 'marked-unknown',
  };

  const [item] = await generator.generate({ candidates: [c], ambiguities: [question], graph: fixtureGraph(), rules: [] });

  assert.equal(item?.type, 'new-element');
  assert.ok(item?.sources.some((s) => s.kind === 'user-answer' && s.excerpt?.includes('не знает')));
});

test('regression: the prompt includes the already-decided type/target and the assembled context, not just the bare candidate id', async () => {
  const llm = new ScriptedLLMProvider([DRAFT_RESPONSE]);
  const generator = new LLMProposalGenerator({ llmProvider: llm });

  const c = candidate({ id: 'c1', type: 'modified-element', matchedElementId: 'orderService', description: 'Order Service must send confirmation emails' });
  await generator.generate({ candidates: [c], ambiguities: [], graph: fixtureGraph(), rules: [] });

  const userMessage = llm.lastMessages.find((m) => m.role === 'user')?.content ?? '';
  assert.match(userMessage, /Order Service must send confirmation emails/);
  const systemMessage = llm.lastMessages.find((m) => m.role === 'system')?.content ?? '';
  assert.match(systemMessage, /modified-element/);
  assert.match(systemMessage, /orderService/);
});
