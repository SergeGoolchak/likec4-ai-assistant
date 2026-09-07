import type { PipelineStageDef } from '../stage.js';

/**
 * Стадия 14 (Milestone 9) — Level 1 валидации из плана: синтаксис, ссылки,
 * дубликаты id, целостность через программный API `likec4` на гипотетическом
 * слитом состоянии (`generatedFiles`), без записи на диск (уже гарантировано
 * реализацией `LikeC4Validator`, Milestone 1).
 */
export const validationStage: PipelineStageDef = {
  id: 'validation',
  label: 'Техническая валидация',
  isDone: (outputs) => outputs.validationResult?.technical !== undefined,
  async run(state, { ports }) {
    const generatedFiles = state.stageOutputs.generatedFiles;
    if (!generatedFiles) throw new Error('validation requires generatedFiles from likec4-generation');
    if (!ports.likec4Validator) throw new Error('validation requires a LikeC4Validator');

    const technical = await ports.likec4Validator.validateTechnical(generatedFiles);
    return { validationResult: { ...state.stageOutputs.validationResult, technical } };
  },
};
