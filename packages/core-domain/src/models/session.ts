import type { UserFacingError } from './common.js';
import type { ConfluencePageRef, ConfluencePageContent } from './confluence.js';
import type { RepositoryFile } from './common.js';
import type { ArchitectureGraph } from './architecture-graph.js';
import type {
  ParsedSpecification,
  ExtractedRequirement,
  EntityMatchResult,
  ArchitectureChangeCandidate,
} from './requirements.js';
import type { ClarificationQuestion } from './question.js';
import type { Proposal } from './proposal.js';
import type {
  TechnicalValidationResult,
  ArchitecturalValidationResult,
  RepairAttemptLog,
  RenderedView,
} from './validation.js';
import type { FileDiff } from './diff.js';
import type { PipelineStageId, PipelineStatus } from './pipeline.js';

/**
 * Полное промежуточное состояние одного прогона pipeline. Сохраняется после
 * *каждой* стадии (не только в конце), чтобы убитый/перезапущенный сервер мог
 * продолжить сессию, а не терять прогресс — см. раздел плана "AI Pipeline" и
 * риск №6.
 *
 * ВАЖНО: `architectureGraph` содержит инстансы Map, которые JSON.stringify не
 * сериализует. Реализации SessionHistoryStore отвечают за шаг маршалинга
 * Map<->массив на границе персистентности; этот адаптер живёт вместе со
 * store, а не здесь (отложено до Milestone 5).
 */
export interface PipelineState {
  currentStage: PipelineStageId;
  status: PipelineStatus;
  stageOutputs: Partial<{
    confluenceContent: ConfluencePageContent;
    specification: ParsedSpecification;
    existingFiles: RepositoryFile[];
    architectureGraph: ArchitectureGraph;
    extractedRequirements: ExtractedRequirement[];
    entityMatches: EntityMatchResult[];
    changeCandidates: ArchitectureChangeCandidate[];
    ambiguities: ClarificationQuestion[];
    proposal: Proposal;
    generatedFiles: RepositoryFile[];
    validationResult: { technical: TechnicalValidationResult; architectural: ArchitecturalValidationResult };
    repairAttempts: RepairAttemptLog[];
    diff: FileDiff[];
    previewViews: RenderedView[];
  }>;
  /** Непустой массив => UI обязан показать экран Questions, прежде чем pipeline сможет продолжиться. */
  pendingQuestionIds: string[];
  error?: UserFacingError;
}

export interface ValidationRunLog {
  at: string;
  technical: TechnicalValidationResult;
  architectural: ArchitecturalValidationResult;
}

/** Внутренний технический лог — отдельно от user-facing timeline; никогда не содержит секретов. */
export interface TechnicalLogEntry {
  at: string;
  stage: PipelineStageId;
  durationMs: number;
  result: 'ok' | 'error';
  message?: string;
}

/** История на понятном языке, показываемая пользователю — без stack trace и внутреннего жаргона. */
export interface UserFacingEvent {
  at: string;
  message: string;
}

export interface ApplyResult {
  appliedAt: string;
  snapshotId: string;
  appliedItemIds: string[];
  rejectedItemIds: string[];
  filesChanged: string[];
  rollbackAvailable: boolean;
}

export interface SessionRecord {
  id: string;
  projectId: string;
  createdAt: string;
  createdByUserEmail: string;
  confluenceRef: ConfluencePageRef;
  confluencePageVersion: number;
  /** Commit/branch (Bitbucket) или snapshotId (local), с которых началась сессия. */
  repositorySnapshotRef: string;
  llmProviderId: string;
  llmModel: string;
  pipelineState: PipelineState;
  proposalId?: string;
  questions: ClarificationQuestion[];
  validationHistory: ValidationRunLog[];
  applyResult?: ApplyResult;
  technicalLog: TechnicalLogEntry[];
  userFacingTimeline: UserFacingEvent[];
}

/** Облегчённая проекция для списков в экранах History. */
export interface SessionRecordSummary {
  id: string;
  projectId: string;
  createdAt: string;
  status: PipelineStatus;
  confluencePageTitle?: string;
}
