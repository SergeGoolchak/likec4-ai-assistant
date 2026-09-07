import type {
  ArchitecturalFinding,
  ArchitecturalReviewInput,
  ArchitecturalReviewer,
  ArchitecturalValidationResult,
  ArchitectureElement,
  ArchitectureGraph,
  ArchitectureRule,
  ProposalItem,
} from '@likec4-ai/core-domain';

const DUPLICATE_LEXICAL_THRESHOLD = 0.5;

/**
 * Level 2 валидации (стадия 15, Milestone 9) — только детерминированные
 * проверки: обязательные metadata, naming conventions, лексические дубликаты
 * с уже существующими элементами. LLM-assisted проверки "на смысловые вещи"
 * из плана сознательно не реализованы в этом пакете — см. explain.md.
 */
export class RuleBasedArchitecturalReviewer implements ArchitecturalReviewer {
  async review(input: ArchitecturalReviewInput): Promise<ArchitecturalValidationResult> {
    const findings: ArchitecturalFinding[] = [];

    for (const item of input.items) {
      const elements = ownedElements(item, input.newGraph, input.itemsByFile);

      for (const element of elements) {
        findings.push(...checkMetadataAndNaming(element, item, input.rules));
      }

      // Дубликаты проверяем только для по-настоящему новых элементов — у modified-*
      // targetElementId уже указывает на существующий элемент осознанно, это не дубликат.
      if (!item.targetElementId) {
        for (const element of elements) {
          const duplicate = findLikelyDuplicate(element, input.existingGraph);
          if (duplicate) {
            findings.push({
              ruleId: 'duplicate-detection',
              severity: 'should',
              message: `"${element.title}" текстуально похож на уже существующий элемент "${duplicate.title}" (${duplicate.id}) — возможно, стоит изменить его вместо создания нового.`,
              affectedItemId: item.id,
              autoFixable: false,
            });
          }
        }
      }
    }

    return { ok: !findings.some((f) => f.severity === 'must'), findings };
  }
}

function ownedElements(item: ProposalItem, graph: ArchitectureGraph, itemsByFile: Map<string, string[]>): ArchitectureElement[] {
  if (item.targetElementId) {
    const element = graph.elements.get(item.targetElementId);
    return element ? [element] : [];
  }

  const ownedFiles = new Set([...itemsByFile.entries()].filter(([, itemIds]) => itemIds.includes(item.id)).map(([file]) => file));
  if (ownedFiles.size === 0) return [];

  return [...graph.elements.values()].filter((element) => ownedFiles.has(graph.sourceFileOf.get(element.id) ?? ''));
}

function checkMetadataAndNaming(element: ArchitectureElement, item: ProposalItem, rules: ArchitectureRule[]): ArchitecturalFinding[] {
  const findings: ArchitecturalFinding[] = [];

  for (const rule of rules.filter((r) => r.appliesToKinds.includes(element.kind))) {
    for (const key of rule.requiredMetadata ?? []) {
      if (!(key in element.metadata)) {
        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: `Элемент "${element.id}" (${element.kind}) не имеет обязательного metadata-поля "${key}" (правило "${rule.title}").`,
          affectedItemId: item.id,
          autoFixable: false,
        });
      }
    }

    if (rule.namingConventionPattern && !matchesNamingConvention(element.id, rule.namingConventionPattern)) {
      findings.push({
        ruleId: rule.id,
        severity: rule.severity,
        message: `Идентификатор "${element.id}" не соответствует конвенции именования правила "${rule.title}" (/${rule.namingConventionPattern}/).`,
        affectedItemId: item.id,
        autoFixable: false,
      });
    }
  }

  return findings;
}

function matchesNamingConvention(id: string, pattern: string): boolean {
  try {
    return new RegExp(pattern).test(id);
  } catch {
    // Некорректный regex в самом правиле — не валим весь review из-за опечатки в настройках проекта.
    return true;
  }
}

function findLikelyDuplicate(element: ArchitectureElement, existingGraph: ArchitectureGraph): ArchitectureElement | undefined {
  const words = tokenize(`${element.title} ${element.id} ${element.description ?? ''}`);
  if (words.size === 0) return undefined;

  let best: { element: ArchitectureElement; score: number } | undefined;
  for (const candidate of existingGraph.elements.values()) {
    const candidateWords = tokenize(`${candidate.title} ${candidate.id} ${candidate.description ?? ''}`);
    const score = jaccard(words, candidateWords);
    if (score >= DUPLICATE_LEXICAL_THRESHOLD && (!best || score > best.score)) best = { element: candidate, score };
  }
  return best?.element;
}

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-zа-яё0-9]+/g) ?? []);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection++;
  return intersection / new Set([...a, ...b]).size;
}
