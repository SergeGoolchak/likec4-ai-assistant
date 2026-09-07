import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, answerQuestion } from '../api/client';
import { useSession } from '../hooks/useSession';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { QueryState } from '../components/QueryState';
import { ValidationPanel } from '../components/ValidationPanel';
import { QuestionCard, type QuestionAnswerInput } from '../components/QuestionCard';
import { HelpAnchor } from '../ui-kit/help/HelpAnchor';
import type { PipelineStageId } from '../api/types';

const stages: { id: PipelineStageId; label: string }[] = [
  { id: 'load-confluence', label: 'Чтение спецификации' },
  { id: 'parse-specification', label: 'Разбор спецификации' },
  { id: 'load-likec4', label: 'Чтение модели' },
  { id: 'build-architecture-graph', label: 'Построение графа' },
  { id: 'extract-requirements', label: 'Извлечение требований' },
  { id: 'entity-matching', label: 'Сопоставление с архитектурой' },
  { id: 'gap-analysis', label: 'Поиск необходимых изменений' },
  { id: 'ambiguity-detection', label: 'Поиск неоднозначностей' },
  { id: 'user-clarification', label: 'Уточнения от вас' },
  { id: 'proposal-generation', label: 'Подготовка предложений' },
  { id: 'user-review', label: 'Проверка предложений' },
  { id: 'likec4-generation', label: 'Генерация кода' },
  { id: 'validation', label: 'Проверка синтаксиса' },
  { id: 'architecture-review', label: 'Проверка правил архитектуры' },
  { id: 'repair', label: 'Исправление замечаний' },
  { id: 'diff', label: 'Сравнение изменений' },
  { id: 'preview', label: 'Подготовка диаграмм' },
  { id: 'apply', label: 'Применение изменений' },
];

export function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const { data: session, error, refetch } = useSession(id);
  const answer = useMutation({
    mutationFn: ({ questionId, input }: { questionId: string; input: QuestionAnswerInput }) => answerQuestion(id!, questionId, input),
    onSuccess: (updated) => { client.setQueryData(['session', id], updated); void refetch(); },
  });
  if (!session) return <QueryState error={error} onRetry={() => refetch()} label="Открываем задачу…" />;
  const questions = session.questions.filter((q) => q.status === 'open');
  const waiting = session.status === 'paused-for-user';
  const stageLabel = stages.find((s) => s.id === session.currentStage)?.label ?? 'Анализ спецификации';
  const title = session.status === 'completed' ? 'Работа завершена' : session.status === 'failed' ? 'Анализ остановился с ошибкой' : session.status === 'aborted' ? 'Задача остановлена' : waiting ? 'Следующий шаг — за вами' : stageLabel;

  return <div className="space-y-6">
    <div><p className="eyebrow mb-3">Ход работы</p><h1 className="page-title">Анализ спецификации<HelpAnchor topicId="screen.analysis" /></h1></div>
    <section className={waiting ? 'warm-panel' : 'rounded-2xl border border-slate-200 bg-white p-7'} aria-live="polite">
      <p className="text-xl font-semibold">{title}</p>
      {session.status === 'running' && <p className="mt-2 text-sm text-slate-500">Можно вернуться в проект. Результаты выполненных этапов сохраняются, пока сервис работает.</p>}
      {waiting && questions.length > 0 && <p className="mt-2 text-sm text-slate-600">Осталось уточнений: {questions.length}. Ответьте на вопросы ниже, чтобы продолжить.</p>}
      {waiting && session.currentStage === 'user-review' && <><p className="mt-2 text-sm text-slate-600">Подготовлено предложений: {session.proposal?.items.length ?? 0}. Проверьте обоснования, примите решения и подтвердите выбранные изменения.</p><Link to={`/sessions/${id}/proposal`} className="btn-primary mt-5">Проверить предложения →</Link></>}
      {waiting && session.currentStage === 'apply' && <><p className="mt-2 text-sm text-slate-600">Изменения подготовлены. Перед записью проверьте код и диаграммы.</p><Link to={`/sessions/${id}/diff`} className="btn-primary mt-5">Посмотреть изменения →</Link></>}
      {session.status === 'completed' && <><p className="mt-2 text-sm text-slate-500">{session.applyResult ? `Изменено файлов: ${session.applyResult.filesChanged.length}.` : 'Анализ завершён.'}</p><Link to={`/projects/${session.projectId}`} className="btn-secondary mt-5">Вернуться в проект</Link></>}
    </section>
    {session.error && <ErrorState error={session.error} />}
    {waiting && questions.length > 0 && <section className="space-y-4" aria-label="Уточняющие вопросы">{questions.map((q) => <QuestionCard key={q.id} question={q} isSubmitting={answer.isPending} onAnswer={(input) => answer.mutate({ questionId: q.id, input })} />)}{answer.error instanceof ApiError && <ErrorState error={answer.error.error} />}</section>}
    {session.validation && <ValidationPanel session={session} />}
    <Card><details><summary className="cursor-pointer font-medium">Технические этапы и журнал</summary><ol className="mt-5 grid gap-3 text-sm lg:grid-cols-2">{stages.map((stage) => {
      const done = session.completedStageIds?.includes(stage.id);
      const active = session.currentStage === stage.id && !done;
      const label = done ? 'Завершён' : active ? session.status === 'failed' ? 'Ошибка' : waiting ? 'Ждёт решения' : 'Текущий этап' : 'Не начат';
      return <li key={stage.id} className="flex items-start gap-3"><span aria-hidden className={done ? 'text-emerald-700' : active ? 'text-amber-800' : 'text-slate-400'}>{done ? '✓' : active ? '●' : '○'}</span><span>{stage.label}<span className="block text-xs text-slate-500">{label}</span></span></li>;
    })}</ol>{session.timeline.length > 0 && <ul className="mt-6 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">{session.timeline.map((event, i) => <li key={i}>{new Date(event.at).toLocaleTimeString('ru-RU')} · {event.message}</li>)}</ul>}</details></Card>
  </div>;
}
