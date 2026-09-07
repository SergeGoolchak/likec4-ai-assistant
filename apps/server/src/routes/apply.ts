import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ApplyResult, RepositoryFile, UserFacingError } from '@likec4-ai/core-domain';
import { hasBlockingValidationIssues } from '@likec4-ai/core-pipeline';
import type { AppContainer } from '../composition-root.js';
import { toSessionView, type SessionView } from './sessions.js';

/**
 * Стадия 19 (Apply) реализована как гейт с `run()`, который никогда не
 * вызывается (см. `packages/core-pipeline/src/stages/apply.ts`) — вся
 * реальная работа (hash-check, snapshot, project-level mutex, атомарная
 * запись) происходит здесь. Сознательно не используем
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
        const applyResult = await container.withProjectLock(project.id, async () => {
          const repositoryAdapter = container.createLocalRepositoryAdapter(project.localRepositoryPath);

          // Hash-check (риск №6) — не перезаписывать молча файлы, изменившиеся на диске с момента
          // начала анализа. Сравниваем по content (не по RepositoryFile.sha — локальный адаптер его
          // не заполняет), поэтому это честная проверка независимо от конкретного адаптера.
          const currentFiles = await repositoryAdapter.readAll();
          const currentByPath = new Map(currentFiles.map((f) => [f.path, f.content]));
          const analysisByPath = new Map(existingFiles.map((f) => [f.path, f.content]));
          const conflicts: string[] = [];
          for (const entry of diff) {
            const current = currentByPath.get(entry.path);
            const atAnalysisTime = analysisByPath.get(entry.path);
            if (sha256(current) !== sha256(atAnalysisTime)) conflicts.push(entry.path);
          }
          if (conflicts.length > 0) throw new ApplyConflictError(conflicts);

          const snapshot = await container.snapshotStore.create(project.id, currentFiles, {
            reason: 'pre-apply',
            sessionId: session.id,
            createdAt: new Date().toISOString(),
          });

          const changedFiles: RepositoryFile[] = diff
            .filter((entry) => entry.changeType !== 'deleted')
            .map((entry) => ({ path: entry.path, content: entry.after! }));
          const deletedPaths = diff.filter((entry) => entry.changeType === 'deleted').map((entry) => entry.path);
          await repositoryAdapter.writeFiles(changedFiles);
          if (deletedPaths.length > 0) await repositoryAdapter.deleteFiles(deletedPaths);

          const result: ApplyResult = {
            appliedAt: new Date().toISOString(),
            snapshotId: snapshot.id,
            appliedItemIds: proposal.items.filter((i) => i.decision === 'approved' || i.decision === 'edited').map((i) => i.id),
            rejectedItemIds: proposal.items.filter((i) => i.decision === 'rejected').map((i) => i.id),
            filesChanged: [...changedFiles.map((f) => f.path), ...deletedPaths],
            rollbackAvailable: true,
          };
          return result;
        });

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

class ApplyConflictError extends Error {
  constructor(readonly paths: string[]) {
    super(`Files changed on disk since analysis started: ${paths.join(', ')}`);
  }
}

function sha256(content: string | undefined): string {
  return createHash('sha256')
    .update(content ?? '', 'utf8')
    .digest('hex');
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
  };
}

function fileConflictError(paths: string[]): UserFacingError {
  return {
    id: 'apply.file-conflict',
    title: 'Файлы изменились на диске с начала анализа',
    likelyCause: `Следующие файлы отличаются от того состояния, на основе которого строился анализ: ${paths.join(', ')}.`,
    suggestedAction: 'Запустите новый анализ на актуальном состоянии репозитория — Apply не перезаписывает чужие правки молча.',
    retryable: false,
  };
}

function applyFailedError(err: unknown): UserFacingError {
  const message = err instanceof Error ? err.message : String(err);
  return {
    id: 'apply.write-failed',
    title: 'Не удалось записать изменения',
    likelyCause: message,
    suggestedAction: 'Snapshot (если успел создаться) сохранён в History — проверьте состояние репозитория и повторите попытку.',
    retryable: true,
  };
}
