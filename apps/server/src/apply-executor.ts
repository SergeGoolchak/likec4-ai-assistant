import { createHash } from 'node:crypto';
import type { ApplyResult, FileDiff, Proposal, RepositoryAdapter, RepositoryFile, SnapshotStore } from '@likec4-ai/core-domain';
import { restoreFilesFromSnapshot } from './snapshot-restore.js';

export interface ExecuteApplyInput {
  repositoryAdapter: RepositoryAdapter;
  snapshotStore: SnapshotStore;
  projectId: string;
  sessionId: string;
  existingFiles: RepositoryFile[];
  diff: FileDiff[];
  proposal: Proposal;
}

export class ApplyConflictError extends Error {
  constructor(readonly paths: string[]) {
    super(`Files changed on disk since analysis started: ${paths.join(', ')}`);
  }
}

/** `rolledBack` — удался ли auto-rollback из снэпшота; если нет, диск в неопределённом состоянии и нужен ручной Restore из History. */
export class ApplyWriteError extends Error {
  constructor(
    readonly cause: unknown,
    readonly snapshotId: string,
    readonly rolledBack: boolean,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

/**
 * Вынесено из `routes/apply.ts` (Milestone 12), чтобы быть тестируемым напрямую
 * с fake-адаптерами, без поднятия Fastify. Единственное место, где реально
 * записываются файлы исходного LikeC4-проекта — отсюда и требование DoD
 * Milestone 12 ("сбой ни разу не портит исходный проект") адресовано именно
 * здесь: hash-check → snapshot → write, и если запись всё же упала на
 * середине пачки — немедленный auto-rollback к тому же снэпшоту, а не просто
 * "снэпшот есть, разбирайтесь сами через History".
 */
export async function executeApply(input: ExecuteApplyInput): Promise<ApplyResult> {
  const { repositoryAdapter, snapshotStore, projectId, sessionId, existingFiles, diff, proposal } = input;

  // Hash-check (риск №6) — не перезаписывать молча файлы, изменившиеся на диске с момента
  // начала анализа. Сравниваем по content (не по RepositoryFile.sha — локальный адаптер его
  // не заполняет), поэтому это честная проверка независимо от конкретного адаптера.
  const currentFiles = await repositoryAdapter.readAll();
  const currentByPath = new Map(currentFiles.map((f) => [f.path, f.content]));
  const analysisByPath = new Map(existingFiles.map((f) => [f.path, f.content]));
  const conflicts: string[] = [];
  for (const entry of diff) {
    const current = currentByPath.get(entry.path);
    const atAnalysisTime = analysisByPath.get(entry.path);
    if (sha256(current) !== sha256(atAnalysisTime)) conflicts.push(entry.path);
  }
  if (conflicts.length > 0) throw new ApplyConflictError(conflicts);

  const snapshot = await snapshotStore.create(projectId, currentFiles, {
    reason: 'pre-apply',
    sessionId,
    createdAt: new Date().toISOString(),
  });

  const changedFiles: RepositoryFile[] = diff
    .filter((entry) => entry.changeType !== 'deleted')
    .map((entry) => ({ path: entry.path, content: entry.after! }));
  const deletedPaths = diff.filter((entry) => entry.changeType === 'deleted').map((entry) => entry.path);

  try {
    await repositoryAdapter.writeFiles(changedFiles);
    if (deletedPaths.length > 0) await repositoryAdapter.deleteFiles(deletedPaths);
  } catch (writeErr) {
    // Частичная запись — откатываемся к снэпшоту, снятому чуть выше, чтобы partial-apply
    // никогда не оставался единственным исходом сбоя (Milestone 12, DoD).
    let rolledBack = true;
    await restoreFilesFromSnapshot(repositoryAdapter, snapshotStore, snapshot.id).catch(() => {
      rolledBack = false;
    });
    throw new ApplyWriteError(writeErr, snapshot.id, rolledBack);
  }

  return {
    appliedAt: new Date().toISOString(),
    snapshotId: snapshot.id,
    appliedItemIds: proposal.items.filter((i) => i.decision === 'approved' || i.decision === 'edited').map((i) => i.id),
    rejectedItemIds: proposal.items.filter((i) => i.decision === 'rejected').map((i) => i.id),
    filesChanged: [...changedFiles.map((f) => f.path), ...deletedPaths],
    rollbackAvailable: true,
  };
}

function sha256(content: string | undefined): string {
  return createHash('sha256')
    .update(content ?? '', 'utf8')
    .digest('hex');
}
