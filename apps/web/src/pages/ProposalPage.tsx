import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decideProposalItem, getSession, regenerateProposalItem } from '../api/client';
import { Card } from '../components/Card';
import { ProposalItemCard, type DecisionInput } from '../components/ProposalItemCard';

export function ProposalPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSession(sessionId!),
    enabled: Boolean(sessionId),
  });

  const decideMutation = useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: DecisionInput }) => decideProposalItem(sessionId!, itemId, input),
    onSuccess: (updated) => queryClient.setQueryData(['session', sessionId], updated),
  });

  const regenerateMutation = useMutation({
    mutationFn: (itemId: string) => regenerateProposalItem(sessionId!, itemId),
    onSuccess: (updated) => queryClient.setQueryData(['session', sessionId], updated),
  });

  if (isLoading || !session) {
    return <p className="text-sm text-slate-500">Загружаем предложения…</p>;
  }

  const items = session.proposal?.items ?? [];
  const allDecided = items.length > 0 && items.every((item) => item.decision === 'approved' || item.decision === 'rejected' || item.decision === 'edited');

  return (
    <div className="max-w-2xl">
      <Link to={`/sessions/${sessionId}`} className="text-sm text-slate-500 hover:text-slate-700">
        ← Назад к анализу
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Предложения по изменению архитектуры</h1>
      <p className="mt-1 text-sm text-slate-500">
        Каждое предложение опирается на источники и объяснение — примите, отклоните, отредактируйте вручную или запросите
        перегенерацию. Pipeline продолжится, когда решение принято по каждому пункту.
      </p>

      {items.length === 0 && (
        <Card className="mt-6">
          <p className="text-sm text-slate-500">Предложений нет — анализ не выявил изменений, требующих проверки.</p>
        </Card>
      )}

      {allDecided && (
        <Card className="mt-6 bg-emerald-50 ring-emerald-200">
          <p className="text-sm font-medium text-emerald-700">
            Решение принято по всем пунктам — pipeline продолжает работу. Вернитесь к анализу, чтобы увидеть итог.
          </p>
        </Card>
      )}

      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <ProposalItemCard
            key={item.id}
            item={item}
            isSubmitting={decideMutation.isPending || regenerateMutation.isPending}
            onDecide={(input) => decideMutation.mutate({ itemId: item.id, input })}
            onRegenerate={() => regenerateMutation.mutate(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
