import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { ErrorState } from './ErrorState';

export function QueryState({ error, onRetry, label = 'Загружаем данные…' }: {
  error?: unknown; onRetry?: () => void; label?: string;
}) {
  if (error) return (
    <div className="space-y-4">
      <ErrorState error={error instanceof ApiError ? error.error : {
        id: 'ui.load-failed', title: 'Не удалось загрузить данные',
        likelyCause: 'Не удалось получить ответ от сервиса.',
        suggestedAction: 'Повторите попытку или вернитесь к проектам.', retryable: true,
      }} onRetry={onRetry} />
      <Link className="btn-secondary" to="/">К проектам</Link>
    </div>
  );
  return <div role="status" className="loading-state"><span className="loading-dot" />{label}</div>;
}
