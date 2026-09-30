import type { FastifyInstance, FastifyReply } from 'fastify';
import { redactSecrets, type UserFacingError } from '@likec4-ai/core-domain';
import { hasBlockingValidationIssues } from '@likec4-ai/core-pipeline';
import { ApplyConflictError, ApplyWriteError, executeApply } from '../apply-executor.js';
import type { AppContainer } from '../composition-root.js';
import { toSessionView, type SessionView } from './sessions.js';

/**
 * Стадия 19 (Apply) реализована как гейт с `run()`, который никогда не
 * вызывается (см. `packages/core-pipeline/src/stages/apply.ts`) — вся
 * реальная работа (hash-check, snapshot, project-level mutex, атомарная
 * запись, auto-rollback при сбое — см. `apply-executor.ts`, Milestone 12)
 * происходит здесь. Сознательно не используем
 * `buildOrchestratorPorts`/`runSessionInBackground`, как это делают
 * `questions.ts`/`proposals.ts`: Apply физически не нуждается ни в LLM, ни
 * в Confluence — только в RepositoryAdapter и SnapshotStore, оба уже есть
 * напрямую на AppContainer. Требовать рабочий AI/Confluence только чтобы
 * записать уже сгенерированный и провалидированный код было бы лишней и
 * не связанной с Apply точкой отказа.
 */
export async function registerApplyRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.post<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/apply',
    async (request, reply): Promise<SessionView | { error: UserFacingError }> => {
      const session = await container.sessionHistoryStore.get(request.params.sessionId);
      if (!session) return sendError(reply, 404, sessionNotFoundError(request.params.sessionId));

      if (session.pipelineState.currentStage !== 'apply' || session.pipelineState.status !== 'paused-for-user') {
        return sendError(reply, 409, notReadyForApplyError());
      }

      const { stageOutputs } = session.pipelineState;
      const { existingFiles, generatedFiles, diff, validationResult, proposal } = stageOutputs;
      if (!existingFiles || !generatedFiles || !diff || !proposal) {
        return sendError(reply, 500, missingPipelineDataError());
      }

      // Apply gate (план, раздел "Валидация и repair") — пересчитано здесь же общей функцией
      // `hasBlockingValidationIssues` (см. validation-gate.ts), а не только на фронтенде: undefined
      // (валидация ещё не завершена) тоже блокирует, разрешён только явный false.
      if (hasBlockingValidationIssues(validationResult) !== false) return sendError(reply, 400, blockedByValidationError());

      const project = await container.projectStore.get(session.projectId);
      if (!project) return sendError(reply, 404, sessionNotFoundError(request.params.sessionId));

      try {
        const applyResult = await container.withProjectLock(project.id, () =>
          executeApply({
            repositoryAdapter: container.createLocalRepositoryAdapter(project.localRepositoryPath),
            snapshotStore: container.snapshotStore,
            projectId: project.id,
            sessionId: session.id,
            existingFiles,
            diff,
            proposal,
          }),
        );

        const at = new Date().toISOString();
        const updatedSession = {
          ...session,
          applyResult,
          pipelineState: {
            ...session.pipelineState,
            status: 'completed' as const,
            stageOutputs: { ...stageOutputs, applyResult },
          },
          userFacingTimeline: [...session.userFacingTimeline, { at, message: 'Изменения применены' }],
        };
        await container.sessionHistoryStore.update(session.id, updatedSession);
        return toSessionView(updatedSession);
      } catch (err) {
        if (err instanceof ApplyConflictError) return sendError(reply, 409, fileConflictError(err.paths));
        container.technicalLogger.error({ err, sessionId: session.id }, 'Apply failed');
        return sendError(reply, 500, applyFailedError(err));
      }
    },
  );
}

function sendError(reply: FastifyReply, status: number, error: UserFacingError) {
  reply.code(status);
  return { error };
}

function sessionNotFoundError(id: string): UserFacingError {
  return {
    id: 'apply.session-not-found',
    title: 'Сессия анализа не найдена',
    likelyCause: `Сессия с id "${id}" не существует.`,
    suggestedAction: 'Вернитесь к списку проектов.',
    retryable: false,
  };
}

function notReadyForApplyError(): UserFacingError {
  return {
    id: 'apply.not-ready',
    title: 'Сессия ещё не готова к Apply',
    likelyCause: 'Pipeline либо ещё не дошёл до стадии Apply, либо изменения уже применены.',
    suggestedAction: 'Обновите страницу, чтобы увидеть актуальный статус сессии.',
    retryable: false,
  };
}

function missingPipelineDataError(): UserFacingError {
  return {
    id: 'apply.missing-pipeline-data',
    title: 'Не хватает данных для применения',
    likelyCause: 'Сессия дошла до стадии Apply, но в ней отсутствуют результаты более ранних стадий.',
    suggestedAction: 'Это внутренняя ошибка — сообщите о ней разработчикам.',
    retryable: false,
  };
}

function blockedByValidationError(): UserFacingError {
  return {
    id: 'apply.blocked-by-validation',
    title: 'Apply заблокирован непройденной валидацией',
    likelyCause: 'Есть техническая ошибка (Level 1) или неразрешённая архитектурная находка уровня "must" (Level 2).',
    suggestedAction: 'Вернитесь к экрану Preview/Diff и проверьте оставшиеся диагностики — Apply станет доступен, когда всё будет чисто.',
    retryable: false,
    helpTopicId: 'field.apply-gate',
  };
}

function fileConflictError(paths: string[]): UserFacingError {
  return {
    id: 'apply.file-conflict',
    title: 'Файлы изменились на диске с начала анализа',
    likelyCause: `Следующие файлы отличаются от того состояния, на основе которого строился анализ: ${paths.join(', ')}.`,
    suggestedAction: 'Запустите новый анализ на актуальном состоянии репозитория — Apply не перезаписывает чужие правки молча.',
    retryable: false,
    helpTopicId: 'field.apply-gate',
  };
}

function applyFailedError(err: unknown): UserFacingError {
  const message = redactSecrets(err instanceof Error ? err.message : String(err));
  if (err instanceof ApplyWriteError) {
    return {
      id: 'apply.write-failed',
      title: 'Не удалось записать изменения',
      likelyCause: message,
      suggestedAction: err.rolledBack
        ? 'Изменения автоматически откачены к состоянию до Apply — репозиторий не повреждён. Повторите попытку.'
        : 'Не удалось автоматически откатить изменения — проверьте состояние репозитория вручную и восстановите нужный снэпшот из History.',
      retryable: true,
    };
  }
  return {
    id: 'apply.write-failed',
    title: 'Не удалось записать изменения',
    likelyCause: message,
    suggestedAction: 'Snapshot (если успел создаться) сохранён в History — проверьте состояние репозитория и повторите попытку.',
    retryable: true,
  };
}
