import type { PipelineStageDef } from '../stage.js';

/**
 * Стадия 10 — гейт, а не вычисление: pipeline физически возвращает управление
 * UI и ждёт ответа на вопросы, поднятые стадией 9, вместо того чтобы блокировать
 * процесс внутри `run()`. `isDone` смотрит на статусы вопросов, уже посчитанных
 * ambiguity-detection — отдельного собственного вывода у этой стадии нет.
 */
export const userClarificationStage: PipelineStageDef = {
  id: 'user-clarification',
  label: 'Ожидание уточнений от пользователя',
  isDone: (outputs) => (outputs.ambiguities ?? []).every((q) => q.status !== 'open'),
  isGate: true,
  async run() {
    // Никогда фактически не вызывается: пока isDone() false, оркестратор перехватывает
    // стадию как гейт раньше, чем дошёл бы до run() (см. PipelineStageDef.isGate).
    return {};
  },
};
