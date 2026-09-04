import type { DatabaseSync } from 'node:sqlite';
import type { SessionHistoryStore, SessionRecord, SessionRecordSummary } from '@likec4-ai/core-domain';
import { mapAwareReplacer, mapAwareReviver } from './map-json.js';

interface SessionRow {
  id: string;
  project_id: string;
  status: string;
  created_at: string;
  data: string;
}

/**
 * Персистентность на *каждый* переход стадии pipeline (не только в конце) —
 * прямое требование плана ("устойчивость к падению процесса"). Весь
 * `SessionRecord` хранится как один JSON blob в колонке `data` (через
 * map-json.ts для Map-полей внутри `pipelineState.stageOutputs.architectureGraph`);
 * `project_id`/`status`/`created_at` вынесены в отдельные колонки только
 * для запросов `list`, не дублируют источник истины.
 */
export class SqliteSessionHistoryStore implements SessionHistoryStore {
  #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  async create(session: SessionRecord): Promise<void> {
    this.#db
      .prepare('INSERT INTO sessions (id, project_id, status, created_at, data) VALUES (?, ?, ?, ?, ?)')
      .run(session.id, session.projectId, session.pipelineState.status, session.createdAt, serialize(session));
  }

  async update(sessionId: string, patch: Partial<SessionRecord>): Promise<void> {
    const existing = await this.get(sessionId);
    if (!existing) throw new Error(`Session not found: ${sessionId}`);
    const merged: SessionRecord = { ...existing, ...patch, id: sessionId };
    this.#db
      .prepare('UPDATE sessions SET project_id = ?, status = ?, data = ? WHERE id = ?')
      .run(merged.projectId, merged.pipelineState.status, serialize(merged), sessionId);
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const row = this.#db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow | undefined;
    return row ? deserialize(row.data) : null;
  }

  async list(filter?: { projectId?: string }): Promise<SessionRecordSummary[]> {
    const rows = (
      filter?.projectId
        ? this.#db.prepare('SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC').all(filter.projectId)
        : this.#db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all()
    ) as unknown as SessionRow[];

    return rows.map((row) => {
      const session = deserialize(row.data);
      return {
        id: session.id,
        projectId: session.projectId,
        createdAt: session.createdAt,
        status: session.pipelineState.status,
        confluencePageTitle: session.pipelineState.stageOutputs.confluenceContent?.title,
      };
    });
  }
}

function serialize(session: SessionRecord): string {
  return JSON.stringify(session, mapAwareReplacer);
}

function deserialize(data: string): SessionRecord {
  return JSON.parse(data, mapAwareReviver) as SessionRecord;
}
