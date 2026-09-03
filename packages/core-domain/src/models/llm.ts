import type { PipelineStageId } from './pipeline.js';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCallOptions {
  temperature?: number;
  maxOutputTokens?: number;
  responseFormat?: 'text' | 'json';
  /** Для structured output, если провайдер это поддерживает. */
  jsonSchema?: object;
  signal?: AbortSignal;
  /** Какая стадия pipeline вызывает — используется для учёта cost/usage по стадиям, никогда не просачивается в сам промпт. */
  stage: PipelineStageId;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  costUsd?: number;
}

export interface LLMResult<T = string> {
  content: T;
  usage: LLMUsage;
  /** Отладочная нагрузка, специфичная для провайдера. Никогда не логировать целиком (может содержать заголовки запроса/ключи). */
  raw?: unknown;
}
