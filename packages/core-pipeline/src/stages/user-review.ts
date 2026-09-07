import type { PipelineStageDef } from '../stage.js';

/**
 * Стадия 12 — гейт, как и user-clarification (10): готова пропустить дальше,
 * только когда КАЖДЫЙ item получил финальное человеческое решение
 * (approved/rejected/edited) и пользователь явно подтвердил весь набор. 'pending' блокирует (item ещё не рассмотрен),
 * 'regenerate-requested' тоже блокирует лишь номинально — на практике роут
 * регенерации сразу же заменяет item и возвращает его в 'pending', так что
 * отдельно этот статус долго не живёт (см. apps/server/src/routes/proposals.ts).
 */
export const userReviewStage: PipelineStageDef = {
  id: 'user-review',
  label: 'Проверка предложений пользователем',
  isDone: (outputs) => {
    const proposal = outputs.proposal;
    if (!proposal) return false;
    // Older sessions already beyond generation remain resumable after this update.
    if (outputs.generatedFiles !== undefined) return true;
    if (proposal.items.length === 0) return true;
    return Boolean(proposal.reviewConfirmedAt) && proposal.items.every((item) =>
      item.decision === 'approved' || item.decision === 'rejected' || item.decision === 'edited');
  },
  isGate: true,
  async run() {
    // Никогда фактически не вызывается — см. PipelineStageDef.isGate и user-clarification.ts.
    return {};
  },
};
