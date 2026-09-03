import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { RepositoryFile } from '@likec4-ai/core-domain';

/**
 * Materializes a hypothetical file set (existing project files + candidate
 * generated fragments) into a throwaway OS temp directory so `likec4`'s
 * workspace-based API can parse it, then deletes the directory afterwards.
 *
 * The public `likec4` package has no multi-file in-memory parse entry point
 * — `LikeC4.fromSource` only accepts a single source string, and the
 * documented way to parse a project is `LikeC4.fromWorkspace(path)`
 * (confirmed by spike in Milestone 1). A temp directory is the pragmatic
 * middle ground: it still satisfies the actual intent behind
 * `LikeC4Validator.validateTechnical` — the REAL project directory the user
 * approved is never touched before Apply — even though it is not literally
 * an in-memory operation. See explain.md, Milestone 1.
 */
export async function withTempWorkspace<T>(
  files: RepositoryFile[],
  fn: (workspacePath: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'likec4-ai-workspace-'));
  try {
    for (const file of files) {
      const filePath = join(dir, file.path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, 'utf8');
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
