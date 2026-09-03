import type { ElementId, RelationshipId, SourceLocation, ViewId } from './common.js';

/**
 * Нормализованное внутреннее представление LikeC4-модели, построенное из
 * разрешённой модели парсера (не копия Langium AST). Оптимизировано под
 * запросы, реально нужные pipeline: matching, retrieval, impact analysis.
 */
export interface ArchitectureGraph {
  elements: Map<ElementId, ArchitectureElement>;
  relationships: Map<RelationshipId, ArchitectureRelationship>;
  views: Map<ViewId, ArchitectureView>;

  byKind: Map<string, ElementId[]>;
  byTag: Map<string, ElementId[]>;
  neighborsIndex: Map<ElementId, { incoming: RelationshipId[]; outgoing: RelationshipId[] }>;
  /** Какой файл редактировать при изменении этого элемента/связи/view — используется diff и repair. */
  sourceFileOf: Map<ElementId | RelationshipId | ViewId, string>;
}

export interface ArchitectureElement {
  id: ElementId;
  kind: string;
  title: string;
  description?: string;
  tags: string[];
  metadata: Record<string, string>;
  parentId?: ElementId;
  technology?: string;
  sourceRef: SourceLocation;
}

export interface ArchitectureRelationship {
  id: RelationshipId;
  sourceId: ElementId;
  targetId: ElementId;
  title?: string;
  technology?: string;
  tags: string[];
  sourceRef: SourceLocation;
}

export type ArchitectureViewKind =
  | 'system-landscape'
  | 'system-context'
  | 'container'
  | 'component'
  | 'dynamic'
  | 'deployment';

export interface ArchitectureView {
  id: ViewId;
  title?: string;
  kind: ArchitectureViewKind;
  includedElementIds: ElementId[];
  sourceRef: SourceLocation;
}
