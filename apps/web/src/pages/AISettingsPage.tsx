import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, getAISettings, saveAISettings } from '../api/client';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { HelpAnchor } from '../ui-kit/help/HelpAnchor';

const DEFAULT_MODEL = 'gpt-4o-mini';

export function AISettingsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['ai-settings', projectId],
    queryFn: () => getAISettings(projectId!),
    enabled: Boolean(projectId),
  });

  const [model, setModel] = useState(DEFAULT_MODEL);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    if (data?.model) setModel(data.model);
  }, [data?.model]);

  useEffect(() => {
    if (data?.baseUrl) setBaseUrl(data.baseUrl);
  }, [data?.baseUrl]);

  const mutation = useMutation({
    mutationFn: () => saveAISettings(projectId!, { model, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined }),
    onSuccess: () => {
      setApiKey('');
      queryClient.invalidateQueries({ queryKey: ['ai-settings', projectId] });
    },
  });

  return (
    <div className="max-w-lg">
      <Link to={`/projects/${projectId}`} className="text-sm text-slate-500 hover:text-slate-700">
        ← Назад к проекту
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        AI-провайдер
        <HelpAnchor topicId="screen.ai-settings" />
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Подключение к OpenAI или любому OpenAI-совместимому серверу (Ollama, LM Studio, vLLM, llama.cpp server и
        т.п.) — достаточно указать его адрес ниже. Используется для извлечения требований из спецификации и
        сопоставления с существующей архитектурой (стадии 6-8 pipeline).
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
            <span className="text-sm font-medium text-slate-700">Модель</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={DEFAULT_MODEL}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Адрес сервера (необязательно)
              <HelpAnchor topicId="field.ai-base-url" />
            </span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.openai.com/v1"
            />
            <span className="mt-1 block text-xs text-slate-400">
              Оставьте пустым для настоящего OpenAI. Укажите адрес локального/self-hosted сервера, чтобы работать без
              облака.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">OpenAI API key (необязательно для локальных серверов)</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={data?.configured ? '••••••••  (уже сохранён, введите новый чтобы заменить)' : 'sk-... (не нужен для большинства локальных серверов)'}
            />
            <span className="mt-1 block text-xs text-slate-400">
              Ключ хранится локально в зашифрованном виде и никогда не отображается повторно. Не передаётся никуда,
              кроме собственных запросов к указанному выше серверу.
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
