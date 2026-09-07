import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { compareLines } from '@likec4-ai/core-domain';
import { useSession } from '../hooks/useSession';
import { QueryState } from '../components/QueryState';
import { Card } from '../components/Card';
import { HelpAnchor } from '../ui-kit/help/HelpAnchor';
import type { FileDiff } from '../api/types';

const labels = { added: 'Новый файл', modified: 'Изменён', deleted: 'Удалён' };

export function DiffPage() {
  const { id } = useParams<{ id: string }>();
  const query = useSession(id);
  const [selectedPath, setSelectedPath] = useState<string>();
  const session = query.data;
  if (!session) return <QueryState error={query.error} onRetry={() => query.refetch()} />;
  if (!session.diff) return <Card><h1 className="text-lg font-semibold">Сравнение ещё не готово</h1><Link to={`/sessions/${id}`} className="btn-secondary mt-4">К анализу</Link></Card>;
  const active = session.diff.find((f) => f.path === selectedPath) ?? session.diff[0];
  return <div className="space-y-6">
    <div><p className="eyebrow mb-3">Проверка результата</p><h1 className="page-title">Изменения в коде<HelpAnchor topicId="screen.diff" /></h1><p className="page-description">Файлов: {session.diff.length}. Проверьте добавленные и удалённые строки перед применением.</p></div>
    {active ? <div className="review-workspace">
      <nav aria-label="Изменённые файлы" className="review-list">{session.diff.map((file) => <button key={file.path} className={`review-list-item ${active.path === file.path ? 'active' : ''}`} aria-pressed={active.path === file.path} onClick={() => setSelectedPath(file.path)}><span className="block break-all font-mono text-xs">{file.path}</span><span className="mt-2 block text-xs text-slate-500">{labels[file.changeType]}</span></button>)}</nav>
      <FileComparison key={active.path} file={active} />
    </div> : <Card><p>Изменений в файлах нет.</p><Link to={`/projects/${session.projectId}`} className="text-link mt-3 inline-block">Вернуться в проект →</Link></Card>}
    {session.previewViews !== undefined && <Link to={`/sessions/${id}/preview`} className="btn-primary">Посмотреть диаграммы →</Link>}
  </div>;
}

function FileComparison({ file }: { file: FileDiff }) {
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState<'diff' | 'full'>('diff');
  const comparison = useMemo(() => compareLines(file.before ?? '', file.after ?? ''), [file.before, file.after]);
  const rows = comparison.lines;
  const visible = new Set<number>();
  rows.forEach((row, index) => {
    if (row.kind !== 'context') for (let i = Math.max(0, index - 3); i <= Math.min(rows.length - 1, index + 3); i++) visible.add(i);
  });
  const rendered: React.ReactNode[] = [];
  let hidden = 0;
  const flush = (key: number) => {
    if (hidden === 0) return;
    rendered.push(<tr key={`gap-${key}`}><td colSpan={4} className="bg-slate-50 p-2 text-center"><button className="text-link" onClick={() => setShowAll(true)}>Показать неизменённые строки ({hidden})</button></td></tr>);
    hidden = 0;
  };
  rows.forEach((row, index) => {
    if (!showAll && !visible.has(index)) { hidden++; return; }
    flush(index);
    rendered.push(<tr key={index} className={row.kind === 'added' ? 'bg-emerald-50' : row.kind === 'removed' ? 'bg-rose-50' : ''}>
      <td className="select-none px-2 text-right text-slate-500">{row.beforeLine ?? ''}</td><td className="select-none px-2 text-right text-slate-500">{row.afterLine ?? ''}</td>
      <td className="px-2"><span aria-label={row.kind === 'added' ? 'Добавлено' : row.kind === 'removed' ? 'Удалено' : 'Без изменений'}>{row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '}</span></td>
      <td className="whitespace-pre pr-4">{row.text.replace(/\r?\n$/, '')}{!row.text.endsWith('\n') && <span className="ml-4 text-xs text-slate-500">↵ Нет перевода строки</span>}</td>
    </tr>);
  });
  flush(rows.length);
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="space-y-3 border-b border-slate-200 p-5"><h2 className="break-all font-mono text-sm font-semibold">{file.path}</h2><div className="flex flex-wrap items-center gap-3 text-xs"><span className="text-emerald-800">+{rows.filter((r) => r.kind === 'added').length} добавлено</span><span className="text-rose-800">−{rows.filter((r) => r.kind === 'removed').length} удалено</span><button className="text-link" onClick={() => setMode(mode === 'diff' ? 'full' : 'diff')}>{mode === 'diff' ? 'Полные файлы' : 'Построчно'}</button>{mode === 'diff' && <label className="flex items-center gap-2"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />Все строки</label>}</div></div>
    {comparison.simplified && <p className="p-4 text-xs text-slate-500">Большой изменённый блок показан как замена целиком.</p>}
    {mode === 'diff' ? <div className="max-h-[70vh] overflow-auto" tabIndex={0} aria-label="Построчное сравнение"><table className="w-full font-mono text-xs leading-6"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-2">До</th><th className="px-2">После</th><th><span className="sr-only">Изменение</span></th><th className="text-left">Код</th></tr></thead><tbody>{rendered}</tbody></table></div> : <div className="grid gap-4 p-4 xl:grid-cols-2">{(['before', 'after'] as const).map((side) => <div key={side} className="min-w-0"><p className="mb-2 text-xs font-semibold">{side === 'before' ? 'До' : 'После'}</p><pre className="max-h-[60vh] overflow-auto rounded-lg bg-slate-50 p-3 text-xs" tabIndex={0}>{file[side] ?? '(файла нет)'}</pre></div>)}</div>}
  </section>;
}
