import { randomUUID } from 'node:crypto';
import type { PipelineStageDef } from '../stage.js';

/**
 * Стадия 11 (Milestone 8). Превращает `changeCandidates` (стадия 8) в
 * объяснимый `Proposal`, честно учитывая ответы, собранные на стадиях 9-10
 * (см. `ProposalGenerator`/`LLMProposalGenerator` — merge/reject-match/etc).
 */
export const proposalGenerationStage: PipelineStageDef = {
  id: 'proposal-generation',
  label: 'Формирование предложений',
  isDone: (outputs) => outputs.proposal !== undefined,
  async run(state, { session, ports }) {
    const candidates = state.stageOutputs.changeCandidates;
    const graph = state.stageOutputs.architectureGraph;
    if (!candidates || !graph) {
      throw new Error('proposal-generation requires changeCandidates and architectureGraph from earlier stages');
    }
    if (!ports.proposalGenerator) {
      throw new Error('proposal-generation requires a ProposalGenerator — configure AI settings for this project');
    }

    if (candidates.length === 0) {
      return { proposal: { id: randomUUID(), sessionId: session.id, createdAt: new Date().toISOString(), items: [], status: 'draft' as const } };
    }

    const ambiguities = state.stageOutputs.ambiguities ?? [];
    const rules = (await ports.architectureRuleStore?.list(session.projectId)) ?? [];
    const items = await ports.proposalGenerator.generate({ candidates, ambiguities, graph, rules, knowledgeProviders: ports.knowledgeProviders });

    return {
      proposal: { id: randomUUID(), sessionId: session.id, createdAt: new Date().toISOString(), items, status: 'under-review' as const },
    };
  },
};
