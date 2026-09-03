import { relative } from 'node:path';
import type {
  ArchitectureElement,
  ArchitectureGraph,
  ArchitectureRelationship,
  ArchitectureView,
  ArchitectureViewKind,
  ElementId,
  RelationshipId,
  SourceLocation,
  ViewId,
} from '@likec4-ai/core-domain';
import type { LikeC4 } from 'likec4';
import { getModelLocator } from './model-locator.js';

const FALLBACK_SOURCE_REF: SourceLocation = { file: '', startLine: 0, endLine: 0 };

/**
 * Builds our normalized ArchitectureGraph from a parsed+computed `likec4`
 * instance. Combines three of its APIs: `parsedModel()` for elements and
 * relationships (kind/title/tags/metadata), `computedModel()` for views
 * (predicates resolved into concrete included elements), and
 * `LikeC4ModelLocator` for exact file+line (see model-locator.ts).
 */
export async function buildArchitectureGraph(instance: LikeC4, workspacePath: string): Promise<ArchitectureGraph> {
  const locator = getModelLocator(instance);
  const parsed = await instance.parsedModel();
  const computed = await instance.computedModel();

  const elements = new Map<ElementId, ArchitectureElement>();
  const relationships = new Map<RelationshipId, ArchitectureRelationship>();
  const views = new Map<ViewId, ArchitectureView>();
  const byKind = new Map<string, ElementId[]>();
  const byTag = new Map<string, ElementId[]>();
  const neighborsIndex = new Map<ElementId, { incoming: RelationshipId[]; outgoing: RelationshipId[] }>();
  const sourceFileOf = new Map<ElementId | RelationshipId | ViewId, string>();

  for (const el of parsed.elements()) {
    const id: ElementId = el.id;
    const sourceRef = toSourceLocation(locator.locateElement(id), workspacePath);
    elements.set(id, {
      id,
      kind: el.kind,
      title: el.title,
      description: el.description?.nonEmpty ? el.description.text : undefined,
      tags: [...el.tags],
      metadata: normalizeMetadata(el.metadata),
      parentId: el.parent?.id,
      technology: el.technology ?? undefined,
      sourceRef,
    });

    addToIndex(byKind, el.kind, id);
    for (const tag of el.tags) addToIndex(byTag, tag, id);
    neighborsIndex.set(id, { incoming: [], outgoing: [] });
    if (sourceRef.file) sourceFileOf.set(id, sourceRef.file);
  }

  for (const rel of parsed.relationships()) {
    const id: RelationshipId = rel.id;
    const sourceRef = toSourceLocation(locator.locateRelation(id), workspacePath);
    relationships.set(id, {
      id,
      sourceId: rel.source.id,
      targetId: rel.target.id,
      title: rel.title ?? undefined,
      technology: rel.technology ?? undefined,
      tags: [...rel.tags],
      sourceRef,
    });

    neighborsIndex.get(rel.source.id)?.outgoing.push(id);
    neighborsIndex.get(rel.target.id)?.incoming.push(id);
    if (sourceRef.file) sourceFileOf.set(id, sourceRef.file);
  }

  for (const view of computed.views()) {
    const id: ViewId = view.id;
    const sourceRef = toSourceLocation(locator.locateView(id), workspacePath);
    views.set(id, {
      id,
      title: view.title ?? undefined,
      kind: toViewKind(view),
      includedElementIds: [...view.elements()].map((e) => e.id),
      sourceRef,
    });
    if (sourceRef.file) sourceFileOf.set(id, sourceRef.file);
  }

  return { elements, relationships, views, byKind, byTag, neighborsIndex, sourceFileOf };
}

function addToIndex(index: Map<string, ElementId[]>, key: string, id: ElementId): void {
  const bucket = index.get(key);
  if (bucket) bucket.push(id);
  else index.set(key, [id]);
}

interface LocatorLocation {
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

function toSourceLocation(location: LocatorLocation | null, workspacePath: string): SourceLocation {
  if (!location) return FALLBACK_SOURCE_REF;
  const uri = String(location.uri);
  const fsPath = uri.startsWith('file://') ? new URL(uri).pathname : uri;
  return {
    file: relative(workspacePath, fsPath),
    startLine: location.range.start.line,
    endLine: location.range.end.line,
  };
}

/** MetadataValue can be a markdown/string or an array; our domain model wants Record<string, string>. */
function normalizeMetadata(metadata: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    result[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return result;
}

interface ComputedViewLike {
  isElementView?: () => boolean;
  isDynamicView?: () => boolean;
  isDeploymentView?: () => boolean;
}

function toViewKind(view: ComputedViewLike): ArchitectureViewKind {
  if (view.isDynamicView?.()) return 'dynamic';
  if (view.isDeploymentView?.()) return 'deployment';
  return 'element';
}
