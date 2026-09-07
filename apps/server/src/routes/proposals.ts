import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ItemDecisionStatus, ProposalItem, UserFacingError } from '@likec4-ai/core-domain';
import type { AppContainer } from '../composition-root.js';
import { buildOrchestratorPorts } from '../orchestrator-ports.js';
import { runSessionInBackground, toSessionView, type SessionView } from './sessions.js';

interface DecisionBody {
  decision?: 'approved' | 'rejected' | 'edited';
  decisionNote?: string;
  /** Только для decision: 'edited' — ручная правка черновика кода без повторного обращения к LLM. */
  proposedLikeC4Code?: string;
}

const FINAL_DECISIONS: ReadonlySet<string> = new Set<ItemDecisionStatus>(['approved', 'rejected', 'edited']);

export async function registerProposalRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.post<{ Params: { sessionId: string; itemId: string }; Body: DecisionBody }>(
    '/api/sessions/:sessionId/proposal/items/:itemId/decision',
    async (request, reply): Promise<SessionView | { error: UserFacingError }> => {
      const session = await container.sessionHistoryStore.get(request.params.sessionId);
      if (!session) return sendError(reply, 404, sessionNotFoundError(request.params.sessionId));

      const proposal = session.pipelineState.stageOutputs.proposal;
      const item = proposal?.items.find((i) => i.id === request.params.itemId);
      if (!proposal || !item) return sendError(reply, 404, itemNotFoundError(request.params.itemId));

      const decision = request.body?.decision;
      if (!decision || !FINAL_DECISIONS.has(decision)) return sendError(reply, 400, invalidDecisionError());
      if (decision === 'edited' && !request.body?.proposedLikeC4Code?.trim()) {
        return sendError(reply, 400, missingEditedCodeError());
      }

      const updatedItem: ProposalItem = {
        ...item,
        decision,
        decisionNote: request.body?.decisionNote?.trim() || undefined,
        proposedLikeC4Code: decision === 'edited' ? request.body!.proposedLikeC4Code!.trim() : item.proposedLikeC4Code,
      };
      const updatedItems = proposal.items.map((i) => (i.id === updatedItem.id ? updatedItem : i));
      const allDecided = updatedItems.every((i) => FINAL_DECISIONS.has(i.decision));

      const updatedSession = {
        ...session,
        pipelineState: {
          ...session.pipelineState,
          stageOutputs: { ...session.pipelineState.stageOutputs, proposal: { ...proposal, items: updatedItems } },
        },
      };
      await container.sessionHistoryStore.update(session.id, updatedSession);

      if (allDecided) {
        const project = await container.projectStore.get(session.projectId);
        // Как и в questions.ts: если настройки проекта с момента запуска сессии сломались, решение
        // всё равно сохранено — сессия останется в paused-for-user, а не потеряет уже принятое решение.
        if (project) {
          const built = await buildOrchestratorPorts(container, project);
          if (built.ok) runSessionInBackground(container, updatedSession, built.ports);
        }
      }

      return toSessionView(await container.sessionHistoryStore.get(session.id).then((s) => s ?? updatedSession));
    },
  );

  app.post<{ Params: { sessionId: string; itemId: string } }>(
    '/api/sessions/:sessionId/proposal/items/:itemId/regenerate',
    async (request, reply): Promise<SessionView | { error: UserFacingError }> => {
      const session = await container.sessionHistoryStore.get(request.params.sessionId);
      if (!session) return sendError(reply, 404, sessionNotFoundError(request.params.sessionId));

      const { stageOutputs } = session.pipelineState;
      const proposal = stageOutputs.proposal;
      const item = proposal?.items.find((i) => i.id === request.params.itemId);
      // Регенерация ищет исходного кандидата по тому же id — при "merge" двух кандидатов в один item
      // (см. LLMProposalGenerator) точечная регенерация неизбежно откатывает его обратно к одиночному
      // кандидату-"первому в группе": честная и осознанная граница простоты, а не забытый случай.
      const candidate = stageOutputs.changeCandidates?.find((c) => c.id === request.params.itemId);
      if (!proposal || !item || !candidate || !stageOutputs.architectureGraph) {
        return sendError(reply, 404, itemNotFoundError(request.params.itemId));
      }

      const project = await container.projectStore.get(session.projectId);
      if (!project) return sendError(reply, 404, sessionNotFoundError(request.params.sessionId));
      const built = await buildOrchestratorPorts(container, project);
      if (!built.ok) return sendError(reply, 400, built.error);

      const rules = (await container.architectureRuleStore.list(session.projectId)) ?? [];
      const [regenerated] = await built.ports.proposalGenerator.generate({
        candidates: [candidate],
        ambiguities: stageOutputs.ambiguities ?? [],
        graph: stageOutputs.architectureGraph,
        rules,
        knowledgeProviders: built.ports.knowledgeProviders,
      });
      if (!regenerated) return sendError(reply, 500, regenerationFailedError());

      // Свежий контент требует свежего решения человека — 'pending', не сохранённое ранее decision.
      const updatedItems = proposal.items.map((i) => (i.id === request.params.itemId ? regenerated : i));
      const updatedSession = {
        ...session,
        pipelineState: {
          ...session.pipelineState,
          stageOutputs: { ...session.pipelineState.stageOutputs, proposal: { ...proposal, items: updatedItems } },
        },
      };
      await container.sessionHistoryStore.update(session.id, updatedSession);

      return toSessionView(updatedSession);
    },
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
