import { useMutation } from '@tanstack/react-query';
import { ApiError, sessionNotAccepted } from '../api/http';
import type { ActivitySummary } from '../api/types';
import { useSession } from '../auth/session';
import { formatUtcDay } from '../lib/format';
import { typeLabel } from '../lib/securityEvents';
import { describeError } from '../lib/useAuthedQuery';
import { TrailResult } from './ChainTrail';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One sentence for a refused or failed summary, by what the server answered. */
function refusal(err: unknown): string {
  if (sessionNotAccepted(err)) {
    return 'This server takes only an API key for the activity summary. A qwed-verification release with #485 takes the session.';
  }
  if (err instanceof ApiError && err.status === 403) {
    return `Only an owner or admin can see the activity summary. The server said: ${err.message}.`;
  }
  if (err instanceof ApiError && err.status === 404) return 'This server has no activity summary.';
  return describeError(err);
}

function Summary({ summary }: Readonly<{ summary: ActivitySummary }>) {
  const { period, metrics } = summary;
  const types = Object.entries(metrics.security_events_by_type);
  return (
    <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="sub">
        {formatUtcDay(Date.parse(period.start))} to {formatUtcDay(Date.parse(period.end))} UTC,{' '}
        {plural(period.days, 'day', 'days')}.
      </p>
      <dl className="kv">
        <dt>Verifications</dt>
        <dd className="num">{metrics.total_verifications}</dd>
        <dt>Security events</dt>
        <dd className="num">
          {metrics.security_events_detected}
          {types.length > 0 && (
            <span className="hint" style={{ display: 'block' }}>
              {types.map(([type, n]) => `${typeLabel(type)}: ${n}`).join(', ')}
            </span>
          )}
        </dd>
        <dt>Active users</dt>
        <dd className="num">{metrics.active_users}</dd>
        <dt>Active API keys</dt>
        <dd className="num">{metrics.active_api_keys}</dd>
      </dl>
      <strong style={{ fontSize: 13, color: 'var(--ink)' }}>Audit chain in the period</strong>
      <TrailResult trail={summary.audit_trail} />
      <p className="hint" style={{ margin: 0 }}>
        {summary.disclaimer}
      </p>
    </div>
  );
}

/**
 * The server's own counts for the last 90 days (#476), loaded on request:
 * the server checks every audit entry in the period to answer. Unlike the
 * rest of the overview, it does not depend on how many records are loaded.
 */
export function ActivitySummaryCard() {
  const { api, token, user } = useSession();
  const summary = useMutation({ mutationFn: (args: { token: string; orgId: string }) => api.activitySummary(args.token, args.orgId) });
  const ready = token && user ? { token, orgId: user.org_id } : null;
  let label = 'Load the 90-day summary';
  if (summary.isPending) label = 'Loading…';
  else if (summary.data) label = 'Load again';

  return (
    <section className="card" aria-labelledby="summary-title">
      <h2 id="summary-title">Last 90 days</h2>
      <p className="sub">
        Counted by the server from all its records, not from the records loaded here. It checks every audit entry in the
        period, so it can take a while.
      </p>
      <div>
        <button
          type="button"
          className="btn btn-sm"
          disabled={summary.isPending || !ready}
          onClick={() => ready && summary.mutate(ready)}
        >
          {label}
        </button>
      </div>
      {summary.isError && (
        <p className="alert" role="alert">
          {refusal(summary.error)}
        </p>
      )}
      {summary.data && <Summary summary={summary.data} />}
    </section>
  );
}
