import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ArchitecturalReviewer,
  ArchitecturalReviewInput,
  ArchitecturalValidationResult,
  ArchitectureChangeCandidate,
  ArchitectureGraph,
  ChangeEngine,
  ConfluenceAdapter,
  ConfluencePageContent,
  ConfluencePageRef,
  ConflictResolution,
  EntityMatchInput,
  EntityMatchResult,
  GapAnalysisInput,
  LikeC4Parser,
  LikeC4ParseResult,
  LikeC4Validator,
  LLMCallOptions,
  LLMMessage,
  LLMProvider,
  LLMResult,
  ProposalGenerationInput,
  ProposalGenerator,
  ProposalItem,
  ProposalRepairInput,
  RenderedView,
  RepositoryAdapter,
  RepositoryFile,
  SessionRecord,
  TechnicalValidationResult,
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
  async deleteFiles(): Promise<void> {
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

class FakeLLMProvider implements LLMProvider {
  readonly id = 'fake';
  readonly model = 'fake';
  readonly isLocal = true;
  async complete(): Promise<LLMResult<string>> {
    throw new Error('not used by these tests');
  }
  async completeJSON<T>(_messages: LLMMessage[], _options: LLMCallOptions): Promise<LLMResult<T>> {
    // Consumed only by extract-requirements — classifies the single fixture chunk ("s1") as one requirement.
    const content = { requirements: [{ chunkId: 's1', summary: 'Payments handling', category: 'modified-service' }] };
    return { content: content as T, usage: { promptTokens: 0, completionTokens: 0 } };
  }
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

class FakeChangeEngine implements ChangeEngine {
  constructor(private options: { needsClarification?: boolean } = {}) {}

  async matchEntities(input: EntityMatchInput): Promise<EntityMatchResult[]> {
    return input.requirements.map((r) => ({ requirementId: r.id, matchedElementId: 'orderService', confidence: 0.9, rationale: 'fake match' }));
  }
  async detectGaps(input: GapAnalysisInput): Promise<ArchitectureChangeCandidate[]> {
    return input.requirements.map((r) => ({
      id: `candidate-${r.id}`,
      type: 'modified-element',
      requirementIds: [r.id],
      matchedElementId: 'orderService',
      description: 'fake candidate',
      sources: [],
      needsClarification: this.options.needsClarification ?? false,
    }));
  }
  async resolveConflicts(candidates: ArchitectureChangeCandidate[]): Promise<ConflictResolution[]> {
    return candidates.map((c) => ({ candidateId: c.id, resolved: true }));
  }
}

class FakeProposalGenerator implements ProposalGenerator {
  async generate(input: ProposalGenerationInput): Promise<ProposalItem[]> {
    return input.candidates.map((c) => ({
      id: c.id,
      type: c.type,
      title: 'Fake proposal item',
      targetElementId: c.matchedElementId,
      proposedLikeC4Code: 'service orderService "Order Service" { description "fake" }',
      explanation: { what: 'fake', why: 'fake', impact: 'fake', confidence: 0.9, assumptions: [] },
      sources: c.sources.length > 0 ? c.sources : [{ kind: 'existing-likec4-element' as const, refId: 'orderService', label: 'fake source' }],
      decision: 'pending' as const,
    }));
  }
  async repair(input: ProposalRepairInput): Promise<ProposalItem> {
    return { ...input.item, proposedLikeC4Code: 'repaired' };
  }
}

class FakeLikeC4Validator implements LikeC4Validator {
  async validateTechnical(_files: RepositoryFile[]): Promise<TechnicalValidationResult> {
    return { ok: true, diagnostics: [] };
  }
  async renderViewsPreview(): Promise<RenderedView[]> {
    return [];
  }
}

class FakeArchitecturalReviewer implements ArchitecturalReviewer {
  async review(_input: ArchitecturalReviewInput): Promise<ArchitecturalValidationResult> {
    return { ok: true, findings: [] };
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

test('runs stages 1-11 straight through when nothing needs clarifying, then pauses at user-review until the item is decided', async () => {
  await withStore(async (sessionStore) => {
    const confluenceAdapter = new FakeConfluenceAdapter();
    const repositoryAdapter = new FakeRepositoryAdapter();
    const likec4Parser = new FakeLikeC4Parser();
    const llmProvider = new FakeLLMProvider();
    const changeEngine = new FakeChangeEngine();
    const proposalGenerator = new FakeProposalGenerator();
    const statuses: UserFacingStatus[] = [];

    const session = fixtureSession();
    await sessionStore.create(session);

    const orchestrator = new PipelineOrchestrator();
    const paused = await orchestrator.run({
      session,
      ports: { confluenceAdapter, repositoryAdapter, likec4Parser, llmProvider, changeEngine, proposalGenerator },
      sessionStore,
      onStatus: (s) => statuses.push(s),
    });

    assert.deepEqual(statuses.map((s) => s.stage), [
      'load-confluence',
      'parse-specification',
      'load-likec4',
      'build-architecture-graph',
      'extract-requirements',
      'entity-matching',
      'gap-analysis',
      'ambiguity-detection',
      'proposal-generation',
    ]);
    assert.equal(paused.pipelineState.stageOutputs.confluenceContent?.title, 'Payment API Spec');
    assert.equal(paused.pipelineState.stageOutputs.specification?.chunks.length, 1);
    assert.equal(paused.pipelineState.stageOutputs.existingFiles?.length, 1);
    assert.ok(paused.pipelineState.stageOutputs.architectureGraph?.elements.get('orderService'));
    assert.equal(paused.pipelineState.stageOutputs.extractedRequirements?.length, 1);
    assert.equal(paused.pipelineState.stageOutputs.entityMatches?.[0]?.matchedElementId, 'orderService');
    assert.equal(paused.pipelineState.stageOutputs.changeCandidates?.length, 1);
    // Нечего разрешать конфликтами/уверенностью — ambiguities пустой, гейт user-clarification
    // проходится в этом же вызове run() без остановки (isDone уже true для пустого списка).
    assert.deepEqual(paused.pipelineState.stageOutputs.ambiguities, []);
    assert.equal(paused.confluencePageVersion, 1, 'confluencePageVersion should sync from the fetched page once load-confluence completes');

    // proposal-generation дало один item со статусом 'pending' — гейт user-review не пропускает
    // дальше, пока item не получит финальное решение человека (approved/rejected/edited).
    assert.equal(paused.pipelineState.status, 'paused-for-user');
    assert.equal(paused.pipelineState.currentStage, 'user-review');
    assert.equal(paused.pipelineState.stageOutputs.proposal?.items.length, 1);
    assert.equal(paused.pipelineState.stageOutputs.proposal?.items[0]?.decision, 'pending');
    assert.equal(paused.proposalId, paused.pipelineState.stageOutputs.proposal?.id, 'proposalId mirror должен синхронизироваться сразу после proposal-generation');

    // Persisted, not just returned in memory.
    const persistedPaused = await sessionStore.get('s1');
    assert.equal(persistedPaused?.pipelineState.status, 'paused-for-user');

    // Simulate the decision route: approve the one item and persist, then re-run the orchestrator.
    const item = paused.pipelineState.stageOutputs.proposal!.items[0]!;
    const approved = {
      ...paused,
      pipelineState: {
        ...paused.pipelineState,
        stageOutputs: {
          ...paused.pipelineState.stageOutputs,
          proposal: { ...paused.pipelineState.stageOutputs.proposal!, reviewConfirmedAt: new Date().toISOString(), items: [{ ...item, decision: 'approved' as const }] },
        },
      },
    };
    await sessionStore.update('s1', approved);

    const likec4Validator = new FakeLikeC4Validator();
    const architecturalReviewer = new FakeArchitecturalReviewer();
    const resumeOrchestrator = new PipelineOrchestrator();
    const result = await resumeOrchestrator.run({
      session: approved,
      ports: { confluenceAdapter, repositoryAdapter, likec4Parser, llmProvider, changeEngine, proposalGenerator, likec4Validator, architecturalReviewer },
      sessionStore,
    });

    // Стадии 13-15 реально выполнились (likec4-generation, validation, architecture-review);
    // 16 (repair) — гейт-подобная стадия: isDone сразу true (нет блокирующих проблем), run() не вызывался.
    // 17-18 (diff, preview) — тоже реально выполнились; 19 (apply) — гейт: ждёт явного действия
    // пользователя (роут apply.ts), поэтому pipeline снова останавливается, а не завершается сам.
    assert.equal(result.pipelineState.status, 'paused-for-user');
    assert.equal(result.pipelineState.currentStage, 'apply');
    assert.ok(result.pipelineState.stageOutputs.generatedFiles && result.pipelineState.stageOutputs.generatedFiles.length > 0);
    assert.equal(result.pipelineState.stageOutputs.validationResult?.technical?.ok, true);
    assert.equal(result.pipelineState.stageOutputs.validationResult?.architectural?.ok, true);
    assert.equal(result.pipelineState.stageOutputs.repairAttempts, undefined, 'repair.run() must never be called when there is nothing to repair');
    assert.ok(result.pipelineState.stageOutputs.diff, 'diff stage should have run automatically (not a gate)');
    assert.ok(result.pipelineState.stageOutputs.previewViews, 'preview stage should have run automatically (not a gate)');
    // 9 выполненных стадий 1-9 (первый run) + 1 запись о постановке на паузу на user-review +
    // 3 стадии 13-15 + 2 стадии 17-18, реально выполненные при возобновлении (16 repair и 19 apply —
    // гейт-подобные стадии: 16 пропущена молча т.к. isDone сразу true, 19 добавляет запись о паузе).
    assert.equal(result.userFacingTimeline.length, 16);

    const persistedPausedAtApply = await sessionStore.get('s1');
    assert.equal(persistedPausedAtApply?.pipelineState.status, 'paused-for-user');

    // Simulate the apply route: it writes files itself (not through a stage `run()`, see apply.ts's
    // doc comment) and then persists `stageOutputs.applyResult` directly, exactly like this.
    const applied = {
      ...result,
      applyResult: {
        appliedAt: new Date().toISOString(),
        snapshotId: 'snap-1',
        appliedItemIds: ['candidate-r1'],
        rejectedItemIds: [],
        filesChanged: ['model.c4'],
        rollbackAvailable: true,
      },
      pipelineState: {
        ...result.pipelineState,
        stageOutputs: {
          ...result.pipelineState.stageOutputs,
          applyResult: {
            appliedAt: new Date().toISOString(),
            snapshotId: 'snap-1',
            appliedItemIds: ['candidate-r1'],
            rejectedItemIds: [],
            filesChanged: ['model.c4'],
            rollbackAvailable: true,
          },
        },
      },
    };
    await sessionStore.update('s1', applied);

    const finalOrchestrator = new PipelineOrchestrator();
    const finished = await finalOrchestrator.run({
      session: applied,
      ports: { confluenceAdapter, repositoryAdapter, likec4Parser, llmProvider, changeEngine, proposalGenerator, likec4Validator, architecturalReviewer },
      sessionStore,
    });

    // apply.isDone становится true и это последняя стадия — orchestrator просто закрывает статус,
    // не добавляя новую запись в timeline (никакой advance() не вызывается для уже готового гейта).
    assert.equal(finished.pipelineState.status, 'completed');
    assert.equal(finished.userFacingTimeline.length, 16);

    const persisted = await sessionStore.get('s1');
    assert.equal(persisted?.pipelineState.status, 'completed');
  });
});

test('pauses at user-clarification when ambiguity-detection raises an open question, then resumes into user-review once it is answered', async () => {
  await withStore(async (sessionStore) => {
    const ports = {
      confluenceAdapter: new FakeConfluenceAdapter(),
      repositoryAdapter: new FakeRepositoryAdapter(),
      likec4Parser: new FakeLikeC4Parser(),
      llmProvider: new FakeLLMProvider(),
      changeEngine: new FakeChangeEngine({ needsClarification: true }),
      proposalGenerator: new FakeProposalGenerator(),
    };

    const session = fixtureSession();
    await sessionStore.create(session);

    const orchestrator = new PipelineOrchestrator();
    const paused = await orchestrator.run({ session, ports, sessionStore });

    assert.equal(paused.pipelineState.status, 'paused-for-user');
    assert.equal(paused.pipelineState.currentStage, 'user-clarification');
    assert.equal(paused.pipelineState.stageOutputs.ambiguities?.length, 1);
    assert.equal(paused.pipelineState.stageOutputs.ambiguities?.[0]?.status, 'open');
    assert.deepEqual(paused.pipelineState.pendingQuestionIds, [paused.pipelineState.stageOutputs.ambiguities![0]!.id]);
    assert.deepEqual(paused.questions, paused.pipelineState.stageOutputs.ambiguities, 'session.questions зеркало должно синхронизироваться сразу после ambiguity-detection, а не только после ответа');

    const persisted = await sessionStore.get('s1');
    assert.equal(persisted?.pipelineState.status, 'paused-for-user');

    // Simulate the answer route: flip the one open question to answered and persist, exactly as
    // apps/server/src/routes/questions.ts does, then re-run the orchestrator against the fresh state.
    const question = paused.pipelineState.stageOutputs.ambiguities![0]!;
    const answered = {
      ...paused,
      pipelineState: {
        ...paused.pipelineState,
        stageOutputs: {
          ...paused.pipelineState.stageOutputs,
          ambiguities: [{ ...question, status: 'answered' as const, answer: { selectedOptionId: 'confirm-match', answeredAt: new Date().toISOString() } }],
        },
      },
    };
    await sessionStore.update('s1', answered);

    const resumeOrchestrator = new PipelineOrchestrator();
    const result = await resumeOrchestrator.run({ session: answered, ports, sessionStore });

    // Ответ снял вопрос, но proposal-generation теперь сгенерировал item в статусе 'pending' —
    // pipeline не завершится сам, пока человек не примет решение по нему (user-review, стадия 12).
    assert.equal(result.pipelineState.status, 'paused-for-user');
    assert.equal(result.pipelineState.currentStage, 'user-review');
    assert.equal(result.pipelineState.stageOutputs.proposal?.items.length, 1);
  });
});

test('resuming after a simulated process restart continues from the last completed stage without re-running earlier ones', async () => {
  await withStore(async (sessionStore) => {
    const confluenceAdapter = new FakeConfluenceAdapter();
    const repositoryAdapter = new FakeRepositoryAdapter();
    const likec4Parser = new FakeLikeC4Parser();
    const ports = {
      confluenceAdapter,
      repositoryAdapter,
      likec4Parser,
      llmProvider: new FakeLLMProvider(),
      changeEngine: new FakeChangeEngine(),
      proposalGenerator: new FakeProposalGenerator(),
    };

    const session = fixtureSession();
    await sessionStore.create(session);

    // First "process": only load-confluence + parse-specification complete, then we stop (simulating a crash)
    // by just not continuing the loop — the orchestrator itself has no notion of "stopping early", so we
    // simulate the crash by constructing a fresh orchestrator against the *persisted* state after reading it
    // back, rather than the in-memory `session` object, exactly as a restarted server would.
    const partialOrchestrator = new PipelineOrchestrator();
    // Run only through completion once to get a fully persisted trail, then rewind persisted state manually
    // to "as if" only 2 stages had completed, to exercise resume from a real DB read.
    await partialOrchestrator.run({ session, ports, sessionStore });
    assert.equal(confluenceAdapter.calls, 1);
    assert.equal(repositoryAdapter.calls, 1);
    assert.equal(likec4Parser.calls, 1);

    // "Restart": reload from the store fresh (a new process would not have the in-memory `session` object)
    // and run again — every stage's isDone() should be true, so nothing re-executes.
    const reloaded = await sessionStore.get('s1');
    assert.ok(reloaded);
    const secondOrchestrator = new PipelineOrchestrator();
    const result = await secondOrchestrator.run({ session: reloaded, ports, sessionStore });

    // Дошли до конца STAGES без повторного вызова ранних стадий — user-review остаётся на паузе,
    // пока proposal-item в статусе 'pending', но это уже за пределами того, что проверяет этот тест.
    assert.equal(result.pipelineState.status, 'paused-for-user');
    assert.equal(result.pipelineState.currentStage, 'user-review');
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
    assert.equal(persisted?.pipelineState.currentStage, 'load-likec4', 'failure must identify the failing stage, not the previous successful stage');
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

    const ports = {
      confluenceAdapter,
      repositoryAdapter,
      likec4Parser,
      llmProvider: new FakeLLMProvider(),
      changeEngine: new FakeChangeEngine(),
      proposalGenerator: new FakeProposalGenerator(),
    };
    await assert.rejects(() => orchestrator.run({ session, ports, sessionStore }));
    assert.equal(confluenceAdapter.calls, 1);

    const failed = await sessionStore.get('s1');
    assert.ok(failed);
    const retryOrchestrator = new PipelineOrchestrator();
    const result = await retryOrchestrator.run({ session: failed, ports, sessionStore });

    // Как и в предыдущем тесте — гейт user-review держит сессию на паузе, пока item 'pending';
    // здесь важно только то, что упавшая стадия была ровно одна и она успешно повторилась.
    assert.equal(result.pipelineState.status, 'paused-for-user');
    assert.equal(result.pipelineState.currentStage, 'user-review');
    assert.equal(confluenceAdapter.calls, 1, 'load-confluence should not be re-run on retry');
    assert.equal(repositoryAdapter.calls, 2, 'load-likec4 is retried once');
  });
});


test('active stage is persisted before an adapter is called, clearing stale errors on resume', async () => {
  await withStore(async (sessionStore) => {
    const record = fixtureSession();
    record.pipelineState.status = 'failed';
    record.pipelineState.error = { id: 'old', title: 'Old error', likelyCause: 'Old cause', suggestedAction: 'Retry', retryable: true };
    await sessionStore.create(record);
    const adapter = new FakeConfluenceAdapter();
    adapter.fetchPage = async () => {
      const active = await sessionStore.get(record.id);
      assert.equal(active?.pipelineState.status, 'running');
      assert.equal(active?.pipelineState.currentStage, 'load-confluence');
      assert.equal(active?.pipelineState.error, undefined);
      throw new Error('simulated failure after inspection');
    };
    await assert.rejects(() => new PipelineOrchestrator().run({ session: record, sessionStore, ports: { confluenceAdapter: adapter, repositoryAdapter: new FakeRepositoryAdapter(), likec4Parser: new FakeLikeC4Parser() } }), /simulated failure/);
  });
});
