import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { OrchestratorPorts } from '@likec4-ai/core-pipeline';
import type {
  PipelineStageId,
  PipelineStatus,
  SessionRecord,
  UserFacingError,
  UserFacingEvent,
} from '@likec4-ai/core-domain';
import type { AppContainer } from '../composition-root.js';

interface CreateSessionBody {
  confluencePageId?: string;
}

interface SessionSummary {
  confluenceTitle?: string;
  specificationChunkCount?: number;
  existingFileCount?: number;
  elementCount?: number;
  relationshipCount?: number;
  viewCount?: number;
  existingModelDiagnosticsCount?: number;
  extractedRequirementCount?: number;
  matchedRequirementCount?: number;
  changeCandidateCount?: number;
}

interface SessionView {
  id: string;
  projectId: string;
  status: PipelineStatus;
  currentStage: PipelineStageId;
  timeline: UserFacingEvent[];
  error?: UserFacingError;
  summary: SessionSummary;
}

export async function registerSessionRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.post<{ Params: { projectId: string }; Body: CreateSessionBody }>(
    '/api/projects/:projectId/sessions',
    async (request, reply) => {
      const project = await container.projectStore.get(request.params.projectId);
      if (!project) return sendError(reply, 404, projectNotFoundError(request.params.projectId));

      const confluencePageId = request.body?.confluencePageId?.trim();
      if (!confluencePageId) return sendError(reply, 400, missingFieldError('confluencePageId', 'ID страницы Confluence'));

      if (!project.confluenceBaseUrl) return sendError(reply, 400, confluenceNotConfiguredError());
      const confluenceToken = await container.secretsVault.get(`confluence.pat.${project.id}`);
      if (!confluenceToken) return sendError(reply, 400, confluenceNotConfiguredError());

      // "Настроено" = хотя бы раз прошёл тест подключения (см. ai-settings.ts) — не наличие ключа:
      // локальным OpenAI-совместимым серверам ключ часто не нужен вовсе.
      if (project.aiModel === undefined) return sendError(reply, 400, aiNotConfiguredError());
      const openaiApiKey = await container.secretsVault.get(`openai.api-key.${project.id}`);

      const repositoryAdapter = container.createLocalRepositoryAdapter(project.localRepositoryPath);
      const repoConnection = await repositoryAdapter.testConnection();
      if (!repoConnection.ok) {
        return sendError(reply, 400, repoConnection.error ?? confluenceNotConfiguredError());
      }

      const confluenceAdapter = container.createConfluenceAdapter({ baseUrl: project.confluenceBaseUrl, token: confluenceToken });
      const llmProvider = container.createLLMProvider({ apiKey: openaiApiKey, model: project.aiModel, baseUrl: project.aiBaseUrl });
      const changeEngine = container.createChangeEngine(llmProvider);
      const revisionInfo = await repositoryAdapter.getRevisionInfo();

      const session: SessionRecord = {
        id: randomUUID(),
        projectId: project.id,
        createdAt: new Date().toISOString(),
        createdByUserEmail: userInfo().username,
        confluenceRef: { baseUrl: project.confluenceBaseUrl, pageId: confluencePageId },
        confluencePageVersion: 0,
        repositorySnapshotRef: revisionInfo.commit ?? revisionInfo.branch ?? 'local',
        llmProviderId: llmProvider.id,
        llmModel: llmProvider.model,
        pipelineState: { currentStage: 'load-confluence', status: 'running', stageOutputs: {}, pendingQuestionIds: [] },
        questions: [],
        validationHistory: [],
        technicalLog: [],
        userFacingTimeline: [],
      };

      await container.sessionHistoryStore.create(session);
      runInBackground(container, session, {
        confluenceAdapter,
        repositoryAdapter,
        likec4Parser: container.likec4Parser,
        llmProvider,
        changeEngine,
        architectureRuleStore: container.architectureRuleStore,
      });

      reply.code(202);
      return { sessionId: session.id };
    },
  );

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    const session = await container.sessionHistoryStore.get(request.params.id);
    if (!session) return sendError(reply, 404, sessionNotFoundError(request.params.id));
    return toSessionView(session);
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id/events', async (request, reply) => {
    const initial = await container.sessionHistoryStore.get(request.params.id);
    if (!initial) return sendError(reply, 404, sessionNotFoundError(request.params.id));

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send('snapshot', toSessionView(initial));

    if (initial.pipelineState.status === 'completed' || initial.pipelineState.status === 'failed') {
      reply.raw.end();
      return;
    }

    const unsubscribe = container.sessionEvents.subscribe(request.params.id, (event) => {
      if (event.type === 'status') {
        send('status', event.status);
        return;
      }
      container.sessionHistoryStore
        .get(request.params.id)
        .then((latest) => {
          if (latest) send('snapshot', toSessionView(latest));
        })
        .finally(() => reply.raw.end());
    });

    request.raw.on('close', unsubscribe);
  });
}

function runInBackground(container: AppContainer, session: SessionRecord, ports: OrchestratorPorts): void {
  container.pipelineOrchestrator
    .run({
      session,
      ports,
      sessionStore: container.sessionHistoryStore,
      onStatus: (status) => container.sessionEvents.publish(session.id, { type: 'status', status }),
    })
    .then(() => container.sessionEvents.publish(session.id, { type: 'completed' }))
    .catch((err: unknown) => {
      container.technicalLogger.error({ err, sessionId: session.id }, 'Pipeline run failed');
      container.sessionEvents.publish(session.id, { type: 'failed' });
    });
}

function toSessionView(session: SessionRecord): SessionView {
  const outputs = session.pipelineState.stageOutputs;
  return {
    id: session.id,
    projectId: session.projectId,
    status: session.pipelineState.status,
    currentStage: session.pipelineState.currentStage,
    timeline: session.userFacingTimeline,
    error: session.pipelineState.error,
    summary: {
      confluenceTitle: outputs.confluenceContent?.title,
      specificationChunkCount: outputs.specification?.chunks.length,
      existingFileCount: outputs.existingFiles?.length,
      elementCount: outputs.architectureGraph?.elements.size,
      relationshipCount: outputs.architectureGraph?.relationships.size,
      viewCount: outputs.architectureGraph?.views.size,
      existingModelDiagnosticsCount: outputs.existingModelDiagnostics?.diagnostics.length,
      extractedRequirementCount: outputs.extractedRequirements?.length,
      matchedRequirementCount: outputs.entityMatches?.filter((m) => m.matchedElementId).length,
      changeCandidateCount: outputs.changeCandidates?.length,
    },
  };
}

function sendError(reply: FastifyReply, status: number, error: UserFacingError) {
  reply.code(status);
  return { error };
}

function missingFieldError(field: string, humanLabel: string): UserFacingError {
  return {
    id: `sessions.missing-field.${field}`,
    title: 'Не заполнено обязательное поле',
    likelyCause: `Поле "${humanLabel}" пустое.`,
    suggestedAction: `Укажите ${humanLabel} и попробуйте снова.`,
    retryable: true,
  };
}

function projectNotFoundError(id: string): UserFacingError {
  return {
    id: 'sessions.project-not-found',
    title: 'Проект не найден',
    likelyCause: `Проект с id "${id}" не существует или был удалён.`,
    suggestedAction: 'Вернитесь к списку проектов.',
    retryable: false,
  };
}

function sessionNotFoundError(id: string): UserFacingError {
  return {
    id: 'sessions.not-found',
    title: 'Сессия анализа не найдена',
    likelyCause: `Сессия с id "${id}" не существует.`,
    suggestedAction: 'Запустите новый анализ из карточки проекта.',
    retryable: false,
  };
}

function confluenceNotConfiguredError(): UserFacingError {
  return {
    id: 'sessions.confluence-not-configured',
    title: 'Confluence не подключён',
    likelyCause: 'В настройках проекта не указан адрес Confluence или не сохранён токен доступа.',
    suggestedAction: 'Откройте настройки проекта и подключите Confluence перед запуском анализа.',
    retryable: false,
  };
}

function aiNotConfiguredError(): UserFacingError {
  return {
    id: 'sessions.ai-not-configured',
    title: 'AI-провайдер не подключён',
    likelyCause: 'В настройках проекта не сохранён OpenAI API key.',
    suggestedAction: 'Откройте настройки проекта и подключите AI-провайдера перед запуском анализа.',
    retryable: false,
  };
}
