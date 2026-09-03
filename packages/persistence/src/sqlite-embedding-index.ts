import type { DatabaseSync } from 'node:sqlite';
import type { KnowledgeChunk, KnowledgeSource } from '@likec4-ai/core-domain';

export interface StoredChunkInput {
  id: string;
  source: KnowledgeSource;
  title: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  embedding: number[];
}

interface ChunkRow {
  id: string;
  source: string;
  title: string;
  content: string;
  tags: string;
  metadata: string;
  embedding: string;
}

/**
 * Brute-force cosine similarity поверх SQLite — сознательно без внешней
 * vector DB, как и рекомендовал план: при объёме "один проект + одна KB"
 * (десятки-сотни chunks, не миллионы) полный перебор в JS быстрее, чем
 * заводить Pinecone/Weaviate ради локального однопользовательского
 * инструмента. `scopeKey` разделяет данные разных областей (global KB vs
 * конкретный projectId) в одной физической таблице.
 */
export class SqliteEmbeddingIndex {
  #db: DatabaseSync;
  #scopeKey: string;

  constructor(options: { db: DatabaseSync; scopeKey: string }) {
    this.#db = options.db;
    this.#scopeKey = options.scopeKey;
  }

  /** Полностью заменяет содержимое этой области — самый простой корректный способ переиндексации для MVP-масштаба. */
  replaceAll(chunks: StoredChunkInput[]): void {
    this.#db.prepare('DELETE FROM knowledge_chunks WHERE scope_key = ?').run(this.#scopeKey);
    const insert = this.#db.prepare(
      `INSERT INTO knowledge_chunks (id, scope_key, source, title, content, tags, metadata, embedding)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const chunk of chunks) {
      insert.run(
        chunk.id,
        this.#scopeKey,
        chunk.source,
        chunk.title,
        chunk.content,
        JSON.stringify(chunk.tags),
        JSON.stringify(chunk.metadata),
        JSON.stringify(chunk.embedding),
      );
    }
  }

  /** Добавляет/обновляет отдельные чанки, не трогая остальной индекс — для ручных заметок пользователя поверх авто-проиндексированного графа. */
  upsert(chunks: StoredChunkInput[]): void {
    const stmt = this.#db.prepare(
      `INSERT INTO knowledge_chunks (id, scope_key, source, title, content, tags, metadata, embedding)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(scope_key, id) DO UPDATE SET
         source = excluded.source, title = excluded.title, content = excluded.content,
         tags = excluded.tags, metadata = excluded.metadata, embedding = excluded.embedding`,
    );
    for (const chunk of chunks) {
      stmt.run(
        chunk.id,
        this.#scopeKey,
        chunk.source,
        chunk.title,
        chunk.content,
        JSON.stringify(chunk.tags),
        JSON.stringify(chunk.metadata),
        JSON.stringify(chunk.embedding),
      );
    }
  }

  /**
   * Переиндексация "по префиксам id": удаляет из этой области только те
   * существующие чанки, чей id начинается с одного из `prefixes` и которых
   * нет среди новых `chunks`, затем upsert'ит новые. Так авто-производные
   * чанки (например `element:*`, `rule:*` при переиндексации из графа)
   * корректно устаревают при удалении элемента/правила из модели, но
   * вручную добавленные заметки пользователя с другими id никогда не
   * трогаются — в отличие от `replaceAll`, которая стирает всю область.
   */
  replaceByIdPrefixes(prefixes: string[], chunks: StoredChunkInput[]): void {
    const newIds = new Set(chunks.map((c) => c.id));
    const existingIds = this.#db.prepare('SELECT id FROM knowledge_chunks WHERE scope_key = ?').all(this.#scopeKey) as unknown as {
      id: string;
    }[];
    const staleIds = existingIds
      .map((row) => row.id)
      .filter((id) => prefixes.some((prefix) => id.startsWith(prefix)) && !newIds.has(id));

    if (staleIds.length > 0) {
      const del = this.#db.prepare('DELETE FROM knowledge_chunks WHERE scope_key = ? AND id = ?');
      for (const id of staleIds) del.run(this.#scopeKey, id);
    }
    this.upsert(chunks);
  }

  isEmpty(): boolean {
    const row = this.#db.prepare('SELECT COUNT(*) as count FROM knowledge_chunks WHERE scope_key = ?').get(this.#scopeKey) as
      | { count: number }
      | undefined;
    return !row || row.count === 0;
  }

  getById(id: string): KnowledgeChunk | null {
    const row = this.#db
      .prepare('SELECT * FROM knowledge_chunks WHERE id = ? AND scope_key = ?')
      .get(id, this.#scopeKey) as ChunkRow | undefined;
    return row ? toChunk(row) : null;
  }

  search(queryEmbedding: number[], options: { topK?: number; tags?: string[] } = {}): KnowledgeChunk[] {
    const rows = this.#db
      .prepare('SELECT * FROM knowledge_chunks WHERE scope_key = ?')
      .all(this.#scopeKey) as unknown as ChunkRow[];

    let candidates = rows.map((row) => ({ row, chunk: toChunk(row), embedding: JSON.parse(row.embedding) as number[] }));

    if (options.tags?.length) {
      const wanted = options.tags;
      candidates = candidates.filter((c) => c.chunk.tags.some((tag) => wanted.includes(tag)));
    }

    const scored = candidates
      .map((c) => ({ ...c.chunk, score: cosineSimilarity(queryEmbedding, c.embedding) }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return scored.slice(0, options.topK ?? 5);
  }
}

function toChunk(row: ChunkRow): KnowledgeChunk {
  return {
    id: row.id,
    source: row.source as KnowledgeSource,
    title: row.title,
    content: row.content,
    tags: JSON.parse(row.tags),
    metadata: JSON.parse(row.metadata),
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
