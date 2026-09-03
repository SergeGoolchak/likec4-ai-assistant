import type { RepositoryFile, ViewId } from '../models/common.js';
import type { ArchitectureGraph } from '../models/architecture-graph.js';
import type { LikeC4Diagnostic, RenderedView, TechnicalValidationResult } from '../models/validation.js';

export interface LikeC4ParseResult {
  graph: ArchitectureGraph;
  diagnostics: LikeC4Diagnostic[];
  sourceFiles: string[];
}

/** Тонкая обёртка над официальными npm-пакетами `likec4` — без собственной грамматики/парсера LikeC4. */
export interface LikeC4Parser {
  parseProject(files: RepositoryFile[]): Promise<LikeC4ParseResult>;
}

export interface LikeC4Validator {
  /**
   * Валидирует гипотетическое слитое состояние (existing files + generated
   * fragments), удерживаемое в памяти — не должно требовать предварительной
   * записи на диск.
   */
  validateTechnical(files: RepositoryFile[]): Promise<TechnicalValidationResult>;
  renderViewsPreview(files: RepositoryFile[], viewIds?: ViewId[]): Promise<RenderedView[]>;
}
