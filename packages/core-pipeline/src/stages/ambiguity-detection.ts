import { randomUUID } from 'node:crypto';
import type { ArchitectureChangeCandidate, ClarificationQuestion, ConflictNote, ElementId } from '@likec4-ai/core-domain';
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

    // Один вопрос на ГРУППУ конфликтующих кандидатов, а не по одному на каждого — иначе для
    // конфликта из N требований пользователь увидел бы N раз буквально один и тот же вопрос.
    // resolveConflicts уже группирует по matchedElementId внутри себя; регруппируем здесь по
    // тому же ключу, а не изобретаем новый способ связать кандидатов из одной группы.
    const conflictGroups = new Map<ElementId, ArchitectureChangeCandidate[]>();
    for (const candidate of candidates) {
      if (!remainingConflictByCandidateId.has(candidate.id) || !candidate.matchedElementId) continue;
      const group = conflictGroups.get(candidate.matchedElementId) ?? [];
      group.push(candidate);
      conflictGroups.set(candidate.matchedElementId, group);
    }

    const ambiguities: ClarificationQuestion[] = [];
    const candidateIdsInConflict = new Set<string>();
    for (const [elementId, group] of conflictGroups) {
      const conflict = remainingConflictByCandidateId.get(group[0]!.id)!;
      ambiguities.push(conflictQuestion(elementId, group, conflict));
      for (const candidate of group) candidateIdsInConflict.add(candidate.id);
    }

    for (const candidate of candidates) {
      if (candidateIdsInConflict.has(candidate.id)) continue;
      if (candidate.needsClarification) ambiguities.push(lowConfidenceQuestion(candidate));
    }
    return { ambiguities };
  },
};

function conflictQuestion(matchedElementId: ElementId, group: ArchitectureChangeCandidate[], conflict: ConflictNote): ClarificationQuestion {
  return {
    id: randomUUID(),
    originKind: 'user-decision-needed',
    text: `${group.length} требования независимо предлагают изменить один и тот же элемент архитектуры (${matchedElementId}). Как поступить?`,
    whyNeeded: conflict.description,
    relatedProposalItemIds: group.map((c) => c.id),
    options: [
      { id: 'keep-separate', label: 'Оставить изменения отдельно друг от друга' },
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
