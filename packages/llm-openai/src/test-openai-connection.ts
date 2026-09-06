import type { UserFacingError } from '@likec4-ai/core-domain';

/**
 * Дешёвая проверка подключения без траты токенов на completion — как и у
 * ConfluenceAdapter/RepositoryAdapter, но `LLMProvider`/`EmbeddingProvider`
 * сами по себе не объявляют `testConnection()` (это было бы лишним для
 * каждой их реализации), поэтому вынесено отдельной функцией здесь же.
 */
export async function testOpenAIConnection(options: {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; error?: UserFacingError }> {
  const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(`${baseUrl}/models`, {
      headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {},
    });
    if (!response.ok) {
      if (response.status === 401) {
        return {
          ok: false,
          error: {
            id: 'openai.auth-error',
            title: 'OpenAI отклонил API key',
            likelyCause: 'Ключ недействителен, отозван или указан с опечаткой.',
            suggestedAction: 'Проверьте ключ в настройках проекта.',
            retryable: true,
          },
        };
      }
      return {
        ok: false,
        error: {
          id: 'openai.connection-error',
          title: 'Не удалось подключиться к OpenAI',
          likelyCause: `Сервер ответил статусом ${response.status}.`,
          suggestedAction: 'Повторите попытку позже.',
          retryable: true,
        },
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: {
        id: 'openai.network-error',
        title: 'OpenAI недоступен по сети',
        likelyCause: 'Нет соединения с api.openai.com.',
        suggestedAction: 'Проверьте сетевое соединение и повторите попытку.',
        retryable: true,
      },
    };
  }
}
