import type { DatabaseSync } from 'node:sqlite';
import type { ArchitectureRule, ArchitectureRuleStore } from '@likec4-ai/core-domain';

interface RuleRow {
  id: string;
  project_id: string;
  applies_to_kinds: string;
  title: string;
  description: string;
  required_metadata: string | null;
  naming_convention_pattern: string | null;
  examples: string | null;
  severity: string;
}

export class SqliteArchitectureRuleStore implements ArchitectureRuleStore {
  #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  async create(projectId: string, rule: ArchitectureRule): Promise<void> {
    this.#db
      .prepare(
        `INSERT INTO architecture_rules
           (id, project_id, applies_to_kinds, title, description, required_metadata, naming_convention_pattern, examples, severity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rule.id,
        projectId,
        JSON.stringify(rule.appliesToKinds),
        rule.title,
        rule.description,
        rule.requiredMetadata ? JSON.stringify(rule.requiredMetadata) : null,
        rule.namingConventionPattern ?? null,
        rule.examples ? JSON.stringify(rule.examples) : null,
        rule.severity,
      );
  }

  async list(projectId: string): Promise<ArchitectureRule[]> {
    const rows = this.#db
      .prepare('SELECT * FROM architecture_rules WHERE project_id = ? ORDER BY title ASC')
      .all(projectId) as unknown as RuleRow[];
    return rows.map(fromRow);
  }

  async update(projectId: string, ruleId: string, patch: Partial<ArchitectureRule>): Promise<void> {
    const existing = await this.#getOne(projectId, ruleId);
    if (!existing) throw new Error(`Architecture rule not found: ${ruleId}`);
    const merged: ArchitectureRule = { ...existing, ...patch, id: ruleId };
    this.#db
      .prepare(
        `UPDATE architecture_rules
         SET applies_to_kinds = ?, title = ?, description = ?, required_metadata = ?, naming_convention_pattern = ?, examples = ?, severity = ?
         WHERE id = ? AND project_id = ?`,
      )
      .run(
        JSON.stringify(merged.appliesToKinds),
        merged.title,
        merged.description,
        merged.requiredMetadata ? JSON.stringify(merged.requiredMetadata) : null,
        merged.namingConventionPattern ?? null,
        merged.examples ? JSON.stringify(merged.examples) : null,
        merged.severity,
        ruleId,
        projectId,
      );
  }

  async delete(projectId: string, ruleId: string): Promise<void> {
    this.#db.prepare('DELETE FROM architecture_rules WHERE id = ? AND project_id = ?').run(ruleId, projectId);
  }

  async #getOne(projectId: string, ruleId: string): Promise<ArchitectureRule | null> {
    const row = this.#db
      .prepare('SELECT * FROM architecture_rules WHERE id = ? AND project_id = ?')
      .get(ruleId, projectId) as RuleRow | undefined;
    return row ? fromRow(row) : null;
  }
}

function fromRow(row: RuleRow): ArchitectureRule {
  return {
    id: row.id,
    appliesToKinds: JSON.parse(row.applies_to_kinds),
    title: row.title,
    description: row.description,
    requiredMetadata: row.required_metadata ? JSON.parse(row.required_metadata) : undefined,
    namingConventionPattern: row.naming_convention_pattern ?? undefined,
    examples: row.examples ? JSON.parse(row.examples) : undefined,
    severity: row.severity as ArchitectureRule['severity'],
  };
}
