import { useProjectReadiness } from '../hooks/useProjectReadiness';
import { ProjectReadiness } from '../components/ProjectReadiness';
import { QueryState } from '../components/QueryState';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ApiError, createSession } from '../api/client';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { HelpAnchor } from '../ui-kit/help/HelpAnchor';

export function NewTaskPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [confluencePageId, setConfluencePageId] = useState('');

  const readiness = useProjectReadiness(projectId);

  const mutation = useMutation({
    mutationFn: () => createSession(projectId!, { confluencePageId }),
    onSuccess: ({ sessionId }) => navigate(`/sessions/${sessionId}`),
  });

  return (
    <div className="max-w-2xl">
      <Link to={`/projects/${projectId}`} className="text-sm text-slate-500 hover:text-slate-700">
        ← Назад к проекту
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        Новая архитектурная задача
        <HelpAnchor topicId="screen.new-task" />
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Укажите ID страницы Confluence с аналитической спецификацией — система прочитает существующую архитектуру и
        сопоставит её со спецификацией.
      </p>

      {readiness.error ? <QueryState error={readiness.error} onRetry={readiness.refetch} /> : !readiness.ready && <div className="mt-5"><ProjectReadiness projectId={projectId!} /></div>}

      <Card className="mt-6">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <label className="block">
            <span className="text-sm font-medium text-slate-700">ID страницы Confluence</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              value={confluencePageId}
              onChange={(event) => setConfluencePageId(event.target.value)}
              placeholder="Например, 123456"
              required
            />
            <span className="mt-1 block text-xs text-slate-400">
              Числовой ID страницы — виден в её URL (…/pages/&lt;ID&gt;/…) или через "..." → "Page Information".
            </span>
          </label>

          {mutation.error instanceof ApiError && <ErrorState error={mutation.error.error} />}

          <button
            type="submit"
            disabled={mutation.isPending || !readiness.ready}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Запускаем…' : 'Проанализировать спецификацию'}
          </button>
        </form>
      </Card>
    </div>
  );
}
