import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArchitectureRule } from '../api/types';
import {
  ApiError,
  createArchitectureRule,
  deleteArchitectureRule,
  listArchitectureRules,
  updateArchitectureRule,
} from '../api/client';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { HelpAnchor } from '../ui-kit/help/HelpAnchor';

type RuleFormValue = {
  title: string;
  description: string;
  appliesToKinds: string;
  severity: 'must' | 'should';
  requiredMetadata: string;
  namingConventionPattern: string;
  examples: string;
};

const EMPTY_FORM: RuleFormValue = {
  title: '',
  description: '',
  appliesToKinds: '',
  severity: 'must',
  requiredMetadata: '',
  namingConventionPattern: '',
  examples: '',
};

function toFormValue(rule: ArchitectureRule): RuleFormValue {
  return {
    title: rule.title,
    description: rule.description,
    appliesToKinds: rule.appliesToKinds.join(', '),
    severity: rule.severity,
    requiredMetadata: rule.requiredMetadata?.join(', ') ?? '',
    namingConventionPattern: rule.namingConventionPattern ?? '',
    examples: rule.examples?.join(', ') ?? '',
  };
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toPayload(form: RuleFormValue): Omit<ArchitectureRule, 'id'> {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    appliesToKinds: splitList(form.appliesToKinds),
    severity: form.severity,
    requiredMetadata: form.requiredMetadata.trim() ? splitList(form.requiredMetadata) : undefined,
    namingConventionPattern: form.namingConventionPattern.trim() || undefined,
    examples: form.examples.trim() ? splitList(form.examples) : undefined,
  };
}

export function ArchitectureRulesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [editingRuleId, setEditingRuleId] = useState<string | 'new' | null>(null);

  const { data: rules, error, isLoading, refetch } = useQuery({
    queryKey: ['architecture-rules', projectId],
    queryFn: () => listArchitectureRules(projectId!),
    enabled: Boolean(projectId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['architecture-rules', projectId] });

  const createMutation = useMutation({
    mutationFn: (form: RuleFormValue) => createArchitectureRule(projectId!, toPayload(form)),
    onSuccess: () => {
      invalidate();
      setEditingRuleId(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ ruleId, form }: { ruleId: string; form: RuleFormValue }) =>
      updateArchitectureRule(projectId!, ruleId, toPayload(form)),
    onSuccess: () => {
      invalidate();
      setEditingRuleId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => deleteArchitectureRule(projectId!, ruleId),
    onSuccess: () => invalidate(),
  });

  return (
    <div>
      <Link to={`/projects/${projectId}`} className="text-sm text-slate-500 hover:text-slate-700">
        ← Назад к проекту
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">
          Architecture Rules
          <HelpAnchor topicId="screen.architecture-rules" />
        </h1>
        {editingRuleId === null && (
          <button
            type="button"
            onClick={() => setEditingRuleId('new')}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Новое правило
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Формальные правила моделирования проекта — AI обязан их соблюдать при генерации изменений, они имеют приоритет
        над общими знаниями о LikeC4.
      </p>

      {editingRuleId === 'new' && (
        <RuleForm
          initial={EMPTY_FORM}
          pending={createMutation.isPending}
          error={createMutation.error}
          onCancel={() => setEditingRuleId(null)}
          onSubmit={(form) => createMutation.mutate(form)}
        />
      )}

      <div className="mt-6 space-y-3">
        {isLoading && <p className="text-sm text-slate-500">Загрузка…</p>}
        {error instanceof ApiError && <ErrorState error={error.error} onRetry={() => refetch()} />}
        {rules?.length === 0 && editingRuleId === null && (
          <Card>
            <p className="text-sm text-slate-500">Правил пока нет. Добавьте первое, чтобы задать стандарт моделирования проекта.</p>
          </Card>
        )}
        {rules?.map((rule) =>
          editingRuleId === rule.id ? (
            <RuleForm
              key={rule.id}
              initial={toFormValue(rule)}
              pending={updateMutation.isPending}
              error={updateMutation.error}
              onCancel={() => setEditingRuleId(null)}
              onSubmit={(form) => updateMutation.mutate({ ruleId: rule.id, form })}
            />
          ) : (
            <Card key={rule.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-900">{rule.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        rule.severity === 'must' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {rule.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{rule.description}</p>
                  <p className="mt-2 text-xs text-slate-400">Применяется к: {rule.appliesToKinds.join(', ')}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingRuleId(rule.id)}
                    className="text-sm text-slate-500 hover:text-slate-800"
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(rule.id)}
                    className="text-sm text-rose-500 hover:text-rose-700"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}

function RuleForm({
  initial,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  initial: RuleFormValue;
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onSubmit: (form: RuleFormValue) => void;
}) {
  const [form, setForm] = useState(initial);

  return (
    <Card className="mt-4">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(form);
        }}
      >
        <TextField label="Название правила" value={form.title} onChange={(v) => setForm({ ...form, title: v })} required />
        <TextAreaField
          label="Описание"
          value={form.description}
          onChange={(v) => setForm({ ...form, description: v })}
          required
        />
        <TextField
          label="Применяется к kind (через запятую)"
          value={form.appliesToKinds}
          onChange={(v) => setForm({ ...form, appliesToKinds: v })}
          placeholder="rest-api, service"
          required
        />
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Важность
            <HelpAnchor topicId="field.architecture-rule-severity" />
          </span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            value={form.severity}
            onChange={(event) => setForm({ ...form, severity: event.target.value as 'must' | 'should' })}
          >
            <option value="must">must — блокирует Apply</option>
            <option value="should">should — предупреждение</option>
          </select>
        </label>
        <TextField
          label="Обязательные metadata-поля (через запятую, необязательно)"
          value={form.requiredMetadata}
          onChange={(v) => setForm({ ...form, requiredMetadata: v })}
          placeholder="owner, sla"
        />
        <TextField
          label="Regex для naming convention (необязательно)"
          value={form.namingConventionPattern}
          onChange={(v) => setForm({ ...form, namingConventionPattern: v })}
          placeholder="^(get|create|update|delete)[A-Z].*"
        />
        <TextField
          label="Примеры (через запятую, необязательно)"
          value={form.examples}
          onChange={(v) => setForm({ ...form, examples: v })}
          placeholder="getOrder, createOrder"
        />

        {error instanceof ApiError && <ErrorState error={error.error} />}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">
            Отмена
          </button>
        </div>
      </form>
    </Card>
  );
}

function TextField({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        rows={2}
      />
    </label>
  );
}
