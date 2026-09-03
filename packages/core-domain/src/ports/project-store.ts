import type { ProjectRecord } from '../models/project.js';

export interface ProjectStore {
  create(project: ProjectRecord): Promise<void>;
  get(id: string): Promise<ProjectRecord | null>;
  list(): Promise<ProjectRecord[]>;
  update(id: string, patch: Partial<ProjectRecord>): Promise<void>;
  delete(id: string): Promise<void>;
}
