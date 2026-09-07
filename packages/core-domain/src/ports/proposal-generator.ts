import type { ArchitectureGraph } from '../models/architecture-graph.js';
import type { ArchitectureChangeCandidate } from '../models/requirements.js';
import type { ClarificationQuestion } from '../models/question.js';
import type { ProposalItem } from '../models/proposal.js';
import type { ArchitectureRule } from '../models/validation.js';
import type { KnowledgeProvider } from './knowledge-provider.js';

export interface ProposalGenerationInput {
  candidates: ArchitectureChangeCandidate[];
  /** Уже отвеченные (или отложенные/"не знаю") вопросы стадии 9-10 — влияют на то, как трактуется кандидат (см. реализацию). */
  ambiguities: ClarificationQuestion[];
  graph: ArchitectureGraph;
  rules: ArchitectureRule[];
  knowledgeProviders?: KnowledgeProvider[];
}

/**
 * Стадия 11 (Proposal Generation, Milestone 8): превращает `ArchitectureChangeCandidate[]`
 * в объяснимые `ProposalItem[]` — контракт объяснимости (ФТ13/раздел 13) обязывает
 * каждый item иметь непустой `sources[]` и полный `Explanation`.
 */
export interface ProposalGenerator {
  generate(input: ProposalGenerationInput): Promise<ProposalItem[]>;
}
