import { Link } from 'react-router-dom';
import type { UserFacingError } from '@likec4-ai/core-domain';
import { getHelpTopic } from '../ui-kit/help/content';

/**
 * Единственное место, рендерящее ошибку в UI — принимает только
 * UserFacingError, никогда сырое исключение. См. ФТ19: title/likelyCause/
 * suggestedAction обязательны, "Error 500" здесь появиться не может.
 */
export function ErrorState({ error, onRetry }: { error: UserFacingError; onRetry?: () => void }) {
  const helpTopic = error.helpTopicId ? getHelpTopic(error.helpTopicId) : undefined;

  return (
    <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4">
      <p className="font-medium text-rose-900">{error.title}</p>
      <p className="mt-1 text-sm text-rose-700">{error.likelyCause}</p>
      <p className="mt-1 text-sm text-rose-700">{error.suggestedAction}</p>
      <div className="mt-3 flex items-center gap-3">
        {error.retryable && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
          >
            Повторить
          </button>
        )}
        {helpTopic && (
          <Link to={`/help#${helpTopic.docLink.split('#')[1] ?? helpTopic.docLink}`} className="text-sm font-medium text-rose-900 hover:underline">
            Подробнее →
          </Link>
        )}
      </div>
    </div>
  );
}
