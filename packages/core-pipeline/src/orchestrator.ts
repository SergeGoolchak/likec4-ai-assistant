import type { SessionHistoryStore, SessionRecord, UserFacingError, UserFacingStatus } from '@likec4-ai/core-domain';
import { loadConfluenceStage } from './stages/load-confluence.js';
import { parseSpecificationStage } from './stages/parse-specification.js';
import { loadLikeC4Stage } from './stages/load-likec4.js';
import { buildArchitectureGraphStage } from './stages/build-architecture-graph.js';
import { extractRequirementsStage } from './stages/extract-requirements.js';
import { entityMatchingStage } from './stages/entity-matching.js';
import { gapAnalysisStage } from './stages/gap-analysis.js';
import { ambiguityDetectionStage } from './stages/ambiguity-detection.js';
import { userClarificationStage } from './stages/user-clarification.js';
import { proposalGenerationStage } from './stages/proposal-generation.js';
import { userReviewStage } from './stages/user-review.js';
import { likec4GenerationStage } from './stages/likec4-generation.js';
import { validationStage } from './stages/validation.js';
import { architectureReviewStage } from './stages/architecture-review.js';
import { repairStage } from './stages/repair.js';
import { computePendingQuestionIds } from './pending-questions.js';
import type { OrchestratorPorts, PipelineStageDef } from './stage.js';

/** Стадии 1-16 плана. Стадия 17 (Diff, Milestone 10) присоединится следующей. */
export const STAGES: PipelineStageDef[] = [
  loadConfluenceStage,
  parseSpecificationStage,
  loadLikeC4Stage,
  buildArchitectureGraphStage,
  extractRequirementsStage,
  entityMatchingStage,
  gapAnalysisStage,
  ambiguityDetectionStage,
  userClarificationStage,
  proposalGenerationStage,
  userReviewStage,
  likec4GenerationStage,
  validationStage,
  architectureReviewStage,
  repairStage,
];

export interface RunOptions {
  session: SessionRecord;
  ports: OrchestratorPorts;
  sessionStore: SessionHistoryStore;
  onStatus?: (status: UserFacingStatus) => void;
}

/**
 * Стейт-машина без отдельного метода `resume()` — `run()` сам определяет,
 * с какой стадии продолжать, по тому, какие `stageOutputs` уже присутствуют
 * в переданном `session.pipelineState` (см. `PipelineStageDef.isDone`).
 * Это значит, что "запустить с нуля" и "продолжить после падения процесса"
 * — один и тот же вызов: свежая сессия просто имеет пустые `stageOutputs`
 * и естественно стартует с первой стадии. Персистентность — после КАЖДОЙ
 * стадии, не только в конце (риск №6 из плана).
 */
export class PipelineOrchestrator {
  async run(options: RunOptions): Promise<SessionRecord> {
    let session = options.session;

    for (const stage of STAGES) {
      if (stage.isDone(session.pipelineState.stageOutputs)) continue;

      if (stage.isGate) {
        // Гейт ещё не готов пропустить дальше (isDone === false) — не ошибка,
        // просто ждём внешнего события (ответ на вопрос и т.п.). Останавливаемся
        // здесь же, не вызывая run(): следующий вызов run() (после того как
        // событие произойдёт) снова дойдёт до этой стадии и увидит isDone === true.
        session = pause(session, stage);
        await options.sessionStore.update(session.id, session);
        return session;
      }

      const startedAt = Date.now();
      options.onStatus?.({ stage: stage.id, label: stage.label, at: new Date().toISOString() });

      try {
        const partialOutputs = await stage.run(session.pipelineState, { session, ports: options.ports });
        session = advance(session, stage, partialOutputs);
        await options.sessionStore.update(session.id, session);
      } catch (err) {
        session = fail(session, stage, err, Date.now() - startedAt);
        await options.sessionStore.update(session.id, session);
        throw err;
      }
    }

    // Дошли до конца STAGES, ни разу не остановившись на гейте — либо последняя
    // стадия выполнилась только что (advance() уже поставил 'completed' через
    // isLastStage), либо она была уже done ДО цикла (например гейт, у которого
    // isDone стал true между вызовами run()) — тогда advance() для неё не звался
    // вовсе, и статус нужно закрыть здесь.
    if (session.pipelineState.status !== 'completed') {
      session = { ...session, pipelineState: { ...session.pipelineState, status: 'completed' } };
      await options.sessionStore.update(session.id, session);
    }

    return session;
  }
}

function advance(session: SessionRecord, stage: PipelineStageDef, partialOutputs: Awaited<ReturnType<PipelineStageDef['run']>>): SessionRecord {
  const isLastStage = STAGES[STAGES.length - 1]?.id === stage.id;
  const at = new Date().toISOString();

  // `confluencePageVersion` живёт на самом SessionRecord (не в stageOutputs) —
  // это метаданные сессии, а не вывод стадии сам по себе, но узнаём мы его
  // только после того как load-confluence реально сходит за страницей.
  const confluencePageVersion = partialOutputs.confluenceContent?.version ?? session.confluencePageVersion;
  const stageOutputs = { ...session.pipelineState.stageOutputs, ...partialOutputs };

  return {
    ...session,
    confluencePageVersion,
    // Зеркала для удобного доступа без похода в pipelineState.stageOutputs (History и т.п.) —
    // единственный источник истины всё равно stageOutputs; синхронизируются здесь же, в одном
    // месте, а не мутируются отдельно в каждом роуте, который меняет ambiguities/proposal.
    questions: stageOutputs.ambiguities ?? session.questions,
    proposalId: stageOutputs.proposal?.id ?? session.proposalId,
    pipelineState: {
      ...session.pipelineState,
      currentStage: stage.id,
      status: isLastStage ? 'completed' : 'running',
      stageOutputs,
    },
    userFacingTimeline: [...session.userFacingTimeline, { at, message: stage.label }],
  };
}

function pause(session: SessionRecord, stage: PipelineStageDef): SessionRecord {
  const at = new Date().toISOString();
  const ambiguities = session.pipelineState.stageOutputs.ambiguities ?? [];
  return {
    ...session,
    pipelineState: {
      ...session.pipelineState,
      currentStage: stage.id,
      status: 'paused-for-user',
      // Пересчитано из ambiguities, а не оставлено как было — см. computePendingQuestionIds.
      pendingQuestionIds: computePendingQuestionIds(ambiguities),
    },
    userFacingTimeline: [...session.userFacingTimeline, { at, message: stage.label }],
  };
}

function fail(session: SessionRecord, stage: PipelineStageDef, err: unknown, durationMs: number): SessionRecord {
  const at = new Date().toISOString();
  const message = err instanceof Error ? err.message : String(err);
  const error: UserFacingError = {
    id: `pipeline.${stage.id}.failed`,
    title: `Не удалось выполнить шаг "${stage.label}"`,
    likelyCause: message,
    suggestedAction: 'Проверьте настройки подключения и повторите попытку. Прогресс до этого шага сохранён.',
    retryable: true,
  };

  return {
    ...session,
    pipelineState: { ...session.pipelineState, status: 'failed', error },
    technicalLog: [...session.technicalLog, { at, stage: stage.id, durationMs, result: 'error', message }],
  };
}
