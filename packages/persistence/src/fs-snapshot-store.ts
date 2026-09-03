import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { RepositoryFile, Snapshot, SnapshotMeta, SnapshotStore } from '@likec4-ai/core-domain';

interface SnapshotRow {
  id: string;
  project_id: string;
  reason: string;
  session_id: string | null;
  created_at: string;
  file_hashes: string;
  storage_ref: string;
}

/**
 * Stores a physical copy of every file (not a git diff — the local folder
 * may not be a git repo at all) under `snapshotsRootDir/<projectId>/<id>/`,
 * plus a manifest of sha256 hashes recorded in sqlite. Restoring reads the
 * copy back and hands it to the caller as RepositoryFile[] — writing it back
 * into the real project is RepositoryAdapter.writeFiles's job, not this
 * store's (keeps "make a copy" and "apply a copy" as separate concerns).
 */
export class FsSnapshotStore implements SnapshotStore {
  #db: DatabaseSync;
  #snapshotsRootDir: string;

  constructor(options: { db: DatabaseSync; snapshotsRootDir: string }) {
    this.#db = options.db;
    this.#snapshotsRootDir = options.snapshotsRootDir;
  }

  async create(projectId: string, files: RepositoryFile[], meta: SnapshotMeta): Promise<Snapshot> {
    const id = randomUUID();
    const storageRef = join(this.#snapshotsRootDir, projectId, id);
    const fileHashes: Record<string, string> = {};

    for (const file of files) {
      const filePath = join(storageRef, file.path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, 'utf8');
      fileHashes[file.path] = sha256(file.content);
    }

    this.#db
      .prepare(
        `INSERT INTO snapshots (id, project_id, reason, session_id, created_at, file_hashes, storage_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, projectId, meta.reason, meta.sessionId ?? null, meta.createdAt, JSON.stringify(fileHashes), storageRef);

    return { id, projectId, meta, fileHashes, storageRef };
  }

  async restore(snapshotId: string): Promise<RepositoryFile[]> {
    const row = this.#db.prepare('SELECT * FROM snapshots WHERE id = ?').get(snapshotId) as SnapshotRow | undefined;
    if (!row) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }
    const fileHashes = JSON.parse(row.file_hashes) as Record<string, string>;
    return Promise.all(
      Object.keys(fileHashes).map(async (path) => ({
        path,
        content: await readFile(join(row.storage_ref, path), 'utf8'),
      })),
    );
  }

  async list(projectId: string): Promise<Snapshot[]> {
    const rows = this.#db
      .prepare('SELECT * FROM snapshots WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as unknown as SnapshotRow[];
    return rows.map(fromRow);
  }
}

function fromRow(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    meta: {
      reason: row.reason as SnapshotMeta['reason'],
      sessionId: row.session_id ?? undefined,
      createdAt: row.created_at,
    },
    fileHashes: JSON.parse(row.file_hashes),
    storageRef: row.storage_ref,
  };
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
