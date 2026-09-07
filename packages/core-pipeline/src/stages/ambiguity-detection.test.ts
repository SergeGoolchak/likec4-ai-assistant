import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ArchitectureChangeCandidate, ChangeEngine, ConflictResolution, EntityMatchInput, EntityMatchResult, GapAnalysisInput, PipelineState } from '@likec4-ai/core-domain';
import { ambiguityDetectionStage } from './ambiguity-detection.js';

function candidate(overrides: Partial<ArchitectureChangeCandidate> & Pick<ArchitectureChangeCandidate, 'id'>): ArchitectureChangeCandidate {
  return {
    type: 'modified-element',
    requirementIds: [],
    description: 'change',
    sources: [],
    needsClarification: false,
    ...overrides,
  };
}

class StubChangeEngine implements ChangeEngine {
  constructor(private resolutions: ConflictResolution[]) {}
  async matchEntities(_input: EntityMatchInput): Promise<EntityMatchResult[]> {
    throw new Error('not used');
  }
  async detectGaps(_input: GapAnalysisInput): Promise<ArchitectureChangeCandidate[]> {
    throw new Error('not used');
  }
  async resolveConflicts(_candidates: ArchitectureChangeCandidate[]): Promise<ConflictResolution[]> {
    return this.resolutions;
  }
}

function stateWith(candidates: ArchitectureChangeCandidate[]): PipelineState {
  return { currentStage: 'ambiguity-detection', status: 'running', stageOutputs: { changeCandidates: candidates }, pendingQuestionIds: [] };
}

test('a single unresolved conflict group of N candidates produces exactly ONE question referencing all N, not one per candidate', async () => {
  const conflict = { description: 'same target', conflictingSources: [], requiresUserDecision: true };
  const candidates = [
    candidate({ id: 'c1', matchedElementId: 'orderService' }),
    candidate({ id: 'c2', matchedElementId: 'orderService' }),
    candidate({ id: 'c3', matchedElementId: 'orderService' }),
  ];
  const changeEngine = new StubChangeEngine(candidates.map((c) => ({ candidateId: c.id, resolved: false, remainingConflict: conflict })));

  const result = await ambiguityDetectionStage.run(stateWith(candidates), { session: {} as never, ports: { changeEngine } as never });

  assert.equal(result.ambiguities?.length, 1, 'three conflicting candidates must raise exactly one shared question');
  assert.deepEqual(result.ambiguities?.[0]?.relatedProposalItemIds.sort(), ['c1', 'c2', 'c3']);
});

test('candidates with independent (non-conflicting) low confidence still get one question each', async () => {
  const candidates = [
    candidate({ id: 'c1', needsClarification: true, matchedElementId: undefined }),
    candidate({ id: 'c2', needsClarification: true, matchedElementId: undefined }),
  ];
  const changeEngine = new StubChangeEngine(candidates.map((c) => ({ candidateId: c.id, resolved: true })));

  const result = await ambiguityDetectionStage.run(stateWith(candidates), { session: {} as never, ports: { changeEngine } as never });

  assert.equal(result.ambiguities?.length, 2);
  assert.deepEqual(result.ambiguities?.map((q) => q.relatedProposalItemIds), [['c1'], ['c2']]);
});

test('a confidently resolved conflict (no remainingConflict) raises no question at all', async () => {
  const candidates = [candidate({ id: 'c1', matchedElementId: 'orderService' }), candidate({ id: 'c2', matchedElementId: 'orderService' })];
  const changeEngine = new StubChangeEngine(candidates.map((c) => ({ candidateId: c.id, resolved: true, resolutionNote: 'merged mechanically' })));

  const result = await ambiguityDetectionStage.run(stateWith(candidates), { session: {} as never, ports: { changeEngine } as never });

  assert.deepEqual(result.ambiguities, []);
});
