export type { ProjectRecord, LikeC4Diagnostic, UserFacingError } from '@likec4-ai/core-domain';

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
