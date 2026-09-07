import { NavLink } from 'react-router-dom';
import type { SessionView } from '../api/types';

export function TaskNavigation({ session }: { session: SessionView }) {
  const base = `/sessions/${session.id}`;
  const steps = [
    { label: 'Анализ', to: base, enabled: true },
    { label: 'Решения', to: `${base}/proposal`, enabled: Boolean(session.proposal) },
    { label: 'Изменения', to: `${base}/diff`, enabled: session.diff !== undefined },
    { label: 'Диаграммы', to: `${base}/preview`, enabled: session.previewViews !== undefined },
    { label: session.applyResult ? 'Результат' : 'Применение', to: `${base}/apply`, enabled: session.currentStage === 'apply' || Boolean(session.applyResult) },
  ];
  return <nav aria-label="Разделы задачи" className="task-nav">
    {steps.map((step) => step.enabled
      ? <NavLink key={step.to} end to={step.to} className={({ isActive }) => isActive ? 'task-tab active' : 'task-tab'}>{step.label}</NavLink>
      : <span key={step.to} aria-disabled="true" title="Будет доступно после завершения предыдущих этапов" className="task-tab disabled">{step.label}</span>)}
  </nav>;
}
