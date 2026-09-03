import { homedir } from 'node:os';
import { join } from 'node:path';

export interface AppConfig {
  port: number;
  dataDir: string;
  secretsFilePath: string;
  /**
   * Намеренно НЕ внутри dataDir — ключ шифрования не должен лежать рядом
   * с шифротекстом, который он защищает (риск №5 из плана).
   */
  secretsKeyFilePath: string;
}

export function loadConfig(): AppConfig {
  const dataDir = process.env.LIKEC4_AI_DATA_DIR ?? join(homedir(), '.likec4-ai');
  const keyDir = process.env.LIKEC4_AI_KEY_DIR ?? join(homedir(), '.likec4-ai-key');
  return {
    port: Number(process.env.PORT ?? 4000),
    dataDir,
    secretsFilePath: join(dataDir, 'secrets.enc'),
    secretsKeyFilePath: join(keyDir, 'vault.key'),
  };
}
