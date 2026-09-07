import { useState } from 'react';
import type { ProposalItem } from '../api/types';
import { Card } from './Card';

export interface DecisionInput {
  decision: 'approved' | 'rejected' | 'edited';
  decisionNote?: string;
  proposedLikeC4Code?: string;
}

const TYPE_LABELS: Record<string, string> = {
  'new-element': 'Новый элемент',
  'modified-element': 'Изменение элемента',
  'new-relationship': 'Новая связь',
  'modified-relationship': 'Изменение связи',
  'api-definition': 'Определение API',
  'data-model': 'Модель данных',
  'sequence-diagram': 'Диаграмма последовательности',
  view: 'View',
  risk: 'Риск',
  assumption: 'Допущение',
  'no-change': 'Без изменений',
};

const DECISION_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Ожидает решения', className: 'bg-slate-100 text-slate-600' },
  approved: { label: 'Принято', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Отклонено', className: 'bg-rose-100 text-rose-700' },
  edited: { label: 'Отредактировано', className: 'bg-blue-100 text-blue-700' },
  'regenerate-requested': { label: 'Перегенерируется…', className: 'bg-amber-100 text-amber-700' },
};

/**
 * Карточка одного ProposalItem (стадия 11/12, Milestone 8) — Approve/Reject/Edit/Regenerate
 * per-item, как того требует DoD milestone'а. Explanation и sources всегда видны целиком —
 * это контракт объяснимости (ФТ13), а не деталь, которую можно спрятать за "подробнее".
 */
export function ProposalItemCard({
  item,
  onDecide,
  onRegenerate,
  isSubmitting,
}: {
  item: ProposalItem;
  onDecide: (input: DecisionInput) => void;
  onRegenerate: () => void;
  isSubmitting: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState(item.proposedLikeC4Code ?? '');
  const [decisionNote, setDecisionNote] = useState('');

  const decisionBadge = DECISION_LABELS[item.decision] ?? DECISION_LABELS.pending!;

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{TYPE_LABELS[item.type] ?? item.type}</p>
          <p className="mt-0.5 font-medium text-slate-900">{item.title}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${decisionBadge.className}`}>{decisionBadge.label}</span>
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs font-medium text-slate-400">Что</dt>
          <dd className="text-slate-700">{item.explanation.what}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-400">Почему</dt>
          <dd className="text-slate-700">{item.explanation.why}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-400">Эффект</dt>
          <dd className="text-slate-700">{item.explanation.impact}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-400">Уверенность</dt>
          <dd className="text-slate-700">{Math.round(item.explanation.confidence * 100)}%</dd>
        </div>
        {item.explanation.assumptions.length > 0 && (
          <div>
            <dt className="text-xs font-medium text-slate-400">Допущения</dt>
            <dd>
              <ul className="list-inside list-disc text-slate-700">
                {item.explanation.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-3">
        <p className="text-xs font-medium text-slate-400">Источники ({item.sources.length})</p>
        <ul className="mt-1 space-y-1 text-xs text-slate-500">
          {item.sources.map((s, i) => (
            <li key={i}>
              {s.label}
              {s.excerpt && <span className="text-slate-400"> — {s.excerpt}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3">
        <p className="text-xs font-medium text-slate-400">Черновик LikeC4 (не финален)</p>
        {isEditing ? (
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-slate-500 focus:outline-none"
            rows={4}
            value={editedCode}
            onChange={(event) => setEditedCode(event.target.value)}
          />
        ) : (
          <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-700">{item.proposedLikeC4Code || '(пусто)'}</pre>
        )}
      </div>

      {isEditing && (
        <input
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          placeholder="Комментарий к правке (необязательно)"
          value={decisionNote}
          onChange={(event) => setDecisionNote(event.target.value)}
        />
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {isEditing ? (
          <>
            <button
              type="button"
              disabled={isSubmitting || !editedCode.trim()}
              onClick={() => {
                onDecide({ decision: 'edited', decisionNote: decisionNote.trim() || undefined, proposedLikeC4Code: editedCode });
                setIsEditing(false);
              }}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Сохранить правку
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Отмена
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => onDecide({ decision: 'approved' })}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Принять
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => onDecide({ decision: 'rejected' })}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              Отклонить
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsEditing(true)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Изменить
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onRegenerate}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Перегенерировать
            </button>
          </>
        )}
      </div>
    </Card>
  );
}
