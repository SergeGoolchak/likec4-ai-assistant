import { useEffect, useState } from 'react';

type HealthState =
  | { status: 'checking' }
  | { status: 'ok'; dataDir: string }
  | { status: 'error'; message: string };

export function App() {
  const [health, setHealth] = useState<HealthState>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ dataDir: string }>;
      })
      .then((data) => {
        if (!cancelled) setHealth({ status: 'ok', dataDir: data.dataDir });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHealth({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900">AI Assistant for LikeC4</h1>
        <p className="mt-2 text-sm text-slate-500">
          Локальный ассистент для дополнения LikeC4-архитектуры на основе спецификаций из Confluence.
        </p>

        <div className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 p-4">
          <StatusDot health={health} />
          <div className="text-sm">
            {health.status === 'checking' && <span className="text-slate-500">Проверяем backend…</span>}
            {health.status === 'ok' && <span className="text-emerald-700">Backend в порядке</span>}
            {health.status === 'error' && <span className="text-rose-700">Backend недоступен: {health.message}</span>}
          </div>
        </div>
      </div>
    </main>
  );
}

function StatusDot({ health }: { health: HealthState }) {
  const color =
    health.status === 'ok' ? 'bg-emerald-500' : health.status === 'error' ? 'bg-rose-500' : 'bg-slate-300';
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} aria-hidden />;
}
