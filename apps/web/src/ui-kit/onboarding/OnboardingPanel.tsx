import { Link, useLocation } from 'react-router-dom';
import { useOnboarding } from './OnboardingProvider';

export function OnboardingPanel() {
  const { visible, step, stepIndex, totalSteps, next, prev, skip } = useOnboarding();
  const { pathname } = useLocation();
  if (!visible || (pathname !== '/' && pathname !== '/help')) return null;
  return <section aria-label="Знакомство с приложением" className="warm-panel mb-8">
    <div className="flex items-start justify-between gap-4"><p className="eyebrow">Знакомство · {stepIndex + 1} / {totalSteps}</p><button onClick={skip} className="text-link">Скрыть</button></div>
    <h2 className="mt-3 max-w-2xl text-2xl font-semibold">{step.title}</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{step.body}</p>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      {step.route && <Link to={step.route} onClick={skip} className="btn-primary">Подключить проект →</Link>}
      {stepIndex > 0 && <button onClick={prev} className="btn-secondary">Назад</button>}
      <button onClick={next} className="text-link">{stepIndex + 1 === totalSteps ? 'Готово' : 'Далее →'}</button>
    </div>
  </section>;
}
