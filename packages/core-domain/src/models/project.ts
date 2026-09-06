/**
 * Репозиторий пока только локальный (Milestone 2) — BitbucketAdapter уже
 * реализован (Milestone 4), но подключение проекта к Bitbucket через UI
 * остаётся отдельной задачей (нужен `RepositoryConfig`-union и своя форма
 * настроек), не вводится здесь заранее как гипотетическая заглушка.
 *
 * `confluenceBaseUrl` — добавлено в Milestone 5: без него недостижима стадия
 * 1 pipeline (Load Confluence). PAT для этого адреса хранится не здесь, а в
 * SecretsVault (ключ `confluence.pat.<projectId>`) — секреты никогда не
 * лежат в обычных доменных записях, которые могут попасть в лог/экспорт.
 * AI provider settings по той же логике остаются за Milestone 6.
 */
export interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  localRepositoryPath: string;
  confluenceBaseUrl?: string;
  createdAt: string;
  lastAnalysisAt?: string;
  lastModifiedAt?: string;
}
