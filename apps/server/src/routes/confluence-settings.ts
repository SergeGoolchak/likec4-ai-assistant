import type { FastifyInstance, FastifyReply } from 'fastify';
import type { UserFacingError } from '@likec4-ai/core-domain';
import type { AppContainer } from '../composition-root.js';

interface ConfluenceSettingsBody {
  baseUrl?: string;
  token?: string;
}

function secretKey(projectId: string): string {
  return `confluence.pat.${projectId}`;
}

export async function registerConfluenceSettingsRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/confluence-settings', async (request, reply) => {
    const project = await container.projectStore.get(request.params.projectId);
    if (!project) return sendError(reply, 404, projectNotFoundError(request.params.projectId));

    const token = await container.secretsVault.get(secretKey(project.id));
    return { baseUrl: project.confluenceBaseUrl ?? null, configured: Boolean(project.confluenceBaseUrl && token) };
  });

  app.post<{ Params: { projectId: string }; Body: ConfluenceSettingsBody }>(
    '/api/projects/:projectId/confluence-settings',
    async (request, reply) => {
      const project = await container.projectStore.get(request.params.projectId);
      if (!project) return sendError(reply, 404, projectNotFoundError(request.params.projectId));

      const { baseUrl, token } = request.body ?? {};
      if (!baseUrl?.trim()) return sendError(reply, 400, missingFieldError('baseUrl', 'адрес Confluence Server'));
      if (!token?.trim()) return sendError(reply, 400, missingFieldError('token', 'Personal Access Token'));

      const adapter = container.createConfluenceAdapter({ baseUrl: baseUrl.trim(), token: token.trim() });
      const connection = await adapter.testConnection();
      if (!connection.ok) {
        return sendError(reply, 400, connection.error ?? missingFieldError('baseUrl', 'адрес Confluence Server'));
      }

      await container.projectStore.update(project.id, { confluenceBaseUrl: baseUrl.trim() });
      await container.secretsVault.set(secretKey(project.id), token.trim());
      container.userFacingLogger.info(`Confluence connection saved for project: ${project.name}`);

      return { baseUrl: baseUrl.trim(), configured: true };
    },
  );
}

function sendError(reply: FastifyReply, status: number, error: UserFacingError) {
  reply.code(status);
  return { error };
}

function missingFieldError(field: string, humanLabel: string): UserFacingError {
  return {
    id: `confluence-settings.missing-field.${field}`,
    title: 'Не заполнено обязательное поле',
    likelyCause: `Поле "${humanLabel}" пустое.`,
    suggestedAction: `Укажите ${humanLabel} и попробуйте снова.`,
    retryable: true,
  };
}

function projectNotFoundError(id: string): UserFacingError {
  return {
    id: 'confluence-settings.project-not-found',
    title: 'Проект не найден',
    likelyCause: `Проект с id "${id}" не существует или был удалён.`,
    suggestedAction: 'Вернитесь к списку проектов.',
    retryable: false,
  };
}
