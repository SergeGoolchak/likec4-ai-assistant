import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ArchitectureElement, ArchitectureGraph, ArchitectureRule, ProposalItem } from '@likec4-ai/core-domain';
import { RuleBasedArchitecturalReviewer } from './rule-based-architectural-reviewer.js';

const SOURCE_REF = { file: 'model.c4', startLine: 1, endLine: 1 };

function element(overrides: Partial<ArchitectureElement> & Pick<ArchitectureElement, 'id' | 'kind' | 'title'>): ArchitectureElement {
  return { tags: [], metadata: {}, sourceRef: SOURCE_REF, ...overrides };
}

function graphOf(elements: ArchitectureElement[], sourceFileOf: [string, string][] = []): ArchitectureGraph {
  return {
    elements: new Map(elements.map((e) => [e.id, e])),
    relationships: new Map(),
    views: new Map(),
    byKind: new Map(),
    byTag: new Map(),
    neighborsIndex: new Map(),
    sourceFileOf: new Map(sourceFileOf),
  };
}

function item(overrides: Partial<ProposalItem> & Pick<ProposalItem, 'id'>): ProposalItem {
  return {
    type: 'new-element',
    title: 'Item',
    explanation: { what: 'w', why: 'y', impact: 'i', confidence: 0.8, assumptions: [] },
    sources: [],
    decision: 'approved',
    ...overrides,
  };
}

test('flags a missing required metadata field as a finding with the rule severity', async () => {
  const reviewer = new RuleBasedArchitecturalReviewer();
  const el = element({ id: 'refundService', kind: 'service', title: 'Refund Service', metadata: {} });
  const rule: ArchitectureRule = { id: 'r1', appliesToKinds: ['service'], title: 'Owner required', description: '', requiredMetadata: ['owner'], severity: 'must' };

  const result = await reviewer.review({
    items: [item({ id: 'i1', targetElementId: 'refundService' })],
    newGraph: graphOf([el]),
    existingGraph: graphOf([]),
    rules: [rule],
    itemsByFile: new Map(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.severity, 'must');
  assert.match(result.findings[0]?.message ?? '', /owner/);
});

test('present required metadata produces no finding', async () => {
  const reviewer = new RuleBasedArchitecturalReviewer();
  const el = element({ id: 'refundService', kind: 'service', title: 'Refund Service', metadata: { owner: 'team-payments' } });
  const rule: ArchitectureRule = { id: 'r1', appliesToKinds: ['service'], title: 'Owner required', description: '', requiredMetadata: ['owner'], severity: 'must' };

  const result = await reviewer.review({
    items: [item({ id: 'i1', targetElementId: 'refundService' })],
    newGraph: graphOf([el]),
    existingGraph: graphOf([]),
    rules: [rule],
    itemsByFile: new Map(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test('flags an id that does not match the naming convention pattern', async () => {
  const reviewer = new RuleBasedArchitecturalReviewer();
  const el = element({ id: 'RefundService', kind: 'service', title: 'Refund Service' });
  const rule: ArchitectureRule = { id: 'r1', appliesToKinds: ['service'], title: 'camelCase ids', description: '', namingConventionPattern: '^[a-z][a-zA-Z0-9]*$', severity: 'should' };

  const result = await reviewer.review({
    items: [item({ id: 'i1', targetElementId: 'RefundService' })],
    newGraph: graphOf([el]),
    existingGraph: graphOf([]),
    rules: [rule],
    itemsByFile: new Map(),
  });

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.severity, 'should');
  assert.equal(result.ok, true, '"should" findings do not flip ok to false');
});

test('finds a lexically similar existing element for a brand-new item and flags it as "should", never "must"', async () => {
  const reviewer = new RuleBasedArchitecturalReviewer();
  const newEl = element({ id: 'orderProcessingService', kind: 'service', title: 'Order Processing Service', description: 'Handles order lifecycle' });
  const existingEl = element({ id: 'orderService', kind: 'service', title: 'Order Service', description: 'Handles order lifecycle' });

  const result = await reviewer.review({
    items: [item({ id: 'i1' })], // no targetElementId => brand new
    newGraph: graphOf([newEl], [['orderProcessingService', 'generated/i1.c4']]),
    existingGraph: graphOf([existingEl]),
    rules: [],
    itemsByFile: new Map([['generated/i1.c4', ['i1']]]),
  });

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.ruleId, 'duplicate-detection');
  assert.equal(result.findings[0]?.severity, 'should');
  assert.equal(result.ok, true);
});

test('a modified-element item (has targetElementId) is never flagged as a duplicate of its own target', async () => {
  const reviewer = new RuleBasedArchitecturalReviewer();
  const el = element({ id: 'orderService', kind: 'service', title: 'Order Service', description: 'Handles order lifecycle' });

  const result = await reviewer.review({
    items: [item({ id: 'i1', type: 'modified-element', targetElementId: 'orderService' })],
    newGraph: graphOf([el]),
    existingGraph: graphOf([el]),
    rules: [],
    itemsByFile: new Map(),
  });

  assert.deepEqual(result.findings, []);
});

test('an unrelated new element with no lexical overlap produces no duplicate finding', async () => {
  const reviewer = new RuleBasedArchitecturalReviewer();
  const newEl = element({ id: 'fraudDetection', kind: 'service', title: 'Fraud Detection', description: 'Flags suspicious transactions' });
  const existingEl = element({ id: 'orderService', kind: 'service', title: 'Order Service', description: 'Handles order lifecycle' });

  const result = await reviewer.review({
    items: [item({ id: 'i1' })],
    newGraph: graphOf([newEl], [['fraudDetection', 'generated/i1.c4']]),
    existingGraph: graphOf([existingEl]),
    rules: [],
    itemsByFile: new Map([['generated/i1.c4', ['i1']]]),
  });

  assert.deepEqual(result.findings, []);
});

test('an invalid regex in a rule does not crash review — that rule is skipped for naming, not the whole pass', async () => {
  const reviewer = new RuleBasedArchitecturalReviewer();
  const el = element({ id: 'refundService', kind: 'service', title: 'Refund Service' });
  const rule: ArchitectureRule = { id: 'r1', appliesToKinds: ['service'], title: 'broken', description: '', namingConventionPattern: '(unterminated', severity: 'must' };

  const result = await reviewer.review({
    items: [item({ id: 'i1', targetElementId: 'refundService' })],
    newGraph: graphOf([el]),
    existingGraph: graphOf([]),
    rules: [rule],
    itemsByFile: new Map(),
  });

  assert.deepEqual(result.findings, []);
});
