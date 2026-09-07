import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getHelpTopic } from './content';

/**
 * Точка входа в контекстную помощь — уровни 3-5 из реестра (`content.ts`):
 * hover показывает `tooltip` (уровень 3), клик разворачивает поповер с
 * `contextHelp` (уровень 4) и ссылкой в Help Center (уровень 5, `docLink`).
 * Уровни 1-2 (label/inlineDescription) не прячутся за этот компонент — они
 * либо уже показаны на экране обычным текстом, либо видны в списке Help
 * Center (см. HelpCenterPage).
 */
export function HelpAnchor({ topicId }: { topicId: string }) {
  const [open, setOpen] = useState(false);
  const topic = getHelpTopic(topicId);

  if (!topic) {
    // Не молчаливый fallback — опечатка в topicId должна быть видна сразу в dev,
    // а не только при следующем прогоне check-help-completeness.mjs.
    throw new Error(`HelpAnchor: неизвестный topicId "${topicId}" — добавьте запись в ui-kit/help/content.ts`);
  }

  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        title={topic.tooltip}
        aria-label={`Помощь: ${topic.label}`}
        onClick={() => setOpen((o) => !o)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 hover:bg-slate-300"
      >
        ?
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-10 w-64 rounded-lg bg-white p-3 text-left shadow-lg ring-1 ring-slate-200">
          <p className="text-xs font-medium text-slate-900">{topic.label}</p>
          <p className="mt-1 text-xs text-slate-600">{topic.contextHelp}</p>
          <Link
            to={`/help#${topic.docLink.split('#')[1] ?? topic.docLink}`}
            onClick={() => setOpen(false)}
            className="mt-2 inline-block text-xs font-medium text-slate-900 hover:underline"
          >
            Подробнее →
          </Link>
        </div>
      )}
    </span>
  );
}
