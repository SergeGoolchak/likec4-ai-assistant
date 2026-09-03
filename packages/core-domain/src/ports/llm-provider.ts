import type { LLMCallOptions, LLMMessage, LLMResult } from '../models/llm.js';

/** Изначально provider-independent (ФТ2) — OpenAI первая реализация, локальные LLM появятся позже. */
export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  readonly isLocal: boolean;
  complete(messages: LLMMessage[], options: LLMCallOptions): Promise<LLMResult<string>>;
  completeJSON<T>(messages: LLMMessage[], options: LLMCallOptions): Promise<LLMResult<T>>;
  estimateTokens(text: string): number;
}

/**
 * Намеренно отделён от LLMProvider: эмбеддинги используются retrieval-слоем
 * ContextBuilder/KnowledgeProvider, а не chat completion, и проект вполне
 * может хотеть разных провайдеров для того и другого.
 */
export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}
