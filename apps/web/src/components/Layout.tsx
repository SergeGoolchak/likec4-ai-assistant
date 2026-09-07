import { Link, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { OnboardingPanel } from '../ui-kit/onboarding/OnboardingPanel';

export function Layout() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('unhealthy');
      return res.json() as Promise<{ status: string }>;
    },
    retry: false,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-semibold text-slate-900">
            AI Assistant for LikeC4
          </Link>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <Link to="/help" className="hover:text-slate-700">
              Помощь
            </Link>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  health.isSuccess ? 'bg-emerald-500' : health.isError ? 'bg-rose-500' : 'bg-slate-300'
                }`}
                aria-hidden
              />
              {health.isSuccess ? 'Backend в порядке' : health.isError ? 'Backend недоступен' : 'Проверяем…'}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <Outlet />
      </main>
      <OnboardingPanel />
    </div>
  );
}
