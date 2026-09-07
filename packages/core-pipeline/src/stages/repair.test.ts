import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  ArchitectureElement,
  ArchitectureGraph,
  ArchitecturalReviewer,
  ArchitecturalValidationResult,
  LikeC4ParseResult,
  LikeC4Parser,
  LikeC4Validator,
  PipelineState,
  ProposalGenerator,
  ProposalItem,
  ProposalRepairInput,
  RepositoryFile,
  TechnicalValidationResult,
} from '@likec4-ai/core-domain';
import { repairStage } from './repair.js';

function graphOf(elements: ArchitectureElement[]): ArchitectureGraph {
  return {
    elements: new Map(elements.map((e) => [e.id, e])),
    relationships: new Map(),
    views: new Map(),
    byKind: new Map(),
    byTag: new Map(),
    neighborsIndex: new Map(),
    sourceFileOf: new Map(),
  };
}

function proposalItem(overrides: Partial<ProposalItem> & Pick<ProposalItem, 'id'>): ProposalItem {
  return {
    type: 'new-element',
    title: 'X',
    proposedLikeC4Code: 'service x "X" { descriptio "typo" }',
    explanation: { what: 'w', why: 'y', impact: 'i', confidence: 0.8, assumptions: [] },
    sources: [],
    decision: 'approved',
    ...overrides,
  };
}

class FixedLikeC4Parser implements LikeC4Parser {
  async parseProject(files: RepositoryFile[]): Promise<LikeC4ParseResult> {
    return { graph: graphOf([]), diagnostics: [], sourceFiles: files.map((f) => f.path) };
  }
}

function stateWith(items: ProposalItem[], technical: TechnicalValidationResult, architectural: ArchitecturalValidationResult): PipelineState {
  return {
    currentStage: 'repair',
    status: 'running',
    stageOutputs: {
      proposal: { id: 'p1', sessionId: 's1', createdAt: new Date().toISOString(), items, status: 'under-review' },
      architectureGraph: graphOf([]),
      existingFiles: [],
      generatedFiles: [{ path: 'generated/x.c4', content: items[0]!.proposedLikeC4Code! }],
      validationResult: { technical, architectural },
    },
    pendingQuestionIds: [],
  };
}

test('self-heals in one attempt: repair fixes the broken item and the loop exits once validation is clean', async () => {
  const item = proposalItem({ id: 'i1' });
  const brokenTechnical: TechnicalValidationResult = { ok: false, diagnostics: [{ severity: 'error', file: 'generated/x.c4', message: 'unknown property "descriptio"' }] };
  const cleanTechnical: TechnicalValidationResult = { ok: true, diagnostics: [] };

  let repairCallCount = 0;
  const proposalGenerator: ProposalGenerator = {
    async generate() {
      throw new Error('not used');
    },
    async repair(input: ProposalRepairInput): Promise<ProposalItem> {
      repairCallCount++;
      assert.equal(input.item.id, 'i1');
      assert.equal(input.diagnostics.length, 1);
      return { ...input.item, proposedLikeC4Code: 'service x "X" { description "fixed" }' };
    },
  };
  const likec4Validator: LikeC4Validator = {
    async validateTechnical() {
      return cleanTechnical;
    },
    async renderViewsPreview() {
      return [];
    },
  };
  const architecturalReviewer: ArchitecturalReviewer = {
    async review() {
      return { ok: true, findings: [] };
    },
  };

  const state = stateWith([item], brokenTechnical, { ok: true, findings: [] });
  const result = await repairStage.run(state, {
    session: {} as never,
    ports: { likec4Parser: new FixedLikeC4Parser(), likec4Validator, architecturalReviewer, proposalGenerator } as never,
  });

  assert.equal(repairCallCount, 1);
  assert.equal(result.validationResult?.technical?.ok, true);
  assert.equal(result.repairAttempts?.length, 1);
  assert.equal(result.repairAttempts?.[0]?.succeeded, true);
  assert.equal(result.proposal?.items[0]?.proposedLikeC4Code, 'service x "X" { description "fixed" }');
});

test('exhausts attempts and throws an explicit error with the full diagnostics dump — never silently applies invalid code', async () => {
  const item = proposalItem({ id: 'i1' });
  const alwaysBroken: TechnicalValidationResult = { ok: false, diagnostics: [{ severity: 'error', file: 'generated/x.c4', message: 'still broken' }] };

  let repairCallCount = 0;
  const proposalGenerator: ProposalGenerator = {
    async generate() {
      throw new Error('not used');
    },
    async repair(input: ProposalRepairInput): Promise<ProposalItem> {
      repairCallCount++;
      return { ...input.item, proposedLikeC4Code: `still broken attempt ${repairCallCount}` };
    },
  };
  const likec4Validator: LikeC4Validator = {
    async validateTechnical() {
      return alwaysBroken;
    },
    async renderViewsPreview() {
      return [];
    },
  };
  const architecturalReviewer: ArchitecturalReviewer = {
    async review() {
      return { ok: true, findings: [] };
    },
  };

  const state = stateWith([item], alwaysBroken, { ok: true, findings: [] });

  await assert.rejects(
    () =>
      repairStage.run(state, {
        session: {} as never,
        ports: { likec4Parser: new FixedLikeC4Parser(), likec4Validator, architecturalReviewer, proposalGenerator } as never,
      }),
    (err: Error) => {
      assert.match(err.message, /Не удалось исправить/);
      assert.match(err.message, /still broken/);
      return true;
    },
  );
  // Ровно MAX_REPAIR_ATTEMPTS (2) попыток — не бесконечный цикл и не ноль.
  assert.equal(repairCallCount, 2);
});

test('isDone is true (and run() is skipped by the orchestrator) once there is nothing left to repair', () => {
  const clean: TechnicalValidationResult = { ok: true, diagnostics: [] };
  const cleanArchitectural: ArchitecturalValidationResult = { ok: true, findings: [] };
  assert.equal(repairStage.isDone({ validationResult: { technical: clean, architectural: cleanArchitectural } }), true);
});

test('isDone is false while a "must" architectural finding remains, even if technical validation is clean', () => {
  const clean: TechnicalValidationResult = { ok: true, diagnostics: [] };
  const withMustFinding: ArchitecturalValidationResult = {
    ok: false,
    findings: [{ ruleId: 'r1', severity: 'must', message: 'missing owner', affectedItemId: 'i1', autoFixable: false }],
  };
  assert.equal(repairStage.isDone({ validationResult: { technical: clean, architectural: withMustFinding } }), false);
});

test('isDone is true when only "should" findings remain — those are warnings, not blockers', () => {
  const clean: TechnicalValidationResult = { ok: true, diagnostics: [] };
  const onlyShould: ArchitecturalValidationResult = {
    ok: true,
    findings: [{ ruleId: 'r1', severity: 'should', message: 'looks like a duplicate', affectedItemId: 'i1', autoFixable: false }],
  };
  assert.equal(repairStage.isDone({ validationResult: { technical: clean, architectural: onlyShould } }), true);
});
