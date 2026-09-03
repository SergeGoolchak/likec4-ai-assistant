import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ProjectRecord, UserFacingError } from '@likec4-ai/core-domain';
import type { AppContainer } from '../composition-root.js';

interface CreateProjectBody {
  name?: string;
  description?: string;
  localRepositoryPath?: string;
}

export async function registerProjectRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.post<{ Body: CreateProjectBody }>('/api/projects', async (request, reply) => {
    const { name, description, localRepositoryPath } = request.body ?? {};

    if (!name?.trim()) {
      return sendError(reply, 400, missingFieldError('name', 'название проекта'));
    }
    if (!localRepositoryPath?.trim()) {
      return sendError(reply, 400, missingFieldError('localRepositoryPath', 'путь к локальной папке с LikeC4-проектом'));
    }

    const adapter = container.createLocalRepositoryAdapter(localRepositoryPath);
    const connection = await adapter.testConnection();
    if (!connection.ok) {
      return sendError(reply, 400, connection.error ?? missingFieldError('localRepositoryPath', 'путь к папке'));
    }

    const project: ProjectRecord = {
      id: randomUUID(),
      name: name.trim(),
      description: description?.trim() || undefined,
      localRepositoryPath: localRepositoryPath.trim(),
      createdAt: new Date().toISOString(),
    };
    await container.projectStore.create(project);
    container.userFacingLogger.info(`Project created: ${project.name}`);

    reply.code(201);
    return project;
  });

  app.get('/api/projects', async () => {
    return container.projectStore.list();
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const project = await container.projectStore.get(request.params.id);
    if (!project) {
      return sendError(reply, 404, projectNotFoundError(request.params.id));
    }

    const adapter = container.createLocalRepositoryAdapter(project.localRepositoryPath);
    const connection = await adapter.testConnection();
    if (!connection.ok) {
      return { project, model: null, modelError: connection.error };
    }

    const files = await adapter.readAll();
    const parsed = await container.likec4Parser.parseProject(files);

    return {
      project,
      model: {
        elementCount: parsed.graph.elements.size,
        relationshipCount: parsed.graph.relationships.size,
        viewCount: parsed.graph.views.size,
        diagnostics: parsed.diagnostics,
      },
      modelError: null,
    };
  });
}

function sendError(reply: FastifyReply, status: number, error: UserFacingError) {
  reply.code(status);
  return { error };
}

function missingFieldError(field: string, humanLabel: string): UserFacingError {
  return {
    id: `projects.missing-field.${field}`,
    title: 'Не заполнено обязательное поле',
    likelyCause: `Поле "${humanLabel}" пустое.`,
    suggestedAction: `Укажите ${humanLabel} и попробуйте снова.`,
    retryable: true,
  };
}

function projectNotFoundError(id: string): UserFacingError {
  return {
    id: 'projects.not-found',
    title: 'Проект не найден',
    likelyCause: `Проект с id "${id}" не существует или был удалён.`,
    suggestedAction: 'Вернитесь к списку проектов и выберите существующий проект.',
    retryable: false,
  };
}
