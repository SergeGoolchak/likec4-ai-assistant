# AI Assistant for LikeC4 Architecture

Локальный ассистент для дополнения существующей LikeC4-архитектуры на основе аналитических спецификаций из Confluence. См. полный план разработки: [docs/development-plan.md](./docs/development-plan.md).

## Требования

Node.js ≥24 (используется встроенный `node:sqlite`) — см. `.nvmrc`.

## Запуск

```bash
npm install
npm run dev
```

`npm run dev` поднимает backend (Fastify, `apps/server`, порт 4000) и web UI (Vite, `apps/web`, порт 5173, проксирует `/api` на backend) параллельно с hot-reload.

Продакшен-подобный локальный запуск одним процессом:

```bash
npm start
```

Собирает web UI и поднимает backend на `http://localhost:4000`, который сам раздаёт собранный UI.

## Структура

- `apps/server` — backend: HTTP API, SSE, оркестрация AI pipeline.
- `apps/web` — React SPA.
- `packages/core-domain` — доменные модели и порты (интерфейсы), от которых зависит весь остальной код. Остальные технологии-адаптеры появятся в `packages/*` по мере прохождения milestones.
- `packages/secrets` — локальное шифрованное хранилище API-ключей/токенов.
- `packages/likec4-adapter` — `LikeC4Parser`/`LikeC4Validator` поверх официального npm-пакета `likec4`: построение `ArchitectureGraph`, техническая валидация, рендер views в SVG.
- `packages/repo-local-adapter` — `LocalRepositoryAdapter`: чтение/атомарная запись `.c4`/`.likec4` файлов локальной папки, определение git branch/commit.
- `packages/persistence` — `SqliteProjectStore`, `FsSnapshotStore`, `SqliteArchitectureRuleStore` и `SqliteEmbeddingIndex` поверх встроенного `node:sqlite`.
- `packages/llm-openai` — `OpenAIEmbeddingProvider` (эмбеддинги для retrieval) и `OpenAILLMProvider` (chat completion, включая `completeJSON` для структурированных ответов) + `testOpenAIConnection`. Несмотря на имя, работает с любым сервером, реализующим протокол OpenAI Chat Completions — настоящим OpenAI или локальным/self-hosted (Ollama, LM Studio, vLLM, llama.cpp server и т.п.): `baseUrl` настраивается на уровне проекта, `apiKey` необязателен.
- `packages/knowledge-global` — LikeC4 Knowledge Base: стартовый контент по синтаксису в `content/`, индексируется через `EmbeddingProvider`.
- `packages/knowledge-project` — Project Knowledge Base: индексация текущей `ArchitectureGraph` + Architecture Rules проекта.
- `packages/context-builder` — `ContextBuilder`: BFS-срез `ArchitectureGraph` по seed-элементам с trim по токен-бюджету + подмешивание knowledge-чанков; первый реальный потребитель появится в Milestone 8/9 (Proposal/LikeC4 Generation).
- `packages/change-engine` — `LLMChangeEngine`: сопоставление извлечённых требований с существующими элементами архитектуры (лексический предфильтр + LLM-судья + hallucination guard), определение gap'ов и типов изменений (ФТ7 "не дублировать"), разрешение конфликтов между кандидатами.
- `packages/confluence-adapter` — `ConfluenceServerAdapter` (Server/DC, PAT) + разбор storage-format в `ConfluenceSection[]`. Пока не проверен на реальном сервере (см. explain.md).
- `packages/repo-bitbucket-adapter` — `BitbucketServerAdapter` (Server/DC, PAT, read-only): листинг/чтение файлов в заданной `likec4Directory`, определение branch/commit.
- `packages/core-pipeline` — `PipelineOrchestrator` и стадии 1-8 AI pipeline (Load Confluence → Parse Specification → Load LikeC4 → Build Architecture Graph → Extract Requirements → Entity Matching → Gap Analysis), с персистентностью после каждой стадии и естественной возобновляемостью после падения процесса.

## Проверка

```bash
npm run lint
npm run typecheck
npm run test
```

Тот же набор команд гоняется в CI на каждый push в `main` и на каждый PR (`.github/workflows/ci.yml`).

## Лицензия

MIT, см. [LICENSE](./LICENSE).
