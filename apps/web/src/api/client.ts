import type { UserFacingError } from '@likec4-ai/core-domain';
import type { ProjectDetailResponse, ProjectRecord } from './types';

/**
 * Любая ошибка API долетает до компонентов либо как реальный UserFacingError
 * от сервера, либо (сеть упала, JSON не распарсился) оборачивается здесь же —
 * компоненты никогда не видят сырой fetch-эксепшн.
 */
export class ApiError extends Error {
  error: UserFacingError;
  constructor(error: UserFacingError) {
    super(error.title);
    this.error = error;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError({
      id: 'client.network-error',
      title: 'Не удалось связаться с backend',
      likelyCause: 'Сервер не запущен или недоступен по сети.',
      suggestedAction: 'Проверьте, что backend запущен, и повторите попытку.',
      retryable: true,
    });
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error: UserFacingError | undefined = body?.error;
    throw new ApiError(
      error ?? {
        id: 'client.unexpected-error',
        title: 'Непредвиденная ошибка сервера',
        likelyCause: `Сервер ответил статусом ${response.status}.`,
        suggestedAction: 'Повторите попытку. Если ошибка повторяется, посмотрите технический лог сервера.',
        retryable: true,
      },
    );
  }

  return body as T;
}

export function listProjects(): Promise<ProjectRecord[]> {
  return request('/api/projects');
}

export function getProject(id: string): Promise<ProjectDetailResponse> {
  return request(`/api/projects/${id}`);
}

export function createProject(input: { name: string; description?: string; localRepositoryPath: string }): Promise<ProjectRecord> {
  return request('/api/projects', { method: 'POST', body: JSON.stringify(input) });
}
