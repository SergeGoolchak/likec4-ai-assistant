/**
 * Только локальный репозиторий на этом этапе (Milestone 2). Поля под
 * Confluence, Bitbucket и AI provider появятся в моделях, когда до них
 * дойдёт очередь по roadmap (Milestone 4/6) — заводить их сейчас как
 * необязательные заглушки означало бы проектировать под гипотетические
 * требования раньше, чем они реально нужны.
 */
export interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  localRepositoryPath: string;
  createdAt: string;
  lastAnalysisAt?: string;
  lastModifiedAt?: string;
}
