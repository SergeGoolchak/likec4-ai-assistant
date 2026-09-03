export interface KnowledgeQuery {
  text: string;
  topK?: number;
  tags?: string[];
}

export type KnowledgeSource = 'likec4-kb' | 'project-kb';

export interface KnowledgeChunk {
  id: string;
  source: KnowledgeSource;
  title: string;
  content: string;
  /** Оценка релевантности, заполняется после retrieval — отсутствует при прямом чтении через getById. */
  score?: number;
  metadata: Record<string, unknown>;
}
