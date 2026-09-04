import type { ConfluenceAdapter, LikeC4Parser, PipelineState, PipelineStageId, RepositoryAdapter, SessionRecord } from '@likec4-ai/core-domain';

/** Порты, которые нужны стадиям 1-5. Стадии 6+ (LLM-зависимые) добавят LLMProvider/KnowledgeProvider в Milestone 6. */
export interface OrchestratorPorts {
  confluenceAdapter: ConfluenceAdapter;
  repositoryAdapter: RepositoryAdapter;
  likec4Parser: LikeC4Parser;
}

export interface StageContext {
  session: SessionRecord;
  ports: OrchestratorPorts;
}

export interface PipelineStageDef {
  id: PipelineStageId;
  /** Показывается пользователю как есть в статусах SSE/экране Analysis — см. плановую таблицу стадий. */
  label: string;
  /**
   * Определяет, уже выполнена ли эта стадия для данного состояния — по
   * наличию её собственного вывода в `stageOutputs`, а не по индексу. Это
   * то, что делает `PipelineOrchestrator.run()` естественно возобновляемым:
   * не нужен отдельный номер стадии или флаг "с чего начинать", достаточно
   * посмотреть, что уже посчитано.
   */
  isDone(stageOutputs: PipelineState['stageOutputs']): boolean;
  run(state: PipelineState, ctx: StageContext): Promise<Partial<PipelineState['stageOutputs']>>;
}
