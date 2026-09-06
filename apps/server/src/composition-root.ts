import { FileSecretsVault } from '@likec4-ai/secrets';
import { LikeC4NpmParser, LikeC4NpmValidator } from '@likec4-ai/likec4-adapter';
import { LocalRepositoryAdapter } from '@likec4-ai/repo-local-adapter';
import { ConfluenceServerAdapter } from '@likec4-ai/confluence-adapter';
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
  ConfluenceAdapter,
  LikeC4Parser,
  LikeC4Validator,
  ProjectStore,
  RepositoryAdapter,
  SecretsVault,
  SessionHistoryStore,
  SnapshotStore,
} from '@likec4-ai/core-domain';
import type { AppConfig } from './config.js';
import { createTechnicalLogger, createUserFacingLogger, type TechnicalLogger, type UserFacingLogger } from './logger.js';
import { SessionEventBus } from './session-events.js';

/**
 * Здесь один раз собирается всё, что нужно остальной части сервера. Адаптеры,
 * добавляемые в следующих milestones (LLMProvider, ...), подключаются в этой
 * же функции — роуты и стадии pipeline видят только AppContainer и никогда
 * не создают адаптеры напрямую.
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
  };
}
