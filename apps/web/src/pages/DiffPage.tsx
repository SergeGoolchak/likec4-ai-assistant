import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSession } from '../api/client';
import { Card } from '../components/Card';
import type { FileDiff } from '../api/types';

const CHANGE_TYPE_LABEL: Record<FileDiff['changeType'], string> = {
  added: 'Новый файл',
  modified: 'Изменён',
  deleted: 'Удалён',
};

const CHANGE_TYPE_BADGE: Record<FileDiff['changeType'], string> = {
  added: 'bg-emerald-100 text-emerald-700',
  modified: 'bg-amber-100 text-amber-700',
  deleted: 'bg-rose-100 text-rose-700',
};

export function DiffPage() {
  const { id: sessionId } = useParams<{ id: string }>();

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId!),
    enabled: Boolean(sessionId),
  });

  if (isLoading || !session) {
    return <p className="text-sm text-slate-500">Загружаем сравнение изменений…</p>;
  }

  const diff = session.diff ?? [];

  return (
    <div className="max-w-4xl">
      <Link to={`/sessions/${sessionId}`} className="text-sm text-slate-500 hover:text-slate-700">
        ← Назад к анализу
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Сравнение изменений</h1>
      <p className="mt-1 text-sm text-slate-500">
        Файлы, которые изменит Apply — {diff.length} {diff.length === 1 ? 'файл' : 'файлов'}.
      </p>

      {diff.length === 0 && (
        <Card className="mt-6">
          <p className="text-sm text-slate-500">Изменений нет.</p>
        </Card>
      )}

      <div className="mt-6 space-y-6">
        {diff.map((entry) => (
          <Card key={entry.path}>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHANGE_TYPE_BADGE[entry.changeType]}`}>
                {CHANGE_TYPE_LABEL[entry.changeType]}
              </span>
              <span className="font-mono text-sm text-slate-900">{entry.path}</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {entry.changeType !== 'added' && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">До</p>
                  <pre className="max-h-96 overflow-auto rounded-lg bg-rose-50 p-3 text-xs text-slate-800">{entry.before}</pre>
                </div>
              )}
              {entry.changeType !== 'deleted' && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">После</p>
                  <pre className="max-h-96 overflow-auto rounded-lg bg-emerald-50 p-3 text-xs text-slate-800">{entry.after}</pre>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Link
        to={`/sessions/${sessionId}/preview`}
        className="mt-6 inline-block rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
      >
        Дальше: Preview
      </Link>
    </div>
  );
}
