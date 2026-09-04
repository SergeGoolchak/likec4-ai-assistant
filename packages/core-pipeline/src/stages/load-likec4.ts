import type { PipelineStageDef } from '../stage.js';

export const loadLikeC4Stage: PipelineStageDef = {
  id: 'load-likec4',
  label: 'Чтение существующей архитектуры',
  isDone: (outputs) => outputs.existingFiles !== undefined,
  async run(_state, { ports }) {
    const files = await ports.repositoryAdapter.readAll();
    return { existingFiles: files };
  },
};
