import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError, listProjects } from '../api/client';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';

export function ProjectsPage() {
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['projects'], queryFn: listProjects });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Проекты</h1>
        <Link
          to="/projects/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Новый проект
        </Link>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading && <p className="text-sm text-slate-500">Загрузка…</p>}
        {error instanceof ApiError && <ErrorState error={error.error} onRetry={() => refetch()} />}
        {data?.length === 0 && (
          <Card>
            <p className="text-sm text-slate-500">Проектов пока нет. Создайте первый, чтобы начать анализ архитектуры.</p>
          </Card>
        )}
        {data?.map((project) => (
          <Link key={project.id} to={`/projects/${project.id}`}>
            <Card className="transition hover:ring-slate-300">
              <p className="font-medium text-slate-900">{project.name}</p>
              {project.description && <p className="mt-1 text-sm text-slate-500">{project.description}</p>}
              <p className="mt-2 text-xs text-slate-400">{project.localRepositoryPath}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
