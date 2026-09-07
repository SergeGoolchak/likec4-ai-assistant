import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import type { RepositoryAdapter, RepositoryFile, UserFacingError } from '@likec4-ai/core-domain';

const execFileAsync = promisify(execFile);

const LIKEC4_EXTENSIONS = ['.c4', '.likec4'];
const EXCLUDED_DIR_NAMES = new Set(['node_modules', '.git']);

/**
 * Read-write adapter over a plain local folder — no VCS assumed. `writeFiles`
 * is two-phase (write every file to a sibling temp path first, only then
 * rename all of them into place) so a mid-batch failure never leaves a
 * partially-overwritten real file — see plan risk #6.
 */
export class LocalRepositoryAdapter implements RepositoryAdapter {
  readonly kind = 'local' as const;
  #rootDir: string;

  constructor(options: { rootDir: string }) {
    this.#rootDir = options.rootDir;
  }

  async testConnection(): Promise<{ ok: boolean; error?: UserFacingError }> {
    try {
      const info = await stat(this.#rootDir);
      if (!info.isDirectory()) {
        return { ok: false, error: notADirectoryError(this.#rootDir) };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: directoryNotFoundError(this.#rootDir) };
    }
  }

  async listLikeC4Files(): Promise<string[]> {
    const found: string[] = [];
    await walk(this.#rootDir, this.#rootDir, found);
    return found.sort();
  }

  async readFile(path: string): Promise<RepositoryFile> {
    const content = await readFile(join(this.#rootDir, path), 'utf8');
    return { path, content };
  }

  async readAll(): Promise<RepositoryFile[]> {
    const paths = await this.listLikeC4Files();
    return Promise.all(paths.map((path) => this.readFile(path)));
  }

  async writeFiles(files: RepositoryFile[]): Promise<void> {
    const staged: Array<{ tempPath: string; finalPath: string }> = [];
    try {
      for (const file of files) {
        const finalPath = join(this.#rootDir, file.path);
        const tempPath = `${finalPath}.tmp-${randomUUID()}`;
        await mkdir(dirname(finalPath), { recursive: true });
        await writeFile(tempPath, file.content, 'utf8');
        staged.push({ tempPath, finalPath });
      }
      for (const { tempPath, finalPath } of staged) {
        await rename(tempPath, finalPath);
      }
    } catch (err) {
      // Best-effort cleanup of any temp files that never made it to rename.
      await Promise.all(staged.map(({ tempPath }) => rm(tempPath, { force: true }).catch(() => undefined)));
      throw err;
    }
  }

  async deleteFiles(paths: string[]): Promise<void> {
    await Promise.all(paths.map((path) => rm(join(this.#rootDir, path), { force: true })));
  }

  async getRevisionInfo(): Promise<{ branch?: string; commit?: string; capturedAt: string }> {
    const capturedAt = new Date().toISOString();
    try {
      const [branch, commit] = await Promise.all([
        execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: this.#rootDir }),
        execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: this.#rootDir }),
      ]);
      return { branch: branch.stdout.trim(), commit: commit.stdout.trim(), capturedAt };
    } catch {
      // Not a git repository, or git is unavailable — ФТ5 only requires this for Bitbucket-backed projects.
      return { capturedAt };
    }
  }
}

async function walk(dir: string, rootDir: string, found: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
      await walk(join(dir, entry.name), rootDir, found);
    } else if (LIKEC4_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      found.push(relative(rootDir, join(dir, entry.name)));
    }
  }
}

function directoryNotFoundError(path: string): UserFacingError {
  return {
    id: 'local-repo.directory-not-found',
    title: 'Указанная папка не найдена',
    likelyCause: `Папка "${path}" не существует или недоступна для чтения.`,
    suggestedAction: 'Проверьте путь в настройках проекта и права доступа к папке.',
    retryable: true,
  };
}

function notADirectoryError(path: string): UserFacingError {
  return {
    id: 'local-repo.not-a-directory',
    title: 'Указанный путь — не папка',
    likelyCause: `По пути "${path}" находится файл, а не директория.`,
    suggestedAction: 'Укажите путь до папки с LikeC4-проектом.',
    retryable: true,
  };
}
