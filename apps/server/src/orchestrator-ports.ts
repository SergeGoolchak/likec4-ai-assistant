import type { OrchestratorPorts } from '@likec4-ai/core-pipeline';
import type {
  ArchitecturalReviewer,
  ArchitectureRuleStore,
  ChangeEngine,
  ConfluenceAdapter,
  LikeC4Parser,
  LikeC4Validator,
  LLMProvider,
  ProjectRecord,
  ProposalGenerator,
  RepositoryAdapter,
  UserFacingError,
} from '@likec4-ai/core-domain';
import type { AppContainer } from './composition-root.js';

/**
 * Порты, реально нужные для запуска/возобновления pipeline — в отличие от
 * `OrchestratorPorts` (где LLM-зависимые поля опциональны ради тестируемости
 * стадий 1-5 без AI provider вообще), здесь они обязательны: это единственное
 * место, которое действительно готовит сессию к `PipelineOrchestrator.run()`.
 */
export interface FullOrchestratorPorts extends OrchestratorPorts {
  confluenceAdapter: ConfluenceAdapter;
  repositoryAdapter: RepositoryAdapter;
  likec4Parser: LikeC4Parser;
  llmProvider: LLMProvider;
  changeEngine: ChangeEngine;
  proposalGenerator: ProposalGenerator;
  likec4Validator: LikeC4Validator;
  architecturalReviewer: ArchitecturalReviewer;
  architectureRuleStore: ArchitectureRuleStore;
}

export type BuildOrchestratorPortsResult = { ok: true; ports: FullOrchestratorPorts } | { ok: false; error: UserFacingError };

/**
 * И запуск новой сессии (`POST /sessions`), и возобновление после ответа на
 * вопрос (`POST /questions/:id/answer`) нуждаются в одном и том же наборе
 * адаптеров, собранном из одних и тех же секретов и настроек проекта — вынесено
 * сюда, чтобы не дублировать эту сборку (и её проверки) в каждом роуте отдельно.
 */
export async function buildOrchestratorPorts(container: AppContainer, project: ProjectRecord): Promise<BuildOrchestratorPortsResult> {
  if (!project.confluenceBaseUrl) return { ok: false, error: confluenceNotConfiguredError() };
  const confluenceToken = await container.secretsVault.get(`confluence.pat.${project.id}`);
  if (!confluenceToken) return { ok: false, error: confluenceNotConfiguredError() };

  // "Настроено" = хотя бы раз прошёл тест подключения (см. ai-settings.ts) — не наличие ключа:
  // локальным OpenAI-совместимым серверам ключ часто не нужен вовсе.
  if (project.aiModel === undefined) return { ok: false, error: aiNotConfiguredError() };
  const openaiApiKey = await container.secretsVault.get(`openai.api-key.${project.id}`);

  const repositoryAdapter = container.createLocalRepositoryAdapter(project.localRepositoryPath);
  const repoConnection = await repositoryAdapter.testConnection();
  if (!repoConnection.ok) return { ok: false, error: repoConnection.error ?? confluenceNotConfiguredError() };

  const confluenceAdapter = container.createConfluenceAdapter({ baseUrl: project.confluenceBaseUrl, token: confluenceToken });
  const llmProvider = container.createLLMProvider({ apiKey: openaiApiKey, model: project.aiModel, baseUrl: project.aiBaseUrl });
  const changeEngine = container.createChangeEngine(llmProvider);
  const proposalGenerator = container.createProposalGenerator(llmProvider);

  return {
    ok: true,
    ports: {
      confluenceAdapter,
      repositoryAdapter,
      likec4Parser: container.likec4Parser,
      llmProvider,
      changeEngine,
      proposalGenerator,
      likec4Validator: container.likec4Validator,
      architecturalReviewer: container.architecturalReviewer,
      architectureRuleStore: container.architectureRuleStore,
    },
  };
}

function confluenceNotConfiguredError(): UserFacingError {
  return {
    id: 'sessions.confluence-not-configured',
    title: 'Confluence не подключён',
    likelyCause: 'В настройках проекта не указан адрес Confluence или не сохранён токен доступа.',
    suggestedAction: 'Откройте настройки проекта и подключите Confluence перед запуском анализа.',
    retryable: false,
    helpTopicId: 'screen.confluence-settings',
  };
}

function aiNotConfiguredError(): UserFacingError {
  return {
    id: 'sessions.ai-not-configured',
    title: 'AI-провайдер не подключён',
    likelyCause: 'В настройках проекта не сохранён OpenAI API key.',
    suggestedAction: 'Откройте настройки проекта и подключите AI-провайдера перед запуском анализа.',
    retryable: false,
    helpTopicId: 'screen.ai-settings',
  };
}
