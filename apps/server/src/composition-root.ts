import { FileSecretsVault } from '@likec4-ai/secrets';
import { LikeC4NpmParser, LikeC4NpmValidator } from '@likec4-ai/likec4-adapter';
import { LocalRepositoryAdapter } from '@likec4-ai/repo-local-adapter';
import { ConfluenceServerAdapter } from '@likec4-ai/confluence-adapter';
import { OpenAILLMProvider, OpenAIEmbeddingProvider } from '@likec4-ai/llm-openai';
import { LLMChangeEngine } from '@likec4-ai/change-engine';
import { LLMProposalGenerator } from '@likec4-ai/proposal-generator';
import {
  openDatabase,
  SqliteProjectStore,
  FsSnapshotStore,
  SqliteArchitectureRuleStore,
  SqliteSessionHistoryStore,
} from '@likec4-ai/persistence';
import { PipelineOrchestrator } from '@likec4-ai/core-pipeline';
import type {
  ArchitectureRuleStore,
  ChangeEngine,
  ConfluenceAdapter,
  EmbeddingProvider,
  LikeC4Parser,
  LikeC4Validator,
  LLMProvider,
  ProjectStore,
  ProposalGenerator,
  RepositoryAdapter,
  SecretsVault,
  SessionHistoryStore,
  SnapshotStore,
} from '@likec4-ai/core-domain';
import type { AppConfig } from './config.js';
import { createTechnicalLogger, createUserFacingLogger, type TechnicalLogger, type UserFacingLogger } from './logger.js';
import { SessionEventBus } from './session-events.js';

/**
 * Здесь один раз собирается всё, что нужно остальной части сервера.
 * Роуты и стадии pipeline видят только AppContainer и никогда не создают
 * адаптеры напрямую.
 */
export interface AppContainer {
  config: AppConfig;
  secretsVault: SecretsVault;
  technicalLogger: TechnicalLogger;
  userFacingLogger: UserFacingLogger;
  likec4Parser: LikeC4Parser;
  likec4Validator: LikeC4Validator;
  projectStore: ProjectStore;
  snapshotStore: SnapshotStore;
  architectureRuleStore: ArchitectureRuleStore;
  sessionHistoryStore: SessionHistoryStore;
  sessionEvents: SessionEventBus;
  pipelineOrchestrator: PipelineOrchestrator;
  /** Единственное место, создающее адаптеры — маршруты никогда не делают `new ...Adapter` сами. */
  createLocalRepositoryAdapter(rootDir: string): RepositoryAdapter;
  createConfluenceAdapter(options: { baseUrl: string; token: string }): ConfluenceAdapter;
  createLLMProvider(options: { apiKey?: string; model?: string; baseUrl?: string }): LLMProvider;
  createEmbeddingProvider(options: { apiKey?: string; baseUrl?: string }): EmbeddingProvider;
  createChangeEngine(llmProvider: LLMProvider): ChangeEngine;
  createProposalGenerator(llmProvider: LLMProvider): ProposalGenerator;
}

export async function createAppContainer(config: AppConfig): Promise<AppContainer> {
  const secretsVault = new FileSecretsVault({
    secretsFilePath: config.secretsFilePath,
    keyFilePath: config.secretsKeyFilePath,
  });

  const db = await openDatabase(config.dbFilePath);

  return {
    config,
    secretsVault,
    technicalLogger: createTechnicalLogger(),
    userFacingLogger: createUserFacingLogger(),
    likec4Parser: new LikeC4NpmParser(),
    likec4Validator: new LikeC4NpmValidator(),
    projectStore: new SqliteProjectStore(db),
    snapshotStore: new FsSnapshotStore({ db, snapshotsRootDir: config.snapshotsRootDir }),
    architectureRuleStore: new SqliteArchitectureRuleStore(db),
    sessionHistoryStore: new SqliteSessionHistoryStore(db),
    sessionEvents: new SessionEventBus(),
    pipelineOrchestrator: new PipelineOrchestrator(),
    createLocalRepositoryAdapter: (rootDir: string) => new LocalRepositoryAdapter({ rootDir }),
    createConfluenceAdapter: (options) => new ConfluenceServerAdapter(options),
    // Приоритет baseUrl: настройка конкретного проекта → server-wide env override → дефолт api.openai.com внутри провайдера.
    createLLMProvider: (options) => new OpenAILLMProvider({ ...options, baseUrl: options.baseUrl ?? config.openaiBaseUrl }),
    createEmbeddingProvider: (options) => new OpenAIEmbeddingProvider({ ...options, baseUrl: options.baseUrl ?? config.openaiBaseUrl }),
    createChangeEngine: (llmProvider) => new LLMChangeEngine({ llmProvider }),
    createProposalGenerator: (llmProvider) => new LLMProposalGenerator({ llmProvider }),
  };
}
