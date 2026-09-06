import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ClarificationQuestion, UserFacingError } from '@likec4-ai/core-domain';
import { computePendingQuestionIds } from '@likec4-ai/core-pipeline';
import type { AppContainer } from '../composition-root.js';
import { buildOrchestratorPorts } from '../orchestrator-ports.js';
import { runSessionInBackground, toSessionView, type SessionView } from './sessions.js';

interface AnswerQuestionBody {
  selectedOptionId?: string;
  freeText?: string;
  /** Пользователь явно не знает ответ — вопрос закрывается статусом 'marked-unknown', а не 'answered'. */
  markUnknown?: boolean;
  /** Отложить на потом без ответа — статус 'deferred'. И markUnknown, и defer не требуют selectedOptionId/freeText. */
  defer?: boolean;
}

export async function registerQuestionRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.post<{ Params: { sessionId: string; questionId: string }; Body: AnswerQuestionBody }>(
    '/api/sessions/:sessionId/questions/:questionId/answer',
    async (request, reply): Promise<SessionView | { error: UserFacingError }> => {
      const session = await container.sessionHistoryStore.get(request.params.sessionId);
      if (!session) return sendError(reply, 404, sessionNotFoundError(request.params.sessionId));

      const ambiguities = session.pipelineState.stageOutputs.ambiguities ?? [];
      const question = ambiguities.find((q) => q.id === request.params.questionId);
      if (!question) return sendError(reply, 404, questionNotFoundError(request.params.questionId));
      if (question.status !== 'open') return sendError(reply, 400, alreadyResolvedError());

      const body = request.body ?? {};
      const status: ClarificationQuestion['status'] = body.markUnknown ? 'marked-unknown' : body.defer ? 'deferred' : 'answered';
      const selectedOptionId = body.selectedOptionId?.trim() || undefined;
      const freeText = body.freeText?.trim() || undefined;
      if (status === 'answered' && !selectedOptionId && !freeText) {
        return sendError(reply, 400, missingAnswerError());
      }

      const updatedQuestion: ClarificationQuestion = {
        ...question,
        status,
        answer: status === 'answered' ? { selectedOptionId, freeText, answeredAt: new Date().toISOString() } : undefined,
      };
      const updatedAmbiguities = ambiguities.map((q) => (q.id === updatedQuestion.id ? updatedQuestion : q));
      const pendingQuestionIds = computePendingQuestionIds(updatedAmbiguities);

      const updatedSession = {
        ...session,
        // Зеркало для будущих экранов (History и т.п.) — единственный источник истины всё равно stageOutputs.ambiguities.
        questions: updatedAmbiguities,
        pipelineState: {
          ...session.pipelineState,
          stageOutputs: { ...session.pipelineState.stageOutputs, ambiguities: updatedAmbiguities },
          pendingQuestionIds,
        },
      };
      await container.sessionHistoryStore.update(session.id, updatedSession);

      if (pendingQuestionIds.length === 0) {
        const project = await container.projectStore.get(session.projectId);
        if (project) {
          const built = await buildOrchestratorPorts(container, project);
          // Если настройки проекта с момента запуска сессии сломались (например, кто-то стёр AI-ключ) —
          // ответ всё равно сохранён; сессия останется в paused-for-user, пользователь увидит это на
          // экране и сможет попробовать снова после починки настроек, а не получит ошибку прямо здесь.
          if (built.ok) runSessionInBackground(container, updatedSession, built.ports);
        }
      }

      return toSessionView(await container.sessionHistoryStore.get(session.id).then((s) => s ?? updatedSession));
    },
  );
}

function sendError(reply: FastifyReply, status: number, error: UserFacingError) {
  reply.code(status);
  return { error };
}

function sessionNotFoundError(id: string): UserFacingError {
  return {
    id: 'questions.session-not-found',
    title: 'Сессия анализа не найдена',
    likelyCause: `Сессия с id "${id}" не существует.`,
    suggestedAction: 'Запустите новый анализ из карточки проекта.',
    retryable: false,
  };
}

function questionNotFoundError(id: string): UserFacingError {
  return {
    id: 'questions.not-found',
    title: 'Вопрос не найден',
    likelyCause: `Вопрос с id "${id}" не существует в этой сессии.`,
    suggestedAction: 'Обновите страницу и попробуйте снова.',
    retryable: true,
  };
}

function alreadyResolvedError(): UserFacingError {
  return {
    id: 'questions.already-resolved',
    title: 'Вопрос уже закрыт',
    likelyCause: 'На этот вопрос уже был дан ответ ранее (возможно, из другой вкладки).',
    suggestedAction: 'Обновите страницу, чтобы увидеть актуальное состояние.',
    retryable: false,
  };
}

function missingAnswerError(): UserFacingError {
  return {
    id: 'questions.missing-answer',
    title: 'Ответ не заполнен',
    likelyCause: 'Нужно выбрать один из вариантов или написать свой ответ — либо явно отметить "не знаю"/"отложить".',
    suggestedAction: 'Выберите вариант, впишите текст, или используйте кнопку "не знаю"/"отложить".',
    retryable: true,
  };
}
