import { QueryState } from '../components/QueryState';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, getConfluenceSettings, saveConfluenceSettings } from '../api/client';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { HelpAnchor } from '../ui-kit/help/HelpAnchor';

export function ConfluenceSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['confluence-settings', projectId],
    queryFn: () => getConfluenceSettings(projectId!),
    enabled: Boolean(projectId),
  });

  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    if (data) setBaseUrl(data.baseUrl ?? '');
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => saveConfluenceSettings(projectId!, { baseUrl, token }),
    onSuccess: () => {
      setToken('');
      queryClient.invalidateQueries({ queryKey: ['confluence-settings', projectId] });
    },
  });

  if (error || isLoading) return <QueryState error={error} onRetry={() => refetch()} label="Загружаем настройки…" />;

  return (
    <div className="max-w-lg">
      <Link to={`/projects/${projectId}`} className="text-sm text-slate-500 hover:text-slate-700">
        ← Назад к проекту
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        Confluence
        <HelpAnchor topicId="screen.confluence-settings" />
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Подключение к Confluence Server/Data Center по Personal Access Token. Используется для чтения аналитических
        спецификаций (read-only).
      </p>

      <Card className="mt-6">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Адрес Confluence Server</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://confluence.example.com"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Personal Access Token
              <HelpAnchor topicId="field.confluence-pat" />
            </span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={data?.configured ? '••••••••  (уже сохранён, введите новый чтобы заменить)' : 'Вставьте PAT'}
              required={!data?.configured}
            />
            <span className="mt-1 block text-xs text-slate-400">
              Токен хранится локально в зашифрованном виде и никогда не отображается повторно.
            </span>
          </label>

          {!isLoading && (
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${data?.configured ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden />
              <span className="text-slate-500">{data?.configured ? 'Подключение настроено' : 'Ещё не настроено'}</span>
            </div>
          )}

          {mutation.isSuccess && !mutation.isPending && (
            <p className="text-sm text-emerald-700">Подключение проверено и сохранено.</p>
          )}
          {mutation.error instanceof ApiError && <ErrorState error={mutation.error.error} />}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {mutation.isPending ? 'Проверяем подключение…' : 'Сохранить и проверить'}
          </button>
        </form>
      </Card>
    </div>
  );
}
