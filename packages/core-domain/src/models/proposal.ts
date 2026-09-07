import type { ElementId } from './common.js';
import type { ArchitecturalValidationResult, TechnicalValidationResult } from './validation.js';

export type SourceKind =
  | 'existing-likec4-element'
  | 'architecture-rules'
  | 'project-knowledge-base'
  | 'confluence-section'
  | 'user-answer'
  | 'likec4-knowledge-base'
  | 'ai-general-knowledge';

/**
 * Порядок приоритета, который использует ChangeEngine.resolveConflicts, когда
 * два источника расходятся. Кодирует принцип №6 из плана ("правила проекта
 * важнее общих знаний AI") и раздел 12 ТЗ. Это дефолт для прозрачного
 * разрешения *механических* конфликтов — семантически неоднозначные конфликты
 * всё равно обязаны пройти через ClarificationQuestion и никогда не
 * разрешаются скрыто только потому, что один источник формально выше по
 * приоритету (ФТ14 / "никаких скрытых допущений").
 */
export const SOURCE_PRIORITY: readonly SourceKind[] = [
  'existing-likec4-element',
  'architecture-rules',
  'project-knowledge-base',
  'confluence-section',
  'user-answer',
  'likec4-knowledge-base',
  'ai-general-knowledge',
];

export interface SourceReference {
  kind: SourceKind;
  /** Например, ConfluenceSection.id, ElementId, id правила или id вопроса. */
  refId: string;
  label: string;
  url?: string;
  excerpt?: string;
}

export type ProposalItemType =
  | 'new-element'
  | 'modified-element'
  | 'new-relationship'
  | 'modified-relationship'
  | 'api-definition'
  | 'data-model'
  | 'sequence-diagram'
  | 'view'
  | 'risk'
  | 'assumption'
  | 'no-change';

export type ItemDecisionStatus = 'pending' | 'approved' | 'rejected' | 'edited' | 'regenerate-requested';

export interface ConflictNote {
  description: string;
  conflictingSources: SourceReference[];
  resolutionSuggestion?: string;
  requiresUserDecision: boolean;
}

/**
 * Контракт объяснимости (ФТ13 / раздел 13): каждый item обязан уметь
 * ответить на what/why/source/impact/confidence/assumptions без того, чтобы
 * пользователь читал код или промпты.
 */
export interface Explanation {
  what: string;
  why: string;
  impact: string;
  /** 0..1 */
  confidence: number;
  assumptions: string[];
}

export interface ProposalItem {
  id: string;
  type: ProposalItemType;
  title: string;
  /** Заполняется, когда type — modified-*, указывает на изменяемый существующий элемент. */
  targetElementId?: ElementId;
  /** Предполагаемый фрагмент LikeC4, показываемый в Change Details; перегенерируется стадией 13, не финален до Apply. */
  proposedLikeC4Code?: string;
  explanation: Explanation;
  /** Непустой массив: ни один proposal item не может существовать без прослеживаемого источника. */
  sources: SourceReference[];
  conflicts?: ConflictNote[];
  decision: ItemDecisionStatus;
  decisionNote?: string;
  validation?: {
    technical?: TechnicalValidationResult;
    architectural?: ArchitecturalValidationResult;
  };
}

export type ProposalStatus = 'draft' | 'under-review' | 'ready-to-apply' | 'applied' | 'discarded';

export interface Proposal {
  id: string;
  sessionId: string;
  createdAt: string;
  items: ProposalItem[];
  status: ProposalStatus;
  /** Explicit user confirmation of the complete set of decisions. */
  reviewConfirmedAt?: string;
}
