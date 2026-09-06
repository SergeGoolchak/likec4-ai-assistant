import type {
  ArchitectureElement,
  ArchitectureGraph,
  ArchitectureRelationship,
  ArchitectureRule,
  ElementId,
  KnowledgeChunk,
  KnowledgeProvider,
  LLMProvider,
} from '@likec4-ai/core-domain';
import { relationshipsAmong, renderElementForContext, renderRelationshipForContext, sliceGraph } from './graph-slice.js';

export interface ContextBuildRequest {
  /** Текст требования/фрагмента спецификации, вокруг которого строится контекст. */
  focusText: string;
  graph: ArchitectureGraph;
  /** Кандидаты из entity matching/lexical filter — стартовые узлы для BFS. Пусто => обрезка по бюджету всё равно применяется, но без соседей. */
  candidateElementIds?: ElementId[];
  rules?: ArchitectureRule[];
  knowledgeProviders?: KnowledgeProvider[];
  maxTokens?: number;
}

export interface AssembledContext {
  elements: ArchitectureElement[];
  relationships: ArchitectureRelationship[];
  applicableRules: ArchitectureRule[];
  knowledgeChunks: KnowledgeChunk[];
  estimatedTokens: number;
  /** Сколько элементов среза графа не влезло в бюджет — не прячем это, а делаем видимым (раздел 3.3 плана). */
  omittedElementCount: number;
}

const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_BFS_DEPTH = 2;

/**
 * Реализация retrieval-стратегии "минимальный релевантный контекст" из
 * плана (раздел 3.3, раздел 14 ТЗ): ни одна LLM-стадия не получает весь
 * ArchitectureGraph или всю Knowledge Base целиком.
 */
export class ContextBuilder {
  #llmProvider: LLMProvider;

  constructor(options: { llmProvider: LLMProvider }) {
    this.#llmProvider = options.llmProvider;
  }

  async build(request: ContextBuildRequest): Promise<AssembledContext> {
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const sliceIds = sliceGraph(request.graph, request.candidateElementIds ?? [], DEFAULT_BFS_DEPTH);

    const { elements, omittedElementCount } = this.#trimElementsToBudget(request.graph, sliceIds, maxTokens);
    const includedIds = new Set(elements.map((e) => e.id));
    const relationships = relationshipsAmong(request.graph, includedIds);

    const includedKinds = new Set(elements.map((e) => e.kind));
    const applicableRules = (request.rules ?? []).filter((rule) => rule.appliesToKinds.some((kind) => includedKinds.has(kind)));

    const knowledgeChunks: KnowledgeChunk[] = [];
    for (const provider of request.knowledgeProviders ?? []) {
      const results = await provider.search({ text: request.focusText, topK: 3 });
      knowledgeChunks.push(...results);
    }

    const renderedText = [
      ...elements.map(renderElementForContext),
      ...relationships.map((rel) => renderRelationshipForContext(rel, request.graph)),
      ...applicableRules.map((rule) => rule.description),
      ...knowledgeChunks.map((chunk) => chunk.content),
    ].join('\n');

    return {
      elements,
      relationships,
      applicableRules,
      knowledgeChunks,
      estimatedTokens: this.#llmProvider.estimateTokens(renderedText),
      omittedElementCount,
    };
  }

  /** Жадно включает элементы среза в BFS-порядке (ближе к seed — раньше), пока не выйдет за бюджет. */
  #trimElementsToBudget(
    graph: ArchitectureGraph,
    sliceIds: ElementId[],
    maxTokens: number,
  ): { elements: ArchitectureElement[]; omittedElementCount: number } {
    const elements: ArchitectureElement[] = [];
    let usedTokens = 0;
    let omittedElementCount = 0;

    for (const id of sliceIds) {
      const element = graph.elements.get(id);
      if (!element) continue;
      const tokens = this.#llmProvider.estimateTokens(renderElementForContext(element));
      if (elements.length > 0 && usedTokens + tokens > maxTokens) {
        omittedElementCount++;
        continue;
      }
      elements.push(element);
      usedTokens += tokens;
    }

    return { elements, omittedElementCount };
  }
}
