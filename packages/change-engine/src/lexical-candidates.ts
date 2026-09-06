import type { ArchitectureElement, ArchitectureGraph, ExtractedRequirement, RequirementCategory } from '@likec4-ai/core-domain';

/**
 * Мягкая подсказка по вероятному kind — не жёсткий фильтр (project-специфичные
 * kind'ы произвольны, см. `specification` в LikeC4), только буст в ранжировании.
 */
const CATEGORY_KIND_HINTS: Partial<Record<RequirementCategory, string[]>> = {
  'new-service': ['service'],
  'modified-service': ['service'],
  'new-database': ['database'],
  'modified-data-entity': ['database', 'service'],
  'new-data-entity': ['database', 'service'],
  'new-queue': ['queue'],
  'new-external-system': ['external-system', 'system'],
  'new-api': ['service'],
  'modified-api': ['service'],
};

/**
 * Первый, дешёвый этап matching (раздел 3.3 плана / риск №1 из explain.md):
 * лексическое пересечение слов title/id с текстом требования + буст по
 * вероятному kind. Не претендует на семантическое понимание — только
 * отсекает заведомо нерелевантные элементы и ранжирует правдоподобных
 * кандидатов, прежде чем тратить вызов LLM на финальное решение.
 */
export function lexicalCandidates(requirement: ExtractedRequirement, graph: ArchitectureGraph, topK = 5): ArchitectureElement[] {
  const requirementWords = new Set(tokenize(`${requirement.summary} ${requirement.rawText}`));
  if (requirementWords.size === 0) return [];

  const hintKinds = CATEGORY_KIND_HINTS[requirement.category] ?? [];

  const scored = [...graph.elements.values()]
    .map((el) => {
      const elementWords = new Set(tokenize(`${el.title} ${el.id} ${el.description ?? ''}`));
      const overlap = jaccard(requirementWords, elementWords);
      return { el, overlap };
    })
    // Буст по kind — только тай-брейкер среди уже текстово пересекающихся кандидатов, а не способ
    // создать кандидата из ничего: элемент нужного kind без единого общего слова с требованием —
    // не кандидат, а простое совпадение категории с половиной элементов графа.
    .filter((s) => s.overlap > 0)
    .map((s) => ({ el: s.el, score: s.overlap + (hintKinds.includes(s.el.kind) ? 0.2 : 0) }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.el);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-zа-яё0-9]+/g) ?? [];
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection++;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}
