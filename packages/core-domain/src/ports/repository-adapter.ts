import type { RepositoryFile, UserFacingError } from '../models/common.js';

/**
 * Две реализации в MVP: LocalRepositoryAdapter (read-write) и
 * BitbucketAdapter (Server/DC, PAT, read-only — writeFiles там бросает
 * NotSupportedError). См. ФТ5.
 */
export interface RepositoryAdapter {
  readonly kind: 'local' | 'bitbucket';
  testConnection(): Promise<{ ok: boolean; error?: UserFacingError }>;
  listLikeC4Files(): Promise<string[]>;
  readFile(path: string): Promise<RepositoryFile>;
  readAll(): Promise<RepositoryFile[]>;
  writeFiles(files: RepositoryFile[]): Promise<void>;
  /**
   * Нужен Rollback (Milestone 10): восстановление снэпшота должно не только
   * перезаписать файлы, которые были на момент снэпшота, но и убрать файлы,
   * появившиеся после него (например новый файл, созданный Apply) — иначе
   * это не настоящий откат к прежнему состоянию, а частичная перезапись.
   */
  deleteFiles(paths: string[]): Promise<void>;
  getRevisionInfo(): Promise<{ branch?: string; commit?: string; capturedAt: string }>;
}
