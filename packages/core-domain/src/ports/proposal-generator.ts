import type { ArchitectureGraph } from '../models/architecture-graph.js';
import type { ArchitectureChangeCandidate } from '../models/requirements.js';
import type { ClarificationQuestion } from '../models/question.js';
import type { ProposalItem } from '../models/proposal.js';
import type { ArchitecturalFinding, ArchitectureRule, LikeC4Diagnostic } from '../models/validation.js';
import type { KnowledgeProvider } from './knowledge-provider.js';

export interface ProposalGenerationInput {
  candidates: ArchitectureChangeCandidate[];
  /** Уже отвеченные (или отложенные/"не знаю") вопросы стадии 9-10 — влияют на то, как трактуется кандидат (см. реализацию). */
  ambiguities: ClarificationQuestion[];
  graph: ArchitectureGraph;
  rules: ArchitectureRule[];
  knowledgeProviders?: KnowledgeProvider[];
}

export interface ProposalRepairInput {
  item: ProposalItem;
  /** Диагностики Level 1 (стадия 14), относящиеся к файлу(ам) этого item — уже отфильтрованы вызывающей стороной. */
  diagnostics: LikeC4Diagnostic[];
  /** Находки Level 2 (стадия 15) с `affectedItemId === item.id`. */
  findings: ArchitecturalFinding[];
  graph: ArchitectureGraph;
  rules: ArchitectureRule[];
}

/**
 * Стадия 11 (Proposal Generation, Milestone 8): превращает `ArchitectureChangeCandidate[]`
 * в объяснимые `ProposalItem[]` — контракт объяснимости (ФТ13/раздел 13) обязывает
 * каждый item иметь непустой `sources[]` и полный `Explanation`.
 */
export interface ProposalGenerator {
  generate(input: ProposalGenerationInput): Promise<ProposalItem[]>;
  /**
   * Стадия 16 (Repair, Milestone 9): точечно перегенерирует `proposedLikeC4Code`
   * ОДНОГО item с учётом диагностик/находок, не трогая остальной Proposal —
   * "точечная перегенерация конкретных файлов/фрагментов" из плана, а не
   * полный повторный проход `generate()` по всем кандидатам.
   */
  repair(input: ProposalRepairInput): Promise<ProposalItem>;
}
