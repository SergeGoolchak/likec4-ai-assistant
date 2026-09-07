import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listProjects } from '../api/client';
import { QueryState } from '../components/QueryState';
import { HelpAnchor } from '../ui-kit/help/HelpAnchor';

export function ProjectsPage() {
  const { data, error, isPending, refetch } = useQuery({ queryKey: ['projects'], queryFn: listProjects });
  const [search, setSearch] = useState('');
  const projects = data?.filter((p) => `${p.name} ${p.description ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];
  return <div>
    <div className="page-header"><div><p className="eyebrow mb-3">Архитектура под вашим контролем</p><h1 className="page-title">Ваши проекты<HelpAnchor topicId="screen.projects" /></h1><p className="page-description">От спецификации — к понятным изменениям архитектуры.</p></div><Link to="/projects/new" className="btn-primary">+ Новый проект</Link></div>
    {isPending || error ? <QueryState error={error} onRetry={() => refetch()} /> : data?.length === 0 ? <div className="empty-state"><div aria-hidden className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-3xl text-amber-800 shadow-sm">◫</div><h2 className="mt-5 text-2xl font-semibold">Дайте архитектуре пространство для роста</h2><p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">Подключите папку с LikeC4-моделью и источник спецификаций. Ассистент подготовит предложения, а вы решите, что изменить.</p><Link to="/projects/new" className="btn-primary mt-6">Подключить первый проект →</Link></div> : <>
      <label className="mb-6 block max-w-md"><span className="sr-only">Найти проект</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти проект по названию…" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm" /></label>
      <div className="grid gap-5 xl:grid-cols-2">{projects.map((p, i) => <Link key={p.id} to={`/projects/${p.id}`} className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-amber-300 hover:shadow-sm"><div className="mb-6 flex items-center justify-between"><span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-sm font-semibold text-amber-800">{String(i + 1).padStart(2, '0')}</span><span aria-hidden className="text-slate-400 group-hover:text-amber-800">↗</span></div><h2 className="break-words text-xl font-semibold">{p.name}</h2><p className="mt-2 text-sm text-slate-500">{p.description ?? 'Проект архитектуры LikeC4'}</p><p className="mt-6 break-all border-t border-slate-100 pt-4 font-mono text-xs text-slate-500">{p.localRepositoryPath}</p></Link>)}</div>
      {projects.length === 0 && <p className="py-8 text-sm text-slate-500">Проекты не найдены. Попробуйте другое название.</p>}
    </>}
  </div>;
}
