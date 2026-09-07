import { assembleGeneratedFiles } from '../likec4-file-assembler.js';
import type { PipelineStageDef } from '../stage.js';

/**
 * Стадия 15 (Milestone 9) — Level 2 валидации: детерминированный rule-engine
 * (`ArchitecturalReviewer`) поверх графа, реально построенного из
 * гипотетического слитого состояния (не исходного графа — новые/изменённые
 * элементы должны быть проверены такими, какими они реально получились).
 * `itemsByFile` пересчитывается заново тем же чистым `assembleGeneratedFiles`,
 * а не хранится отдельным полем в stageOutputs — то же рассуждение, что и с
 * `pendingQuestionIds` в Milestone 7: не заводить вторую копию состояния,
 * которую придётся держать в синхроне вручную.
 */
export const architectureReviewStage: PipelineStageDef = {
  id: 'architecture-review',
  label: 'Архитектурная проверка',
  isDone: (outputs) => outputs.validationResult?.architectural !== undefined,
  async run(state, { session, ports }) {
    const proposal = state.stageOutputs.proposal;
    const existingGraph = state.stageOutputs.architectureGraph;
    const existingFiles = state.stageOutputs.existingFiles;
    const generatedFiles = state.stageOutputs.generatedFiles;
    if (!proposal || !existingGraph || !existingFiles || !generatedFiles) {
      throw new Error('architecture-review requires proposal, architectureGraph, existingFiles and generatedFiles from earlier stages');
    }
    if (!ports.likec4Parser) throw new Error('architecture-review requires a LikeC4Parser');
    if (!ports.architecturalReviewer) throw new Error('architecture-review requires an ArchitecturalReviewer');

    const { itemsByFile } = assembleGeneratedFiles(existingFiles, proposal.items, existingGraph);
    const { graph: newGraph } = await ports.likec4Parser.parseProject(generatedFiles);
    const rules = (await ports.architectureRuleStore?.list(session.projectId)) ?? [];

    const architectural = await ports.architecturalReviewer.review({
      items: proposal.items,
      newGraph,
      existingGraph,
      rules,
      itemsByFile,
    });

    return { validationResult: { ...state.stageOutputs.validationResult, architectural } };
  },
};
