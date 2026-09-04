import type { ConfluenceAdapter, ConfluencePageContent, ConfluencePageRef, UserFacingError } from '@likec4-ai/core-domain';
import { parseStorageFormat } from './storage-format-parser.js';

interface ConfluenceContentResponse {
  id: string;
  title: string;
  space: { key: string };
  version: { number: number };
  body: { storage: { value: string } };
  _links: { base: string; webui: string };
}

/**
 * Server/Data Center only (ФТ1) — PAT передаётся как Bearer-токен в
 * заголовке Authorization, это стандартная схема авторизации Confluence
 * Server/DC начиная с версии 7.9, отдельная от Cloud (API token + email).
 * Read-only: класс не содержит методов записи.
 */
export class ConfluenceServerAdapter implements ConfluenceAdapter {
  #baseUrl: string;
  #token: string;
  #fetchImpl: typeof fetch;

  constructor(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, '');
    this.#token = options.token;
    this.#fetchImpl = options.fetchImpl ?? fetch;
  }

  async testConnection(): Promise<{ ok: boolean; error?: UserFacingError }> {
    try {
      const response = await this.#fetchImpl(`${this.#baseUrl}/rest/api/space?limit=1`, { headers: this.#authHeaders() });
      if (!response.ok) return { ok: false, error: connectionError(response.status) };
      return { ok: true };
    } catch {
      return { ok: false, error: networkError() };
    }
  }

  async fetchPage(ref: ConfluencePageRef): Promise<ConfluencePageContent> {
    const baseUrl = ref.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/rest/api/content/${ref.pageId}?expand=body.storage,space,version`;
    const response = await this.#fetchImpl(url, { headers: this.#authHeaders() });

    if (!response.ok) {
      throw new Error(`Confluence request for page ${ref.pageId} failed with status ${response.status}`);
    }

    const payload = (await response.json()) as ConfluenceContentResponse;
    return {
      pageId: payload.id,
      title: payload.title,
      version: payload.version.number,
      spaceKey: payload.space.key,
      url: `${payload._links.base}${payload._links.webui}`,
      sections: parseStorageFormat(payload.body.storage.value),
      fetchedAt: new Date().toISOString(),
    };
  }

  #authHeaders(): Record<string, string> {
    // Секрет уходит только в этот заголовок этого запроса — никогда в лог/ошибку (риск №5 из плана).
    return { Authorization: `Bearer ${this.#token}`, Accept: 'application/json' };
  }
}

function connectionError(status: number): UserFacingError {
  if (status === 401 || status === 403) {
    return {
      id: 'confluence.auth-error',
      title: 'Confluence отклонил токен доступа',
      likelyCause: 'Personal Access Token недействителен, просрочен или не имеет прав на чтение.',
      suggestedAction: 'Проверьте токен в настройках проекта и права доступа к Confluence.',
      retryable: true,
    };
  }
  return {
    id: 'confluence.connection-error',
    title: 'Не удалось подключиться к Confluence',
    likelyCause: `Сервер ответил статусом ${status}.`,
    suggestedAction: 'Проверьте адрес сервера в настройках проекта и повторите попытку.',
    retryable: true,
  };
}

function networkError(): UserFacingError {
  return {
    id: 'confluence.network-error',
    title: 'Confluence недоступен по сети',
    likelyCause: 'Сервер не отвечает или адрес указан неверно.',
    suggestedAction: 'Проверьте адрес Confluence Server и сетевое соединение.',
    retryable: true,
  };
}
