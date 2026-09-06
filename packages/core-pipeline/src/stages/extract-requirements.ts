import { randomUUID } from 'node:crypto';
import type { ExtractedRequirement, RequirementCategory, SpecificationChunk } from '@likec4-ai/core-domain';
import type { PipelineStageDef } from '../stage.js';

const VALID_CATEGORIES: readonly RequirementCategory[] = [
  'new-service',
  'modified-service',
  'new-integration',
  'modified-integration',
  'new-api',
  'modified-api',
  'new-data-entity',
  'modified-data-entity',
  'new-algorithm',
  'modified-sequence',
  'new-queue',
  'new-database',
  'new-external-system',
  'new-event',
  'data-ownership-change',
];

interface ExtractionResponse {
  requirements: Array<{ chunkId: string; summary: string; category: string }>;
}

/**
 * LLM-стадия: решает, какие из нормализованных секций спецификации (стадия 2)
 * архитектурно значимы (ФТ8), и классифицирует их. Чанки, не описывающие
 * значимое изменение (чистый контекст/преамбула), в ExtractedRequirement не
 * попадают вовсе — это явный сигнал "здесь ничего делать не нужно", а не
 * потерянные данные (сам ParsedSpecification остаётся в stageOutputs).
 */
export const extractRequirementsStage: PipelineStageDef = {
  id: 'extract-requirements',
  label: 'Извлечение требований',
  isDone: (outputs) => outputs.extractedRequirements !== undefined,
  async run(state, { ports }) {
    const specification = state.stageOutputs.specification;
    if (!specification) {
      throw new Error('extract-requirements requires specification from the parse-specification stage');
    }
    if (!ports.llmProvider) {
      throw new Error('extract-requirements requires an LLM provider — configure AI settings for this project');
    }

    if (specification.chunks.length === 0) {
      return { extractedRequirements: [] };
    }

    const response = await ports.llmProvider.completeJSON<ExtractionResponse>(
      [
        {
          role: 'system',
          content:
            'Ты выделяешь архитектурно значимые требования из аналитической спецификации: новый/изменённый сервис, ' +
            'интеграция, API, сущность данных, алгоритм, последовательность взаимодействия, очередь, БД, внешняя система, ' +
            'событие, смена владельца данных. Пропускай куски без такого содержания (преамбула, контекст, общие слова). ' +
            `Категория обязана быть одной из: ${VALID_CATEGORIES.join(', ')}. ` +
            'Ответь строго JSON: {"requirements": [{"chunkId": string, "summary": string, "category": string}]}.',
        },
        {
          role: 'user',
          content: specification.chunks.map((chunk) => `[${chunk.id}] ${chunk.text}`).join('\n\n'),
        },
      ],
      { stage: 'extract-requirements' },
    );

    const chunkById = new Map(specification.chunks.map((chunk) => [chunk.id, chunk]));
    const requirements: ExtractedRequirement[] = [];

    for (const item of response.content.requirements ?? []) {
      const chunk = chunkById.get(item.chunkId);
      if (!chunk) continue; // модель сослалась на несуществующий chunkId — не выдумываем, пропускаем
      if (!VALID_CATEGORIES.includes(item.category as RequirementCategory)) continue; // невалидная категория — не угадываем

      requirements.push(toExtractedRequirement(item.chunkId, item.summary, item.category as RequirementCategory, chunk));
    }

    return { extractedRequirements: requirements };
  },
};

function toExtractedRequirement(
  chunkId: string,
  summary: string,
  category: RequirementCategory,
  chunk: SpecificationChunk,
): ExtractedRequirement {
  return {
    id: randomUUID(),
    summary,
    category,
    rawText: chunk.text,
    sourceSections: chunk.sectionIds.map((sectionId) => ({
      kind: 'confluence-section',
      refId: sectionId,
      label: `Confluence: раздел ${sectionId}`,
      excerpt: chunk.text.slice(0, 200),
    })),
  };
}
