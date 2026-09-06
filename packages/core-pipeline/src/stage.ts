import type {
  ArchitectureRuleStore,
  ChangeEngine,
  ConfluenceAdapter,
  KnowledgeProvider,
  LikeC4Parser,
  LLMProvider,
  PipelineState,
  PipelineStageId,
  RepositoryAdapter,
  SessionRecord,
} from '@likec4-ai/core-domain';

/** Порты, нужные стадиям 1-10 (Milestone 7 переиспользует `changeEngine`, новых портов не добавляет). Стадии 11+ добавят свои по мере реализации в следующих milestones. */
export interface OrchestratorPorts {
  confluenceAdapter: ConfluenceAdapter;
  repositoryAdapter: RepositoryAdapter;
  likec4Parser: LikeC4Parser;
  /** LLM-зависимые стадии 6-8 (Milestone 6) не работают без него — опционален, чтобы стадии 1-5 оставались тестируемы без AI provider вообще. */
  llmProvider?: LLMProvider;
  changeEngine?: ChangeEngine;
  architectureRuleStore?: ArchitectureRuleStore;
  /** Global + Project Knowledge Base — участвуют в стадии 6 как дополнительный контекст, не блокируют pipeline при отсутствии. */
  knowledgeProviders?: KnowledgeProvider[];
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
  /**
   * Стадии-гейты (10. User Clarification, позже — 12. User Review) ждут внешнего
   * события (ответ пользователя), а не что-то вычисляют. Когда `isDone` ещё
   * false, оркестратор не вызывает `run()` для такой стадии — вместо этого
   * останавливается с `status: 'paused-for-user'` (см. orchestrator.ts). `run()`
   * у гейта поэтому никогда фактически не исполняется, но остаётся в интерфейсе
   * ради простоты — не заводим отдельный union-тип ради одного поля.
   */
  isGate?: boolean;
}
