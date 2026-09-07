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
} from '@likec4-ai/core-domain';
import { openDatabase, SqliteSessionHistoryStore } from '@likec4-ai/persistence';
import { PipelineOrchestrator } from './orchestrator.js';

/**
 * Milestone 12, DoD: «тест "убить процесс/сеть на каждой стадии" ни разу не
 * портит исходный LikeC4-проект». Интерпретация "убить сеть" — thrown error
 * из соответствующего внешнего порта именно на целевой стадии (тот же
 * механизм, что и `orchestrator.test.ts`'s `shouldThrowOnce`, только
 * систематически на каждую стадию с внешним вызовом, а не только на одну).
 *
 * Универсальный инвариант, проверяемый на КАЖДОЙ стадии: `TrapRepositoryAdapter`
 * бросает, если его `writeFiles`/`deleteFiles` вообще вызвали — ни одна из
 * стадий 1-18 не должна писать в исходный репозиторий ни при каком исходе
 * (запись происходит только в Apply, apps/server/src/apply-executor.ts,
 * покрыт отдельными тестами там). Это и есть формальное доказательство того,
 * что "исходный LikeC4-проект" структурно не может быть испорчен сбоем ни
 * одной из стадий 1-18, независимо от того, где именно она упала.
 */
class TrapRepositoryAdapter implements RepositoryAdapter {
  readonly kind = 'local' as const;
  writeFilesCalled = false;
  deleteFilesCalled = false;

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
    return [{ path: 'model.c4', content: 'specification { element service } model { service orderService "Order Service" }' }];
  }
  async writeFiles(): Promise<void> {
    this.writeFilesCalled = true;
    throw new Error('TrapRepositoryAdapter.writeFiles must never be called by pipeline stages 1-18');
  }
  async deleteFiles(): Promise<void> {
    this.deleteFilesCalled = true;
    throw new Error('TrapRepositoryAdapter.deleteFiles must never be called by pipeline stages 1-18');
  }
  async getRevisionInfo() {
    return { capturedAt: new Date().toISOString() };
  }
}

class FakeConfluenceAdapter implements ConfluenceAdapter {
  shouldThrow = false;
  async testConnection() {
    return { ok: true };
  }
  async fetchPage(ref: ConfluencePageRef): Promise<ConfluencePageContent> {
    if (this.shouldThrow) throw new Error('ECONNREFUSED: confluence unreachable');
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

function graph(): ArchitectureGraph {
  return {
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
}

class FakeLikeC4Parser implements LikeC4Parser {
  shouldThrow = false;
  async parseProject(files: RepositoryFile[]): Promise<LikeC4ParseResult> {
    if (this.shouldThrow) throw new Error('ETIMEDOUT: likec4 parse timed out');
    return { graph: graph(), diagnostics: [], sourceFiles: files.map((f) => f.path) };
  }
}

class FakeLLMProvider implements LLMProvider {
  readonly id = 'fake';
  readonly model = 'fake';
  readonly isLocal = true;
  shouldThrowInExtraction = false;

  async complete(): Promise<LLMResult<string>> {
    throw new Error('not used by these tests');
  }
  async completeJSON<T>(): Promise<LLMResult<T>> {
    if (this.shouldThrowInExtraction) throw new Error('502 Bad Gateway: LLM provider unreachable');
    const content = { requirements: [{ chunkId: 's1', summary: 'Payments handling', category: 'modified-service' }] };
    return { content: content as T, usage: { promptTokens: 0, completionTokens: 0 } };
  }
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

class FakeChangeEngine implements ChangeEngine {
  shouldThrowInMatch = false;
  shouldThrowInGaps = false;
  shouldThrowInResolve = false;

  async matchEntities(input: EntityMatchInput): Promise<EntityMatchResult[]> {
    if (this.shouldThrowInMatch) throw new Error('LLM judge call failed: connection reset');
    return input.requirements.map((r) => ({ requirementId: r.id, matchedElementId: 'orderService', confidence: 0.9, rationale: 'fake match' }));
  }
  async detectGaps(input: GapAnalysisInput): Promise<ArchitectureChangeCandidate[]> {
    if (this.shouldThrowInGaps) throw new Error('LLM gap-analysis call failed: connection reset');
    return input.requirements.map((r) => ({
      id: `candidate-${r.id}`,
      type: 'modified-element',
      requirementIds: [r.id],
      matchedElementId: 'orderService',
      description: 'fake candidate',
      sources: [],
      needsClarification: false,
    }));
  }
  async resolveConflicts(candidates: ArchitectureChangeCandidate[]): Promise<ConflictResolution[]> {
    if (this.shouldThrowInResolve) throw new Error('LLM conflict-resolution call failed: connection reset');
    return candidates.map((c) => ({ candidateId: c.id, resolved: true }));
  }
}

class FakeProposalGenerator implements ProposalGenerator {
  shouldThrowInGenerate = false;
  shouldThrowInRepair = false;

  async generate(input: ProposalGenerationInput): Promise<ProposalItem[]> {
    if (this.shouldThrowInGenerate) throw new Error('LLM proposal-generation call failed: connection reset');
    return input.candidates.map((c) => ({
      id: c.id,
      type: c.type,
      title: 'Fake proposal item',
      targetElementId: c.matchedElementId,
      proposedLikeC4Code: 'service orderService "Order Service" { description "fake" }',
      explanation: { what: 'fake', why: 'fake', impact: 'fake', confidence: 0.9, assumptions: [] },
      sources: c.sources.length > 0 ? c.sources : [{ kind: 'existing-likec4-element' as const, refId: 'orderService', label: 'fake source' }],
      decision: 'approved' as const,
    }));
  }
  async repair(input: ProposalRepairInput): Promise<ProposalItem> {
    if (this.shouldThrowInRepair) throw new Error('LLM repair call failed: connection reset');
    return { ...input.item, proposedLikeC4Code: 'repaired' };
  }
}

class FakeLikeC4Validator implements LikeC4Validator {
  shouldThrowInValidate = false;
  shouldThrowInPreview = false;

  async validateTechnical(_files: RepositoryFile[]): Promise<TechnicalValidationResult> {
    if (this.shouldThrowInValidate) throw new Error('likec4 validator crashed');
    return { ok: true, diagnostics: [] };
  }
  async renderViewsPreview(): Promise<RenderedView[]> {
    if (this.shouldThrowInPreview) throw new Error('likec4 renderer crashed');
    return [];
  }
}

class FakeArchitecturalReviewer implements ArchitecturalReviewer {
  shouldThrow = false;
  /** Возвращает одну must-находку вместо ok:true — нужен, чтобы repair.run() вообще что-то делал. */
  returnMustFinding = false;

  async review(_input: ArchitecturalReviewInput): Promise<ArchitecturalValidationResult> {
    if (this.shouldThrow) throw new Error('architecture rule engine crashed');
    if (this.returnMustFinding) {
      return { ok: false, findings: [{ ruleId: 'r1', severity: 'must', message: 'bad naming', affectedItemId: 'x', autoFixable: false }] };
    }
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
  const dir = await mkdtemp(join(tmpdir(), 'likec4-ai-hardening-'));
  try {
    const db = await openDatabase(join(dir, 'app.db'));
    await fn(new SqliteSessionHistoryStore(db));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

interface Fakes {
  confluenceAdapter: FakeConfluenceAdapter;
  repositoryAdapter: TrapRepositoryAdapter;
  likec4Parser: FakeLikeC4Parser;
  llmProvider: FakeLLMProvider;
  changeEngine: FakeChangeEngine;
  proposalGenerator: FakeProposalGenerator;
  likec4Validator: FakeLikeC4Validator;
  architecturalReviewer: FakeArchitecturalReviewer;
}

function freshFakes(): Fakes {
  return {
    confluenceAdapter: new FakeConfluenceAdapter(),
    repositoryAdapter: new TrapRepositoryAdapter(),
    likec4Parser: new FakeLikeC4Parser(),
    llmProvider: new FakeLLMProvider(),
    changeEngine: new FakeChangeEngine(),
    proposalGenerator: new FakeProposalGenerator(),
    likec4Validator: new FakeLikeC4Validator(),
    architecturalReviewer: new FakeArchitecturalReviewer(),
  };
}

/** Запускает pipeline с данным набором fake-портов, ожидает падения, и проверяет универсальный инвариант. */
async function assertStageFailsWithoutTouchingRepo(fakes: Fakes, expectedFailedStage: string): Promise<void> {
  await withStore(async (sessionStore) => {
    const session = fixtureSession();
    await sessionStore.create(session);

    const orchestrator = new PipelineOrchestrator();
    await assert.rejects(() => orchestrator.run({ session, ports: fakes, sessionStore }));

    const persisted = await sessionStore.get('s1');
    assert.equal(persisted?.pipelineState.status, 'failed');
    // `pipelineState.currentStage` отражает последнюю УСПЕШНО завершённую стадию (`fail()` его не
    // трогает, только `advance()`/`pause()`) — какая стадия реально упала, однозначно видно по
    // `error.id`, который `fail()` формирует как `pipeline.<stage.id>.failed`.
    assert.equal(
      persisted?.pipelineState.error?.id,
      `pipeline.${expectedFailedStage}.failed`,
      `expected the pipeline to fail exactly at "${expectedFailedStage}"`,
    );
    assert.equal(fakes.repositoryAdapter.writeFilesCalled, false, `writeFiles must never be called (failure at "${expectedFailedStage}")`);
    assert.equal(fakes.repositoryAdapter.deleteFilesCalled, false, `deleteFiles must never be called (failure at "${expectedFailedStage}")`);
  });
}

test('load-confluence: a Confluence network failure fails cleanly without touching the repository', async () => {
  const fakes = freshFakes();
  fakes.confluenceAdapter.shouldThrow = true;
  await assertStageFailsWithoutTouchingRepo(fakes, 'load-confluence');
});

// load-likec4 (repositoryAdapter.readAll failing) is already covered by orchestrator.test.ts's
// "a failed stage persists a failed status..." test — not duplicated here.

test('extract-requirements: an LLM failure fails cleanly without touching the repository', async () => {
  const fakes = freshFakes();
  fakes.llmProvider.shouldThrowInExtraction = true;
  await assertStageFailsWithoutTouchingRepo(fakes, 'extract-requirements');
});

test('entity-matching: an LLM failure fails cleanly without touching the repository', async () => {
  const fakes = freshFakes();
  fakes.changeEngine.shouldThrowInMatch = true;
  await assertStageFailsWithoutTouchingRepo(fakes, 'entity-matching');
});

test('gap-analysis: an LLM failure fails cleanly without touching the repository', async () => {
  const fakes = freshFakes();
  fakes.changeEngine.shouldThrowInGaps = true;
  await assertStageFailsWithoutTouchingRepo(fakes, 'gap-analysis');
});

test('ambiguity-detection: an LLM failure fails cleanly without touching the repository', async () => {
  const fakes = freshFakes();
  fakes.changeEngine.shouldThrowInResolve = true;
  await assertStageFailsWithoutTouchingRepo(fakes, 'ambiguity-detection');
});

test('proposal-generation: an LLM failure fails cleanly without touching the repository', async () => {
  const fakes = freshFakes();
  fakes.proposalGenerator.shouldThrowInGenerate = true;
  await assertStageFailsWithoutTouchingRepo(fakes, 'proposal-generation');
});

// Стадии 13+ (Validation, Architecture Review, Repair, Preview) требуют пройденного гейта
// user-review — `FakeProposalGenerator.generate()` в этом файле намеренно возвращает решение
// 'approved' сразу (а не 'pending', как в orchestrator.test.ts), поэтому один и тот же
// `orchestrator.run()` проходит через ВСЕ стадии 1-18 за один вызов без ручного вмешательства,
// и `assertStageFailsWithoutTouchingRepo` годится и для них без отдельного helper'а.

test('validation: a local likec4 validator crash fails cleanly without touching the repository', async () => {
  const fakes = freshFakes();
  fakes.likec4Validator.shouldThrowInValidate = true;
  await assertStageFailsWithoutTouchingRepo(fakes, 'validation');
});

test('architecture-review: a rule-engine crash fails cleanly without touching the repository', async () => {
  const fakes = freshFakes();
  fakes.architecturalReviewer.shouldThrow = true;
  await assertStageFailsWithoutTouchingRepo(fakes, 'architecture-review');
});

test('repair: an LLM repair-call failure exhausts the loop and fails cleanly without touching the repository', async () => {
  const fakes = freshFakes();
  fakes.architecturalReviewer.returnMustFinding = true;
  fakes.proposalGenerator.shouldThrowInRepair = true;
  await assertStageFailsWithoutTouchingRepo(fakes, 'repair');
});

test('preview: a local likec4 renderer crash fails cleanly without touching the repository', async () => {
  const fakes = freshFakes();
  fakes.likec4Validator.shouldThrowInPreview = true;
  await assertStageFailsWithoutTouchingRepo(fakes, 'preview');
});
