import { describeError } from '../lib/useAuthedQuery';

/**
 * Shown when a background refresh fails after data loaded: the page keeps
 * what it already shows and says it may be out of date.
 */
export function RefreshError({
  what,
  error,
  onRetry,
}: Readonly<{ what: string; error: unknown; onRetry: () => void }>) {
  return (
    <div
      className="note"
      role="alert"
      style={{ margin: '0 24px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
    >
      <span style={{ flex: '1 1 260px' }}>
        {what} could not be refreshed, so what you see may be out of date. {describeError(error)}
      </span>
      <button type="button" className="btn btn-sm" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
