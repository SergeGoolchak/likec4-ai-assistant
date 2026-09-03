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
- `packages/core-domain` — доменные модели и порты (интерфейсы), от которых зависит весь остальной код. Технологии-адаптеры (LLM, Confluence, Bitbucket, LikeC4 parser) появятся в `packages/*` по мере прохождения milestones.
- `packages/secrets` — локальное шифрованное хранилище API-ключей/токенов.

## Проверка

```bash
npm run typecheck
npm run test
```
