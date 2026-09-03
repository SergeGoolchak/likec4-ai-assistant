/** Общие примитивные типы, используемые портами и стадиями pipeline. */

export type ElementId = string;
export type RelationshipId = string;
export type ViewId = string;

export interface SourceLocation {
  file: string;
  startLine: number;
  endLine: number;
}

export interface RepositoryFile {
  /** Путь относительно корня LikeC4-проекта. */
  path: string;
  content: string;
  /** Присутствует, если адаптер может его предоставить (например, blob sha в Bitbucket) для optimistic concurrency. */
  sha?: string;
}

/**
 * Любая ошибка, показываемая в UI, обязана иметь именно эту форму — никогда
 * сырое исключение, stack trace или голый HTTP-статус. См. раздел плана
 * "Frontend" / требование ФТ: никаких "Error 500" / "Something went wrong".
 */
export interface UserFacingError {
  id: string;
  title: string;
  likelyCause: string;
  suggestedAction: string;
  retryable: boolean;
  helpTopicId?: string;
}
