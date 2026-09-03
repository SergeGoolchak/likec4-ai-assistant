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

/**
 * Отражает реальную таксономию видов LikeC4 (подтверждено spike'ом в
 * Milestone 1 через likec4.isElementView()/isDynamicView()/isDeploymentView()),
 * а не C4/Structurizr-номенклатуру (system-context/container/component),
 * которую предполагал изначальный план — у LikeC4 нет встроенного деления
 * element view на такие уровни, это дело соглашений конкретного проекта
 * (Architecture Rules), а не типа view.
 */
export type ArchitectureViewKind = 'element' | 'dynamic' | 'deployment';

export interface ArchitectureView {
  id: ViewId;
  title?: string;
  kind: ArchitectureViewKind;
  includedElementIds: ElementId[];
  sourceRef: SourceLocation;
}
