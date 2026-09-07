import type { ArchitectureGraph } from '../models/architecture-graph.js';
import type { ProposalItem } from '../models/proposal.js';
import type { ArchitecturalValidationResult, ArchitectureRule } from '../models/validation.js';

export interface ArchitecturalReviewInput {
  items: ProposalItem[];
  /** Граф, построенный из гипотетического слитого состояния (см. `generatedFiles`, стадия 13) — не исходный. */
  newGraph: ArchitectureGraph;
  /** Граф ДО изменений — нужен для проверки "не дублирует ли новый элемент уже существующий" (ФТ7). */
  existingGraph: ArchitectureGraph;
  rules: ArchitectureRule[];
  /**
   * Путь к файлу -> id item'ов, чей контент туда попал (см. `assembleGeneratedFiles`,
   * стадия 13). Нужен, чтобы найти элементы НОВОГО item в `newGraph` — у item'ов без
   * `targetElementId` нет собственного id элемента, только файл, куда его поместила сборка.
   */
  itemsByFile: Map<string, string[]>;
}

/**
 * Level 2 валидации (раздел плана "Валидация и repair"): детерминированные
 * архитектурные проверки — обязательные metadata, naming conventions,
 * дубликаты по лексическому пересечению с уже существующими элементами.
 * LLM-assisted проверки на смысловые вещи в MVP этого порта сознательно не
 * реализованы — см. explain.md, Milestone 9.
 */
export interface ArchitecturalReviewer {
  review(input: ArchitecturalReviewInput): Promise<ArchitecturalValidationResult>;
}
