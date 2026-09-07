import { Link } from 'react-router-dom';
import { useProjectReadiness } from '../hooks/useProjectReadiness';
import { QueryState } from './QueryState';

export function ProjectReadiness({ projectId }: { projectId: string }) {
  const readiness = useProjectReadiness(projectId);
  if (readiness.isLoading || readiness.error) return <QueryState error={readiness.error} onRetry={readiness.refetch} label="Проверяем настройки проекта…" />;
  const steps = [
    { title: 'Модель LikeC4', description: readiness.modelReady ? 'Модель прочитана и проверена' : 'Проверьте папку и ошибки модели', ready: readiness.modelReady, to: `/projects/${projectId}` },
    { title: 'Confluence', description: readiness.confluence.data?.configured ? 'Подключение сохранено' : 'Подключите источник спецификаций', ready: readiness.confluence.data?.configured, to: `/projects/${projectId}/confluence-settings` },
    { title: 'AI-провайдер', description: readiness.ai.data?.configured ? `Модель: ${readiness.ai.data.model}` : 'Выберите модель для анализа', ready: readiness.ai.data?.configured, to: `/projects/${projectId}/ai-settings` },
  ];
  return <section aria-label="Готовность проекта" className="rounded-2xl border border-slate-200 bg-white p-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{readiness.ready ? 'Всё готово к работе' : 'Подготовьте проект к анализу'}</h2><span className="text-xs text-slate-500">{readiness.readyCount} из 3</span></div>
    <div className="grid gap-5 xl:grid-cols-3">{steps.map((step, i) => <Link key={step.title} to={step.to} className="group flex items-start gap-3 rounded-lg">
      <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${step.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{step.ready ? '✓' : `0${i + 1}`}</span>
      <span><span className="block text-sm font-medium group-hover:underline">{step.title} <span aria-hidden>↗</span></span><span className="mt-1 block text-xs text-slate-500">{step.description}</span></span>
    </Link>)}</div>
    <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">Подключения проверяются при сохранении настроек. Их текущая доступность может измениться.</p>
  </section>;
}
