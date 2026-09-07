import type { SessionView } from '../api/types';
import { Card } from './Card';

export function ValidationPanel({ session }: { session: SessionView }) {
  const diagnostics = session.validation?.technical?.diagnostics ?? [];
  const findings = session.validation?.architectural?.findings ?? [];
  const checked = session.summary.hasBlockingValidationIssues;
  return <Card className="space-y-4">
    <div><p className="eyebrow">Качество изменений</p><h2 className="mt-1 text-lg font-semibold">Результаты проверок</h2></div>
    <p className={`text-sm ${checked === false ? 'text-emerald-800' : 'text-slate-600'}`}>
      {checked === undefined ? 'Проверка ещё не завершена. Применение будет доступно после её окончания.'
        : checked ? 'Найдены проблемы, которые нужно устранить до применения.'
          : 'Блокирующих проблем нет. Изменения прошли проверку.'}
    </p>
    {(diagnostics.length > 0 || findings.length > 0) && <ul className="space-y-3 text-sm">
      {diagnostics.map((d, i) => <li key={`d-${i}`} className="rounded-xl bg-slate-50 p-3">
        <p className="font-medium">{d.severity === 'error' ? 'Ошибка' : d.severity === 'warning' ? 'Предупреждение' : 'Информация'} · {d.message}</p>
        <p className="mt-1 break-all font-mono text-xs text-slate-500">{d.file}{d.range ? `:${d.range.startLine}` : ''}</p>
      </li>)}
      {findings.map((f, i) => <li key={`f-${i}`} className="rounded-xl bg-slate-50 p-3">
        <p className="font-medium">{f.severity === 'must' ? 'Обязательное исправление' : 'Рекомендация'} · {f.message}</p>
        <p className="mt-1 text-xs text-slate-500">Правило: {f.ruleId} · Предложение: {session.proposal?.items.find((item) => item.id === f.affectedItemId)?.title ?? f.affectedItemId}</p>
      </li>)}
    </ul>}
  </Card>;
}
