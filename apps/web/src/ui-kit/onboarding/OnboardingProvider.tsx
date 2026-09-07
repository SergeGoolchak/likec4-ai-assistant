import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ONBOARDING_STEPS } from './steps';

const DISMISSED_KEY = 'onboarding-dismissed';

interface OnboardingContextValue {
  visible: boolean;
  stepIndex: number;
  step: (typeof ONBOARDING_STEPS)[number];
  totalSteps: number;
  next: () => void;
  prev: () => void;
  skip: () => void;
  restart: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function readDismissedFlag(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return true;
  }
}

/**
 * Состояние — только `localStorage` (`onboarding-dismissed`): это локальный
 * однопользовательский инструмент, серверная персистентность здесь не нужна.
 * Автопоказ при первом заходе (флаг ещё не выставлен); повторный запуск —
 * кнопка "Показать введение снова" на Help Center вызывает `restart()`.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // localStorage недоступен (приватный режим и т.п.) => считаем уже показанным, просто не
    // показываем автоматически, а не падаем.
    const dismissed = readDismissedFlag();
    if (!dismissed) setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // Не критично — просто покажется снова в следующей вкладке/сессии.
    }
  };

  const value = useMemo<OnboardingContextValue>(
    () => ({
      visible,
      stepIndex,
      step: ONBOARDING_STEPS[stepIndex]!,
      totalSteps: ONBOARDING_STEPS.length,
      next: () => {
        if (stepIndex + 1 >= ONBOARDING_STEPS.length) {
          dismiss();
        } else {
          setStepIndex((i) => i + 1);
        }
      },
      prev: () => setStepIndex((i) => Math.max(0, i - 1)),
      skip: dismiss,
      restart: () => {
        setStepIndex(0);
        setVisible(true);
      },
    }),
    [visible, stepIndex],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
