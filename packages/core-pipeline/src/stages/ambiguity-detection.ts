import { randomUUID } from 'node:crypto';
import type { ArchitectureChangeCandidate, ClarificationQuestion, ConflictNote } from '@likec4-ai/core-domain';
import type { PipelineStageDef } from '../stage.js';

/**
 * Стадия 9. Берёт уже посчитанные сигналы двух предыдущих стадий —
 * `needsClarification` из Gap Analysis (стадия 8) и структурные конфликты из
 * `ChangeEngine.resolveConflicts` — и превращает их в явные ClarificationQuestion,
 * а не в тихое решение по приоритету источников (ФТ14). Настоящее семантическое
 * разрешение конфликтов (когда два источника содержательно противоречат друг
 * другу, а не просто метят в один и тот же элемент) — на текущем уровне
 * `resolveConflicts` не определяется программно; распознаётся только структурный
 * случай "несколько требований независимо целятся в один существующий элемент".
 * Расширение до содержательного анализа — не в рамках Milestone 7 (см. explain.md).
 */
export const ambiguityDetectionStage: PipelineStageDef = {
  id: 'ambiguity-detection',
  label: 'Выявление неоднозначностей',
  isDone: (outputs) => outputs.ambiguities !== undefined,
  async run(state, { ports }) {
    const candidates = state.stageOutputs.changeCandidates;
    if (!candidates) throw new Error('ambiguity-detection requires changeCandidates from gap-analysis');
    if (!ports.changeEngine) throw new Error('ambiguity-detection requires a ChangeEngine — configure AI settings for this project');

    if (candidates.length === 0) return { ambiguities: [] };

    const resolutions = await ports.changeEngine.resolveConflicts(candidates);
    const remainingConflictByCandidateId = new Map(
      resolutions.filter((r) => r.remainingConflict).map((r) => [r.candidateId, r.remainingConflict!]),
    );

    const ambiguities: ClarificationQuestion[] = [];
    for (const candidate of candidates) {
      const conflict = remainingConflictByCandidateId.get(candidate.id);
      if (conflict) {
        ambiguities.push(conflictQuestion(candidate, conflict));
      } else if (candidate.needsClarification) {
        ambiguities.push(lowConfidenceQuestion(candidate));
      }
    }
    return { ambiguities };
  },
};

function conflictQuestion(candidate: ArchitectureChangeCandidate, conflict: ConflictNote): ClarificationQuestion {
  return {
    id: randomUUID(),
    originKind: 'user-decision-needed',
    text: `Несколько требований независимо предлагают изменить один и тот же элемент архитектуры (${candidate.matchedElementId}). Как поступить?`,
    whyNeeded: conflict.description,
    relatedProposalItemIds: [candidate.id],
    options: [
      { id: 'keep-separate', label: 'Оставить оба изменения отдельно' },
      { id: 'merge', label: 'Считать это одним изменением' },
    ],
    allowFreeText: true,
    status: 'open',
  };
}

function lowConfidenceQuestion(candidate: ArchitectureChangeCandidate): ClarificationQuestion {
  const options = candidate.matchedElementId
    ? [
        { id: 'confirm-match', label: `Да, это тот же элемент (${candidate.matchedElementId})` },
        { id: 'reject-match', label: 'Нет, это новый элемент' },
      ]
    : [
        { id: 'confirm-new', label: 'Да, это новый элемент архитектуры' },
        { id: 'reject-new', label: 'Нет, это на самом деле существующий элемент' },
      ];

  return {
    id: randomUUID(),
    originKind: 'ai-assumption-needs-confirmation',
    text: candidate.matchedElementId
      ? `AI не полностью уверен, что "${candidate.description}" — это изменение элемента "${candidate.matchedElementId}", а не что-то новое. Подтвердите.`
      : `AI предполагает, что "${candidate.description}" — новый элемент архитектуры, но уверенность ниже порога. Подтвердите.`,
    whyNeeded:
      'Уверенность автоматического сопоставления с существующей архитектурой ниже настроенного порога — ошибка здесь тиражируется во все последующие стадии, поэтому решение принимает человек, а не тихое предположение AI.',
    relatedProposalItemIds: [candidate.id],
    options,
    allowFreeText: true,
    status: 'open',
  };
}
