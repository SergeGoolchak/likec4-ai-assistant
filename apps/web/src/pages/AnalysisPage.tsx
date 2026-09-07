import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import type { PipelineStageId, SessionView } from '../api/types';
import { ApiError, answerQuestion } from '../api/client';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { QuestionCard, type QuestionAnswerInput } from '../components/QuestionCard';

const STAGE_ORDER: { id: PipelineStageId; label: string; isDone: (s: SessionView) => boolean }[] = [
  { id: 'load-confluence', label: 'Чтение Confluence', isDone: (s) => s.summary.confluenceTitle !== undefined },
  { id: 'parse-specification', label: 'Разбор спецификации', isDone: (s) => s.summary.specificationChunkCount !== undefined },
  { id: 'load-likec4', label: 'Чтение существующей архитектуры', isDone: (s) => s.summary.existingFileCount !== undefined },
  { id: 'build-architecture-graph', label: 'Построение графа архитектуры', isDone: (s) => s.summary.elementCount !== undefined },
  { id: 'extract-requirements', label: 'Извлечение требований', isDone: (s) => s.summary.extractedRequirementCount !== undefined },
  { id: 'entity-matching', label: 'Сопоставление с существующей архитектурой', isDone: (s) => s.summary.matchedRequirementCount !== undefined },
  { id: 'gap-analysis', label: 'Анализ пробелов в архитектуре', isDone: (s) => s.summary.changeCandidateCount !== undefined },
  { id: 'ambiguity-detection', label: 'Выявление неоднозначностей', isDone: (s) => s.summary.ambiguityCount !== undefined },
  { id: 'user-clarification', label: 'Уточнения от вас', isDone: (s) => s.questions.every((q) => q.status !== 'open') },
  { id: 'proposal-generation', label: 'Формирование предложений', isDone: (s) => s.proposal !== undefined },
  {
    id: 'user-review',
    label: 'Проверка предложений вами',
    isDone: (s) => (s.proposal?.items ?? []).every((item) => item.decision === 'approved' || item.decision === 'rejected' || item.decision === 'edited'),
  },
  { id: 'likec4-generation', label: 'Генерация LikeC4', isDone: (s) => s.summary.generatedFileCount !== undefined },
  { id: 'validation', label: 'Техническая валидация', isDone: (s) => s.summary.technicalDiagnosticsCount !== undefined },
  { id: 'architecture-review', label: 'Архитектурная проверка', isDone: (s) => s.summary.architecturalFindingsCount !== undefined },
  { id: 'repair', label: 'Исправление ошибок валидации', isDone: (s) => s.summary.hasBlockingValidationIssues === false },
  { id: 'diff', label: 'Сравнение изменений', isDone: (s) => s.summary.diffFileCount !== undefined },
  { id: 'preview', label: 'Рендер превью диаграмм', isDone: (s) => s.summary.previewViewCount !== undefined },
  { id: 'apply', label: 'Применение изменений', isDone: (s) => s.applyResult !== undefined },
];

export function AnalysisPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionView | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    const source = new EventSource(`/api/sessions/${sessionId}/events`);

    source.addEventListener('snapshot', (event) => {
      setSession(JSON.parse((event as MessageEvent).data));
    });
    source.onerror = () => setConnectionLost(true);

    return () => source.close();
    // connectionAttempt — не читается внутри, но нарочно в зависимостях: после ответа на
    // последний открытый вопрос предыдущий EventSource уже закрыт (см. sessions.ts, SSE-роут
    // завершает соединение на paused-for-user) — это способ открыть новый и снова слушать live-статусы.
  }, [sessionId, connectionAttempt]);

  const answerMutation = useMutation({
    mutationFn: ({ questionId, input }: { questionId: string; input: QuestionAnswerInput }) =>
      answerQuestion(sessionId!, questionId, input),
    onSuccess: (updated) => {
      setSession(updated);
      setConnectionLost(false);
      setConnectionAttempt((n) => n + 1);
    },
  });

  if (!session) {
    return <p className="text-sm text-slate-500">Подключаемся к сессии анализа…</p>;
  }

  const firstPendingIndex = STAGE_ORDER.findIndex((stage) => !stage.isDone(session));
  const currentIndex = firstPendingIndex === -1 ? STAGE_ORDER.length : firstPendingIndex;
  const openQuestions = session.questions.filter((q) => q.status === 'open');

  return (
    <div className="max-w-lg">
      <Link to={`/projects/${session.projectId}`} className="text-sm text-slate-500 hover:text-slate-700">
        ← Назад к проекту
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Анализ спецификации</h1>
      {connectionLost && session.status === 'running' && (
        <p className="mt-1 text-xs text-amber-600">Соединение для live-обновлений прервано — статус может отставать.</p>
      )}

      <Card className="mt-6">
        <ul className="space-y-3">
          {STAGE_ORDER.map((stage, index) => {
            const done = stage.isDone(session);
            const isRunning = index === currentIndex && session.status === 'running';
            const isPaused = index === currentIndex && session.status === 'paused-for-user';
            const isFailedHere = index === currentIndex && session.status === 'failed';
            return (
              <li key={stage.id} className="flex items-center gap-3 text-sm">
                <StageIcon done={done} running={isRunning} paused={isPaused} failed={isFailedHere} />
                <span className={done ? 'text-slate-900' : isFailedHere ? 'text-rose-700' : 'text-slate-500'}>{stage.label}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      {session.status === 'paused-for-user' && openQuestions.length > 0 && (
        <div className="mt-6 space-y-4">
          <p className="text-sm font-medium text-amber-700">
            Нужны уточнения, прежде чем продолжить — {openQuestions.length} {questionWord(openQuestions.length)}:
          </p>
          {openQuestions.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              isSubmitting={answerMutation.isPending}
              onAnswer={(input) => answerMutation.mutate({ questionId: question.id, input })}
            />
          ))}
          {answerMutation.error instanceof ApiError && <ErrorState error={answerMutation.error.error} />}
        </div>
      )}

      {session.status === 'paused-for-user' && session.currentStage === 'user-review' && (
        <Card className="mt-6 bg-amber-50 ring-amber-200">
          <p className="text-sm font-medium text-amber-700">
            Сформировано предложений: {session.proposal?.items.length ?? 0}. Нужно принять решение по каждому, прежде чем pipeline
            продолжит работу.
          </p>
          <Link
            to={`/sessions/${session.id}/proposal`}
            className="mt-2 inline-block rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Перейти к предложениям
          </Link>
        </Card>
      )}

      {session.status === 'paused-for-user' && session.currentStage === 'apply' && (
        <Card className="mt-6 bg-amber-50 ring-amber-200">
          <p className="text-sm font-medium text-amber-700">
            Изменения готовы к применению — {session.summary.diffFileCount ?? 0} {fileWord(session.summary.diffFileCount ?? 0)}.
          </p>
          <Link
            to={`/sessions/${session.id}/diff`}
            className="mt-2 inline-block rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Перейти к Diff
          </Link>
        </Card>
      )}

      {session.status === 'failed' && session.error && (
        <div className="mt-6">
          <ErrorState error={session.error} />
        </div>
      )}

      {session.status === 'completed' && (
        <Card className="mt-6">
          <p className="font-medium text-emerald-700">Готово: {session.summary.confluenceTitle}</p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Чанков спецификации" value={session.summary.specificationChunkCount} />
            <Stat label="Файлов модели" value={session.summary.existingFileCount} />
            <Stat label="Элементов" value={session.summary.elementCount} />
            <Stat label="Views" value={session.summary.viewCount} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
            <Stat label="Требований извлечено" value={session.summary.extractedRequirementCount} />
            <Stat label="Сопоставлено с существующим" value={session.summary.matchedRequirementCount} />
            <Stat label="Предложений изменений" value={session.summary.changeCandidateCount} />
          </div>
          {session.proposal && session.proposal.items.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
              <Stat label="Принято" value={session.proposal.items.filter((i) => i.decision === 'approved').length} />
              <Stat label="Отклонено" value={session.proposal.items.filter((i) => i.decision === 'rejected').length} />
              <Stat label="Отредактировано" value={session.proposal.items.filter((i) => i.decision === 'edited').length} />
            </div>
          )}
          {session.summary.generatedFileCount !== undefined && (
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
              <Stat label="Файлов сгенерировано" value={session.summary.generatedFileCount} />
              <Stat label="Технических диагностик" value={session.summary.technicalDiagnosticsCount} />
              <Stat label="Архитектурных находок" value={session.summary.architecturalFindingsCount} />
              <Stat label="Попыток исправления" value={session.summary.repairAttemptCount ?? 0} />
            </div>
          )}
          {Boolean(session.summary.existingModelDiagnosticsCount) && (
            <p className="mt-3 text-xs text-amber-600">
              В существующей модели найдено диагностик: {session.summary.existingModelDiagnosticsCount}
            </p>
          )}
          {session.applyResult && (
            <p className="mt-4 border-t border-slate-100 pt-4 text-sm font-medium text-emerald-700">
              Применено — изменено файлов: {session.applyResult.filesChanged.length}.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-4 text-sm">
            <Link to={`/sessions/${session.id}/diff`} className="text-slate-500 hover:text-slate-700">
              Diff →
            </Link>
            <Link to={`/sessions/${session.id}/preview`} className="text-slate-500 hover:text-slate-700">
              Preview →
            </Link>
            <Link to={`/sessions/${session.id}/apply`} className="text-slate-500 hover:text-slate-700">
              Apply →
            </Link>
            <Link to={`/projects/${session.projectId}/history`} className="text-slate-500 hover:text-slate-700">
              History →
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}

function fileWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'файл';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'файла';
  return 'файлов';
}

function questionWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'вопрос';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'вопроса';
  return 'вопросов';
}

function StageIcon({ done, running, paused, failed }: { done: boolean; running: boolean; paused: boolean; failed: boolean }) {
  if (done) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs text-white">✓</span>
    );
  }
  if (failed) {
    return <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs text-white">✕</span>;
  }
  if (paused) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs text-white">?</span>
    );
  }
  if (running) {
    return <span className="h-5 w-5 shrink-0 animate-pulse rounded-full border-2 border-slate-900" aria-hidden />;
  }
  return <span className="h-5 w-5 shrink-0 rounded-full border-2 border-slate-200" aria-hidden />;
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <p className="text-xl font-semibold text-slate-900">{value ?? '—'}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
