import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LikeC4Diagnostic } from '@likec4-ai/core-domain';
import type { LikeC4 } from 'likec4';

/**
 * `LikeC4.getErrors()` is the only diagnostics accessor the public façade
 * exposes — there is no separate warnings list. Everything it returns is
 * therefore mapped as severity 'error'. Acceptable for now: ФТ17 mainly
 * requires that invalid code cannot reach Apply, which errors alone cover;
 * surfacing warnings too is a refinement for later, not a blocker.
 */
export function collectDiagnostics(instance: LikeC4, workspacePath: string): LikeC4Diagnostic[] {
  return instance.getErrors().map((err) => ({
    severity: 'error',
    message: err.message,
    file: toRelativePath(err.sourceFsPath, workspacePath),
    range: { startLine: err.range.start.line, endLine: err.range.end.line },
  }));
}

function toRelativePath(sourceFsPath: string, workspacePath: string): string {
  const fsPath = sourceFsPath.startsWith('file://') ? fileURLToPath(sourceFsPath) : sourceFsPath;
  return relative(workspacePath, fsPath);
}
