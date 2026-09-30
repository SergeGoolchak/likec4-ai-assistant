import { randomBytes, createCipheriv, createDecipheriv, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SecretsVault } from '@likec4-ai/core-domain';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;

interface EncryptedBlob {
  iv: string;
  tag: string;
  data: string;
}

/**
 * Локальное хранилище секретов уровня MVP: зашифрованный AES-256-GCM JSON
 * blob, ключ шифрования хранится в *другом* файле, чем шифротекст (риск №5
 * из плана — "не хранить ключ шифрования рядом с зашифрованными
 * данными"). Это защищает от случайного чтения одного из файлов в отрыве
 * от другого, но не от атакующего с полным доступом к машине — интеграция
 * с OS keychain является естественным следующим шагом и не требует менять
 * код, использующий этот класс, — только заменить реализацию за портом
 * SecretsVault.
 */
export class FileSecretsVault implements SecretsVault {
  #secretsFilePath: string;
  #keyFilePath: string;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: { secretsFilePath: string; keyFilePath: string }) {
    this.#secretsFilePath = options.secretsFilePath;
    this.#keyFilePath = options.keyFilePath;
  }

  async get(key: string): Promise<string | undefined> {
    return this.#enqueue(async () => {
      const store = await this.#readStore();
      return store[key];
    });
  }

  async set(key: string, value: string): Promise<void> {
    await this.#enqueue(async () => {
      const store = await this.#readStore();
      store[key] = value;
      await this.#writeStore(store);
    });
  }

  async delete(key: string): Promise<void> {
    await this.#enqueue(async () => {
      const store = await this.#readStore();
      delete store[key];
      await this.#writeStore(store);
    });
  }

  async list(): Promise<string[]> {
    return this.#enqueue(async () => {
      const store = await this.#readStore();
      return Object.keys(store);
    });
  }

  /** Сериализует все операции, чтобы конкурентные вызовы не гонялись за read-modify-write. */
  #enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(fn);
    // Гасим отказы прямо в цепочке, чтобы одна неудачная операция не блокировала очередь навсегда.
    this.#queue = result.catch(() => undefined);
    return result;
  }

  async #getOrCreateKey(): Promise<Buffer> {
    try {
      return await readFile(this.#keyFilePath);
    } catch {
      const key = randomBytes(KEY_LENGTH);
      await mkdir(dirname(this.#keyFilePath), { recursive: true, mode: 0o700 });
      await writeFile(this.#keyFilePath, key, { mode: 0o600 });
      await chmod(this.#keyFilePath, 0o600).catch(() => undefined);
      return key;
    }
  }

  async #readStore(): Promise<Record<string, string>> {
    let raw: string;
    try {
      raw = await readFile(this.#secretsFilePath, 'utf8');
    } catch {
      return {};
    }
    const blob = JSON.parse(raw) as EncryptedBlob;
    const key = await this.#getOrCreateKey();
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(blob.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as Record<string, string>;
  }

  /**
   * Temp-write-then-rename (Milestone 12, риск №6/№5 пересекаются здесь) — тот же паттерн, что и
   * `LocalRepositoryAdapter.writeFiles`: убийство процесса посреди записи не может оставить
   * `secrets.enc` обрезанным/повреждённым, так как `rename` — атомарная операция на той же ФС, а
   * до неё существующий файл вообще не трогается.
   */
  async #writeStore(store: Record<string, string>): Promise<void> {
    const key = await this.#getOrCreateKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(store), 'utf8'), cipher.final()]);
    const blob: EncryptedBlob = {
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64'),
    };
    await mkdir(dirname(this.#secretsFilePath), { recursive: true, mode: 0o700 });
    const tempPath = `${this.#secretsFilePath}.tmp-${randomUUID()}`;
    try {
      await writeFile(tempPath, JSON.stringify(blob), { mode: 0o600 });
      await rename(tempPath, this.#secretsFilePath);
    } catch (err) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw err;
    }
  }
}
