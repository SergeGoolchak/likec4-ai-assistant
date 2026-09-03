import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Node 24's built-in `node:sqlite` works without any flag or native
 * dependency (verified in this session) — chosen over `better-sqlite3` to
 * keep the dependency footprint minimal for a local single-user tool. One
 * shared file for all MVP persistence (projects, snapshots; proposals and
 * session history join in later milestones).
 */
export async function openDatabase(dbFilePath: string): Promise<DatabaseSync> {
  await mkdir(dirname(dbFilePath), { recursive: true });
  const db = new DatabaseSync(dbFilePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      local_repository_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_analysis_at TEXT,
      last_modified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      session_id TEXT,
      created_at TEXT NOT NULL,
      file_hashes TEXT NOT NULL,
      storage_ref TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS architecture_rules (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      applies_to_kinds TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      required_metadata TEXT,
      naming_convention_pattern TEXT,
      examples TEXT,
      severity TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_architecture_rules_project ON architecture_rules(project_id);

    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL,
      metadata TEXT NOT NULL,
      embedding TEXT NOT NULL,
      PRIMARY KEY (scope_key, id)
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_scope ON knowledge_chunks(scope_key);
  `);
  return db;
}
