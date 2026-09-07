import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Snapshot, SessionRecordSummary, UserFacingError } from '@likec4-ai/core-domain';
import type { AppContainer } from '../composition-root.js';
import { toSessionView, type SessionView } from './sessions.js';

interface HistoryResponse {
  sessions: SessionRecordSummary[];
  snapshots: Snapshot[];
}

export async function registerHistoryRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/history', async (request): Promise<HistoryResponse> => {
    const [sessions, snapshots] = await Promise.all([
      container.sessionHistoryStore.list({ projectId: request.params.projectId }),
      container.snapshotStore.list(request.params.projectId),
    ]);
    return { sessions, snapshots };
  });

  app.post<{ Params: { projectId: string; snapshotId: string } }>(
    '/api/projects/:projectId/snapshots/:snapshotId/restore',
    async (request, reply): Promise<{ ok: true } | { error: UserFacingError }> => {
      const project = await container.projectStore.get(request.params.projectId);
      if (!project) return sendError(reply, 404, projectNotFoundError(request.params.projectId));

      try {
        await restoreSnapshot(container, project.id, project.localRepositoryPath, request.params.snapshotId);
        return { ok: true };
      } catch (err) {
        container.technicalLogger.error({ err, projectId: project.id }, 'Snapshot restore failed');
        return sendError(reply, 500, restoreFailedError(err));
      }
    },
  );

  // Свёрнутый путь для основного DoD-сценария "Apply → Rollback": не требует помнить/передавать
  // snapshotId вручную — берёт его из applyResult уже загруженной сессии.
  app.post<{ Params: { sessionId: string } }>(
    '/api/sessions/:sessionId/rollback',
    async (request, reply): Promise<SessionView | { error: UserFacingError }> => {
      const session = await container.sessionHistoryStore.get(request.params.sessionId);
      if (!session) return sendError(reply, 404, sessionNotFoundError(request.params.sessionId));
      if (!session.applyResult?.rollbackAvailable) return sendError(reply, 409, rollbackNotAvailableError());

      const project = await container.projectStore.get(session.projectId);
      if (!project) return sendError(reply, 404, sessionNotFoundError(request.params.sessionId));

      try {
        await restoreSnapshot(container, project.id, project.localRepositoryPath, session.applyResult.snapshotId);

        const updatedSession = { ...session, applyResult: { ...session.applyResult, rollbackAvailable: false } };
        await container.sessionHistoryStore.update(session.id, updatedSession);
        return toSessionView(updatedSession);
      } catch (err) {
        container.technicalLogger.error({ err, sessionId: session.id }, 'Rollback failed');
        return sendError(reply, 500, restoreFailedError(err));
      }
    },
  );
}

async function restoreSnapshot(container: AppContainer, projectId: string, localRepositoryPath: string, snapshotId: string): Promise<void> {
  await container.withProjectLock(projectId, async () => {
    const files = await container.snapshotStore.restore(snapshotId);
    const repositoryAdapter = container.createLocalRepositoryAdapter(localRepositoryPath);
    await repositoryAdapter.writeFiles(files);

    // Настоящий откат, а не частичная перезапись — файлы, появившиеся ПОСЛЕ снэпшота (например
    // новый файл, созданный Apply), нужно удалить, иначе репозиторий не вернётся byte-for-byte
    // к прежнему состоянию (см. RepositoryAdapter.deleteFiles, добавлен именно для этого случая).
    const snapshotPaths = new Set(files.map((f) => f.path));
    const currentPaths = await repositoryAdapter.listLikeC4Files();
    const orphaned = currentPaths.filter((path) => !snapshotPaths.has(path));
    if (orphaned.length > 0) await repositoryAdapter.deleteFiles(orphaned);
  });
}

function sendError(reply: FastifyReply, status: number, error: UserFacingError) {
  reply.code(status);
  return { error };
}

function projectNotFoundError(id: string): UserFacingError {
  return {
    id: 'history.project-not-found',
    title: 'Проект не найден',
    likelyCause: `Проект с id "${id}" не существует или был удалён.`,
    suggestedAction: 'Вернитесь к списку проектов.',
    retryable: false,
  };
}

function sessionNotFoundError(id: string): UserFacingError {
  return {
    id: 'history.session-not-found',
    title: 'Сессия анализа не найдена',
    likelyCause: `Сессия с id "${id}" не существует.`,
    suggestedAction: 'Вернитесь к списку проектов.',
    retryable: false,
  };
}

function rollbackNotAvailableError(): UserFacingError {
  return {
    id: 'history.rollback-not-available',
    title: 'Откат недоступен',
    likelyCause: 'Эта сессия ещё не применена, либо уже была откачена ранее.',
    suggestedAction: 'Проверьте статус сессии на экране Apply, либо восстановите нужный снэпшот вручную из History.',
    retryable: false,
    helpTopicId: 'field.rollback',
  };
}

function restoreFailedError(err: unknown): UserFacingError {
  const message = err instanceof Error ? err.message : String(err);
  return {
    id: 'history.restore-failed',
    title: 'Не удалось восстановить снэпшот',
    likelyCause: message,
    suggestedAction: 'Проверьте, что путь к локальному репозиторию всё ещё существует и доступен для записи, и повторите попытку.',
    retryable: true,
  };
}
