import type { LLMCallOptions, LLMMessage, LLMProvider, LLMResult, LLMUsage } from '@likec4-ai/core-domain';

interface OpenAIChatCompletionResponse {
  choices: Array<{ message: { content: string | null } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/** Один явный повтор с текстовым напоминанием — дешевле, чем ронять всю стадию pipeline. */
const JSON_RETRY_MESSAGE = { role: 'user' as const, content: 'Ответь строго валидным JSON, без markdown-разметки и без пояснений вокруг него.' };

/**
 * MVP-default LLMProvider (chat completion). Использует базовый JSON mode
 * OpenAI (`response_format: {type: 'json_object'}`) для `completeJSON`, а не
 * строгие structured outputs (`json_schema` + `strict: true`) — у той схемы
 * жёсткие собственные ограничения (обязательный `additionalProperties:
 * false` и т.п.), и завязываться на них сейчас означало бы тащить эти
 * ограничения во все места, вызывающие `completeJSON`. Вместо этого
 * корректность формы ответа проверяется на стороне вызывающего кода
 * (стадии pipeline сами валидируют то, что пришло) — тот же принцип, что и
 * "AI — инструмент анализа, не источник истины" из плана.
 *
 * Несмотря на имя, класс говорит по протоколу OpenAI Chat Completions
 * (`/v1/chat/completions`, `/v1/models`), которому следуют и open-source
 * серверы — Ollama, vLLM, LM Studio, llama.cpp server и т.п. Достаточно
 * указать их `baseUrl`; `apiKey` необязателен, потому что большинство таких
 * серверов Authorization-заголовок вообще не проверяют.
 */
export class OpenAILLMProvider implements LLMProvider {
  readonly id = 'openai';
  readonly model: string;
  /** Эвристика: "не официальное облако OpenAI" — единственный практичный сигнал, пока поле нигде не используется в логике. */
  readonly isLocal: boolean;
  #apiKey?: string;
  #baseUrl: string;
  #fetchImpl: typeof fetch;

  constructor(options: { apiKey?: string; model?: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
    this.#apiKey = options.apiKey;
    this.model = options.model ?? 'gpt-4o-mini';
    this.#baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
    this.isLocal = this.#baseUrl !== 'https://api.openai.com/v1';
    this.#fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(messages: LLMMessage[], options: LLMCallOptions): Promise<LLMResult<string>> {
    const payload = await this.#request(messages, options);
    return {
      content: payload.choices[0]?.message.content ?? '',
      usage: toUsage(payload.usage),
      raw: payload,
    };
  }

  async completeJSON<T>(messages: LLMMessage[], options: LLMCallOptions): Promise<LLMResult<T>> {
    let payload = await this.#request(messages, { ...options, responseFormat: 'json' });
    let text = payload.choices[0]?.message.content ?? '{}';
    try {
      return { content: JSON.parse(text) as T, usage: toUsage(payload.usage), raw: payload };
    } catch {
      // Не все OpenAI-совместимые серверы (в частности часть локальных моделей) до конца
      // соблюдают response_format — один явный повтор с текстовым напоминанием чинит это
      // заметно чаще, чем стоило бы сразу ронять стадию pipeline.
    }

    payload = await this.#request([...messages, JSON_RETRY_MESSAGE], { ...options, responseFormat: 'json' });
    text = payload.choices[0]?.message.content ?? '{}';
    try {
      return { content: JSON.parse(text) as T, usage: toUsage(payload.usage), raw: payload };
    } catch (err) {
      throw new Error(
        `OpenAI-совместимый сервер вернул невалидный JSON для completeJSON дважды подряд (stage: ${options.stage}): ${(err as Error).message}`,
        { cause: err },
      );
    }
  }

  /** Грубое приближение (~4 символа на токен) — достаточно для бюджетирования ContextBuilder, не для точного биллинга. */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async #request(messages: LLMMessage[], options: LLMCallOptions): Promise<OpenAIChatCompletionResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.maxOutputTokens !== undefined ? { max_tokens: options.maxOutputTokens } : {}),
      ...(options.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
    };

    const response = await this.#fetchImpl(`${this.#baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        // Секрет уходит только в этот заголовок этого запроса — никогда в лог/ошибку/промпт (риск №5 из плана).
        // Заголовок опускается целиком, если ключа нет — большинство локальных серверов его не проверяют,
        // и буквальный "Bearer undefined" выглядел бы как настоящий (хоть и бессмысленный) токен.
        ...(this.#apiKey ? { Authorization: `Bearer ${this.#apiKey}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(
        `OpenAI chat completion failed with status ${response.status} (stage: ${options.stage}): ${bodyText.slice(0, 200)}`,
      );
    }

    return (await response.json()) as OpenAIChatCompletionResponse;
  }
}

function toUsage(usage: OpenAIChatCompletionResponse['usage']): LLMUsage {
  return { promptTokens: usage?.prompt_tokens ?? 0, completionTokens: usage?.completion_tokens ?? 0 };
}
