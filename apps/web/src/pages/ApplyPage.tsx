import { ValidationPanel } from '../components/ValidationPanel';
import { QueryState } from '../components/QueryState';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applySession, getSession, rollbackSession } from '../api/client';
import { ApiError } from '../api/client';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { HelpAnchor } from '../ui-kit/help/HelpAnchor';

export function ApplyPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: session, isLoading, error, refetch } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId!),
    enabled: Boolean(sessionId),
  });

  const applyMutation = useMutation({
    mutationFn: () => applySession(sessionId!),
    onSuccess: (updated) => queryClient.setQueryData(['session', sessionId], updated),
  });

  const rollbackMutation = useMutation({
    mutationFn: () => rollbackSession(sessionId!),
    onSuccess: (updated) => queryClient.setQueryData(['session', sessionId], updated),
  });

  if (error && !session) return <QueryState error={error} onRetry={() => refetch()} />;

  if (isLoading || !session) {
    return <p className="text-sm text-slate-500">Загружаем сводку применения…</p>;
  }

  const diff = session.diff ?? [];
  const items = session.proposal?.items ?? [];
  const approvedCount = items.filter((i) => i.decision === 'approved' || i.decision === 'edited').length;
  const rejectedCount = items.filter((i) => i.decision === 'rejected').length;
  // Буквально формулировка DoD плана: "Apply задизейблен при непройденной валидации".
  // undefined (валидация ещё не считалась) тоже блокирует — Apply доступен только на явном false.
  const blocked = session.summary.hasBlockingValidationIssues !== false;
  const applied = session.applyResult !== undefined;
  const readyToApply = session.status === 'paused-for-user' && session.currentStage === 'apply';

  return (
    <div className="max-w-2xl">
      <Link to={`/sessions/${sessionId}/preview`} className="text-sm text-slate-500 hover:text-slate-700">
        ← Назад к превью
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        Применение изменений
        <HelpAnchor topicId="screen.apply" />
      </h1>

      <div className="mt-6"><ValidationPanel session={session} /></div>
      <Card className="mt-6">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Файлов изменится" value={diff.length} />
          <Stat label="Принято" value={approvedCount} />
          <Stat label="Отклонено" value={rejectedCount} />
        </div>

        {blocked && !applied && (
          <p className="mt-4 text-sm font-medium text-amber-700">
            Применение недоступно. Результаты проверок и причины блокировки показаны выше.
            <HelpAnchor topicId="field.apply-gate" />
          </p>
        )}

        {!readyToApply && !applied && <p className="mt-4 text-sm text-slate-500">Задача ещё не готова к применению. Откройте анализ, чтобы увидеть текущее действие.</p>}
        {!applied ? (
          <button
            onClick={() => applyMutation.mutate()}
            disabled={blocked || !readyToApply || applyMutation.isPending}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {applyMutation.isPending ? 'Применяем…' : 'Применить изменения'}
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-emerald-700">
              Применено {session.applyResult?.appliedAt ? new Date(session.applyResult.appliedAt).toLocaleString() : ''} — изменено файлов:{' '}
              {session.applyResult?.filesChanged.length}.
            </p>
            {session.applyResult?.rollbackAvailable && (
              <p>
                <button
                  onClick={() => rollbackMutation.mutate()}
                  disabled={rollbackMutation.isPending}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-300"
                >
                  {rollbackMutation.isPending ? 'Откатываем…' : 'Rollback'}
                </button>
                <HelpAnchor topicId="field.rollback" />
              </p>
            )}
            {rollbackMutation.isSuccess && <p className="text-sm text-slate-500">Откачено — файлы восстановлены до состояния перед Apply.</p>}
          </div>
        )}

        {applyMutation.error instanceof ApiError && <ErrorState error={applyMutation.error.error} />}
        {rollbackMutation.error instanceof ApiError && <ErrorState error={rollbackMutation.error.error} />}
      </Card>

      <Link to={`/projects/${session.projectId}/history`} className="mt-6 inline-block text-sm text-slate-500 hover:text-slate-700">
        История и снэпшоты →
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
