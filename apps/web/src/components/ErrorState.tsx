import type { UserFacingError } from '@likec4-ai/core-domain';

/**
 * Единственное место, рендерящее ошибку в UI — принимает только
 * UserFacingError, никогда сырое исключение. См. ФТ19: title/likelyCause/
 * suggestedAction обязательны, "Error 500" здесь появиться не может.
 */
export function ErrorState({ error, onRetry }: { error: UserFacingError; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
      <p className="font-medium text-rose-900">{error.title}</p>
      <p className="mt-1 text-sm text-rose-700">{error.likelyCause}</p>
      <p className="mt-1 text-sm text-rose-700">{error.suggestedAction}</p>
      {error.retryable && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
        >
          Повторить
        </button>
      )}
    </div>
  );
}
