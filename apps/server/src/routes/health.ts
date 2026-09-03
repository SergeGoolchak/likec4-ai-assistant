import type { FastifyInstance } from 'fastify';
import type { AppContainer } from '../composition-root.js';

export async function registerHealthRoute(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.get('/api/health', async () => ({
    status: 'ok',
    dataDir: container.config.dataDir,
    time: new Date().toISOString(),
  }));
}
