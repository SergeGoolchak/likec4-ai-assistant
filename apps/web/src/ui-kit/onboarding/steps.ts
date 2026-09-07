/** A short introduction; actual setup progress comes from ProjectReadiness. */
export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  route?: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 'welcome', title: 'Архитектура развивается. Вы управляете изменениями.', body: 'Подключите LikeC4-проект, добавьте спецификацию из Confluence и получите объяснимые предложения по архитектуре.', route: '/projects/new' },
  { id: 'review', title: 'Каждое предложение — с обоснованием', body: 'Ассистент задаст уточняющие вопросы и покажет источники. Принимайте предложения, отклоняйте их или редактируйте код.' },
  { id: 'apply', title: 'Сначала проверка, затем применение', body: 'Сравните код и диаграммы перед записью файлов. Перед применением автоматически создаётся снимок для восстановления.' },
];
