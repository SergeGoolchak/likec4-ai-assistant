import type {
  ArchitectureChangeCandidate,
  ClarificationQuestion,
  ElementId,
  LLMProvider,
  ProposalGenerationInput,
  ProposalGenerator,
  ProposalItem,
  ProposalItemType,
  ProposalRepairInput,
  SourceReference,
} from '@likec4-ai/core-domain';
import { ContextBuilder, renderElementForContext, renderRelationshipForContext } from '@likec4-ai/context-builder';

interface DraftedItem {
  title: string;
  what: string;
  why: string;
  impact: string;
  /** 0..1 */
  confidence: number;
  assumptions: string[];
  proposedLikeC4Code: string;
}

interface RepairedCode {
  proposedLikeC4Code: string;
  /** Кратко, что было исправлено — добавляется в assumptions чиненного item, а не скрывается. */
  whatWasFixed: string;
}

/**
 * Стадия 11 (Milestone 8). Первый реальный потребитель `ContextBuilder`
 * (собран в Milestone 6, ждал именно этого места — точечное обогащение
 * промпта entity-matching/gap-analysis не нуждалось в полноценном срезе
 * графа, а формирование предложения по конкретному элементу нуждается).
 *
 * Честно учитывает решения, принятые на стадиях 9-10 (Ambiguity Detection/
 * User Clarification), а не игнорирует их молча:
 * - "merge" на вопросе о конфликте → несколько кандидатов становятся ОДНИМ
 *   ProposalItem с объединёнными источниками, а не независимыми предложениями.
 * - "reject-match" на вопросе о низкой уверенности → кандидат трактуется как
 *   новый элемент, а не как изменение того, что предложил AI изначально.
 * - "не знаю"/"отложить" → решение AI используется как есть, но это явно
 *   отражается в `Explanation.assumptions`, а не выдаётся за подтверждённый факт.
 */
export class LLMProposalGenerator implements ProposalGenerator {
  #llmProvider: LLMProvider;
  #contextBuilder: ContextBuilder;

  constructor(options: { llmProvider: LLMProvider }) {
    this.#llmProvider = options.llmProvider;
    this.#contextBuilder = new ContextBuilder({ llmProvider: options.llmProvider });
  }

  async generate(input: ProposalGenerationInput): Promise<ProposalItem[]> {
    const { mergeGroups, standalone } = groupByMergeDecision(input.candidates, input.ambiguities);

    const items: ProposalItem[] = [];
    for (const candidate of standalone) {
      items.push(await this.#generateOne([candidate], input));
    }
    for (const group of mergeGroups) {
      items.push(await this.#generateOne(group, input));
    }
    return items;
  }

  /**
   * Стадия 16 (Repair, Milestone 9). В отличие от `generate()`, не начинает с нуля:
   * даёт модели её же прошлый черновик + конкретные diagnostics/findings и просит
   * исправить именно их, сохранив id/type/targetElementId — то, что уже было
   * решено человеком на User Review, `repair` не пересматривает.
   */
  async repair(input: ProposalRepairInput): Promise<ProposalItem> {
    const { item } = input;
    const context = await this.#contextBuilder.build({
      focusText: item.explanation.what,
      graph: input.graph,
      candidateElementIds: item.targetElementId ? [item.targetElementId] : [],
      rules: input.rules,
    });
    const contextText = [
      ...context.elements.map(renderElementForContext),
      ...context.relationships.map((rel) => renderRelationshipForContext(rel, input.graph)),
      ...context.applicableRules.map((rule) => `Правило: ${rule.title} — ${rule.description}`),
    ].join('\n');

    const repaired = await this.#repairDraft(item, contextText, input);

    return {
      ...item,
      proposedLikeC4Code: repaired.proposedLikeC4Code,
      explanation: { ...item.explanation, assumptions: [...item.explanation.assumptions, `Repair: ${repaired.whatWasFixed}`] },
    };
  }

  async #repairDraft(item: ProposalItem, contextText: string, input: ProposalRepairInput): Promise<RepairedCode> {
    const diagnosticsText = input.diagnostics.map((d) => `- [${d.severity}] ${d.file}: ${d.message}`).join('\n');
    const findingsText = input.findings.map((f) => `- [${f.severity}] ${f.message}`).join('\n');

    const messages = [
      {
        role: 'system' as const,
        content:
          'Ты исправляешь фрагмент кода LikeC4, который не прошёл валидацию. ' +
          'Сохраняй тот же id элемента/связи, тот же смысл изменения — исправляй ТОЛЬКО то, на что указывают diagnostics/findings, ' +
          'не переписывай остальное и не меняй архитектурное решение. ' +
          'Ответь строго JSON: {"proposedLikeC4Code": string, "whatWasFixed": string}.',
      },
      {
        role: 'user' as const,
        content: [
          `Текущий фрагмент:\n${item.proposedLikeC4Code ?? '(пусто)'}`,
          `Контекст существующей архитектуры:\n${contextText || '(пусто)'}`,
          diagnosticsText ? `Технические диагностики:\n${diagnosticsText}` : '',
          findingsText ? `Архитектурные находки:\n${findingsText}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ];

    const result = await this.#llmProvider.completeJSON<RepairedCode>(messages, { stage: 'repair' });
    return result.content;
  }

  async #generateOne(group: ArchitectureChangeCandidate[], input: ProposalGenerationInput): Promise<ProposalItem> {
    const primary = group[0]!;
    const { effectiveType, effectiveMatchedElementId, answerNote } = applyAssumptionAnswer(primary, input.ambiguities);

    const context = await this.#contextBuilder.build({
      focusText: group.map((c) => c.description).join('\n'),
      graph: input.graph,
      candidateElementIds: effectiveMatchedElementId ? [effectiveMatchedElementId] : [],
      rules: input.rules,
      knowledgeProviders: input.knowledgeProviders,
    });

    const contextText = [
      ...context.elements.map(renderElementForContext),
      ...context.relationships.map((rel) => renderRelationshipForContext(rel, input.graph)),
      ...context.applicableRules.map((rule) => `Правило: ${rule.title} — ${rule.description}`),
      ...context.knowledgeChunks.map((chunk) => chunk.content),
    ].join('\n');

    const drafted = await this.#draft(group, effectiveType, effectiveMatchedElementId, contextText, answerNote);

    const sources = dedupeSources(group.flatMap((c) => c.sources));
    if (answerNote) {
      sources.push({ kind: 'user-answer', refId: answerNote.questionId, label: 'Ответ пользователя на уточняющий вопрос', excerpt: answerNote.text });
    }

    return {
      id: primary.id,
      type: effectiveType,
      title: drafted.title,
      targetElementId: effectiveMatchedElementId,
      proposedLikeC4Code: drafted.proposedLikeC4Code,
      explanation: {
        what: drafted.what,
        why: drafted.why,
        impact: drafted.impact,
        confidence: drafted.confidence,
        assumptions: drafted.assumptions,
      },
      sources,
      decision: 'pending',
    };
  }

  async #draft(
    group: ArchitectureChangeCandidate[],
    type: ProposalItemType,
    matchedElementId: ElementId | undefined,
    contextText: string,
    answerNote: { questionId: string; text: string } | undefined,
  ): Promise<DraftedItem> {
    const descriptions = group.map((c) => `- ${c.description}`).join('\n');
    const messages = [
      {
        role: 'system' as const,
        content:
          'Ты формируешь одно предложение изменения архитектуры LikeC4 на основе уже проанализированного требования. ' +
          'Используй только факты из предоставленного контекста и описания требования — не выдумывай детали, которых там нет. ' +
          'Если для какого-то поля не хватает информации — честно опиши это в assumptions, а не додумывай. ' +
          `Тип изменения и целевой элемент уже определены на предыдущих стадиях (тип: "${type}"` +
          `${matchedElementId ? `, целевой элемент: "${matchedElementId}"` : ', это новый элемент'}) — не меняй их, только опиши. ` +
          'Ответь строго JSON: {"title": string, "what": string, "why": string, "impact": string, "confidence": число от 0 до 1, ' +
          '"assumptions": string[], "proposedLikeC4Code": string}. "proposedLikeC4Code" — черновой фрагмент синтаксиса LikeC4 ' +
          '(может быть неполным и будет перепроверен и перегенерирован позже — не выдавай его за финальный).',
      },
      {
        role: 'user' as const,
        content: [
          `Требование(я):\n${descriptions}`,
          `Контекст существующей архитектуры:\n${contextText || '(пусто — совпадений с существующей моделью не найдено)'}`,
          answerNote ? `Ответ пользователя на уточняющий вопрос: ${answerNote.text}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ];

    const result = await this.#llmProvider.completeJSON<DraftedItem>(messages, { stage: 'proposal-generation' });
    return result.content;
  }
}

function groupByMergeDecision(
  candidates: ArchitectureChangeCandidate[],
  ambiguities: ClarificationQuestion[],
): { mergeGroups: ArchitectureChangeCandidate[][]; standalone: ArchitectureChangeCandidate[] } {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const mergedIds = new Set<string>();
  const mergeGroups: ArchitectureChangeCandidate[][] = [];

  for (const question of ambiguities) {
    if (question.originKind !== 'user-decision-needed') continue;
    if (question.status !== 'answered' || question.answer?.selectedOptionId !== 'merge') continue;

    const group = question.relatedProposalItemIds.map((id) => byId.get(id)).filter((c): c is ArchitectureChangeCandidate => Boolean(c));
    if (group.length < 2) continue;
    mergeGroups.push(group);
    for (const candidate of group) mergedIds.add(candidate.id);
  }

  return { mergeGroups, standalone: candidates.filter((c) => !mergedIds.has(c.id)) };
}

function applyAssumptionAnswer(
  candidate: ArchitectureChangeCandidate,
  ambiguities: ClarificationQuestion[],
): { effectiveType: ProposalItemType; effectiveMatchedElementId: ElementId | undefined; answerNote: { questionId: string; text: string } | undefined } {
  const question = ambiguities.find(
    (q) => q.originKind === 'ai-assumption-needs-confirmation' && q.relatedProposalItemIds.includes(candidate.id),
  );

  if (!question) {
    return { effectiveType: candidate.type, effectiveMatchedElementId: candidate.matchedElementId, answerNote: undefined };
  }

  const rejectedMatch = question.status === 'answered' && question.answer?.selectedOptionId === 'reject-match';

  const summary = summarizeAnswer(question);
  return {
    effectiveType: rejectedMatch ? flipToNew(candidate.type) : candidate.type,
    effectiveMatchedElementId: rejectedMatch ? undefined : candidate.matchedElementId,
    answerNote: summary ? { questionId: question.id, text: summary } : undefined,
  };
}

function flipToNew(type: ProposalItemType): ProposalItemType {
  if (type === 'modified-element') return 'new-element';
  if (type === 'modified-relationship') return 'new-relationship';
  return type;
}

function summarizeAnswer(question: ClarificationQuestion): string | undefined {
  if (question.status === 'answered') {
    const optionLabel = question.options?.find((o) => o.id === question.answer?.selectedOptionId)?.label;
    const parts = [optionLabel, question.answer?.freeText].filter((p): p is string => Boolean(p));
    return parts.length > 0 ? parts.join(' — ') : undefined;
  }
  if (question.status === 'marked-unknown') {
    return 'Пользователь отметил, что не знает ответа — использовано исходное предположение AI без подтверждения.';
  }
  if (question.status === 'deferred') {
    return 'Пользователь отложил решение по этому вопросу — использовано исходное предположение AI без подтверждения.';
  }
  return undefined;
}

function dedupeSources(sources: SourceReference[]): SourceReference[] {
  const seen = new Set<string>();
  const result: SourceReference[] = [];
  for (const source of sources) {
    const key = `${source.kind}:${source.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(source);
  }
  return result;
}
