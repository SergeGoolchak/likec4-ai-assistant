import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ArchitectureRule, UserFacingError } from '@likec4-ai/core-domain';
import type { AppContainer } from '../composition-root.js';

interface RuleBody {
  title?: string;
  description?: string;
  appliesToKinds?: string[];
  requiredMetadata?: string[];
  namingConventionPattern?: string;
  examples?: string[];
  severity?: 'must' | 'should';
}

export async function registerArchitectureRuleRoutes(app: FastifyInstance, container: AppContainer): Promise<void> {
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/architecture-rules', async (request) => {
    return container.architectureRuleStore.list(request.params.projectId);
  });

  app.post<{ Params: { projectId: string }; Body: RuleBody }>(
    '/api/projects/:projectId/architecture-rules',
    async (request, reply) => {
      const validation = validateRuleBody(request.body ?? {});
      if (!validation.ok) return sendError(reply, 400, validation.error);

      const rule: ArchitectureRule = { id: randomUUID(), ...validation.value };
      await container.architectureRuleStore.create(request.params.projectId, rule);
      reply.code(201);
      return rule;
    },
  );

  app.patch<{ Params: { projectId: string; ruleId: string }; Body: RuleBody }>(
    '/api/projects/:projectId/architecture-rules/:ruleId',
    async (request, reply) => {
      const body = request.body ?? {};
      const patch: Partial<ArchitectureRule> = {};
      if (body.title !== undefined) patch.title = body.title;
      if (body.description !== undefined) patch.description = body.description;
      if (body.appliesToKinds !== undefined) patch.appliesToKinds = body.appliesToKinds;
      if (body.requiredMetadata !== undefined) patch.requiredMetadata = body.requiredMetadata;
      if (body.namingConventionPattern !== undefined) patch.namingConventionPattern = body.namingConventionPattern;
      if (body.examples !== undefined) patch.examples = body.examples;
      if (body.severity !== undefined) patch.severity = body.severity;

      try {
        await container.architectureRuleStore.update(request.params.projectId, request.params.ruleId, patch);
      } catch {
        return sendError(reply, 404, ruleNotFoundError(request.params.ruleId));
      }
      const rules = await container.architectureRuleStore.list(request.params.projectId);
      return rules.find((r) => r.id === request.params.ruleId) ?? null;
    },
  );

  app.delete<{ Params: { projectId: string; ruleId: string } }>(
    '/api/projects/:projectId/architecture-rules/:ruleId',
    async (request, reply) => {
      await container.architectureRuleStore.delete(request.params.projectId, request.params.ruleId);
      reply.code(204);
    },
  );
}

type RuleValidation = { ok: true; value: Omit<ArchitectureRule, 'id'> } | { ok: false; error: UserFacingError };

function validateRuleBody(body: RuleBody): RuleValidation {
  if (!body.title?.trim()) return { ok: false, error: missingFieldError('title', 'название правила') };
  if (!body.description?.trim()) return { ok: false, error: missingFieldError('description', 'описание правила') };
  if (!body.appliesToKinds?.length) return { ok: false, error: missingFieldError('appliesToKinds', 'применимые kind элементов') };
  if (body.severity !== 'must' && body.severity !== 'should') {
    return { ok: false, error: missingFieldError('severity', 'важность правила (must/should)') };
  }

  return {
    ok: true,
    value: {
      title: body.title.trim(),
      description: body.description.trim(),
      appliesToKinds: body.appliesToKinds,
      requiredMetadata: body.requiredMetadata,
      namingConventionPattern: body.namingConventionPattern,
      examples: body.examples,
      severity: body.severity,
    },
  };
}

function sendError(reply: FastifyReply, status: number, error: UserFacingError) {
  reply.code(status);
  return { error };
}

function missingFieldError(field: string, humanLabel: string): UserFacingError {
  return {
    id: `architecture-rules.missing-field.${field}`,
    title: 'Не заполнено обязательное поле',
    likelyCause: `Поле "${humanLabel}" пустое или некорректно.`,
    suggestedAction: `Укажите ${humanLabel} и попробуйте снова.`,
    retryable: true,
  };
}

function ruleNotFoundError(ruleId: string): UserFacingError {
  return {
    id: 'architecture-rules.not-found',
    title: 'Правило не найдено',
    likelyCause: `Правило с id "${ruleId}" не существует или было удалено.`,
    suggestedAction: 'Обновите страницу и попробуйте снова.',
    retryable: true,
  };
}
