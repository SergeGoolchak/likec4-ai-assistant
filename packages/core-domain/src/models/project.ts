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
 *
 * `aiModel` — добавлено в Milestone 6, по той же логике: имя модели не
 * секрет, хранится здесь; сам OpenAI API key — в SecretsVault (ключ
 * `openai.api-key.<projectId>`). Отдельного поля `aiProvider` пока нет —
 * реализован только OpenAI, и заводить поле с единственным всегда
 * одинаковым значением было бы преждевременной абстракцией.
 *
 * `aiBaseUrl` — добавлено следом за Milestone 6: `OpenAILLMProvider`/
 * `OpenAIEmbeddingProvider` физически говорят по протоколу OpenAI Chat
 * Completions, которому следуют и open-source серверы (Ollama, vLLM, LM
 * Studio, llama.cpp server и т.п.) — этого поля достаточно, чтобы указать
 * такой сервер вместо api.openai.com, без отдельного адаптера под каждый.
 * Не секрет — сам API key (не всегда даже нужен локальным серверам)
 * по-прежнему только в SecretsVault.
 */
export interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  localRepositoryPath: string;
  confluenceBaseUrl?: string;
  aiModel?: string;
  aiBaseUrl?: string;
  createdAt: string;
  lastAnalysisAt?: string;
  lastModifiedAt?: string;
}
