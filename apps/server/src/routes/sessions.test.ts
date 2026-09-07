import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SessionRecord } from '@likec4-ai/core-domain';
import { toSessionView } from './sessions.js';

function session(): SessionRecord {
  return {
    id: 's1', projectId: 'p1', createdAt: '2026-09-07T12:00:00Z', createdByUserEmail: 'test',
    confluenceRef: { baseUrl: 'https://example.test', pageId: '123' }, confluencePageVersion: 0,
    repositorySnapshotRef: 'local', llmProviderId: 'test', llmModel: 'test',
    pipelineState: { currentStage: 'load-confluence', status: 'running', stageOutputs: {}, pendingQuestionIds: [] },
    questions: [], validationHistory: [], technicalLog: [], userFacingTimeline: [],
  };
}

test('fresh session does not mark empty future gates complete', () => {
  const view = toSessionView(session());
  assert.deepEqual(view.completedStageIds, []);
  assert.equal(view.validation, undefined);
  assert.equal(view.summary.hasBlockingValidationIssues, undefined);
});

test('reached clarification can finish with no questions, but future review remains pending', () => {
  const record = session();
  record.pipelineState.currentStage = 'proposal-generation';
  record.pipelineState.stageOutputs.ambiguities = [];
  const view = toSessionView(record);
  assert.ok(view.completedStageIds.includes('user-clarification'));
  assert.ok(!view.completedStageIds.includes('user-review'));
});

test('blocked validation exposes actionable file and rule diagnostics to the UI', () => {
  const record = session();
  record.pipelineState.currentStage = 'repair';
  record.pipelineState.status = 'failed';
  record.pipelineState.stageOutputs.validationResult = {
    technical: { ok: false, diagnostics: [{ severity: 'error', file: 'model.c4', range: { startLine: 12, endLine: 12 }, message: 'Unknown element' }] },
    architectural: { ok: false, findings: [{ ruleId: 'owner', affectedItemId: 'item-1', severity: 'must', message: 'Owner is required', autoFixable: false }] },
  };
  const view = toSessionView(record);
  assert.equal(view.summary.hasBlockingValidationIssues, true);
  assert.equal(view.validation?.technical?.diagnostics[0]?.range?.startLine, 12);
  assert.equal(view.validation?.architectural?.findings[0]?.affectedItemId, 'item-1');
  assert.ok(!view.completedStageIds.includes('repair'));
});

test('SSE delivers stage updates after the initial snapshot and closes after the final snapshot', async () => {
  const { default: Fastify } = await import('fastify');
  const { SessionEventBus } = await import('../session-events.js');
  const { registerSessionRoutes } = await import('./sessions.js');
  const app = Fastify();
  let record = session();
  const events = new SessionEventBus();
  const container = {
    sessionHistoryStore: { get: async (id: string) => id === record.id ? record : undefined },
    sessionEvents: events,
  } as unknown as import('../composition-root.js').AppContainer;
  await registerSessionRoutes(app, container);
  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 5000);
  try {
    const response = await fetch(`${url}/api/sessions/s1/events`, { signal: abort.signal });
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const next = async () => {
      while (!buffer.includes('\n\n')) {
        const chunk = await reader.read();
        assert.equal(chunk.done, false, 'stream closed before the expected event');
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      const end = buffer.indexOf('\n\n');
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      return event;
    };
    assert.match(await next(), /event: snapshot/);
    events.publish('s1', { type: 'status', status: { stage: 'extract-requirements', label: 'Extracting', at: new Date().toISOString() } });
    assert.match(await next(), /event: status\ndata: .*extract-requirements/);
    record = { ...record, pipelineState: { ...record.pipelineState, status: 'paused-for-user', currentStage: 'user-review' } };
    events.publish('s1', { type: 'paused' });
    assert.match(await next(), /event: snapshot\ndata: .*paused-for-user/);
    assert.equal((await reader.read()).done, true);
    const paused = await fetch(`${url}/api/sessions/s1/events`, { signal: abort.signal });
    assert.match(await paused.text(), /paused-for-user/);
    const missing = await app.inject('/api/sessions/missing');
    assert.equal(missing.statusCode, 404);
  } finally {
    clearTimeout(timeout);
    abort.abort();
    await app.close();
  }
});
