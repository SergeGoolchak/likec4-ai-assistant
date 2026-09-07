import type { PipelineStageDef } from '../stage.js';

/**
 * Стадия 18 (Milestone 10) — рендерит итоговое (гипотетическое слитое)
 * состояние через уже существующий с Milestone 1 порт `renderViewsPreview`
 * (первый его реальный потребитель). Без фильтра viewIds — превьюшим все
 * views итогового состояния, не только затронутые изменением.
 */
export const previewStage: PipelineStageDef = {
  id: 'preview',
  label: 'Рендер превью диаграмм',
  isDone: (outputs) => outputs.previewViews !== undefined,
  async run(state, { ports }) {
    const generatedFiles = state.stageOutputs.generatedFiles;
    if (!generatedFiles) throw new Error('preview requires generatedFiles from likec4-generation');
    if (!ports.likec4Validator) throw new Error('preview requires a LikeC4Validator');

    const previewViews = await ports.likec4Validator.renderViewsPreview(generatedFiles);
    return { previewViews };
  },
};
