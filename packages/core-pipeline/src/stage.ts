import type {
  ArchitecturalReviewer,
  ArchitectureRuleStore,
  ChangeEngine,
  ConfluenceAdapter,
  KnowledgeProvider,
  LikeC4Parser,
  LikeC4Validator,
  LLMProvider,
  PipelineState,
  PipelineStageId,
  ProposalGenerator,
  RepositoryAdapter,
  SessionRecord,
} from '@likec4-ai/core-domain';

/** Порты, нужные стадиям 1-16 (Milestone 9 добавляет `likec4Validator`/`architecturalReviewer`; `proposalGenerator` из Milestone 8 переиспользуется стадией 16 для repair). Стадии 17+ добавят свои по мере реализации в следующих milestones. */
export interface OrchestratorPorts {
  confluenceAdapter: ConfluenceAdapter;
  repositoryAdapter: RepositoryAdapter;
  likec4Parser: LikeC4Parser;
  /** LLM-зависимые стадии 6-8 (Milestone 6) не работают без него — опционален, чтобы стадии 1-5 оставались тестируемы без AI provider вообще. */
  llmProvider?: LLMProvider;
  changeEngine?: ChangeEngine;
  /** Стадия 11 (Milestone 8) и стадия 16 (Repair, Milestone 9) — опционален по той же причине, что и changeEngine. */
  proposalGenerator?: ProposalGenerator;
  /** Стадия 14 (Milestone 9). Уже существовал как порт с Milestone 1 (`renderViewsPreview`), просто не был частью OrchestratorPorts, пока не появился реальный потребитель-стадия. */
  likec4Validator?: LikeC4Validator;
  /** Стадия 15 (Milestone 9). */
  architecturalReviewer?: ArchitecturalReviewer;
  architectureRuleStore?: ArchitectureRuleStore;
  /** Global + Project Knowledge Base — участвуют в стадиях 6 и 11 как дополнительный контекст, не блокируют pipeline при отсутствии. */
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
   * Стадии-гейты (10. User Clarification, 12. User Review) ждут внешнего
   * события (ответ пользователя), а не что-то вычисляют. Когда `isDone` ещё
   * false, оркестратор не вызывает `run()` для такой стадии — вместо этого
   * останавливается с `status: 'paused-for-user'` (см. orchestrator.ts). `run()`
   * у гейта поэтому никогда фактически не исполняется, но остаётся в интерфейсе
   * ради простоты — не заводим отдельный union-тип ради одного поля.
   */
  isGate?: boolean;
}
