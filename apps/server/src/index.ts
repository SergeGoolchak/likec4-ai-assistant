import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './config.js';
import { createAppContainer } from './composition-root.js';
import { registerHealthRoute } from './routes/health.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerArchitectureRuleRoutes } from './routes/architecture-rules.js';
import { registerConfluenceSettingsRoutes } from './routes/confluence-settings.js';
import { registerAISettingsRoutes } from './routes/ai-settings.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerQuestionRoutes } from './routes/questions.js';
import { registerProposalRoutes } from './routes/proposals.js';
import { registerApplyRoutes } from './routes/apply.js';
import { registerHistoryRoutes } from './routes/history.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const config = loadConfig();
  const container = await createAppContainer(config);

  const app = Fastify({ logger: false });

  await registerHealthRoute(app, container);
  await registerProjectRoutes(app, container);
  await registerArchitectureRuleRoutes(app, container);
  await registerConfluenceSettingsRoutes(app, container);
  await registerAISettingsRoutes(app, container);
  await registerSessionRoutes(app, container);
  await registerQuestionRoutes(app, container);
  await registerProposalRoutes(app, container);
  await registerApplyRoutes(app, container);
  await registerHistoryRoutes(app, container);

  // Продакшен (`npm start`): раздаём собранный web SPA из того же процесса
  // (ФТ28 — единый локальный процесс). В dev-режиме `npm run dev` поднимает
  // Vite отдельно с HMR и проксирует /api сюда.
  const webDist = join(__dirname, '../../web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((request, reply) => {
      // Preserve SPA deep links on refresh, without masking unknown API endpoints/assets.
      if (request.method === 'GET' && !request.url.startsWith('/api/') && request.headers.accept?.includes('text/html')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: { id: 'route.not-found', title: 'Адрес не найден', likelyCause: 'Такого адреса нет в приложении.', suggestedAction: 'Вернитесь к проектам.', retryable: false } });
    });
  }

  await app.listen({ port: config.port, host: '127.0.0.1' });
  container.userFacingLogger.info(`Server listening on http://localhost:${config.port}`);
}

main().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
