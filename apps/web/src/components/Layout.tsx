import { Link, NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getProject } from '../api/client';
import { useSessionUpdates } from '../hooks/useSession';
import { StatusBadge } from './StatusBadge';
import { TaskNavigation } from './TaskNavigation';
import { OnboardingPanel } from '../ui-kit/onboarding/OnboardingPanel';

export function Layout() {
  const { pathname } = useLocation();
  const sessionId = matchPath('/sessions/:id/*', pathname)?.params.id;
  const session = useSessionUpdates(sessionId);
  const routeProjectId = matchPath('/projects/:id/*', pathname)?.params.id;
  const projectId = routeProjectId === 'new' ? undefined : routeProjectId ?? session.data?.projectId;
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => getProject(projectId!), enabled: Boolean(projectId), staleTime: 30_000 });
  const health = useQuery({
    queryKey: ['health'], queryFn: async () => {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('unhealthy');
      return res.json() as Promise<{ status: string }>;
    }, retry: false, refetchInterval: 30_000,
  });
  const base = `/projects/${projectId}`;
  const links = projectId ? [
    { label: 'Обзор проекта', to: base, icon: '◫', end: true },
    { label: 'История задач', to: `${base}/history`, icon: '◷' },
    { label: 'Правила архитектуры', to: `${base}/architecture-rules`, icon: '≡' },
    { label: 'Confluence', to: `${base}/confluence-settings`, icon: '↗' },
    { label: 'AI-провайдер', to: `${base}/ai-settings`, icon: '✧' },
  ] : [];

  return <div className="app-shell">
    <a href="#main-content" className="skip-link">К содержимому</a>
    <aside className="app-sidebar">
      <Link to="/" className="brand"><span className="brand-mark" aria-hidden>c4<span>·</span></span><span>LikeC4<span className="brand-caption">Architecture assistant</span></span></Link>
      <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}><span aria-hidden>▦</span>Все проекты</NavLink>
      {projectId && <>
        <div className="sidebar-section">Рабочее пространство</div>
        <Link to={base} className="sidebar-project">{project.data?.project.name ?? 'Проект'}</Link>
        <nav aria-label="Навигация проекта" className="sidebar-nav">
          {links.map((link) => <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}><span aria-hidden>{link.icon}</span>{link.label}</NavLink>)}
        </nav>
      </>}
      <div className="sidebar-footer">
        <NavLink to="/help" className="sidebar-link"><span aria-hidden>?</span>Помощь и руководство</NavLink>
        <p className="service-status"><span aria-hidden className={health.isSuccess ? 'text-emerald-700' : health.isError ? 'text-rose-700' : ''}>●</span> {health.isSuccess ? 'Сервис доступен' : health.isError ? 'Сервис недоступен' : 'Проверяем сервис…'}</p>
      </div>
    </aside>
    <div className="app-body">
      <header className="app-topbar">
        <nav aria-label="Вы здесь" className="breadcrumbs"><Link to="/">Проекты</Link>{projectId && <><span aria-hidden>/</span><Link to={base}>{project.data?.project.name ?? 'Проект'}</Link></>}{sessionId && <><span aria-hidden>/</span><span>Задача</span></>}</nav>
        <span className="local-label">Локальное рабочее пространство</span>
        <Link to="/help" className="mobile-help text-link">Помощь</Link>
      </header>
      <main id="main-content" className="app-main" tabIndex={-1}>
        {session.data && sessionId && <div className="task-context">
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="min-w-0 break-words font-medium">{session.data.summary.confluenceTitle ?? 'Анализ спецификации'}</p><StatusBadge status={session.data.status} /></div>
          {session.connectionLost && <p role="status" className="mt-3 text-sm text-amber-800">Связь прервана. Проверяем состояние каждые 5 секунд и восстанавливаем обновления.</p>}
          {session.error && <p role="alert" className="mt-3 text-sm text-amber-800">Не удалось обновить данные. Показано последнее сохранённое состояние. <button className="text-link" onClick={() => session.refetch()}>Повторить</button></p>}
          <TaskNavigation session={session.data} />
        </div>}
        <OnboardingPanel />
        <Outlet />
      </main>
    </div>
  </div>;
}
