import type { RepositoryAdapter, RepositoryFile, UserFacingError } from '@likec4-ai/core-domain';

const LIKEC4_EXTENSIONS = ['.c4', '.likec4'];
const PAGE_LIMIT = 1000;

interface PagedResponse<T> {
  values: T[];
  isLastPage: boolean;
  nextPageStart?: number;
}

interface CommitsResponse {
  values: Array<{ id: string }>;
}

/**
 * Bitbucket Server/Data Center only (ФТ5), read-only в MVP — `writeFiles`
 * бросает ошибку. PAT — Bearer-токен в Authorization, как и Confluence
 * Server/DC (одна и та же схема авторизации Atlassian Server-продуктов).
 *
 * `likec4Directory` — поддиректория репозитория, где лежит LikeC4-проект
 * (ФТ5: "указать directory LikeC4"); пустая строка означает "весь репозиторий
 * — это LikeC4-проект". Пути в возвращаемых RepositoryFile — относительно
 * этой директории, а не корня репозитория, что соответствует конвенции
 * LocalRepositoryAdapter.
 */
export class BitbucketServerAdapter implements RepositoryAdapter {
  readonly kind = 'bitbucket' as const;
  #baseUrl: string;
  #projectKey: string;
  #repoSlug: string;
  #atRef: string;
  #likec4Directory: string;
  #token: string;
  #fetchImpl: typeof fetch;

  constructor(options: {
    baseUrl: string;
    projectKey: string;
    repoSlug: string;
    branch: string;
    likec4Directory?: string;
    token: string;
    fetchImpl?: typeof fetch;
  }) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, '');
    this.#projectKey = options.projectKey;
    this.#repoSlug = options.repoSlug;
    this.#atRef = options.branch.startsWith('refs/') ? options.branch : `refs/heads/${options.branch}`;
    this.#likec4Directory = (options.likec4Directory ?? '').replace(/^\/|\/$/g, '');
    this.#token = options.token;
    this.#fetchImpl = options.fetchImpl ?? fetch;
  }

  async testConnection(): Promise<{ ok: boolean; error?: UserFacingError }> {
    try {
      const response = await this.#fetchImpl(this.#repoUrl(), { headers: this.#authHeaders() });
      if (!response.ok) return { ok: false, error: connectionError(response.status) };
      return { ok: true };
    } catch {
      return { ok: false, error: networkError() };
    }
  }

  async listLikeC4Files(): Promise<string[]> {
    const allPaths: string[] = [];
    let start = 0;
    for (;;) {
      const url = `${this.#repoUrl()}/files?at=${encodeURIComponent(this.#atRef)}&start=${start}&limit=${PAGE_LIMIT}`;
      const response = await this.#fetchImpl(url, { headers: this.#authHeaders() });
      if (!response.ok) {
        throw new Error(`Bitbucket file listing failed with status ${response.status}`);
      }
      const page = (await response.json()) as PagedResponse<string>;
      allPaths.push(...page.values);
      if (page.isLastPage || page.nextPageStart === undefined) break;
      start = page.nextPageStart;
    }

    const prefix = this.#likec4Directory ? `${this.#likec4Directory}/` : '';
    return allPaths
      .filter((path) => (prefix ? path.startsWith(prefix) : true))
      .filter((path) => LIKEC4_EXTENSIONS.some((ext) => path.endsWith(ext)))
      .map((path) => (prefix ? path.slice(prefix.length) : path))
      .sort();
  }

  async readFile(path: string): Promise<RepositoryFile> {
    const fullPath = this.#likec4Directory ? `${this.#likec4Directory}/${path}` : path;
    const url = `${this.#repoUrl()}/raw/${encodePathSegments(fullPath)}?at=${encodeURIComponent(this.#atRef)}`;
    const response = await this.#fetchImpl(url, { headers: this.#authHeaders() });
    if (!response.ok) {
      throw new Error(`Bitbucket raw file request for "${path}" failed with status ${response.status}`);
    }
    const content = await response.text();
    return { path, content };
  }

  async readAll(): Promise<RepositoryFile[]> {
    const paths = await this.listLikeC4Files();
    return Promise.all(paths.map((path) => this.readFile(path)));
  }

  async writeFiles(_files: RepositoryFile[]): Promise<void> {
    throw new Error('BitbucketServerAdapter is read-only in MVP — writeFiles is not supported.');
  }

  async deleteFiles(_paths: string[]): Promise<void> {
    throw new Error('BitbucketServerAdapter is read-only in MVP — deleteFiles is not supported.');
  }

  async getRevisionInfo(): Promise<{ branch?: string; commit?: string; capturedAt: string }> {
    const capturedAt = new Date().toISOString();
    const url = `${this.#repoUrl()}/commits?until=${encodeURIComponent(this.#atRef)}&limit=1`;
    const response = await this.#fetchImpl(url, { headers: this.#authHeaders() });
    if (!response.ok) return { capturedAt };
    const body = (await response.json()) as CommitsResponse;
    return { branch: this.#atRef.replace(/^refs\/heads\//, ''), commit: body.values[0]?.id, capturedAt };
  }

  #repoUrl(): string {
    return `${this.#baseUrl}/rest/api/1.0/projects/${this.#projectKey}/repos/${this.#repoSlug}`;
  }

  #authHeaders(): Record<string, string> {
    // Секрет уходит только в этот заголовок этого запроса — никогда в лог/ошибку (риск №5 из плана).
    return { Authorization: `Bearer ${this.#token}`, Accept: 'application/json' };
  }
}

function encodePathSegments(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function connectionError(status: number): UserFacingError {
  if (status === 401 || status === 403) {
    return {
      id: 'bitbucket.auth-error',
      title: 'Bitbucket отклонил токен доступа',
      likelyCause: 'Personal Access Token недействителен, просрочен или не имеет прав на чтение репозитория.',
      suggestedAction: 'Проверьте токен в настройках проекта и права доступа к репозиторию.',
      retryable: true,
    };
  }
  if (status === 404) {
    return {
      id: 'bitbucket.not-found',
      title: 'Репозиторий не найден',
      likelyCause: 'Неверный project key, repo slug или у токена нет доступа к этому репозиторию.',
      suggestedAction: 'Проверьте project key и repo slug в настройках проекта.',
      retryable: true,
    };
  }
  return {
    id: 'bitbucket.connection-error',
    title: 'Не удалось подключиться к Bitbucket',
    likelyCause: `Сервер ответил статусом ${status}.`,
    suggestedAction: 'Проверьте адрес сервера в настройках проекта и повторите попытку.',
    retryable: true,
  };
}

function networkError(): UserFacingError {
  return {
    id: 'bitbucket.network-error',
    title: 'Bitbucket недоступен по сети',
    likelyCause: 'Сервер не отвечает или адрес указан неверно.',
    suggestedAction: 'Проверьте адрес Bitbucket Server и сетевое соединение.',
    retryable: true,
  };
}
