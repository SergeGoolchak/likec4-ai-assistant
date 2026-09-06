# AI Assistant for LikeC4 Architecture — план разработки

## Контекст

Требуется локальное ПО с web-интерфейсом для системных аналитиков/архитекторов: пользователь передаёт ссылку на аналитическую спецификацию в Confluence + существующий LikeC4-проект (репозиторий/локальная папка) + правила моделирования проекта. Система через LLM-pipeline анализирует спецификацию и существующую архитектуру, находит архитектурно значимые изменения, сопоставляет их с уже существующими элементами (чтобы не плодить дубликаты), при неоднозначностях задаёт вопросы, формирует Proposal (новые/изменённые элементы, связи, API, логическая модель данных, sequence-диаграммы, views), генерирует LikeC4-код, валидирует его технически и архитектурно, показывает diff/preview — и только после явного подтверждения пользователя применяет изменения, с обязательной точкой восстановления и rollback.

Ключевой принцип: система **дополняет** существующую модель, не генерирует её заново. Human-in-the-loop на каждом значимом решении, полная объяснимость (traceability) и никаких скрытых допущений — это не второстепенные фичи, а системообразующие требования, определяющие архитектуру (нельзя строить это как "один большой prompt").

Проект — greenfield, кода нет. Ниже — согласованные с пользователем технологические решения и итоговая архитектура/roadmap для MVP.

## Согласованные технологические решения

- **Backend/pipeline:** Node.js/TypeScript, поверх официальных `likec4` npm-пакетов (парсер на Langium, CLI/API валидации, генератор представлений) — свой парсер LikeC4-синтаксиса не пишем.
- **LLM:** provider-independent порт `LLMProvider`; в MVP реализуем OpenAI-адаптер как основной. Архитектура обязана допускать локальные LLM позже (privacy-режим без выхода данных наружу).
- **Упаковка/запуск:** обычный локальный Node-процесс (`npm install && npm start`), backend + web UI на localhost. Без Docker, без Electron в MVP.
- **Confluence / Bitbucket:** Server/Data Center (self-hosted), авторизация через Personal Access Token (PAT). Оба — **read-only** в MVP.

## Архитектура: модульная структура (hexagonal / ports-and-adapters)

Ядро (domain + pipeline) не знает о конкретных LLM/Confluence/Bitbucket/UI — всё заходит через порты, реализации — заменяемые адаптеры. Монорепо (npm workspaces):

```
/apps
  /server            # Node/TS backend: HTTP API + SSE + orchestrator host
  /web               # React SPA (Vite), REST + SSE к /server
/packages
  /core-domain       # доменные модели и порты (интерфейсы), без реализаций
  /core-pipeline      # PipelineOrchestrator + 19 стадий, работает только через порты
  /architecture-graph # построение/запросы к Architecture Graph (внутр. модель LikeC4)
  /change-engine      # entity matching, gap analysis, conflict resolution, rule-engine
  /context-builder    # сборка минимального релевантного контекста для LLM
  /likec4-adapter     # LikeC4Parser/LikeC4Validator поверх likec4 npm-пакетов
  /llm-openai         # LLMProvider для OpenAI (+ EmbeddingProvider)
  /llm-local          # заготовка под локальные LLM (stub в MVP)
  /confluence-adapter # ConfluenceAdapter (Server/DC, PAT)
  /repo-local-adapter # LocalRepositoryAdapter (файловая система, атомарная запись)
  /repo-bitbucket-adapter # BitbucketAdapter (Server/DC, PAT, read-only)
  /knowledge-global   # LikeC4 Knowledge Base (версионируется отдельно от приложения)
  /knowledge-project  # Project Knowledge Base (per-project)
  /documentation-engine # explainability, changelog, help-контент
  /persistence        # ProposalStore, SessionHistoryStore, SnapshotStore (SQLite + FS)
  /secrets            # SecretsVault — единая точка хранения PAT/API key
  /ui-kit             # design-system + 5-уровневая help-система + onboarding engine
```

`core-domain`/`core-pipeline` импортируют только типы адаптеров, не реализации. Конкретные адаптеры собираются в `apps/server` через простой composition root (`createApp(config): AppContainer`) — без тяжёлого DI-фреймворка.

### Ключевые порты (контракты)

```typescript
interface ConfluenceAdapter {
  testConnection(): Promise<{ ok: boolean; error?: UserFacingError }>;
  fetchPage(ref: ConfluencePageRef): Promise<ConfluencePageContent>; // sections: paragraph/table/code-block/list/macro, со стабильными id для traceability
}

interface RepositoryAdapter {
  kind: 'local' | 'bitbucket';
  listLikeC4Files(): Promise<string[]>;
  readAll(): Promise<RepositoryFile[]>;
  writeFiles(files: RepositoryFile[]): Promise<void>; // atomic write+rename; Bitbucket → NotSupported в MVP
  getRevisionInfo(): Promise<{ branch?: string; commit?: string; capturedAt: string }>;
}

interface LLMProvider {
  readonly id: string; readonly model: string; isLocal: boolean;
  complete(messages, options): Promise<LLMResult<string>>;
  completeJSON<T>(messages, options): Promise<LLMResult<T>>; // structured output
}

interface LikeC4Parser { parseProject(files: RepositoryFile[]): Promise<{ graph: ArchitectureGraph; diagnostics: LikeC4Diagnostic[] }>; }
interface LikeC4Validator {
  validateTechnical(files: RepositoryFile[]): Promise<TechnicalValidationResult>; // на гипотетическом слитом состоянии, без записи на диск
  renderViewsPreview(files: RepositoryFile[], viewIds?: string[]): Promise<RenderedView[]>;
}

interface KnowledgeProvider { // две реализации: global и project
  scope: 'global' | 'project';
  search(query: { text: string; topK?: number }): Promise<KnowledgeChunk[]>;
}

interface ChangeEngine {
  matchEntities(input): Promise<EntityMatchResult[]>;
  detectGaps(input): Promise<ArchitectureChangeCandidate[]>;
  resolveConflicts(candidates): Promise<ConflictResolution[]>;
}
```

Секреты (Confluence PAT, Bitbucket PAT, OpenAI key) идут через отдельный порт `SecretsVault` — никогда не покидают адаптер, который их использует.

## Модель данных (ключевое)

- **ArchitectureGraph** — нормализованное внутреннее представление LikeC4-модели (elements/relationships/views + индексы by-kind/by-tag/neighbors + sourceFileOf для diff/repair). Строится из `likec4` model API после парсинга, не копия AST.
- **Proposal / ProposalItem** — типы (`new-element`, `modified-element`, `new-relationship`, `api-definition`, `data-model`, `sequence-diagram`, `view`, `risk`, `assumption`), каждый item обязан иметь `sources: SourceReference[]` (≥1) и `Explanation { what, why, impact, confidence, assumptions }`. Приоритет источников при конфликте: existing-likec4-element → architecture-rules → project-knowledge-base → confluence-section → user-answer → likec4-knowledge-base → ai-general-knowledge.
- **ClarificationQuestion** — с явным `originKind` (факт из спецификации / факт из архитектуры / решение пользователя / AI-допущение), опциями, `allowFreeText`, статусами `open/answered/deferred/marked-unknown`.
- **SessionRecord** — вся история сессии: Confluence ref+version, repo ref, LLM модель, PipelineState, Proposal, вопросы/ответы, validation log, apply result; технический лог отдельно от user-facing timeline.
- **Snapshot** — физическая копия файлов проекта (не git-diff) + manifest с хэшами, создаётся перед каждым Apply, восстановление — атомарная перезапись.

## AI Pipeline: 19 стадий как явная стейт-машина

`PipelineOrchestrator` — не линейный конвейер, а стейт-машина с точками паузы и частичными повторными проходами:

1. Load Confluence → 2. Parse Specification → 3. Load LikeC4 → 4. Parse LikeC4 → 5. Build Architecture Graph → 6. Extract Requirements → 7. Entity Matching → 8. Gap Analysis → 9. Ambiguity Detection → **10. User Clarification (пауза)** → 11. Proposal Generation → **12. User Review (пауза, per-item Approve/Reject/Edit/Regenerate)** → 13. LikeC4 Generation → 14. Validation → 15. Architecture Review → 16. Repair (ограниченные попытки) → 17. Diff → 18. Preview → 19. Apply.

Важные механики:
- `PipelineState` сериализуется в `SessionHistoryStore` после каждой стадии → устойчивость к падению процесса, можно продолжить сессию после рестарта.
- Стадии 10 и 12 — гейты: pipeline физически возвращает управление UI и ждёт внешнего события (ответ на вопрос / решение по item), а не блокирует поток внутри процесса.
- "Regenerate" на item в Proposal — точечный повторный проход `proposal-generation` только для этого item, не для всей Proposal.
- Repair — точечная перегенерация конкретных файлов/фрагментов по diagnostics, с cap на число попыток (per-item и per-proposal); при исчерпании — explicit stop с полным diagnostics-дампом, никогда тихое применение невалидного кода.

### Минимальный релевантный контекст для LLM (`context-builder`)

Ни одна LLM-стадия не получает весь ArchitectureGraph или всю Knowledge Base. Стратегия: (1) стартовые узлы — top-N кандидатов из entity matching (lexical filter + embedding similarity, эмбеддинги считаются один раз при построении графа и кэшируются); (2) BFS на глубину 1-2 по связям + родительская иерархия; (3) бюджет токенов ограничивает slice, с явным логированием, что было отброшено. Architecture Rules фильтруются по applicability (`appliesToKinds`), а не ретривятся вслепую. Каждая стадия имеет собственный узкий system-prompt — это прямая реализация требования "pipeline не один большой prompt".

## Валидация и repair — два уровня

- **Level 1 (техническая):** через программный API/CLI пакета `likec4` — синтаксис, ссылки, дубликаты id, целостность relationships/views/imports. Прогоняется на гипотетическом слитом состоянии (existing + generated, in-memory), без записи на диск.
- **Level 2 (архитектурная):** отдельный rule-engine, детерминированные проверки (дубликаты сервисов по matching-score, обязательные metadata, naming conventions, переиспользование существующих API) + LLM-assisted проверки на узком контексте для смысловых вещей. Findings `must` блокируют Apply; `should` — предупреждения.
- **Apply gate:** разрешён только если Level 1 без ошибок, нет неразрешённых `must`-findings среди выбранных items, и snapshot успешно создан.

## Frontend

React + TypeScript + Vite, React Router, TanStack Query + SSE-хук для realtime статусов pipeline, Tailwind + `ui-kit` с design tokens (success/warning/error/progress). Экраны: Home/Projects, Create Project, Project Dashboard, Project Settings (General/Confluence/Repository/AI/LikeC4/Knowledge/Architecture Rules), New Architecture Task, Analysis, Questions, Proposal (карточки по категориям), Change Details, Diff (split view), Preview, Apply (сводка), History, Help Center.

**Рендеринг LikeC4-диаграмм:** приоритет — переиспользовать официальный React-компонент рендеринга likec4 (даёт interactive click-to-details); если его встраивание в наш backend-driven preview окажется несоразмерно сложным — fallback на серверный экспорт в SVG + zoom/pan обёртка. Развилка проверяется **технически spike'ом в начале Milestone 10**, до того как строить финальный UI Preview.

**Контекстная помощь (5 уровней)** — не хардкод по компонентам, а единый контент-реестр (`HelpTopic` записи: label / inline description / tooltip / context help / doc link) в `ui-kit/help/content`, подключаемый через `<HelpAnchor topicId>`. Onboarding — декларативный движок поверх того же реестра. Help Center рендерит ту же структуру + markdown-документацию из `docs/user-guide/`. Ошибки — единый `UserFacingError { title, likelyCause, suggestedAction, retryable, helpTopicId }`, никаких сырых исключений/HTTP-кодов в UI.

## Roadmap (milestones)

Порядок специально ставит "локальный репозиторий + парсинг/валидация LikeC4" раньше Confluence/полного AI pipeline — так Diff/Preview/Apply можно тестировать на синтетических Proposal ещё до готовности LLM-цепочки, снижая риск позднего обнаружения проблем в самой рискованной части (качество генерации кода).

0. **Foundation & Scaffolding** — монорепо, `core-domain` порты, базовый `apps/server`/`apps/web`, secrets vault stub, раздельные technical/user-facing логи. DoD: `npm start` поднимает всё на localhost, health-check зелёный.
1. **LikeC4 Parser/Validator + LocalRepositoryAdapter + Architecture Graph** — интеграция likec4 npm-пакетов (⚠ technical spike в начале — программный API для in-memory validate неопределён), построение графа. DoD: на тестовом LikeC4-проекте строится граф, диагностики корректны, `renderViewsPreview` работает.
2. **Project setup UI + Settings + SnapshotStore** — Create Project, Dashboard, Settings (Local repo), snapshot create/restore. DoD: можно создать проект на локальной папке, увидеть распарсенную модель, восстановить snapshot побайтово.
3. **Knowledge Bases & Architecture Rules** — global + project KB, embedding-индекс (`EmbeddingProvider` — отдельный порт от `LLMProvider`), CRUD для Architecture Rules. DoD: Project KB переиндексируется автоматически, rules фильтруются по kind в поиске.
4. **Confluence Adapter + Bitbucket Adapter (read-only)** — PAT auth, извлечение sections/tables/code-blocks из Server/DC storage-format. DoD: реальная тестовая Confluence-страница → корректный `ConfluencePageContent`; Bitbucket → список/чтение .c4 файлов.
5. **Pipeline Orchestrator skeleton + стадии 1-5** — стейт-машина, персистентность состояния, SSE статусы, экран Analysis. DoD: end-to-end проход стадий 1-5, переживает рестарт процесса.
6. **LLMProvider (OpenAI) + ContextBuilder + стадии 6-8** — extraction/matching/gap analysis. DoD: golden-test набор фикстур (текст требования + модель → ожидаемый match) проходит на очевидных кейсах.
7. **Ambiguity Detection + Questions UI (9-10)** — конфликты источников → вопросы, а не тихий выбор по приоритету для смысловых случаев. DoD: конфликт двух источников порождает явный вопрос с обоими источниками.
8. **Proposal Generation + Proposal UI (11-12)** — категоризированные карточки, Approve/Reject/Edit/Regenerate per-item. DoD: каждый item имеет непустой `sources[]` и `Explanation`.
9. **LikeC4 Generation + двухуровневая валидация + Repair (13-16)** — точечная генерация в существующие/новые файлы, rule-engine, repair с cap. DoD: намеренно проблемный тест-кейс либо самовосстанавливается, либо корректно останавливается с explicit-сообщением.
10. **Diff + Preview + Apply/Rollback/History (17-19)** — ⚠ spike по likec4 React-рендереру в начале. DoD: полный happy path New Task → Apply → Rollback работает; Apply задизейблен при непройденной валидации.
11. **UX polish: Help System, Onboarding, User Documentation** — наполнение `HelpTopic` по всем экранам (проверяется lint-скриптом на полноту), 13-шаговый onboarding, Help Center. Практически: контент должен накапливаться параллельно с milestones 2-10, здесь — сведение и проверка полноты.
12. **Hardening: Security, Reliability, Errors, Logging** — аудит утечек secrets в логах/prompts/ошибках, атомарность записи файлов, graceful degradation при обрыве LLM/Confluence/Bitbucket посреди любой из 19 стадий. DoD: тест "убить процесс/сеть на каждой стадии" ни разу не портит исходный LikeC4-проект.

## Ключевые риски

1. **Качество entity matching (главный риск продукта)** — многоступенчато: lexical/fuzzy → embedding similarity → LLM-подтверждение с confidence; низкий confidence → обязательный вопрос пользователю, не автоматическое решение. Golden-test регрессия с Milestone 6.
2. **Repair-зацикливание** — жёсткий cap попыток, точечная перегенерация, explicit stop вместо тихого применения невалидного кода.
3. **Стоимость/латентность LLM** — retrieval+BFS-slice вместо полного графа, кэш эмбеддингов, usage/cost tracking по стадиям в истории.
4. **Разбор Confluence Server storage-format** — поддержать конечный список макросов явно, деградация в plain-text с warning для остального; тестировать на реальной странице целевого Confluence как можно раньше (Milestone 4).
5. **Безопасное хранение secrets** — OS keychain либо зашифрованный локальный файл, redaction в логах, секреты никогда не идут в LLM prompt/error message; CI-проверка на утечку тестового секрета.
6. **Конкурентная запись файлов при Apply** — atomic write+rename, автоматический rollback при частичном сбое записи, project-level mutex, проверка hash файлов перед Apply (не перезаписывать чужие правки молча).
7. **Нестабильность программного API `likec4` между версиями** — вся интеграция изолирована в `likec4-adapter`, contract задокументирован отдельно; ранний spike фиксирует реальные возможности API.

## Критические файлы для старта реализации

- `packages/core-domain/src/ports/*.ts` — все контракты, фундамент для остального кода.
- `packages/core-pipeline/src/orchestrator.ts` + `src/stages/*.ts` — стейт-машина 19 стадий, самый архитектурно рискованный компонент.
- `packages/likec4-adapter/src/*` — обёртка над likec4 npm; требует раннего spike.
- `packages/change-engine/src/entity-matching.ts`, `architecture-rules-engine.ts` — качество matching/дубликатов — определяет доверие к продукту.
- `packages/context-builder/*` — retrieval-стратегия минимального контекста.

## Проверка (verification)

- **Milestone 1:** реальный тестовый LikeC4-проект (несколько `.c4` файлов) — граф строится, диагностики Langium транслируются, `renderViewsPreview` отдаёт SVG.
- **Milestone 2:** UI создание проекта на локальной папке → просмотр графа; snapshot create/restore — побайтовое сравнение файлов до/после.
- **Milestone 4:** реальная (или тестовая self-hosted) Confluence Server страница с таблицами/code-blocks + реальный Bitbucket Server репозиторий — сверить извлечённый контент вручную.
- **Milestone 6-9:** golden-test фикстуры для entity matching (текст требования + модель → ожидаемый match/no-match), намеренно "сломанный"/неоднозначный тест-кейс для repair-цикла.
- **Milestone 10:** полный сквозной прогон New Architecture Task → Questions → Proposal → Diff → Preview → Apply → Rollback на тестовом проекте с реальной Confluence-страницей и реальной LikeC4-моделью — это и есть критерий успеха MVP из ТЗ (раздел 24).
- **Milestone 12:** сценарий обрыва процесса/сети на каждой из 19 стадий — исходный репозиторий должен остаться нетронутым или откатываемым в каждом случае.
- Везде, где применимо — unit-тесты на детерминированные части (parsing, rule-engine, snapshot/restore, context slicing) и integration-тесты на связку adapter+pipeline stage.
