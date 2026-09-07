import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getProjectHistory } from '../api/client';
import { useProjectReadiness } from '../hooks/useProjectReadiness';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { QueryState } from '../components/QueryState';
import { StatusBadge } from '../components/StatusBadge';
import { ProjectReadiness } from '../components/ProjectReadiness';
import { HelpAnchor } from '../ui-kit/help/HelpAnchor';

export function ProjectDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const readiness = useProjectReadiness(id);
  const { data, error, isPending, refetch } = readiness.project;
  const history = useQuery({ queryKey: ['project-history', id], queryFn: () => getProjectHistory(id!), enabled: Boolean(id), refetchInterval: 15_000 });
  if (isPending || error || !data) return <QueryState error={error} onRetry={() => refetch()} />;
  const { project, model, modelError } = data;
  const sessions = [...(history.data?.sessions ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const waiting = sessions.filter((s) => s.status === 'paused-for-user');
  const nextSetup = !readiness.modelReady ? '#model-status' : !readiness.confluence.data?.configured ? `/projects/${id}/confluence-settings` : `/projects/${id}/ai-settings`;

  return <div className="space-y-7">
    <div className="page-header">
      <div><p className="eyebrow mb-3">Рабочее пространство</p><h1 className="page-title">{project.name}<HelpAnchor topicId="screen.project-dashboard" /></h1><p className="page-description">{project.description || 'Развивайте архитектуру, сохраняя контроль над каждым изменением.'}</p></div>
      {readiness.ready ? <Link to={`/projects/${id}/tasks/new`} className="btn-primary">+ Новый анализ</Link> : readiness.isLoading || readiness.error ? <button className="btn-primary" disabled>Подготовка проекта</button> : nextSetup.startsWith('#') ? <a href={nextSetup} className="btn-primary">Проверить модель</a> : <Link to={nextSetup} className="btn-primary">Завершить настройку →</Link>}
    </div>
    {waiting.length > 0 && <section className="warm-panel">
      <p className="eyebrow">Нужно ваше решение</p><h2 className="mt-2 text-2xl font-semibold">Продолжите работу над архитектурой</h2>
      <div className="mt-5 space-y-3">{waiting.slice(0, 3).map((s) => <div key={s.id} className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm font-medium">{s.confluencePageTitle ?? 'Анализ спецификации'}</p><Link to={`/sessions/${s.id}`} className="btn-secondary">Продолжить →</Link></div>)}</div>
    </section>}
    <ProjectReadiness projectId={project.id} />
    <section>
      <div className="mb-4 flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">Последние задачи</h2><Link to={`/projects/${id}/history`} className="text-link">Вся история →</Link></div>
      {history.isPending || history.error ? <QueryState error={history.error} onRetry={() => history.refetch()} label="Загружаем задачи…" /> : sessions.length === 0 ? <div className="empty-state"><span aria-hidden className="text-3xl text-amber-800">✧</span><h3 className="mt-3 text-lg font-semibold">Первая задача начинается со спецификации</h3><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">Ассистент сопоставит требования с вашей моделью и предложит изменения. Решение о записи файлов останется за вами.</p>{readiness.ready && <Link to={`/projects/${id}/tasks/new`} className="btn-primary mt-6">Создать первый анализ</Link>}</div> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">{sessions.slice(0, 5).map((s) => <Link key={s.id} to={`/sessions/${s.id}`} className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5 last:border-0 hover:bg-slate-50"><div className="min-w-0"><p className="break-words text-sm font-semibold">{s.confluencePageTitle ?? 'Анализ спецификации'}</p><p className="mt-1 text-xs text-slate-500">{new Date(s.createdAt).toLocaleString('ru-RU')}</p></div><StatusBadge status={s.status} /></Link>)}</div>}
    </section>
    <section id="model-status" className="scroll-mt-6">
      <h2 className="mb-4 text-lg font-semibold">Модель проекта</h2>
      <Card><div className="grid grid-cols-3 gap-4">{[['Элементы', model?.elementCount], ['Связи', model?.relationshipCount], ['Диаграммы', model?.viewCount]].map(([label, value]) => <div key={label}><p className="text-2xl font-semibold">{value ?? '—'}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>)}</div><p className="mt-5 break-all border-t border-slate-100 pt-4 font-mono text-xs text-slate-500">{project.localRepositoryPath}</p></Card>
      {modelError && <div className="mt-4"><ErrorState error={modelError} onRetry={() => refetch()} /></div>}
      {!!model?.diagnostics.length && <Card className="mt-4"><h3 className="font-medium">Диагностика модели</h3><ul className="mt-3 space-y-3">{model.diagnostics.map((d, i) => <li key={i} className="text-sm"><p>{d.severity === 'error' ? 'Ошибка' : 'Предупреждение'}: {d.message}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{d.file}:{d.range?.startLine ?? '?'}</p></li>)}</ul></Card>}
    </section>
  </div>;
}
