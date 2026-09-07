import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSession } from '../api/client';
import { Card } from '../components/Card';

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3];

export function PreviewPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState(2);

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId!),
    enabled: Boolean(sessionId),
  });

  if (isLoading || !session) {
    return <p className="text-sm text-slate-500">Загружаем превью диаграмм…</p>;
  }

  const views = session.previewViews ?? [];
  const activeView = views.find((v) => v.viewId === activeViewId) ?? views[0];
  const zoom = ZOOM_STEPS[zoomIndex]!;

  return (
    <div className="max-w-4xl">
      <Link to={`/sessions/${sessionId}/diff`} className="text-sm text-slate-500 hover:text-slate-700">
        ← Назад к сравнению
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Превью диаграмм</h1>
      <p className="mt-1 text-sm text-slate-500">Итоговое состояние архитектуры — {views.length} {views.length === 1 ? 'диаграмма' : 'диаграмм'}.</p>

      {views.length === 0 && (
        <Card className="mt-6">
          <p className="text-sm text-slate-500">Диаграмм нет.</p>
        </Card>
      )}

      {views.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {views.map((v) => (
            <button
              key={v.viewId}
              onClick={() => setActiveViewId(v.viewId)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                v.viewId === (activeView?.viewId ?? '') ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'
              }`}
            >
              {v.viewId}
            </button>
          ))}
        </div>
      )}

      {activeView && (
        <Card className="mt-6 overflow-hidden p-0">
          <div className="flex items-center justify-end gap-2 border-b border-slate-100 p-2">
            <button
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
              disabled={zoomIndex === 0}
              className="rounded-lg px-2 py-1 text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              −
            </button>
            <span className="w-12 text-center text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              className="rounded-lg px-2 py-1 text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              +
            </button>
          </div>
          {/* Официальный React-компонент likec4/react (LikeC4Diagram) на практике требует живой
              LikeC4Model через LikeC4ModelProvider даже при прямой передаче view-пропа (не только для
              продвинутых фич, как показал статический анализ типов) — вопреки первоначальному выводу
              спайка. Полноценная клиентская модель — заметно больший объём работы, не оправданный для
              MVP; используем fallback, явно предусмотренный планом: серверный SVG + zoom/pan обёртка.
              См. explain.md, Milestone 10. */}
          <div className="h-[560px] overflow-auto bg-slate-50 p-4">
            <img
              src={`data:image/svg+xml,${encodeURIComponent(activeView.svg)}`}
              alt={`Диаграмма ${activeView.viewId}`}
              style={{ width: `${zoom * 100}%`, maxWidth: 'none' }}
            />
          </div>
        </Card>
      )}

      <Link
        to={`/sessions/${sessionId}/apply`}
        className="mt-6 inline-block rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
      >
        Дальше: Apply
      </Link>
    </div>
  );
}
