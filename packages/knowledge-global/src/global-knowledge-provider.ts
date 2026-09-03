import { SqliteEmbeddingIndex } from '@likec4-ai/persistence';
import type { EmbeddingProvider, KnowledgeChunk, KnowledgeProvider, KnowledgeQuery } from '@likec4-ai/core-domain';
import { loadContentChunks } from './content-loader.js';

/**
 * Реализация KnowledgeProvider для общей LikeC4 Knowledge Base (ФТ3).
 * Индексируется лениво при первом обращении и переиспользует индекс, пока
 * он не пуст — контент меняется редко (правками файлов в content/), а не
 * при каждом запуске приложения, так что пересчитывать эмбеддинги на
 * каждый старт бессмысленно.
 */
export class GlobalKnowledgeProvider implements KnowledgeProvider {
  readonly scope = 'global' as const;
  #index: SqliteEmbeddingIndex;
  #embeddingProvider: EmbeddingProvider;
  #contentDir?: string;
  #ensureIndexedPromise?: Promise<void>;

  constructor(options: { index: SqliteEmbeddingIndex; embeddingProvider: EmbeddingProvider; contentDir?: string }) {
    this.#index = options.index;
    this.#embeddingProvider = options.embeddingProvider;
    this.#contentDir = options.contentDir;
  }

  async search(query: KnowledgeQuery): Promise<KnowledgeChunk[]> {
    await this.#ensureIndexed();
    const [queryEmbedding] = await this.#embeddingProvider.embed([query.text]);
    if (!queryEmbedding) return [];
    return this.#index.search(queryEmbedding, { topK: query.topK, tags: query.tags });
  }

  async getById(id: string): Promise<KnowledgeChunk | null> {
    await this.#ensureIndexed();
    return this.#index.getById(id);
  }

  /** Гарантирует однократную индексацию даже при параллельных вызовах search/getById. */
  #ensureIndexed(): Promise<void> {
    if (!this.#index.isEmpty()) return Promise.resolve();
    this.#ensureIndexedPromise ??= this.#buildIndex();
    return this.#ensureIndexedPromise;
  }

  async #buildIndex(): Promise<void> {
    const chunks = await loadContentChunks(this.#contentDir);
    const embeddings = await this.#embeddingProvider.embed(chunks.map((c) => c.content));
    this.#index.replaceAll(
      chunks.map((chunk, i) => ({
        id: chunk.id,
        source: 'likec4-kb',
        title: chunk.title,
        content: chunk.content,
        tags: chunk.tags,
        metadata: {},
        embedding: embeddings[i] ?? [],
      })),
    );
  }
}
