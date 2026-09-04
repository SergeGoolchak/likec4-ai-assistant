import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SessionRecord } from '@likec4-ai/core-domain';
import { openDatabase } from './database.js';
import { SqliteSessionHistoryStore } from './sqlite-session-history-store.js';

async function withStore(fn: (store: SqliteSessionHistoryStore) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'likec4-ai-session-store-'));
  try {
    const db = await openDatabase(join(dir, 'app.db'));
    await fn(new SqliteSessionHistoryStore(db));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function fixtureSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 's1',
    projectId: 'p1',
    createdAt: '2026-09-04T00:00:00.000Z',
    createdByUserEmail: 'dev@example.com',
    confluenceRef: { baseUrl: 'https://confluence.example.com', pageId: '123' },
    confluencePageVersion: 1,
    repositorySnapshotRef: 'local',
    llmProviderId: 'openai',
    llmModel: 'gpt-5',
    pipelineState: {
      currentStage: 'load-confluence',
      status: 'running',
      stageOutputs: {},
      pendingQuestionIds: [],
    },
    questions: [],
    validationHistory: [],
    technicalLog: [],
    userFacingTimeline: [],
    ...overrides,
  };
}

test('create and get round-trip a session record, including Map fields inside the architecture graph', async () => {
  await withStore(async (store) => {
    const graph = {
      elements: new Map([['orderService', { id: 'orderService', kind: 'service', title: 'Order Service', tags: [], metadata: {}, sourceRef: { file: 'model.c4', startLine: 1, endLine: 1 } }]]),
      relationships: new Map(),
      views: new Map(),
      byKind: new Map([['service', ['orderService']]]),
      byTag: new Map(),
      neighborsIndex: new Map([['orderService', { incoming: [], outgoing: [] }]]),
      sourceFileOf: new Map([['orderService', 'model.c4']]),
    };

    const session = fixtureSession({
      pipelineState: {
        currentStage: 'build-architecture-graph',
        status: 'running',
        stageOutputs: { architectureGraph: graph },
        pendingQuestionIds: [],
      },
    });

    await store.create(session);
    const restored = await store.get('s1');

    assert.ok(restored);
    const restoredGraph = restored.pipelineState.stageOutputs.architectureGraph;
    assert.ok(restoredGraph?.elements instanceof Map);
    assert.equal(restoredGraph?.elements.get('orderService')?.title, 'Order Service');
    assert.deepEqual([...(restoredGraph?.byKind.get('service') ?? [])], ['orderService']);
  });
});

test('update merges a patch and persists it', async () => {
  await withStore(async (store) => {
    await store.create(fixtureSession());
    await store.update('s1', {
      pipelineState: { currentStage: 'parse-specification', status: 'running', stageOutputs: {}, pendingQuestionIds: [] },
    });

    const restored = await store.get('s1');
    assert.equal(restored?.pipelineState.currentStage, 'parse-specification');
    assert.equal(restored?.createdByUserEmail, 'dev@example.com');
  });
});

test('get returns null for an unknown session id', async () => {
  await withStore(async (store) => {
    assert.equal(await store.get('missing'), null);
  });
});

test('list filters by projectId and summarizes status/title', async () => {
  await withStore(async (store) => {
    await store.create(fixtureSession({ id: 's1', projectId: 'p1' }));
    await store.create(
      fixtureSession({
        id: 's2',
        projectId: 'p1',
        pipelineState: {
          currentStage: 'load-confluence',
          status: 'completed',
          stageOutputs: {
            confluenceContent: {
              pageId: '123',
              title: 'Payment API Spec',
              version: 1,
              spaceKey: 'ENG',
              url: 'https://confluence.example.com/x',
              sections: [],
              fetchedAt: '2026-09-04T00:00:00.000Z',
            },
          },
          pendingQuestionIds: [],
        },
      }),
    );
    await store.create(fixtureSession({ id: 's3', projectId: 'p2' }));

    const summaries = await store.list({ projectId: 'p1' });
    assert.equal(summaries.length, 2);
    const s2 = summaries.find((s) => s.id === 's2');
    assert.equal(s2?.status, 'completed');
    assert.equal(s2?.confluencePageTitle, 'Payment API Spec');
  });
});
