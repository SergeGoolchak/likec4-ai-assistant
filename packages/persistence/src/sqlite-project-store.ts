import type { DatabaseSync } from 'node:sqlite';
import type { ProjectRecord, ProjectStore } from '@likec4-ai/core-domain';

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  local_repository_path: string;
  created_at: string;
  last_analysis_at: string | null;
  last_modified_at: string | null;
}

/** `node:sqlite`'s DatabaseSync API is synchronous — wrapped in resolved promises to satisfy the async ProjectStore port. */
export class SqliteProjectStore implements ProjectStore {
  #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  async create(project: ProjectRecord): Promise<void> {
    this.#db
      .prepare(
        `INSERT INTO projects (id, name, description, local_repository_path, created_at, last_analysis_at, last_modified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        project.id,
        project.name,
        project.description ?? null,
        project.localRepositoryPath,
        project.createdAt,
        project.lastAnalysisAt ?? null,
        project.lastModifiedAt ?? null,
      );
  }

  async get(id: string): Promise<ProjectRecord | null> {
    const row = this.#db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
    return row ? fromRow(row) : null;
  }

  async list(): Promise<ProjectRecord[]> {
    const rows = this.#db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as unknown as ProjectRow[];
    return rows.map(fromRow);
  }

  async update(id: string, patch: Partial<ProjectRecord>): Promise<void> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Project not found: ${id}`);
    const merged: ProjectRecord = { ...existing, ...patch, id };
    this.#db
      .prepare(
        `UPDATE projects
         SET name = ?, description = ?, local_repository_path = ?, created_at = ?, last_analysis_at = ?, last_modified_at = ?
         WHERE id = ?`,
      )
      .run(
        merged.name,
        merged.description ?? null,
        merged.localRepositoryPath,
        merged.createdAt,
        merged.lastAnalysisAt ?? null,
        merged.lastModifiedAt ?? null,
        id,
      );
  }

  async delete(id: string): Promise<void> {
    this.#db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }
}

function fromRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    localRepositoryPath: row.local_repository_path,
    createdAt: row.created_at,
    lastAnalysisAt: row.last_analysis_at ?? undefined,
    lastModifiedAt: row.last_modified_at ?? undefined,
  };
}
