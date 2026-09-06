import type { EmbeddingProvider } from '@likec4-ai/core-domain';

interface OpenAIEmbeddingsResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

/**
 * MVP-default EmbeddingProvider (OpenAI, provider-independent port). Chat
 * completion (`LLMProvider`) is a separate implementation.
 *
 * Как и `OpenAILLMProvider`, говорит по протоколу OpenAI Embeddings API
 * (`/v1/embeddings`), которому следуют и open-source серверы эмбеддингов —
 * `baseUrl` настраиваемый, `apiKey` необязателен по той же причине (большинство
 * локальных серверов Authorization не проверяют).
 *
 * `fetchImpl` is injectable so tests never need a real network call or API
 * key — it defaults to the global `fetch`.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'openai';
  readonly model: string;
  #apiKey?: string;
  #baseUrl: string;
  #fetchImpl: typeof fetch;

  constructor(options: { apiKey?: string; model?: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
    this.#apiKey = options.apiKey;
    this.model = options.model ?? 'text-embedding-3-small';
    this.#baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
    this.#fetchImpl = options.fetchImpl ?? fetch;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await this.#fetchImpl(`${this.#baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        // Секрет уходит только в этот один заголовок этого одного запроса — никогда в лог/ошибку/промпт (риск №5 из плана).
        ...(this.#apiKey ? { Authorization: `Bearer ${this.#apiKey}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(`OpenAI embeddings request failed with status ${response.status}: ${bodyText.slice(0, 200)}`);
    }

    const payload = (await response.json()) as OpenAIEmbeddingsResponse;
    return [...payload.data].sort((a, b) => a.index - b.index).map((entry) => entry.embedding);
  }
}
