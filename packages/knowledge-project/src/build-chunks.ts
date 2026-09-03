import type { ArchitectureElement, ArchitectureGraph, ArchitectureRule } from '@likec4-ai/core-domain';
import type { StoredChunkInput } from '@likec4-ai/persistence';

/** Auto-derived chunk id prefixes — used by ProjectKnowledgeProvider to know what a reindex is allowed to prune. */
export const ELEMENT_CHUNK_PREFIX = 'element:';
export const RULE_CHUNK_PREFIX = 'rule:';

export function buildElementChunks(graph: ArchitectureGraph): Omit<StoredChunkInput, 'embedding'>[] {
  return [...graph.elements.values()].map((element) => ({
    id: `${ELEMENT_CHUNK_PREFIX}${element.id}`,
    source: 'project-kb',
    title: element.title,
    content: elementToText(element),
    tags: [element.kind, ...element.tags],
    metadata: { elementId: element.id, kind: element.kind },
  }));
}

export function buildRuleChunks(rules: ArchitectureRule[]): Omit<StoredChunkInput, 'embedding'>[] {
  return rules.map((rule) => ({
    id: `${RULE_CHUNK_PREFIX}${rule.id}`,
    source: 'project-kb',
    title: rule.title,
    content: ruleToText(rule),
    tags: rule.appliesToKinds,
    metadata: { ruleId: rule.id, severity: rule.severity },
  }));
}

function elementToText(element: ArchitectureElement): string {
  const lines = [`${element.kind} "${element.title}" (id: ${element.id})`];
  if (element.description) lines.push(element.description);
  if (element.technology) lines.push(`Technology: ${element.technology}`);
  if (element.parentId) lines.push(`Parent: ${element.parentId}`);
  return lines.join('\n');
}

function ruleToText(rule: ArchitectureRule): string {
  const lines = [rule.description, `Applies to: ${rule.appliesToKinds.join(', ')}`, `Severity: ${rule.severity}`];
  if (rule.namingConventionPattern) lines.push(`Naming pattern: ${rule.namingConventionPattern}`);
  if (rule.requiredMetadata?.length) lines.push(`Required metadata: ${rule.requiredMetadata.join(', ')}`);
  if (rule.examples?.length) lines.push(`Examples: ${rule.examples.join(', ')}`);
  return lines.join('\n');
}
