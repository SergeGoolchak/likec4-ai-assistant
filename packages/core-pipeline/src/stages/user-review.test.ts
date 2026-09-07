import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Proposal } from '@likec4-ai/core-domain';
import { userReviewStage } from './user-review.js';

test('final decisions require explicit confirmation, including all rejected proposals', () => {
  for (const decision of ['approved', 'rejected', 'edited'] as const) {
    const proposal: Proposal = { id: 'p', sessionId: 's', createdAt: '', status: 'under-review', items: [{ id: 'i', title: 'i', type: 'new-element', decision, sources: [], explanation: { what: '', why: '', impact: '', confidence: 1, assumptions: [] } }] };
    assert.equal(userReviewStage.isDone({ proposal }), false);
    assert.equal(userReviewStage.isDone({ proposal: { ...proposal, reviewConfirmedAt: '2026-09-07' } }), true);
  }
  assert.equal(userReviewStage.isDone({}), false);
});

test('legacy sessions with generated files do not reopen review on resume', () => {
  const proposal: Proposal = { id: 'p', sessionId: 's', createdAt: '', status: 'under-review', items: [] };
  assert.equal(userReviewStage.isDone({ proposal, generatedFiles: [] }), true);
});
