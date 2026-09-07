import { useNavigate } from 'react-router-dom';
import { useOnboarding } from './OnboardingProvider';

/** Плавающая панель в углу экрана — рендерится один раз в Layout, видна поверх любого маршрута. */
export function OnboardingPanel() {
  const { visible, step, stepIndex, totalSteps, next, prev, skip } = useOnboarding();
  const navigate = useNavigate();

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-20 w-80 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">
          Шаг {stepIndex + 1} из {totalSteps}
        </span>
        <button type="button" onClick={skip} className="text-xs text-slate-400 hover:text-slate-600">
          Пропустить
        </button>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-900">{step.title}</p>
      <p className="mt-1 text-sm text-slate-600">{step.body}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={prev}
            disabled={stepIndex === 0}
            className="rounded-lg px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
          >
            Назад
          </button>
          <button type="button" onClick={next} className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800">
            {stepIndex + 1 === totalSteps ? 'Готово' : 'Далее'}
          </button>
        </div>
        {step.route && (
          <button
            type="button"
            onClick={() => navigate(step.route!)}
            className="text-xs font-medium text-slate-900 hover:underline"
          >
            Перейти →
          </button>
        )}
      </div>
    </div>
  );
}
