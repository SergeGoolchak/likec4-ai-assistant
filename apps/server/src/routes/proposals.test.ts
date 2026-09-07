import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type { SessionRecord } from '@likec4-ai/core-domain';
import type { AppContainer } from '../composition-root.js';
import { registerProposalRoutes } from './proposals.js';
import { toSessionView } from './sessions.js';

async function fixture() {
  let record: SessionRecord = {
    id: 's1', projectId: 'p1', createdAt: '2026-09-07T00:00:00Z', createdByUserEmail: 'test',
    confluenceRef: { baseUrl: 'https://example.test', pageId: '123' }, confluencePageVersion: 1,
    repositorySnapshotRef: 'local', llmProviderId: 'test', llmModel: 'test', questions: [], validationHistory: [], technicalLog: [], userFacingTimeline: [],
    pipelineState: { status: 'paused-for-user', currentStage: 'user-review', pendingQuestionIds: [], stageOutputs: {
      proposal: { id: 'p1', sessionId: 's1', status: 'under-review', createdAt: '2026-09-07T00:00:00Z', items: [{
        id: 'i1', type: 'new-element', title: 'Service', decision: 'pending', proposedLikeC4Code: 'service x',
        sources: [], explanation: { what: 'w', why: 'w', impact: 'i', confidence: 1, assumptions: [] },
      }] },
    } },
  };
  let starts = 0;
  let configured = true;
  const container = {
    sessionHistoryStore: { get: async () => structuredClone(record), update: async (_id: string, value: SessionRecord) => { record = structuredClone(value); } },
    projectStore: { get: async () => ({ id: 'p1', localRepositoryPath: '/tmp/model', confluenceBaseUrl: configured ? 'https://example.test' : undefined, aiModel: 'test' }) },
    secretsVault: { get: async () => 'test-token' },
    createLocalRepositoryAdapter: () => ({ testConnection: async () => ({ ok: true }) }),
    createConfluenceAdapter: () => ({}), createLLMProvider: () => ({}), createChangeEngine: () => ({}), createProposalGenerator: () => ({}),
    pipelineOrchestrator: { run: async ({ session }: { session: SessionRecord }) => { starts++; return session; } },
    sessionEvents: { publish: () => {} }, technicalLogger: { error: () => {} },
  } as unknown as AppContainer;
  const app = Fastify();
  await registerProposalRoutes(app, container);
  const decide = () => app.inject({ method: 'POST', url: '/api/sessions/s1/proposal/items/i1/decision', payload: { decision: 'approved' } });
  const confirm = (revision = toSessionView(record).reviewRevision) => app.inject({ method: 'POST', url: '/api/sessions/s1/proposal/confirm', payload: { reviewRevision: revision } });
  return { app, decide, confirm, get: () => record, starts: () => starts, disconnect: () => { configured = false; } };
}

test('last decision is saved without starting generation; confirmation starts it once and freezes edits', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.decide()).statusCode, 200);
    assert.equal(f.starts(), 0);
    assert.equal(f.get().pipelineState.status, 'paused-for-user');
    const [a, b] = await Promise.all([f.confirm(), f.confirm()]);
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [202, 409]);
    assert.equal(f.starts(), 1);
    assert.ok(f.get().pipelineState.stageOutputs.proposal?.reviewConfirmedAt);
    assert.equal((await f.decide()).statusCode, 409);
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/sessions/s1/proposal/items/i1/regenerate' })).statusCode, 409);
  } finally { await f.app.close(); }
});

test('pending decisions and a stale revision cannot be confirmed', async () => {
  const f = await fixture();
  try {
    const oldRevision = toSessionView(f.get()).reviewRevision;
    assert.equal((await f.confirm()).statusCode, 409);
    await f.decide();
    assert.equal((await f.confirm(oldRevision)).statusCode, 409);
    assert.equal(f.starts(), 0);
    assert.equal(f.get().pipelineState.status, 'paused-for-user');
  } finally { await f.app.close(); }
});

test('failed preflight preserves decisions and allows retrying confirmation', async () => {
  const f = await fixture();
  try {
    await f.decide();
    f.disconnect();
    assert.equal((await f.confirm()).statusCode, 400);
    assert.equal(f.get().pipelineState.stageOutputs.proposal?.items[0]?.decision, 'approved');
    assert.equal(f.get().pipelineState.stageOutputs.proposal?.reviewConfirmedAt, undefined);
    assert.equal(f.get().pipelineState.status, 'paused-for-user');
    assert.equal(f.starts(), 0);
  } finally { await f.app.close(); }
});
