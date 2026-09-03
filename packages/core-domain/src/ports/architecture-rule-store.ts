import type { ArchitectureRule } from '../models/validation.js';

export interface ArchitectureRuleStore {
  create(projectId: string, rule: ArchitectureRule): Promise<void>;
  list(projectId: string): Promise<ArchitectureRule[]>;
  update(projectId: string, ruleId: string, patch: Partial<ArchitectureRule>): Promise<void>;
  delete(projectId: string, ruleId: string): Promise<void>;
}
