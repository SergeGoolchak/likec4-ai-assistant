import { useState } from 'react';
import type { ClarificationQuestion } from '../api/types';
import { Card } from './Card';

export interface QuestionAnswerInput {
  selectedOptionId?: string;
  freeText?: string;
  markUnknown?: boolean;
  defer?: boolean;
}

/**
 * Один открытый ClarificationQuestion (стадия 9/10) — единственное место в
 * UI, рендерящее вопрос AI. "Не знаю" и "Отложить" всегда доступны отдельно
 * от выбора варианта/текста (ФТ14 — молчаливое предположение недопустимо,
 * но и не отвечать сразу — тоже валидный, явный выбор пользователя).
 */
export function QuestionCard({
  question,
  onAnswer,
  isSubmitting,
}: {
  question: ClarificationQuestion;
  onAnswer: (input: QuestionAnswerInput) => void;
  isSubmitting: boolean;
}) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | undefined>(undefined);
  const [freeText, setFreeText] = useState('');

  const canSubmit = Boolean(selectedOptionId) || freeText.trim().length > 0;

  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{originKindLabel(question.originKind)}</p>
      <p className="mt-1 font-medium text-slate-900">{question.text}</p>
      <p className="mt-1 text-sm text-slate-500">{question.whyNeeded}</p>

      {question.options && question.options.length > 0 && (
        <div className="mt-4 space-y-2">
          {question.options.map((option) => (
            <label key={option.id} className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name={`question-${question.id}`}
                className="mt-0.5"
                checked={selectedOptionId === option.id}
                onChange={() => setSelectedOptionId(option.id)}
              />
              <span>
                {option.label}
                {option.description && <span className="block text-xs text-slate-400">{option.description}</span>}
              </span>
            </label>
          ))}
        </div>
      )}

      {question.allowFreeText && (
        <textarea
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          rows={2}
          placeholder="Свой вариант ответа (необязательно)"
          value={freeText}
          onChange={(event) => setFreeText(event.target.value)}
        />
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canSubmit || isSubmitting}
          onClick={() => onAnswer({ selectedOptionId, freeText: freeText.trim() || undefined })}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Ответить
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => onAnswer({ markUnknown: true })}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Не знаю
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => onAnswer({ defer: true })}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Отложить
        </button>
      </div>
    </Card>
  );
}

function originKindLabel(kind: ClarificationQuestion['originKind']): string {
  switch (kind) {
    case 'specification-fact':
      return 'Факт из спецификации';
    case 'existing-architecture-fact':
      return 'Факт из существующей архитектуры';
    case 'user-decision-needed':
      return 'Нужно ваше решение';
    case 'ai-assumption-needs-confirmation':
      return 'Предположение AI — нужно подтверждение';
  }
}
