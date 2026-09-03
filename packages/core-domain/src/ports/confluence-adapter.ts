import type { UserFacingError } from '../models/common.js';
import type { ConfluencePageContent, ConfluencePageRef } from '../models/confluence.js';

/** В MVP только Server/Data Center, авторизация через PAT, read-only. См. ФТ1. */
export interface ConfluenceAdapter {
  testConnection(): Promise<{ ok: boolean; error?: UserFacingError }>;
  fetchPage(ref: ConfluencePageRef): Promise<ConfluencePageContent>;
}
