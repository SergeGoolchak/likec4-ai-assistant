export type {
  ProjectRecord,
  LikeC4Diagnostic,
  UserFacingError,
  ArchitectureRule,
  PipelineStageId,
  PipelineStatus,
  UserFacingEvent,
  UserFacingStatus,
  ClarificationQuestion,
  QuestionOption,
  QuestionStatus,
  Proposal,
  ProposalItem,
  ProposalItemType,
  ItemDecisionStatus,
  Explanation,
  SourceReference,
  FileDiff,
  RenderedView,
  ApplyResult,
  Snapshot,
  SessionRecordSummary,
} from '@likec4-ai/core-domain';

export interface ProjectModelSummary {
  elementCount: number;
  relationshipCount: number;
  viewCount: number;
  diagnostics: import('@likec4-ai/core-domain').LikeC4Diagnostic[];
}

export interface ProjectDetailResponse {
  project: import('@likec4-ai/core-domain').ProjectRecord;
  model: ProjectModelSummary | null;
  modelError: import('@likec4-ai/core-domain').UserFacingError | null;
}

export interface ConfluenceSettings {
  baseUrl: string | null;
  configured: boolean;
}

export interface AISettings {
  model: string | null;
  baseUrl: string | null;
  configured: boolean;
}

export interface SessionSummary {
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
  hasBlockingValidationIssues?: boolean;
  diffFileCount?: number;
  previewViewCount?: number;
}

export interface SessionView {
  id: string;
  projectId: string;
  status: import('@likec4-ai/core-domain').PipelineStatus;
  currentStage: import('@likec4-ai/core-domain').PipelineStageId;
  timeline: import('@likec4-ai/core-domain').UserFacingEvent[];
  error?: import('@likec4-ai/core-domain').UserFacingError;
  summary: SessionSummary;
  completedStageIds: import('@likec4-ai/core-domain').PipelineStageId[];
  reviewRevision?: string;
  validation?: {
    technical?: import('@likec4-ai/core-domain').TechnicalValidationResult;
    architectural?: import('@likec4-ai/core-domain').ArchitecturalValidationResult;
  };
  questions: import('@likec4-ai/core-domain').ClarificationQuestion[];
  proposal?: import('@likec4-ai/core-domain').Proposal;
  diff?: import('@likec4-ai/core-domain').FileDiff[];
  previewViews?: import('@likec4-ai/core-domain').RenderedView[];
  applyResult?: import('@likec4-ai/core-domain').ApplyResult;
}

export interface ProjectHistoryResponse {
  sessions: import('@likec4-ai/core-domain').SessionRecordSummary[];
  snapshots: import('@likec4-ai/core-domain').Snapshot[];
}
