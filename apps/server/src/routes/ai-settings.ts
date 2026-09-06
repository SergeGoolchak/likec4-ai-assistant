import type { FastifyInstance, FastifyReply } from 'fastify';
import { testOpenAIConnection } from '@likec4-ai/llm-openai';
import type { UserFacingError } from '@likec4-ai/core-domain';
import type { AppContainer } from '../composition-root.js';

interface AISettingsBody {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'gpt-4o-mini';

function secretKey(projectId: string): string {
  return `openai.api-key.${projectId}`;
}

export async function registerAISettingsRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/ai-settings', async (request, reply) => {
    const project = await container.projectStore.get(request.params.projectId);
    if (!project) return sendError(reply, 404, projectNotFoundError(request.params.projectId));

    // "Настроено" означает "хотя бы раз прошёл тест подключения" (пишется в aiModel только тогда) —
    // а не "есть сохранённый ключ": локальным OpenAI-совместимым серверам ключ часто вообще не нужен.
    return { model: project.aiModel ?? null, baseUrl: project.aiBaseUrl ?? null, configured: project.aiModel !== undefined };
  });

  app.post<{ Params: { projectId: string }; Body: AISettingsBody }>('/api/projects/:projectId/ai-settings', async (request, reply) => {
    const project = await container.projectStore.get(request.params.projectId);
    if (!project) return sendError(reply, 404, projectNotFoundError(request.params.projectId));

    const model = request.body?.model?.trim() || DEFAULT_MODEL;
    const baseUrl = request.body?.baseUrl?.trim();
    // Пустое поле при обновлении = "оставить как было", а не "точно нет ключа" — иначе нельзя
    // сменить модель/baseUrl, не перевводя реальный OpenAI-ключ заново.
    const submittedApiKey = request.body?.apiKey?.trim();
    const effectiveApiKey = submittedApiKey || (await container.secretsVault.get(secretKey(project.id)));

    // Если и сохранённого ключа нет — это не ошибка сама по себе (локальный сервер может не требовать
    // ключ вовсе); testOpenAIConnection сам честно провалится 401-ошибкой, если ключ реально нужен.
    const connection = await testOpenAIConnection({ apiKey: effectiveApiKey, baseUrl: baseUrl || container.config.openaiBaseUrl });
    if (!connection.ok) {
      return sendError(reply, 400, connection.error ?? missingFieldError('apiKey', 'OpenAI API key'));
    }

    await container.projectStore.update(project.id, { aiModel: model, aiBaseUrl: baseUrl || undefined });
    if (submittedApiKey) await container.secretsVault.set(secretKey(project.id), submittedApiKey);
    container.userFacingLogger.info(`AI provider settings saved for project: ${project.name}`);

    return { model, baseUrl: baseUrl || null, configured: true };
  });
}

function sendError(reply: FastifyReply, status: number, error: UserFacingError) {
  reply.code(status);
  return { error };
}

function missingFieldError(field: string, humanLabel: string): UserFacingError {
  return {
    id: `ai-settings.missing-field.${field}`,
    title: 'Не заполнено обязательное поле',
    likelyCause: `Поле "${humanLabel}" пустое.`,
    suggestedAction: `Укажите ${humanLabel} и попробуйте снова.`,
    retryable: true,
  };
}

function projectNotFoundError(id: string): UserFacingError {
  return {
    id: 'ai-settings.project-not-found',
    title: 'Проект не найден',
    likelyCause: `Проект с id "${id}" не существует или был удалён.`,
    suggestedAction: 'Вернитесь к списку проектов.',
    retryable: false,
  };
}
