import type { ClarificationQuestion } from '@likec4-ai/core-domain';

/**
 * `PipelineState.pendingQuestionIds` — не независимо поддерживаемое состояние,
 * а производное от `stageOutputs.ambiguities`: единственный источник истины —
 * сам список вопросов, а `pendingQuestionIds` — просто его открытая проекция.
 * Пересчитывается заново в двух местах (стадия user-clarification и роут
 * ответа на вопрос) через эту функцию, а не мутируется вручную в каждом —
 * иначе оба списка рано или поздно разойдутся.
 */
export function computePendingQuestionIds(ambiguities: ClarificationQuestion[]): string[] {
  return ambiguities.filter((q) => q.status === 'open').map((q) => q.id);
}
