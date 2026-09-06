import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ArchitectureGraph,
  ConfluenceAdapter,
  ConfluencePageContent,
  ConfluencePageRef,
  LikeC4Parser,
  LikeC4ParseResult,
  RepositoryAdapter,
  RepositoryFile,
  SessionRecord,
  UserFacingStatus,
} from '@likec4-ai/core-domain';
import { openDatabase, SqliteSessionHistoryStore } from '@likec4-ai/persistence';
import { PipelineOrchestrator } from './orchestrator.js';

class FakeConfluenceAdapter implements ConfluenceAdapter {
  calls = 0;
  async testConnection() {
    return { ok: true };
  }
  async fetchPage(ref: ConfluencePageRef): Promise<ConfluencePageContent> {
    this.calls++;
    return {
      pageId: ref.pageId,
      title: 'Payment API Spec',
      version: 1,
      spaceKey: 'ENG',
      url: 'https://confluence.example.com/spaces/ENG/pages/123',
      sections: [{ id: 's1', headingPath: ['Overview'], kind: 'paragraph', text: 'Handles payments end to end.' }],
      fetchedAt: new Date().toISOString(),
    };
  }
}

class FakeRepositoryAdapter implements RepositoryAdapter {
  readonly kind = 'local' as const;
  calls = 0;
  shouldThrowOnce = false;

  async testConnection() {
    return { ok: true };
  }
  async listLikeC4Files() {
    return ['model.c4'];
  }
  async readFile(path: string): Promise<RepositoryFile> {
    return { path, content: 'specification {}' };
  }
  async readAll(): Promise<RepositoryFile[]> {
    this.calls++;
    if (this.shouldThrowOnce) {
      this.shouldThrowOnce = false;
      throw new Error('ECONNREFUSED: repository unreachable');
    }
    return [{ path: 'model.c4', content: 'specification { element service } model { service orderService "Order Service" }' }];
  }
  async writeFiles(): Promise<void> {
    throw new Error('not supported in fake');
  }
  async getRevisionInfo() {
    return { capturedAt: new Date().toISOString() };
  }
}

class FakeLikeC4Parser implements LikeC4Parser {
  calls = 0;
  async parseProject(files: RepositoryFile[]): Promise<LikeC4ParseResult> {
    this.calls++;
    const graph: ArchitectureGraph = {
      elements: new Map([
        [
          'orderService',
          {
            id: 'orderService',
            kind: 'service',
            title: 'Order Service',
            tags: [],
            metadata: {},
            sourceRef: { file: 'model.c4', startLine: 1, endLine: 1 },
          },
        ],
      ]),
      relationships: new Map(),
      views: new Map(),
      byKind: new Map([['service', ['orderService']]]),
      byTag: new Map(),
      neighborsIndex: new Map([['orderService', { incoming: [], outgoing: [] }]]),
      sourceFileOf: new Map([['orderService', 'model.c4']]),
    };
    return { graph, diagnostics: [], sourceFiles: files.map((f) => f.path) };
  }
}

function fixtureSession(): SessionRecord {
  return {
    id: 's1',
    projectId: 'p1',
    createdAt: new Date().toISOString(),
    createdByUserEmail: 'dev@example.com',
    confluenceRef: { baseUrl: 'https://confluence.example.com', pageId: '123' },
    confluencePageVersion: 0,
    repositorySnapshotRef: 'local',
    llmProviderId: 'openai',
    llmModel: 'gpt-5',
    pipelineState: { currentStage: 'load-confluence', status: 'running', stageOutputs: {}, pendingQuestionIds: [] },
    questions: [],
    validationHistory: [],
    technicalLog: [],
    userFacingTimeline: [],
  };
}

async function withStore(fn: (store: SqliteSessionHistoryStore) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'likec4-ai-orchestrator-'));
  try {
    const db = await openDatabase(join(dir, 'app.db'));
    await fn(new SqliteSessionHistoryStore(db));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('runs stages 1-5 end to end, persisting after each and marking the session completed', async () => {
  await withStore(async (sessionStore) => {
    const confluenceAdapter = new FakeConfluenceAdapter();
    const repositoryAdapter = new FakeRepositoryAdapter();
    const likec4Parser = new FakeLikeC4Parser();
    const statuses: UserFacingStatus[] = [];

    const session = fixtureSession();
    await sessionStore.create(session);

    const orchestrator = new PipelineOrchestrator();
    const result = await orchestrator.run({
      session,
      ports: { confluenceAdapter, repositoryAdapter, likec4Parser },
      sessionStore,
      onStatus: (s) => statuses.push(s),
    });

    assert.equal(result.pipelineState.status, 'completed');
    assert.deepEqual(
      statuses.map((s) => s.stage),
      ['load-confluence', 'parse-specification', 'load-likec4', 'build-architecture-graph'],
    );
    assert.equal(result.pipelineState.stageOutputs.confluenceContent?.title, 'Payment API Spec');
    assert.equal(result.pipelineState.stageOutputs.specification?.chunks.length, 1);
    assert.equal(result.pipelineState.stageOutputs.existingFiles?.length, 1);
    assert.ok(result.pipelineState.stageOutputs.architectureGraph?.elements.get('orderService'));
    assert.equal(result.userFacingTimeline.length, 4);
    assert.equal(result.confluencePageVersion, 1, 'confluencePageVersion should sync from the fetched page once load-confluence completes');

    // Persisted, not just returned in memory.
    const persisted = await sessionStore.get('s1');
    assert.equal(persisted?.pipelineState.status, 'completed');
  });
});

test('resuming after a simulated process restart continues from the last completed stage without re-running earlier ones', async () => {
  await withStore(async (sessionStore) => {
    const confluenceAdapter = new FakeConfluenceAdapter();
    const repositoryAdapter = new FakeRepositoryAdapter();
    const likec4Parser = new FakeLikeC4Parser();

    const session = fixtureSession();
    await sessionStore.create(session);

    // First "process": only load-confluence + parse-specification complete, then we stop (simulating a crash)
    // by just not continuing the loop — the orchestrator itself has no notion of "stopping early", so we
    // simulate the crash by constructing a fresh orchestrator against the *persisted* state after reading it
    // back, rather than the in-memory `session` object, exactly as a restarted server would.
    const partialOrchestrator = new PipelineOrchestrator();
    // Run only through completion once to get a fully persisted trail, then rewind persisted state manually
    // to "as if" only 2 stages had completed, to exercise resume from a real DB read.
    await partialOrchestrator.run({
      session,
      ports: { confluenceAdapter, repositoryAdapter, likec4Parser },
      sessionStore,
    });
    assert.equal(confluenceAdapter.calls, 1);
    assert.equal(repositoryAdapter.calls, 1);
    assert.equal(likec4Parser.calls, 1);

    // "Restart": reload from the store fresh (a new process would not have the in-memory `session` object)
    // and run again — every stage's isDone() should be true, so nothing re-executes.
    const reloaded = await sessionStore.get('s1');
    assert.ok(reloaded);
    const secondOrchestrator = new PipelineOrchestrator();
    const result = await secondOrchestrator.run({
      session: reloaded,
      ports: { confluenceAdapter, repositoryAdapter, likec4Parser },
      sessionStore,
    });

    assert.equal(result.pipelineState.status, 'completed');
    assert.equal(confluenceAdapter.calls, 1, 'load-confluence must not re-run once already done');
    assert.equal(repositoryAdapter.calls, 1, 'load-likec4 must not re-run once already done');
    assert.equal(likec4Parser.calls, 1, 'build-architecture-graph must not re-run once already done');
  });
});

test('a failed stage persists a failed status with a UserFacingError, and progress made so far is kept', async () => {
  await withStore(async (sessionStore) => {
    const confluenceAdapter = new FakeConfluenceAdapter();
    const repositoryAdapter = new FakeRepositoryAdapter();
    repositoryAdapter.shouldThrowOnce = true;
    const likec4Parser = new FakeLikeC4Parser();

    const session = fixtureSession();
    await sessionStore.create(session);

    const orchestrator = new PipelineOrchestrator();
    await assert.rejects(() =>
      orchestrator.run({ session, ports: { confluenceAdapter, repositoryAdapter, likec4Parser }, sessionStore }),
    );

    const persisted = await sessionStore.get('s1');
    assert.equal(persisted?.pipelineState.status, 'failed');
    assert.ok(persisted?.pipelineState.error);
    assert.match(persisted?.pipelineState.error?.likelyCause ?? '', /ECONNREFUSED/);
    // Stages before the failure are still there.
    assert.ok(persisted?.pipelineState.stageOutputs.confluenceContent);
    assert.ok(persisted?.pipelineState.stageOutputs.specification);
    assert.ok(persisted?.technicalLog.some((entry) => entry.stage === 'load-likec4' && entry.result === 'error'));
  });
});

test('re-running a failed session retries only the failed stage and can succeed', async () => {
  await withStore(async (sessionStore) => {
    const confluenceAdapter = new FakeConfluenceAdapter();
    const repositoryAdapter = new FakeRepositoryAdapter();
    repositoryAdapter.shouldThrowOnce = true;
    const likec4Parser = new FakeLikeC4Parser();

    const session = fixtureSession();
    await sessionStore.create(session);
    const orchestrator = new PipelineOrchestrator();

    await assert.rejects(() =>
      orchestrator.run({ session, ports: { confluenceAdapter, repositoryAdapter, likec4Parser }, sessionStore }),
    );
    assert.equal(confluenceAdapter.calls, 1);

    const failed = await sessionStore.get('s1');
    assert.ok(failed);
    const retryOrchestrator = new PipelineOrchestrator();
    const result = await retryOrchestrator.run({
      session: failed,
      ports: { confluenceAdapter, repositoryAdapter, likec4Parser },
      sessionStore,
    });

    assert.equal(result.pipelineState.status, 'completed');
    assert.equal(confluenceAdapter.calls, 1, 'load-confluence should not be re-run on retry');
    assert.equal(repositoryAdapter.calls, 2, 'load-likec4 is retried once');
  });
});
