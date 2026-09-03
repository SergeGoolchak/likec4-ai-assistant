/** 19 стадий pipeline в порядке выполнения. См. раздел плана "AI Pipeline". */
export type PipelineStageId =
  | 'load-confluence'
  | 'parse-specification'
  | 'load-likec4'
  | 'parse-likec4'
  | 'build-architecture-graph'
  | 'extract-requirements'
  | 'entity-matching'
  | 'gap-analysis'
  | 'ambiguity-detection'
  | 'user-clarification'
  | 'proposal-generation'
  | 'user-review'
  | 'likec4-generation'
  | 'validation'
  | 'architecture-review'
  | 'repair'
  | 'diff'
  | 'preview'
  | 'apply';

export type PipelineStatus = 'running' | 'paused-for-user' | 'completed' | 'failed' | 'aborted';

/** Транслируется в UI через SSE, чтобы пользователь всегда знал, что сейчас делает AI. */
export interface UserFacingStatus {
  stage: PipelineStageId;
  label: string;
  at: string;
}
