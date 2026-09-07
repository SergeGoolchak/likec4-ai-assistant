import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, confirmProposal, decideProposalItem, regenerateProposalItem } from '../api/client';
import { useSession } from '../hooks/useSession';
import { QueryState } from '../components/QueryState';
import { ErrorState } from '../components/ErrorState';
import { Card } from '../components/Card';
import { ProposalItemCard, TYPE_LABELS, DECISION_LABELS, type DecisionInput } from '../components/ProposalItemCard';
import { HelpAnchor } from '../ui-kit/help/HelpAnchor';

export function ProposalPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useSession(id);
  const session = query.data;
  const [selectedId, setSelectedId] = useState<string>();
  const [search, setSearch] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [drafts, setDrafts] = useState<Record<string, boolean>>({});
  const update = (value: NonNullable<typeof session>) => client.setQueryData(['session', id], value);
  const decide = useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: DecisionInput }) => decideProposalItem(id!, itemId, input),
    onSuccess: update,
  });
  const regenerate = useMutation({ mutationFn: (itemId: string) => regenerateProposalItem(id!, itemId), onSuccess: update });
  const confirm = useMutation({
    mutationFn: () => confirmProposal(id!, session!.reviewRevision!),
    onSuccess: (value) => { update(value); navigate(`/sessions/${id}`); },
    onError: () => { void query.refetch(); },
  });
  if (!session) return <QueryState error={query.error} onRetry={() => query.refetch()} />;
  if (!session.proposal) return <Card><h1 className="text-lg font-semibold">Предложения ещё не готовы</h1><Link to={`/sessions/${id}`} className="btn-secondary mt-4">К анализу</Link></Card>;

  const items = session.proposal.items;
  const pendingCount = items.filter((i) => ['pending', 'regenerate-requested'].includes(i.decision)).length;
  const editable = session.status === 'paused-for-user' && session.currentStage === 'user-review' && !session.proposal.reviewConfirmedAt;
  const busy = decide.isPending || regenerate.isPending || confirm.isPending;
  const hasDrafts = Object.values(drafts).some(Boolean);
  const filtered = items.filter((i) =>
    (decisionFilter === 'all' || (decisionFilter === 'pending' ? ['pending', 'regenerate-requested'].includes(i.decision) : i.decision === decisionFilter))
    && (typeFilter === 'all' || i.type === typeFilter)
    && `${i.title} ${i.explanation.what}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const selected = filtered.find((i) => i.id === selectedId) ?? filtered[0];

  return <div className="space-y-6">
    <div><p className="eyebrow mb-3">Решения по архитектуре</p><h1 className="page-title">Проверьте предложения<HelpAnchor topicId="screen.proposal" /></h1><p className="page-description">Изучите источники и обоснования. Решения сохраняются по одному; генерация начнётся после вашего подтверждения.</p></div>
    <section className="review-summary" aria-label="Готовность решений">
      <div><p className="font-semibold">Рассмотрено {items.length - pendingCount} из {items.length}</p><p className="mt-1 text-xs text-slate-500">Принято: {items.filter((i) => ['approved', 'edited'].includes(i.decision)).length} · Отклонено: {items.filter((i) => i.decision === 'rejected').length}</p></div>
      {editable ? <button className="btn-primary" disabled={busy || pendingCount > 0 || hasDrafts || !session.reviewRevision} onClick={() => confirm.mutate()}>Проверить выбранные изменения →</button> : <Link to={`/sessions/${id}`} className="btn-secondary">К результатам анализа →</Link>}
      {editable && <p className="w-full text-xs text-slate-500">{hasDrafts ? 'Сохраните или отмените открытые правки перед продолжением.' : pendingCount > 0 ? `Осталось решений: ${pendingCount}.` : 'Всё рассмотрено. До подтверждения можно пересмотреть любое решение.'}</p>}
      {confirm.error instanceof ApiError && <div className="w-full"><ErrorState error={confirm.error.error} /></div>}
    </section>
    {items.length === 0 ? <Card><p>Предложений нет — изменения не требуются.</p><Link to={`/sessions/${id}`} className="text-link mt-4 inline-block">К анализу →</Link></Card> : <>
      <div className="flex flex-wrap gap-3">
        <label className="min-w-0 flex-1"><span className="sr-only">Поиск предложений</span><input className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="Найти предложение…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <label><span className="sr-only">Фильтр решений</span><select className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm" value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value)}><option value="all">Все решения</option><option value="pending">Нужно решение</option><option value="approved">Принято</option><option value="edited">Отредактировано</option><option value="rejected">Отклонено</option></select></label>
        <label><span className="sr-only">Тип предложения</span><select className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">Все типы</option>{[...new Set(items.map((i) => i.type))].map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</select></label>
      </div>
      <div className="review-workspace">
        <nav aria-label="Предложения" className="review-list">
          {filtered.map((item) => <button key={item.id} className={`review-list-item ${selected?.id === item.id ? 'active' : ''}`} aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(item.id)}><span className="eyebrow">{TYPE_LABELS[item.type]}</span><span className="mt-2 block font-semibold">{item.title}</span><span className="mt-3 block text-xs">{DECISION_LABELS[item.decision]?.label}{drafts[item.id] ? ' · Есть правка' : ''}</span></button>)}
          {filtered.length === 0 && <p className="p-5 text-sm text-slate-500">Предложения не найдены. Измените фильтры.</p>}
        </nav>
        <div className="min-w-0">
          {/* Keep editors mounted when selection/filters change, preserving local drafts. */}
          {items.map((item) => <div key={item.id} hidden={selected?.id !== item.id}>
            <ProposalItemCard item={item} readOnly={!editable} isSubmitting={busy}
              onEditingChange={(editing) => setDrafts((current) => ({ ...current, [item.id]: editing }))}
              error={decide.variables?.itemId === item.id && decide.error instanceof ApiError ? decide.error.error : regenerate.variables === item.id && regenerate.error instanceof ApiError ? regenerate.error.error : undefined}
              onDecide={async (input) => { regenerate.reset(); confirm.reset(); try { await decide.mutateAsync({ itemId: item.id, input }); return true; } catch { return false; } }}
              onRegenerate={() => { decide.reset(); confirm.reset(); regenerate.mutate(item.id); }} />
          </div>)}
          {!selected && <Card><p className="text-sm text-slate-500">Выберите другой фильтр, чтобы продолжить проверку.</p></Card>}
        </div>
      </div>
    </>}
  </div>;
}
