import type { KnowledgeChunk, KnowledgeQuery } from '../models/knowledge.js';

/**
 * Этот порт разделяют две реализации: глобальная LikeC4 Knowledge Base
 * (версионируется независимо от приложения, согласно ФТ3) и Project
 * Knowledge Base (ФТ4, чьи правила имеют приоритет — см. SOURCE_PRIORITY).
 */
export interface KnowledgeProvider {
  readonly scope: 'global' | 'project';
  search(query: KnowledgeQuery): Promise<KnowledgeChunk[]>;
  getById(id: string): Promise<KnowledgeChunk | null>;
  /** Запись поддерживает только project KB (переиндексируется при каждом парсинге/правке правил). */
  upsert?(chunks: KnowledgeChunk[]): Promise<void>;
}
