import { StatusBadge } from '../components/StatusBadge';
import { QueryState } from '../components/QueryState';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getProjectHistory, restoreSnapshot } from '../api/client';
import { ApiError } from '../api/client';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { HelpAnchor } from '../ui-kit/help/HelpAnchor';

export function HistoryPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['project-history', projectId],
    queryFn: () => getProjectHistory(projectId!),
    enabled: Boolean(projectId),
  });

  const restoreMutation = useMutation({
    mutationFn: (snapshotId: string) => restoreSnapshot(projectId!, snapshotId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-history', projectId] }),
  });

  if (error) return <QueryState error={error} onRetry={() => refetch()} />;

  if (isLoading || !data) {
    return <p className="text-sm text-slate-500">Загружаем историю…</p>;
  }

  return (
    <div className="max-w-3xl">
      <Link to={`/projects/${projectId}`} className="text-sm text-slate-500 hover:text-slate-700">
        ← Назад к проекту
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        История
        <HelpAnchor topicId="screen.history" />
      </h1>

      <h2 className="mt-6 text-lg font-medium text-slate-900">Задачи анализа</h2>
      {data.sessions.length === 0 && <p className="mt-2 text-sm text-slate-500">Задач пока нет.</p>}
      <div className="mt-3 space-y-2">
        {data.sessions.map((s) => (
          <Card key={s.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{s.confluencePageTitle ?? s.id}</p>
              <p className="text-xs text-slate-500">
                {new Date(s.createdAt).toLocaleString('ru-RU')}
              </p>
            </div>
            <StatusBadge status={s.status} />
            <Link to={`/sessions/${s.id}`} className="text-sm text-slate-500 hover:text-slate-700">
              Открыть →
            </Link>
          </Card>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-medium text-slate-900">Снимки состояния</h2>
      {data.snapshots.length === 0 && <p className="mt-2 text-sm text-slate-500">Снимков пока нет — они создаются перед каждым применением изменений.</p>}
      <div className="mt-3 space-y-2">
        {data.snapshots.map((snapshot) => (
          <Card key={snapshot.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">
                {snapshot.meta.reason === 'pre-apply' ? 'Перед применением' : 'Вручную'} — {Object.keys(snapshot.fileHashes).length} файлов
              </p>
              <p className="text-xs text-slate-500">{new Date(snapshot.meta.createdAt).toLocaleString()}</p>
            </div>
            <button
              onClick={() => restoreMutation.mutate(snapshot.id)}
              disabled={restoreMutation.isPending}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Восстановить
            </button>
          </Card>
        ))}
      </div>

      {restoreMutation.error instanceof ApiError && <ErrorState error={restoreMutation.error.error} />}
      {restoreMutation.isSuccess && <p className="mt-4 text-sm text-emerald-700">Снимок восстановлен — файлы репозитория обновлены.</p>}
    </div>
  );
}
