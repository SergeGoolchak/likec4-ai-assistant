import type { SqliteEmbeddingIndex } from '@likec4-ai/persistence';
import type {
  ArchitectureGraph,
  ArchitectureRule,
  EmbeddingProvider,
  KnowledgeChunk,
  KnowledgeProvider,
  KnowledgeQuery,
} from '@likec4-ai/core-domain';
import { buildElementChunks, buildRuleChunks, ELEMENT_CHUNK_PREFIX, RULE_CHUNK_PREFIX } from './build-chunks.js';

/**
 * Реализация KnowledgeProvider для Project Knowledge Base (ФТ4): текущая
 * LikeC4-модель + Architecture Rules проекта. Правила проекта имеют
 * приоритет над общими знаниями AI (SOURCE_PRIORITY) — этот provider как
 * раз и делает их видимыми для retrieval наравне с элементами модели.
 */
export class ProjectKnowledgeProvider implements KnowledgeProvider {
  readonly scope = 'project' as const;
  #index: SqliteEmbeddingIndex;
  #embeddingProvider: EmbeddingProvider;

  constructor(options: { index: SqliteEmbeddingIndex; embeddingProvider: EmbeddingProvider }) {
    this.#index = options.index;
    this.#embeddingProvider = options.embeddingProvider;
  }

  /**
   * Полная переиндексация из текущего состояния графа + правил. Вызывается
   * при каждом парсинге модели проекта (DoD Milestone 3). Использует
   * `replaceByIdPrefixes`, а не `replaceAll` — элементы/правила, которых
   * больше нет в модели, устаревают и удаляются, но ручные заметки
   * пользователя (добавленные через upsert с другими id) не трогаются.
   */
  async reindexFromGraph(graph: ArchitectureGraph, rules: ArchitectureRule[]): Promise<void> {
    const chunks = [...buildElementChunks(graph), ...buildRuleChunks(rules)];
    const embeddings = await this.#embeddingProvider.embed(chunks.map((c) => c.content));
    this.#index.replaceByIdPrefixes(
      [ELEMENT_CHUNK_PREFIX, RULE_CHUNK_PREFIX],
      chunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i] ?? [] })),
    );
  }

  async search(query: KnowledgeQuery): Promise<KnowledgeChunk[]> {
    const [queryEmbedding] = await this.#embeddingProvider.embed([query.text]);
    if (!queryEmbedding) return [];
    return this.#index.search(queryEmbedding, { topK: query.topK, tags: query.tags });
  }

  async getById(id: string): Promise<KnowledgeChunk | null> {
    return this.#index.getById(id);
  }

  /** Ручные заметки пользователя поверх авто-проиндексированного графа — не вытесняются следующим reindexFromGraph. */
  async upsert(chunks: KnowledgeChunk[]): Promise<void> {
    const embeddings = await this.#embeddingProvider.embed(chunks.map((c) => c.content));
    this.#index.upsert(chunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i] ?? [] })));
  }
}
