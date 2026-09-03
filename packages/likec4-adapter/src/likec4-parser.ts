import { relative } from 'node:path';
import type { LikeC4Parser, LikeC4ParseResult, RepositoryFile } from '@likec4-ai/core-domain';
import { LikeC4 } from 'likec4';
import { buildArchitectureGraph } from './build-architecture-graph.js';
import { collectDiagnostics } from './diagnostics.js';
import { withTempWorkspace } from './temp-workspace.js';

/** Thin wrapper over the official `likec4` package — see explain.md, Milestone 1, for the API spike behind this. */
export class LikeC4NpmParser implements LikeC4Parser {
  async parseProject(files: RepositoryFile[]): Promise<LikeC4ParseResult> {
    return withTempWorkspace(files, async (workspacePath) => {
      const instance = await LikeC4.fromWorkspace(workspacePath, { printErrors: false, logger: false });
      const [graph, diagnostics] = await Promise.all([
        buildArchitectureGraph(instance, workspacePath),
        Promise.resolve(collectDiagnostics(instance, workspacePath)),
      ]);
      const sourceFiles = instance.documentPaths().map((path) => relative(workspacePath, path));
      return { graph, diagnostics, sourceFiles };
    });
  }
}
