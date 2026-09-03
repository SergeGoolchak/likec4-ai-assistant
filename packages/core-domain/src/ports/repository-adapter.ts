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
  getRevisionInfo(): Promise<{ branch?: string; commit?: string; capturedAt: string }>;
}
