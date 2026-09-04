import type { PipelineStageDef } from '../stage.js';

/**
 * Покрывает плановые стадии 4 (Parse LikeC4) и 5 (Build Architecture Graph)
 * как один шаг, а не два отдельных checkpoint'а. Причина не косметическая:
 * `LikeC4Parser.parseProject()` (см. likec4-adapter, Milestone 1) считает
 * parse и построение графа атомарно за один вызов — между ними нет
 * наблюдаемого промежуточного состояния, которое можно было бы отдельно
 * сохранить. А поскольку `isDone` в этом оркестраторе определяется по
 * наличию результата стадии в `stageOutputs`, а не по номеру шага, две
 * стадии с одним и тем же результатом (`architectureGraph`) не могут
 * корректно сосуществовать как отдельные checkpoint'ы — вторая всегда
 * выглядела бы уже выполненной сразу после первой и никогда бы не
 * получала свой собственный статус. Объединение — не срезание угла, а
 * следствие реальной атомарности библиотеки, на которую эта стадия
 * опирается.
 */
export const buildArchitectureGraphStage: PipelineStageDef = {
  id: 'build-architecture-graph',
  label: 'Построение графа архитектуры',
  isDone: (outputs) => outputs.architectureGraph !== undefined,
  async run(state, { ports }) {
    const files = state.stageOutputs.existingFiles;
    if (!files) {
      throw new Error('build-architecture-graph requires existingFiles from the load-likec4 stage');
    }
    const { graph, diagnostics } = await ports.likec4Parser.parseProject(files);
    return {
      architectureGraph: graph,
      existingModelDiagnostics: { ok: diagnostics.length === 0, diagnostics },
    };
  },
};
