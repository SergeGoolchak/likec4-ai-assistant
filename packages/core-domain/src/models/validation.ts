import type { ViewId } from './common.js';

export interface LikeC4Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  file: string;
  range?: { startLine: number; endLine: number };
  code?: string;
}

export interface TechnicalValidationResult {
  ok: boolean;
  diagnostics: LikeC4Diagnostic[];
}

export interface RenderedView {
  viewId: ViewId;
  svg: string;
  layoutData?: unknown;
}

/** Одно правило Architecture Rule (вход Level 2 / архитектурного rule-engine). См. ФТ12. */
export interface ArchitectureRule {
  id: string;
  appliesToKinds: string[];
  title: string;
  description: string;
  requiredMetadata?: string[];
  namingConventionPattern?: string;
  examples?: string[];
  severity: 'must' | 'should';
}

export interface ArchitecturalFinding {
  ruleId: string;
  severity: 'must' | 'should';
  message: string;
  /** ProposalItem.id, к которому относится эта находка. */
  affectedItemId: string;
  autoFixable: boolean;
}

export interface ArchitecturalValidationResult {
  ok: boolean;
  findings: ArchitecturalFinding[];
}

export interface RepairAttemptLog {
  attempt: number;
  targetItemIds: string[];
  diagnosticsBefore: LikeC4Diagnostic[];
  diagnosticsAfter: LikeC4Diagnostic[];
  succeeded: boolean;
}
