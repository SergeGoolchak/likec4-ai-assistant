# AI Assistant for LikeC4 Architecture

Локальный ассистент для дополнения существующей LikeC4-архитектуры на основе аналитических спецификаций из Confluence. См. полный план разработки: [harmonic-waddling-fog.md](./harmonic-waddling-fog.md).

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
- `packages/llm-openai` — `OpenAIEmbeddingProvider` (эмбеддинги для retrieval; chat completion `LLMProvider` появится в Milestone 6).
- `packages/knowledge-global` — LikeC4 Knowledge Base: стартовый контент по синтаксису в `content/`, индексируется через `EmbeddingProvider`.
- `packages/knowledge-project` — Project Knowledge Base: индексация текущей `ArchitectureGraph` + Architecture Rules проекта.

## Проверка

```bash
npm run typecheck
npm run test
```
