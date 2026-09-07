import { computeFileDiff } from '../diff.js';
import type { PipelineStageDef } from '../stage.js';

/** Стадия 17 (Milestone 10) — см. `computeFileDiff` за подробностями сравнения. */
export const diffStage: PipelineStageDef = {
  id: 'diff',
  label: 'Сравнение изменений',
  isDone: (outputs) => outputs.diff !== undefined,
  async run(state) {
    const existingFiles = state.stageOutputs.existingFiles;
    const generatedFiles = state.stageOutputs.generatedFiles;
    if (!existingFiles || !generatedFiles) {
      throw new Error('diff requires existingFiles and generatedFiles from earlier stages');
    }

    return { diff: computeFileDiff(existingFiles, generatedFiles) };
  },
};
