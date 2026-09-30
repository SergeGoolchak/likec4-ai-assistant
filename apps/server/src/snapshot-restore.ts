import type { RepositoryAdapter, SnapshotStore } from '@likec4-ai/core-domain';

/**
 * Общая часть Rollback (`routes/history.ts`) и auto-rollback при частичном сбое
 * Apply (`apply-executor.ts`, Milestone 12) — вынесена сюда, чтобы не
 * дублировать логику "восстановить снэпшот, включая удаление файлов,
 * которых на его момент ещё не было" в двух местах.
 *
 * НЕ содержит `withProjectLock` внутри себя намеренно: `apply-executor.ts`
 * вызывает эту функцию уже находясь под локом, который держит вызывающий
 * `apply.ts` — обернуть локом здесь же означало бы рекурсивный вызов
 * неповторно-входимого лока и зависание. Вызывающий код сам решает, нужен
 * ли лок (history.ts берёт его явно перед вызовом).
 */
export async function restoreFilesFromSnapshot(
  repositoryAdapter: RepositoryAdapter,
  snapshotStore: SnapshotStore,
  snapshotId: string,
): Promise<void> {
  const files = await snapshotStore.restore(snapshotId);
  await repositoryAdapter.writeFiles(files);

  // Настоящий откат, а не частичная перезапись — файлы, появившиеся ПОСЛЕ снэпшота (например
  // новый файл, созданный Apply), нужно удалить, иначе репозиторий не вернётся byte-for-byte
  // к прежнему состоянию (см. RepositoryAdapter.deleteFiles, добавлен именно для этого случая).
  const snapshotPaths = new Set(files.map((f) => f.path));
  const currentPaths = await repositoryAdapter.listLikeC4Files();
  const orphaned = currentPaths.filter((path) => !snapshotPaths.has(path));
  if (orphaned.length > 0) await repositoryAdapter.deleteFiles(orphaned);
}
