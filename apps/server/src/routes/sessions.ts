import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type {
  ApplyResult,
  ClarificationQuestion,
  FileDiff,
  PipelineStageId,
  PipelineStatus,
  Proposal,
  RenderedView,
  SessionRecord,
  UserFacingError,
  UserFacingEvent,
} from '@likec4-ai/core-domain';
import { hasBlockingValidationIssues } from '@likec4-ai/core-pipeline';
import type { AppContainer } from '../composition-root.js';
import { buildOrchestratorPorts, type FullOrchestratorPorts } from '../orchestrator-ports.js';

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
  ambiguityCount?: number;
  generatedFileCount?: number;
  technicalDiagnosticsCount?: number;
  architecturalFindingsCount?: number;
  repairAttemptCount?: number;
  /** undefined => валидация ещё не прошла оба уровня; false => есть техническая ошибка или must-находка, ждём repair. */
  hasBlockingValidationIssues?: boolean;
  diffFileCount?: number;
  previewViewCount?: number;
}

export interface SessionView {
  id: string;
  projectId: string;
  status: PipelineStatus;
  currentStage: PipelineStageId;
  timeline: UserFacingEvent[];
  error?: UserFacingError;
  summary: SessionSummary;
  /** Открытые и уже отвеченные вопросы стадии 9 — непустой список открытых означает, что pipeline стоит на паузе (см. PipelineStatus.paused-for-user). */
  questions: ClarificationQuestion[];
  /** Результат стадии 11 — есть, начиная с paused-for-user на user-review (стадия 12) и до конца. */
  proposal?: Proposal;
  /** Результат стадии 17 (Diff, Milestone 10) — полный список файлов, не только счётчик, для экрана Diff. */
  diff?: FileDiff[];
  /** Результат стадии 18 (Preview, Milestone 10) — включает и `svg`, и `layoutData` для интерактивного рендера. */
  previewViews?: RenderedView[];
  /** Результат стадии 19 (Apply, Milestone 10) — есть только после того, как пользователь нажал Apply. */
  applyResult?: ApplyResult;
}

export async function registerSessionRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.post<{ Params: { projectId: string }; Body: CreateSessionBody }>(
    '/api/projects/:projectId/sessions',
    async (request, reply) => {
      const project = await container.projectStore.get(request.params.projectId);
      if (!project) return sendError(reply, 404, projectNotFoundError(request.params.projectId));

      const confluencePageId = request.body?.confluencePageId?.trim();
      if (!confluencePageId) return sendError(reply, 400, missingFieldError('confluencePageId', 'ID страницы Confluence'));

      const built = await buildOrchestratorPorts(container, project);
      if (!built.ok) return sendError(reply, 400, built.error);
      const { ports } = built;

      const revisionInfo = await ports.repositoryAdapter.getRevisionInfo();

      const session: SessionRecord = {
        id: randomUUID(),
        projectId: project.id,
        createdAt: new Date().toISOString(),
        createdByUserEmail: userInfo().username,
        // project.confluenceBaseUrl точно задан здесь — buildOrchestratorPorts уже это проверил как часть ok:true.
        confluenceRef: { baseUrl: project.confluenceBaseUrl!, pageId: confluencePageId },
        confluencePageVersion: 0,
        repositorySnapshotRef: revisionInfo.commit ?? revisionInfo.branch ?? 'local',
        llmProviderId: ports.llmProvider.id,
        llmModel: ports.llmProvider.model,
        pipelineState: { currentStage: 'load-confluence', status: 'running', stageOutputs: {}, pendingQuestionIds: [] },
        questions: [],
        validationHistory: [],
        technicalLog: [],
        userFacingTimeline: [],
      };

      await container.sessionHistoryStore.create(session);
      runSessionInBackground(container, session, ports);

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

    // 'paused-for-user' — тоже терминально для ЭТОГО соединения: дальше ничего не произойдёт, пока
    // пользователь не ответит на вопрос через отдельный роут (см. questions.ts), а тот запускает
    // pipeline заново, и фронтенд откроет новый EventSource, а не будет ждать в этом же.
    if (
      initial.pipelineState.status === 'completed' ||
      initial.pipelineState.status === 'failed' ||
      initial.pipelineState.status === 'paused-for-user'
    ) {
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

/** Используется и при создании сессии, и при возобновлении после ответа на вопрос (см. questions.ts). */
export function runSessionInBackground(container: AppContainer, session: SessionRecord, ports: FullOrchestratorPorts): void {
  container.pipelineOrchestrator
    .run({
      session,
      ports,
      sessionStore: container.sessionHistoryStore,
      onStatus: (status) => container.sessionEvents.publish(session.id, { type: 'status', status }),
    })
    .then((finished) => {
      const type = finished.pipelineState.status === 'paused-for-user' ? 'paused' : 'completed';
      container.sessionEvents.publish(session.id, { type });
    })
    .catch((err: unknown) => {
      container.technicalLogger.error({ err, sessionId: session.id }, 'Pipeline run failed');
      container.sessionEvents.publish(session.id, { type: 'failed' });
    });
}

export function toSessionView(session: SessionRecord): SessionView {
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
      ambiguityCount: outputs.ambiguities?.length,
      generatedFileCount: outputs.generatedFiles?.length,
      technicalDiagnosticsCount: outputs.validationResult?.technical?.diagnostics.length,
      architecturalFindingsCount: outputs.validationResult?.architectural?.findings.length,
      repairAttemptCount: outputs.repairAttempts?.length,
      hasBlockingValidationIssues: hasBlockingValidationIssues(outputs.validationResult),
      diffFileCount: outputs.diff?.length,
      previewViewCount: outputs.previewViews?.length,
    },
    questions: outputs.ambiguities ?? [],
    proposal: outputs.proposal,
    diff: outputs.diff,
    previewViews: outputs.previewViews,
    applyResult: session.applyResult,
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
