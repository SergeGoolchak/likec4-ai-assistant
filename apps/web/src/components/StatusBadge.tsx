import type { PipelineStatus } from '../api/types';

const statuses: Record<PipelineStatus, { label: string; tone: string }> = {
  running: { label: 'Анализируется', tone: 'bg-blue-50 text-blue-800' },
  'paused-for-user': { label: 'Нужно решение', tone: 'bg-amber-50 text-amber-800' },
  completed: { label: 'Завершена', tone: 'bg-emerald-50 text-emerald-800' },
  failed: { label: 'Ошибка', tone: 'bg-rose-50 text-rose-800' },
  aborted: { label: 'Остановлена', tone: 'bg-slate-100 text-slate-600' },
};

export function StatusBadge({ status }: { status: PipelineStatus }) {
  const { label, tone } = statuses[status];
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${tone}`}>
    <span aria-hidden>●</span>{label}
  </span>;
}
