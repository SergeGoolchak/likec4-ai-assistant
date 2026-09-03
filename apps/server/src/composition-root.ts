import { FileSecretsVault } from '@likec4-ai/secrets';
import type { SecretsVault } from '@likec4-ai/core-domain';
import type { AppConfig } from './config.js';
import { createTechnicalLogger, createUserFacingLogger, type TechnicalLogger, type UserFacingLogger } from './logger.js';

/**
 * Здесь один раз собирается всё, что нужно остальной части сервера. Адаптеры,
 * добавляемые в следующих milestones (ConfluenceAdapter, RepositoryAdapter,
 * LLMProvider, ...), подключаются в этой же функции — роуты и стадии
 * pipeline видят только AppContainer и никогда не создают адаптеры напрямую.
 */
export interface AppContainer {
  config: AppConfig;
  secretsVault: SecretsVault;
  technicalLogger: TechnicalLogger;
  userFacingLogger: UserFacingLogger;
}

export function createAppContainer(config: AppConfig): AppContainer {
  const secretsVault = new FileSecretsVault({
    secretsFilePath: config.secretsFilePath,
    keyFilePath: config.secretsKeyFilePath,
  });

  return {
    config,
    secretsVault,
    technicalLogger: createTechnicalLogger(),
    userFacingLogger: createUserFacingLogger(),
  };
}
