import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError, getProject } from '../api/client';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';

export function ProjectDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id!),
    enabled: Boolean(id),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Загрузка…</p>;
  if (error instanceof ApiError) return <ErrorState error={error.error} onRetry={() => refetch()} />;
  if (!data) return null;

  const { project, model, modelError } = data;

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
          {project.description && <p className="mt-1 text-slate-500">{project.description}</p>}
          <p className="mt-2 text-xs text-slate-400">{project.localRepositoryPath}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            to={`/projects/${project.id}/confluence-settings`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Confluence
          </Link>
          <Link
            to={`/projects/${project.id}/architecture-rules`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Architecture Rules
          </Link>
          <Link
            to={`/projects/${project.id}/tasks/new`}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Новая задача
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Элементы" value={model?.elementCount} />
        <StatCard label="Связи" value={model?.relationshipCount} />
        <StatCard label="Views" value={model?.viewCount} />
      </div>

      {modelError && (
        <div className="mt-6">
          <ErrorState error={modelError} onRetry={() => refetch()} />
        </div>
      )}

      {model && model.diagnostics.length > 0 && (
        <Card className="mt-6">
          <p className="font-medium text-amber-700">Диагностика модели ({model.diagnostics.length})</p>
          <ul className="mt-2 space-y-2 text-sm">
            {model.diagnostics.map((diagnostic, index) => (
              <li key={index} className="rounded-lg bg-amber-50 p-2 text-amber-900">
                <span className="font-mono text-xs text-amber-600">
                  {diagnostic.file}:{diagnostic.range?.startLine ?? '?'}
                </span>
                <p>{diagnostic.message}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {model && model.diagnostics.length === 0 && (
        <Card className="mt-6">
          <p className="text-sm text-emerald-700">Модель валидна, ошибок не найдено.</p>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value?: number }) {
  return (
    <Card>
      <p className="text-3xl font-semibold text-slate-900">{value ?? '—'}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </Card>
  );
}
