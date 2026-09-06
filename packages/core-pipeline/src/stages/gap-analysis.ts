import type { PipelineStageDef } from '../stage.js';

export const gapAnalysisStage: PipelineStageDef = {
  id: 'gap-analysis',
  label: 'Анализ пробелов в архитектуре',
  isDone: (outputs) => outputs.changeCandidates !== undefined,
  async run(state, { session, ports }) {
    const requirements = state.stageOutputs.extractedRequirements;
    const matches = state.stageOutputs.entityMatches;
    const graph = state.stageOutputs.architectureGraph;
    if (!requirements || !matches || !graph) {
      throw new Error('gap-analysis requires extractedRequirements, entityMatches and architectureGraph from earlier stages');
    }
    if (!ports.changeEngine) {
      throw new Error('gap-analysis requires a ChangeEngine — configure AI settings for this project');
    }

    if (requirements.length === 0) return { changeCandidates: [] };

    const rules = (await ports.architectureRuleStore?.list(session.projectId)) ?? [];
    const changeCandidates = await ports.changeEngine.detectGaps({ requirements, matches, graph, rules });
    return { changeCandidates };
  },
};
