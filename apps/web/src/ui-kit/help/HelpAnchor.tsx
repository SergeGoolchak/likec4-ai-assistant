import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const popupId = useId();
  useLayoutEffect(() => {
    if (!open || !trigger.current || !popup.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const panel = popup.current.getBoundingClientRect();
    setPosition({
      left: Math.max(12, Math.min(anchor.left, window.innerWidth - panel.width - 12)),
      top: Math.max(12, Math.min(anchor.bottom + 8, window.innerHeight - panel.height - 12)),
    });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    const closeOnResize = () => setOpen(false);
    window.addEventListener('resize', closeOnResize);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [open]);
  const topic = getHelpTopic(topicId);

  if (!topic) {
    // Не молчаливый fallback — опечатка в topicId должна быть видна сразу в dev,
    // а не только при следующем прогоне check-help-completeness.mjs.
    throw new Error(`HelpAnchor: неизвестный topicId "${topicId}" — добавьте запись в ui-kit/help/content.ts`);
  }

  return (
    <span ref={root} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }} className="relative inline-block align-middle">
      <button
        ref={trigger}
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        type="button"
        title={topic.tooltip}
        aria-label={`Помощь: ${topic.label}`}
        onClick={() => setOpen((o) => !o)}
        className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-300"
      >
        ?
      </button>
      {open && (
        <div ref={popup} id={popupId} role="note" style={position} className="fixed z-20 max-h-[70vh] w-64 max-w-[calc(100vw-24px)] overflow-auto rounded-lg bg-white p-4 text-left shadow-lg ring-1 ring-slate-200">
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
