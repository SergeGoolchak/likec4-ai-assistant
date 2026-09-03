import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './config.js';
import { createAppContainer } from './composition-root.js';
import { registerHealthRoute } from './routes/health.js';
import { registerProjectRoutes } from './routes/projects.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const config = loadConfig();
  const container = await createAppContainer(config);

  const app = Fastify({ logger: false });

  await registerHealthRoute(app, container);
  await registerProjectRoutes(app, container);

  // Продакшен (`npm start`): раздаём собранный web SPA из того же процесса
  // (ФТ28 — единый локальный процесс). В dev-режиме `npm run dev` поднимает
  // Vite отдельно с HMR и проксирует /api сюда.
  const webDist = join(__dirname, '../../web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
  }

  await app.listen({ port: config.port, host: '127.0.0.1' });
  container.userFacingLogger.info(`Server listening on http://localhost:${config.port}`);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
