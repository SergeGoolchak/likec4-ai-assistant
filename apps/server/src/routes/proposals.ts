import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ProposalItem, SessionRecord, UserFacingError } from '@likec4-ai/core-domain';
import type { AppContainer } from '../composition-root.js';
import { buildOrchestratorPorts } from '../orchestrator-ports.js';
import { runSessionInBackground, toSessionView, type SessionView } from './sessions.js';

type Result = SessionView | { error: UserFacingError };
interface DecisionBody {
  decision?: 'approved' | 'rejected' | 'edited';
  decisionNote?: string;
  proposedLikeC4Code?: string;
}
const FINAL_DECISIONS = new Set(['approved', 'rejected', 'edited']);

function editable(session: SessionRecord): boolean {
  return session.pipelineState.status === 'paused-for-user'
    && session.pipelineState.currentStage === 'user-review'
    && !session.pipelineState.stageOutputs.proposal?.reviewConfirmedAt
    && session.pipelineState.stageOutputs.generatedFiles === undefined;
}

function reviewError(title: string, cause: string): UserFacingError {
  return { id: 'proposals.review-conflict', title, likelyCause: cause,
    suggestedAction: 'Обновите задачу и проверьте актуальные решения.', retryable: true };
}

export async function registerProposalRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  // Serialize decisions, regeneration and confirmation across tabs. A running LLM
  // request keeps the review locked, so its result cannot overwrite a confirmed set.
  const busy = new Set<string>();
  async function locked(id: string, reply: FastifyReply, action: () => Promise<Result>): Promise<Result> {
    if (busy.has(id)) return sendError(reply, 409, reviewError('Изменения ещё сохраняются', 'В этой задаче уже выполняется другое действие.'));
    busy.add(id);
    try { return await action(); } finally { busy.delete(id); }
  }

  app.post<{ Params: { sessionId: string; itemId: string }; Body: DecisionBody }>(
    '/api/sessions/:sessionId/proposal/items/:itemId/decision',
    async (request, reply) => locked(request.params.sessionId, reply, async () => {
      const session = await container.sessionHistoryStore.get(request.params.sessionId);
      if (!session) return sendError(reply, 404, sessionNotFoundError(request.params.sessionId));
      if (!editable(session)) return sendError(reply, 409, reviewError('Проверка уже завершена', 'Решения зафиксированы или задача находится на другом этапе.'));
      const proposal = session.pipelineState.stageOutputs.proposal;
      const item = proposal?.items.find((i) => i.id === request.params.itemId);
      if (!proposal || !item) return sendError(reply, 404, itemNotFoundError(request.params.itemId));
      const decision = request.body?.decision;
      if (!decision || !FINAL_DECISIONS.has(decision)) return sendError(reply, 400, invalidDecisionError());
      if (decision === 'edited' && !request.body?.proposedLikeC4Code?.trim()) return sendError(reply, 400, missingEditedCodeError());
      const updatedItem: ProposalItem = {
        ...item, decision, decisionNote: request.body?.decisionNote?.trim() || undefined,
        proposedLikeC4Code: decision === 'edited' ? request.body.proposedLikeC4Code!.trim() : item.proposedLikeC4Code,
      };
      const updated = { ...session, pipelineState: { ...session.pipelineState,
        stageOutputs: { ...session.pipelineState.stageOutputs, proposal: {
          ...proposal, items: proposal.items.map((i) => i.id === item.id ? updatedItem : i),
        } },
      } };
      await container.sessionHistoryStore.update(session.id, updated);
      return toSessionView(updated);
    }),
  );

  app.post<{ Params: { sessionId: string }; Body: { reviewRevision?: string } }>(
    '/api/sessions/:sessionId/proposal/confirm',
    async (request, reply) => locked(request.params.sessionId, reply, async () => {
      const session = await container.sessionHistoryStore.get(request.params.sessionId);
      if (!session) return sendError(reply, 404, sessionNotFoundError(request.params.sessionId));
      if (!editable(session)) return sendError(reply, 409, reviewError('Проверка уже завершена', 'Повторное подтверждение не запускает задачу заново.'));
      const proposal = session.pipelineState.stageOutputs.proposal;
      if (!proposal || !proposal.items.every((item) => FINAL_DECISIONS.has(item.decision))) {
        return sendError(reply, 409, reviewError('Остались нерассмотренные предложения', 'Примите решение по каждому пункту перед продолжением.'));
      }
      if (request.body?.reviewRevision !== toSessionView(session).reviewRevision) {
        return sendError(reply, 409, reviewError('Решения изменились', 'В другой вкладке изменены предложения. Проверьте новую версию перед подтверждением.'));
      }
      const project = await container.projectStore.get(session.projectId);
      if (!project) return sendError(reply, 404, sessionNotFoundError(request.params.sessionId));
      const built = await buildOrchestratorPorts(container, project);
      if (!built.ok) return sendError(reply, 400, built.error);
      const updated: SessionRecord = { ...session, pipelineState: {
        ...session.pipelineState, status: 'running', currentStage: 'likec4-generation', error: undefined,
        stageOutputs: { ...session.pipelineState.stageOutputs, proposal: { ...proposal, reviewConfirmedAt: new Date().toISOString() } },
      } };
      await container.sessionHistoryStore.update(session.id, updated);
      runSessionInBackground(container, updated, built.ports);
      reply.code(202);
      return toSessionView(updated);
    }),
  );

  app.post<{ Params: { sessionId: string; itemId: string } }>(
    '/api/sessions/:sessionId/proposal/items/:itemId/regenerate',
    async (request, reply) => locked(request.params.sessionId, reply, async () => {
      const session = await container.sessionHistoryStore.get(request.params.sessionId);
      if (!session) return sendError(reply, 404, sessionNotFoundError(request.params.sessionId));
      if (!editable(session)) return sendError(reply, 409, reviewError('Проверка уже завершена', 'Перегенерация недоступна после подтверждения решений.'));
      const { stageOutputs } = session.pipelineState;
      const proposal = stageOutputs.proposal;
      const item = proposal?.items.find((i) => i.id === request.params.itemId);
      const candidate = stageOutputs.changeCandidates?.find((c) => c.id === request.params.itemId);
      if (!proposal || !item || !candidate || !stageOutputs.architectureGraph) return sendError(reply, 404, itemNotFoundError(request.params.itemId));
      const project = await container.projectStore.get(session.projectId);
      if (!project) return sendError(reply, 404, sessionNotFoundError(request.params.sessionId));
      const built = await buildOrchestratorPorts(container, project);
      if (!built.ok) return sendError(reply, 400, built.error);
      const rules = await container.architectureRuleStore.list(session.projectId);
      const [regenerated] = await built.ports.proposalGenerator.generate({
        candidates: [candidate], ambiguities: stageOutputs.ambiguities ?? [],
        graph: stageOutputs.architectureGraph, rules, knowledgeProviders: built.ports.knowledgeProviders,
      });
      if (!regenerated) return sendError(reply, 500, regenerationFailedError());
      const updated = { ...session, pipelineState: { ...session.pipelineState,
        stageOutputs: { ...stageOutputs, proposal: { ...proposal,
          items: proposal.items.map((i) => i.id === item.id ? { ...regenerated, id: item.id, decision: 'pending' as const } : i),
        } },
      } };
      await container.sessionHistoryStore.update(session.id, updated);
      return toSessionView(updated);
    }),
  );
}

function sendError(reply: FastifyReply, status: number, error: UserFacingError) {
  reply.code(status);
  return { error };
}

function sessionNotFoundError(id: string): UserFacingError {
  return {
    id: 'proposals.session-not-found',
    title: 'Сессия анализа не найдена',
    likelyCause: `Сессия с id "${id}" не существует.`,
    suggestedAction: 'Запустите новый анализ из карточки проекта.',
    retryable: false,
  };
}

function itemNotFoundError(id: string): UserFacingError {
  return {
    id: 'proposals.item-not-found',
    title: 'Предложение не найдено',
    likelyCause: `Item с id "${id}" не существует в этой сессии.`,
    suggestedAction: 'Обновите страницу и попробуйте снова.',
    retryable: true,
  };
}

function invalidDecisionError(): UserFacingError {
  return {
    id: 'proposals.invalid-decision',
    title: 'Некорректное решение',
    likelyCause: 'Решение должно быть одним из: approved, rejected, edited.',
    suggestedAction: 'Выберите одно из доступных действий на карточке предложения.',
    retryable: true,
  };
}

function missingEditedCodeError(): UserFacingError {
  return {
    id: 'proposals.missing-edited-code',
    title: 'Не заполнен отредактированный код',
    likelyCause: 'При решении "edited" нужно указать новый текст proposedLikeC4Code.',
    suggestedAction: 'Впишите отредактированный фрагмент LikeC4 и повторите.',
    retryable: true,
  };
}

function regenerationFailedError(): UserFacingError {
  return {
    id: 'proposals.regeneration-failed',
    title: 'Не удалось перегенерировать предложение',
    likelyCause: 'AI-провайдер не вернул результат для этого запроса.',
    suggestedAction: 'Повторите попытку позже.',
    retryable: true,
  };
}
