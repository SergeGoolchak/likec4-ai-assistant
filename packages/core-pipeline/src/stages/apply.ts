import type { PipelineStageDef } from '../stage.js';

/**
 * Стадия 19 — гейт, как user-review (12): pipeline ждёт явного действия
 * пользователя (кнопка Apply), а не что-то вычисляет сама. `run()` фактически
 * никогда не вызывается — вся реальная работа (hash-check, snapshot,
 * project-level mutex, атомарная запись) происходит в
 * `apps/server/src/routes/apply.ts`, не здесь: Apply физически не нуждается
 * ни в LLM, ни в Confluence, только в RepositoryAdapter/SnapshotStore,
 * которые роут берёт напрямую из AppContainer — гонять через
 * buildOrchestratorPorts/PipelineOrchestrator.run() ради этого не нужно.
 */
export const applyStage: PipelineStageDef = {
  id: 'apply',
  label: 'Применение изменений',
  isDone: (outputs) => outputs.applyResult !== undefined,
  isGate: true,
  async run() {
    // Никогда фактически не вызывается — см. doc comment выше и user-review.ts.
    return {};
  },
};
