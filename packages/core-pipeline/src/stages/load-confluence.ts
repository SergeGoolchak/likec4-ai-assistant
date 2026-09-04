import type { PipelineStageDef } from '../stage.js';

export const loadConfluenceStage: PipelineStageDef = {
  id: 'load-confluence',
  label: 'Чтение Confluence',
  isDone: (outputs) => outputs.confluenceContent !== undefined,
  async run(_state, { session, ports }) {
    const content = await ports.confluenceAdapter.fetchPage(session.confluenceRef);
    return { confluenceContent: content };
  },
};
