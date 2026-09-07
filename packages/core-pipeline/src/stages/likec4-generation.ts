import { assembleGeneratedFiles } from '../likec4-file-assembler.js';
import type { PipelineStageDef } from '../stage.js';

/**
 * Стадия 13 (Milestone 9). Чисто механическая — не вызывает LLM: код уже
 * написан (стадией 11 и, возможно, отредактирован человеком на стадии 12),
 * здесь он только размещается в правильном месте гипотетического слитого
 * состояния файлов. См. `assembleGeneratedFiles` за подробностями.
 */
export const likec4GenerationStage: PipelineStageDef = {
  id: 'likec4-generation',
  label: 'Генерация LikeC4',
  isDone: (outputs) => outputs.generatedFiles !== undefined,
  async run(state) {
    const proposal = state.stageOutputs.proposal;
    const graph = state.stageOutputs.architectureGraph;
    const existingFiles = state.stageOutputs.existingFiles;
    if (!proposal || !graph || !existingFiles) {
      throw new Error('likec4-generation requires proposal, architectureGraph and existingFiles from earlier stages');
    }

    const { files } = assembleGeneratedFiles(existingFiles, proposal.items, graph);
    return { generatedFiles: files };
  },
};
