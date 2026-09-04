import type { ConfluenceSection } from '@likec4-ai/core-domain';
import type { PipelineStageDef } from '../stage.js';

/**
 * Нормализует секции Confluence-страницы в `SpecificationChunk[]` —
 * детерминированное структурное преобразование, БЕЗ обращения к LLM.
 * Реальное извлечение архитектурно значимых требований (стадия 6, Extract
 * Requirements) — задача LLM и появится в Milestone 6; эта стадия только
 * готовит текстовое представление секций, на которое та стадия будет
 * опираться. Согласовано с таблицей стадий плана, где "Parse Specification"
 * помечена как лишь частично-LLM (в основном структурирование).
 */
export const parseSpecificationStage: PipelineStageDef = {
  id: 'parse-specification',
  label: 'Разбор спецификации',
  isDone: (outputs) => outputs.specification !== undefined,
  async run(state) {
    const content = state.stageOutputs.confluenceContent;
    if (!content) {
      throw new Error('parse-specification requires confluenceContent from the load-confluence stage');
    }

    const chunks = content.sections
      .map((section) => ({ id: section.id, sectionIds: [section.id], text: sectionToText(section) }))
      .filter((chunk) => chunk.text.trim().length > 0);

    return { specification: { source: content, chunks } };
  },
};

function sectionToText(section: ConfluenceSection): string {
  if (section.text) return section.text;
  if (section.codeBlock) return section.codeBlock.content;
  if (section.table) {
    return [section.table.headers.join(' | '), ...section.table.rows.map((row) => row.join(' | '))].join('\n');
  }
  return '';
}
