import type { ArchitectureGraph } from '../models/architecture-graph.js';
import type {
  ArchitectureChangeCandidate,
  ConflictResolution,
  EntityMatchResult,
  ExtractedRequirement,
} from '../models/requirements.js';
import type { ArchitectureRule } from '../models/validation.js';

export interface EntityMatchInput {
  requirements: ExtractedRequirement[];
  graph: ArchitectureGraph;
}

export interface GapAnalysisInput {
  matches: EntityMatchResult[];
  requirements: ExtractedRequirement[];
  graph: ArchitectureGraph;
  rules: ArchitectureRule[];
}

/**
 * Ключевая логика "не дублировать, не выдумывать скрыто" (ФТ7, ФТ14).
 * Реализуется начиная с Milestone 6+; сейчас определён только контракт.
 */
export interface ChangeEngine {
  matchEntities(input: EntityMatchInput): Promise<EntityMatchResult[]>;
  detectGaps(input: GapAnalysisInput): Promise<ArchitectureChangeCandidate[]>;
  resolveConflicts(candidates: ArchitectureChangeCandidate[]): Promise<ConflictResolution[]>;
}
