import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PipelineStageId, SessionView } from '../api/types';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';

const STAGE_ORDER: { id: PipelineStageId; label: string; isDone: (s: SessionView) => boolean }[] = [
  { id: 'load-confluence', label: 'Чтение Confluence', isDone: (s) => s.summary.confluenceTitle !== undefined },
  { id: 'parse-specification', label: 'Разбор спецификации', isDone: (s) => s.summary.specificationChunkCount !== undefined },
  { id: 'load-likec4', label: 'Чтение существующей архитектуры', isDone: (s) => s.summary.existingFileCount !== undefined },
  { id: 'build-architecture-graph', label: 'Построение графа архитектуры', isDone: (s) => s.summary.elementCount !== undefined },
];

export function AnalysisPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionView | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    const source = new EventSource(`/api/sessions/${sessionId}/events`);

    source.addEventListener('snapshot', (event) => {
      setSession(JSON.parse((event as MessageEvent).data));
    });
    source.onerror = () => setConnectionLost(true);

    return () => source.close();
  }, [sessionId]);

  if (!session) {
    return <p className="text-sm text-slate-500">Подключаемся к сессии анализа…</p>;
  }

  const firstPendingIndex = STAGE_ORDER.findIndex((stage) => !stage.isDone(session));
  const currentIndex = firstPendingIndex === -1 ? STAGE_ORDER.length : firstPendingIndex;

  return (
    <div className="max-w-lg">
      <Link to={`/projects/${session.projectId}`} className="text-sm text-slate-500 hover:text-slate-700">
        ← Назад к проекту
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Анализ спецификации</h1>
      {connectionLost && session.status === 'running' && (
        <p className="mt-1 text-xs text-amber-600">Соединение для live-обновлений прервано — статус может отставать.</p>
      )}

      <Card className="mt-6">
        <ul className="space-y-3">
          {STAGE_ORDER.map((stage, index) => {
            const done = stage.isDone(session);
            const isCurrent = index === currentIndex && session.status === 'running';
            const isFailedHere = index === currentIndex && session.status === 'failed';
            return (
              <li key={stage.id} className="flex items-center gap-3 text-sm">
                <StageIcon done={done} current={isCurrent} failed={isFailedHere} />
                <span className={done ? 'text-slate-900' : isFailedHere ? 'text-rose-700' : 'text-slate-500'}>{stage.label}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      {session.status === 'failed' && session.error && (
        <div className="mt-6">
          <ErrorState error={session.error} />
        </div>
      )}

      {session.status === 'completed' && (
        <Card className="mt-6">
          <p className="font-medium text-emerald-700">Готово: {session.summary.confluenceTitle}</p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Чанков спецификации" value={session.summary.specificationChunkCount} />
            <Stat label="Файлов модели" value={session.summary.existingFileCount} />
            <Stat label="Элементов" value={session.summary.elementCount} />
            <Stat label="Views" value={session.summary.viewCount} />
          </div>
          {Boolean(session.summary.existingModelDiagnosticsCount) && (
            <p className="mt-3 text-xs text-amber-600">
              В существующей модели найдено диагностик: {session.summary.existingModelDiagnosticsCount}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function StageIcon({ done, current, failed }: { done: boolean; current: boolean; failed: boolean }) {
  if (done) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs text-white">✓</span>
    );
  }
  if (failed) {
    return <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs text-white">✕</span>;
  }
  if (current) {
    return <span className="h-5 w-5 shrink-0 animate-pulse rounded-full border-2 border-slate-900" aria-hidden />;
  }
  return <span className="h-5 w-5 shrink-0 rounded-full border-2 border-slate-200" aria-hidden />;
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <p className="text-xl font-semibold text-slate-900">{value ?? '—'}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
