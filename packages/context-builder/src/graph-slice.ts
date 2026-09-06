import type { ArchitectureElement, ArchitectureGraph, ArchitectureRelationship, ElementId } from '@likec4-ai/core-domain';

/**
 * BFS от seed-элементов на глубину `depth` по связям + подъём по цепочке
 * родителей — реализация retrieval-стратегии из плана (раздел 3.3): LLM
 * никогда не получает весь граф, только окрестность интересующих элементов.
 * Порядок обхода детерминирован (итерация по `Map` идёт в порядке вставки),
 * что важно для воспроизводимости тестов и для того, чтобы urgent-элементы
 * (ближе к seed) оказывались раньше при последующей обрезке по бюджету.
 */
export function sliceGraph(graph: ArchitectureGraph, seeds: ElementId[], depth = 2): ElementId[] {
  const visited = new Set<ElementId>(seeds.filter((id) => graph.elements.has(id)));
  let frontier = [...visited];

  for (let step = 0; step < depth; step++) {
    const next: ElementId[] = [];
    for (const id of frontier) {
      const neighbors = graph.neighborsIndex.get(id);
      if (!neighbors) continue;
      for (const relId of [...neighbors.outgoing, ...neighbors.incoming]) {
        const rel = graph.relationships.get(relId);
        if (!rel) continue;
        for (const candidateId of [rel.sourceId, rel.targetId]) {
          if (!visited.has(candidateId) && graph.elements.has(candidateId)) {
            visited.add(candidateId);
            next.push(candidateId);
          }
        }
      }
    }
    frontier = next;
  }

  // Родительская иерархия: architectural context обычно нужен как "сосед + место в дереве", а не только сосед.
  for (const id of [...visited]) {
    let current = graph.elements.get(id);
    while (current?.parentId && !visited.has(current.parentId)) {
      visited.add(current.parentId);
      current = graph.elements.get(current.parentId);
    }
  }

  return [...visited];
}

export function relationshipsAmong(graph: ArchitectureGraph, elementIds: ReadonlySet<ElementId>): ArchitectureRelationship[] {
  const result: ArchitectureRelationship[] = [];
  for (const rel of graph.relationships.values()) {
    if (elementIds.has(rel.sourceId) && elementIds.has(rel.targetId)) result.push(rel);
  }
  return result;
}

export function renderElementForContext(element: ArchitectureElement): string {
  const lines = [`${element.kind} "${element.title}" (id: ${element.id})`];
  if (element.description) lines.push(element.description);
  if (element.technology) lines.push(`Technology: ${element.technology}`);
  return lines.join('\n');
}

export function renderRelationshipForContext(relationship: ArchitectureRelationship, graph: ArchitectureGraph): string {
  const sourceTitle = graph.elements.get(relationship.sourceId)?.title ?? relationship.sourceId;
  const targetTitle = graph.elements.get(relationship.targetId)?.title ?? relationship.targetId;
  return `${sourceTitle} -> ${targetTitle}${relationship.title ? `: ${relationship.title}` : ''}`;
}
