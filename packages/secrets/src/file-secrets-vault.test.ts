import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSecretsVault } from './file-secrets-vault.js';

async function withTempVault(fn: (vault: FileSecretsVault, dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'likec4-ai-secrets-'));
  try {
    const vault = new FileSecretsVault({
      secretsFilePath: join(dir, 'data', 'secrets.enc'),
      keyFilePath: join(dir, 'key', 'vault.key'),
    });
    await fn(vault, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('stores and retrieves a secret', async () => {
  await withTempVault(async (vault) => {
    await vault.set('confluence.pat', 'super-secret-token');
    assert.equal(await vault.get('confluence.pat'), 'super-secret-token');
    assert.deepEqual(await vault.list(), ['confluence.pat']);
  });
});

test('deletes a secret', async () => {
  await withTempVault(async (vault) => {
    await vault.set('a', '1');
    await vault.delete('a');
    assert.equal(await vault.get('a'), undefined);
  });
});

test('the secret value never appears in plaintext on disk', async () => {
  await withTempVault(async (vault, dir) => {
    const secretValue = 'super-secret-token-xyz';
    await vault.set('confluence.pat', secretValue);
    const onDisk = await readFile(join(dir, 'data', 'secrets.enc'), 'utf8');
    assert.equal(onDisk.includes(secretValue), false);
  });
});

test('a failed write (Milestone 12: temp+rename) never corrupts an already-stored secret', async () => {
  await withTempVault(async (vault, dir) => {
    await vault.set('a', '1');
    const dataDir = join(dir, 'data');
    const before = await readFile(join(dataDir, 'secrets.enc'), 'utf8');

    // Директория без права записи — writeFile временного файла (или последующий rename)
    // упадёт, эмулируя обрыв процесса/диска посреди записи, без моков fs.
    await chmod(dataDir, 0o500);
    try {
      await assert.rejects(() => vault.set('b', '2'));
    } finally {
      await chmod(dataDir, 0o700);
    }

    const after = await readFile(join(dataDir, 'secrets.enc'), 'utf8');
    assert.equal(after, before, 'secrets.enc must be byte-for-byte unchanged after a failed write');
    assert.equal(await vault.get('a'), '1', 'previously stored secret must still be readable');
    assert.equal(await vault.get('b'), undefined, 'the failed write must not have partially applied');

    const leftoverTempFiles = (await readdir(dataDir)).filter((name) => name.includes('.tmp-'));
    assert.deepEqual(leftoverTempFiles, [], 'no leftover temp file after cleanup');
  });
});

test('the encryption key file is separate from the secrets file', async () => {
  await withTempVault(async (vault, dir) => {
    await vault.set('a', '1');
    const keyPath = join(dir, 'key', 'vault.key');
    const secretsPath = join(dir, 'data', 'secrets.enc');
    assert.notEqual(keyPath, secretsPath);
    await assert.doesNotReject(readFile(keyPath));
    await assert.doesNotReject(readFile(secretsPath));
  });
});
