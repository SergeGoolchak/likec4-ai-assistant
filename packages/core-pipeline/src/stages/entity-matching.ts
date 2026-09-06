import type { PipelineStageDef } from '../stage.js';

export const entityMatchingStage: PipelineStageDef = {
  id: 'entity-matching',
  label: 'Сопоставление с существующей архитектурой',
  isDone: (outputs) => outputs.entityMatches !== undefined,
  async run(state, { ports }) {
    const requirements = state.stageOutputs.extractedRequirements;
    const graph = state.stageOutputs.architectureGraph;
    if (!requirements || !graph) {
      throw new Error('entity-matching requires extractedRequirements and architectureGraph from earlier stages');
    }
    if (!ports.changeEngine) {
      throw new Error('entity-matching requires a ChangeEngine — configure AI settings for this project');
    }

    if (requirements.length === 0) return { entityMatches: [] };

    const entityMatches = await ports.changeEngine.matchEntities({ requirements, graph });
    return { entityMatches };
  },
};
