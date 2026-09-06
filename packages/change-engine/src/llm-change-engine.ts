import { randomUUID } from 'node:crypto';
import type {
  ArchitectureChangeCandidate,
  ArchitectureElement,
  ChangeEngine,
  ConflictResolution,
  ElementId,
  EntityMatchInput,
  EntityMatchResult,
  ExtractedRequirement,
  GapAnalysisInput,
  LLMProvider,
  SourceReference,
} from '@likec4-ai/core-domain';
import { lexicalCandidates } from './lexical-candidates.js';
import { mapCategoryToProposalType } from './category-mapping.js';

const DEFAULT_TOP_K = 5;
/** Ниже этого — needsClarification=true (стадия 9, Milestone 7, решает, что делать дальше). Не значит "нет матча". */
const AUTO_CONFIDENT_THRESHOLD = 0.75;

interface JudgedMatch {
  matchedElementId: string | null;
  confidence: number;
  rationale: string;
}

export class LLMChangeEngine implements ChangeEngine {
  #llmProvider: LLMProvider;
  #topK: number;

  constructor(options: { llmProvider: LLMProvider; topK?: number }) {
    this.#llmProvider = options.llmProvider;
    this.#topK = options.topK ?? DEFAULT_TOP_K;
  }

  /**
   * Трёхступенчато (раздел 3.3 / риск №1 плана): лексический фильтр → (если
   * есть кандидаты) LLM-подтверждение с confidence и rationale. Если
   * лексический фильтр не дал вообще ни одного кандидата — до LLM не
   * доходит: просить модель выбрать среди нуля вариантов бессмысленно и
   * только тратит вызов впустую, результат предопределён.
   */
  async matchEntities(input: EntityMatchInput): Promise<EntityMatchResult[]> {
    const results: EntityMatchResult[] = [];

    for (const requirement of input.requirements) {
      const candidates = lexicalCandidates(requirement, input.graph, this.#topK);

      if (candidates.length === 0) {
        results.push({
          requirementId: requirement.id,
          confidence: 0,
          rationale: 'В существующей модели нет элементов с похожим названием или вероятным типом — похоже на новый элемент.',
        });
        continue;
      }

      const judged = await this.#judge(requirement, candidates);
      const candidateIds = new Set(candidates.map((c) => c.id));

      if (judged.matchedElementId && !candidateIds.has(judged.matchedElementId)) {
        // Модель предложила id, которого не было среди предложенных кандидатов — не доверяем, не пропускаем дальше.
        results.push({
          requirementId: requirement.id,
          confidence: 0,
          rationale: `Модель сослалась на несуществующего среди кандидатов "${judged.matchedElementId}" — предложение отклонено.`,
        });
        continue;
      }

      results.push({
        requirementId: requirement.id,
        matchedElementId: judged.matchedElementId ?? undefined,
        confidence: judged.confidence,
        rationale: judged.rationale,
      });
    }

    return results;
  }

  async detectGaps(input: GapAnalysisInput): Promise<ArchitectureChangeCandidate[]> {
    const matchByRequirementId = new Map(input.matches.map((m) => [m.requirementId, m]));

    return input.requirements.map((requirement) => {
      const match = matchByRequirementId.get(requirement.id);
      const hasMatch = Boolean(match?.matchedElementId);
      const type = mapCategoryToProposalType(requirement.category, hasMatch);

      const sources: SourceReference[] = [...requirement.sourceSections];
      if (match?.matchedElementId) {
        const existingElement = input.graph.elements.get(match.matchedElementId);
        sources.push({
          kind: 'existing-likec4-element',
          refId: match.matchedElementId,
          label: `Существующий элемент: ${existingElement?.title ?? match.matchedElementId}`,
        });
      }

      const targetKind = match?.matchedElementId ? input.graph.elements.get(match.matchedElementId)?.kind : undefined;
      const applicableRules = input.rules.filter((rule) => (targetKind ? rule.appliesToKinds.includes(targetKind) : false));
      for (const rule of applicableRules) {
        sources.push({ kind: 'architecture-rules', refId: rule.id, label: `Правило: ${rule.title}` });
      }

      return {
        id: randomUUID(),
        type,
        requirementIds: [requirement.id],
        matchedElementId: match?.matchedElementId,
        description: describeChange(requirement, match),
        sources,
        // Ниже порога уверенности — не решаем сами, оставляем стадии 9 (Ambiguity Detection, Milestone 7) явно спросить пользователя.
        needsClarification: !match || match.confidence < AUTO_CONFIDENT_THRESHOLD,
      };
    });
  }

  /**
   * Механический базовый уровень: обнаруживает только один структурно
   * проверяемый случай конфликта — несколько кандидатов независимо метят в
   * один и тот же существующий элемент. Семантическое разрешение конфликтов
   * (два источника противоречат друг другу по содержанию) — задача стадии 9
   * с реальным LLM-суждением, появится в Milestone 7; здесь для такого
   * пока просто нет входных данных, которые можно было бы честно
   * анализировать программно без выдумывания.
   */
  async resolveConflicts(candidates: ArchitectureChangeCandidate[]): Promise<ConflictResolution[]> {
    const byTarget = new Map<ElementId, ArchitectureChangeCandidate[]>();
    for (const candidate of candidates) {
      if (!candidate.matchedElementId) continue;
      const group = byTarget.get(candidate.matchedElementId) ?? [];
      group.push(candidate);
      byTarget.set(candidate.matchedElementId, group);
    }

    const resolutions = new Map<string, ConflictResolution>(candidates.map((c) => [c.id, { candidateId: c.id, resolved: true }]));

    for (const group of byTarget.values()) {
      if (group.length < 2) continue;
      const anyNeedsClarification = group.some((c) => c.needsClarification);

      for (const candidate of group) {
        resolutions.set(
          candidate.id,
          anyNeedsClarification
            ? {
                candidateId: candidate.id,
                resolved: false,
                remainingConflict: {
                  description: 'Несколько требований независимо предлагают изменить один и тот же существующий элемент.',
                  conflictingSources: group.flatMap((c) => c.sources),
                  requiresUserDecision: true,
                },
              }
            : {
                candidateId: candidate.id,
                resolved: true,
                resolutionNote: 'Несколько требований об одном элементе — потребуется объединить при формировании Proposal.',
              },
        );
      }
    }

    return [...resolutions.values()];
  }

  async #judge(requirement: ExtractedRequirement, candidates: ArchitectureElement[]): Promise<JudgedMatch> {
    const candidateDescriptions = candidates
      .map((c) => `- id: ${c.id}, kind: ${c.kind}, title: "${c.title}"${c.description ? `, description: ${c.description}` : ''}`)
      .join('\n');

    const messages = [
      {
        role: 'system' as const,
        content:
          'Ты помогаешь сопоставить архитектурное требование с уже существующим элементом LikeC4-модели, если он есть. ' +
          'Предлагай совпадение, только если уверен, что это один и тот же реальный элемент, а не просто похожее название. ' +
          'Если не уверен — верни null и низкую confidence, решение примет человек. ' +
          'Ответь строго JSON: {"matchedElementId": string|null, "confidence": число от 0 до 1, "rationale": string}.',
      },
      {
        role: 'user' as const,
        content: `Требование: ${requirement.summary}\n${requirement.rawText}\n\nСуществующие кандидаты:\n${candidateDescriptions}`,
      },
    ];

    const result = await this.#llmProvider.completeJSON<JudgedMatch>(messages, { stage: 'entity-matching' });
    return result.content;
  }
}

function describeChange(requirement: ExtractedRequirement, match?: EntityMatchResult): string {
  // Полноценное, объяснимое описание — задача Proposal Generation (стадия 11, Milestone 8);
  // здесь — только структурная заготовка, достаточная чтобы дальнейшие стадии могли сослаться на кандидат.
  return match?.matchedElementId
    ? `Изменение существующего элемента "${match.matchedElementId}" на основе требования: ${requirement.summary}`
    : `Новый элемент архитектуры на основе требования: ${requirement.summary}`;
}
