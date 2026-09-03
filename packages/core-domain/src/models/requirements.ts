import type { ElementId } from './common.js';
import type { ConfluencePageContent } from './confluence.js';
import type { ProposalItemType, SourceReference, ConflictNote } from './proposal.js';

export interface SpecificationChunk {
  id: string;
  /** Ссылки на ConfluenceSection.id, из которых нормализован этот chunk. */
  sectionIds: string[];
  text: string;
}

/** Результат стадии 2 (Parse Specification). */
export interface ParsedSpecification {
  source: ConfluencePageContent;
  chunks: SpecificationChunk[];
}

/** Категории, к которым может относиться извлечённое требование — см. ФТ8. */
export type RequirementCategory =
  | 'new-service'
  | 'modified-service'
  | 'new-integration'
  | 'modified-integration'
  | 'new-api'
  | 'modified-api'
  | 'new-data-entity'
  | 'modified-data-entity'
  | 'new-algorithm'
  | 'modified-sequence'
  | 'new-queue'
  | 'new-database'
  | 'new-external-system'
  | 'new-event'
  | 'data-ownership-change';

/** Результат стадии 6 (Extract Requirements). */
export interface ExtractedRequirement {
  id: string;
  summary: string;
  category: RequirementCategory;
  sourceSections: SourceReference[];
  rawText: string;
}

/** Результат стадии 7 (Entity Matching). Совпадение не найдено => matchedElementId отсутствует. */
export interface EntityMatchResult {
  requirementId: string;
  matchedElementId?: ElementId;
  /** 0..1 — ниже настроенного порога это обязано стать ClarificationQuestion, а не тихой догадкой. */
  confidence: number;
  rationale: string;
}

/** Результат стадии 8 (Gap Analysis) — основа, из которой генерируется ProposalItem. */
export interface ArchitectureChangeCandidate {
  id: string;
  type: ProposalItemType;
  requirementIds: string[];
  matchedElementId?: ElementId;
  description: string;
  sources: SourceReference[];
  needsClarification: boolean;
}

export interface ConflictResolution {
  candidateId: string;
  /** true, если разрешено автоматически через SOURCE_PRIORITY (механический конфликт). */
  resolved: boolean;
  resolutionNote?: string;
  /** Заполняется, когда конфликт семантический и должен быть вынесен в ClarificationQuestion. */
  remainingConflict?: ConflictNote;
}
