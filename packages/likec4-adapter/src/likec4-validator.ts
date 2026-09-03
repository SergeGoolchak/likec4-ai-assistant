import type { LikeC4Validator, RenderedView, RepositoryFile, TechnicalValidationResult, ViewId } from '@likec4-ai/core-domain';
import { LikeC4 } from 'likec4';
import { collectDiagnostics } from './diagnostics.js';
import { withTempWorkspace } from './temp-workspace.js';

export class LikeC4NpmValidator implements LikeC4Validator {
  async validateTechnical(files: RepositoryFile[]): Promise<TechnicalValidationResult> {
    return withTempWorkspace(files, async (workspacePath) => {
      const instance = await LikeC4.fromWorkspace(workspacePath, { printErrors: false, logger: false });
      const diagnostics = collectDiagnostics(instance, workspacePath);
      return { ok: diagnostics.length === 0, diagnostics };
    });
  }

  async renderViewsPreview(files: RepositoryFile[], viewIds?: ViewId[]): Promise<RenderedView[]> {
    return withTempWorkspace(files, async (workspacePath) => {
      const instance = await LikeC4.fromWorkspace(workspacePath, { printErrors: false, logger: false });
      // WASM graphviz produces real SVG directly — no headless browser needed
      // (see explain.md, Milestone 1: this replaces the earlier assumption
      // that Preview would require Playwright, based on the CLI's own
      // dependency list rather than the programmatic API actually used here).
      const rendered = await instance.viewsService.viewsAsGraphvizOut();
      const filtered = viewIds ? rendered.filter((view) => viewIds.includes(view.id)) : rendered;
      return filtered.map((view) => ({ viewId: view.id, svg: view.svg }));
    });
  }
}
