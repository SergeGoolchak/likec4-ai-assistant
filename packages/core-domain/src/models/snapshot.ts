export interface SnapshotMeta {
  reason: 'pre-apply' | 'manual';
  sessionId?: string;
  createdAt: string;
}

/**
 * Физическая копия файлов локального репозитория (не git diff — локальная
 * папка может вообще не быть git-репозиторием), делается перед каждым Apply.
 * Восстановление перезаписывает файлы атомарно. См. риск №6 из плана
 * (конкурентная запись файлов).
 */
export interface Snapshot {
  id: string;
  projectId: string;
  meta: SnapshotMeta;
  fileHashes: Record<string, string>;
  storageRef: string;
}
