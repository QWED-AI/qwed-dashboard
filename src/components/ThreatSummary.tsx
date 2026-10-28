import { ApiError, refusedForRole, sessionNotAccepted } from '../api/http';
import { useSession } from '../auth/session';
import { formatUtcLong } from '../lib/format';
import { describeError, useAuthedQuery, useDataUnlessRefused } from '../lib/useAuthedQuery';
import { Icon } from './Icon';

// The server's threat summary for the organisation (#68), from
// GET /admin/security/threats/{org_id}, which takes the signed-in session
// from qwed-verification #506. The threat level is the server's rating, from
// its own thresholds; the dashboard shows it and works none out.

// As an event's severity is shown: high and critical stand out, the rest are plain.
const LEVEL_CLASS: Record<string, string> = {
  HIGH: 'tag sev-high',
  CRITICAL: 'tag sev-critical',
};

export function threatSummaryError(err: unknown): string {
  if (sessionNotAccepted(err)) {
    return 'This server gives the threat summary only for an API key, not a signed-in session. That needs a qwed-verification release with #506.';
  }
  if (refusedForRole(err)) return 'Only owners and admins can see the threat summary.';
  // Another 403 has its own reason, such as an inactive user or organisation.
  if (err instanceof ApiError && err.status === 403) return `The server refused: ${err.message}.`;
  if (err instanceof ApiError && err.status === 404) return 'This server has no threat summary.';
  return describeError(err);
}

export function ThreatSummary() {
  const { user } = useSession();
  const orgId = user?.org_id ?? '';
  const summary = useAuthedQuery(['threat-summary', orgId], (api, token) => api.threatSummary(token, orgId));
  // A failed refresh keeps the summary shown, marked as maybe out of date; a
  // refusal (403) does not, as the signed-in user may no longer see it.
  const data = useDataUnlessRefused(summary);
  const layers = Object.entries(data?.security_layer_breakdown ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <section className="card" aria-labelledby="threat-summary-title" style={{ margin: '0 24px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="shield" />
        <h2 id="threat-summary-title">Threat summary</h2>
      </div>

      {summary.isPending && (
        <p className="sub" aria-busy="true" style={{ margin: 0 }}>
          Loading the threat summary…
        </p>
      )}

      {summary.isError && !data && (
        <p className="sub" role="alert" style={{ margin: 0 }}>
          {threatSummaryError(summary.error)}
        </p>
      )}

      {data && (
        <>
          <p className="sub" style={{ margin: 0 }}>
            The server’s threat level for the last {data.period_hours} hours:{' '}
            <span className={LEVEL_CLASS[data.threat_level] ?? 'tag'}>{data.threat_level}</span>. The server rates it from
            its own thresholds on high-severity events and blocked attempts.
          </p>
          <dl className="kv" style={{ marginTop: 10 }}>
            <dt>Security events</dt>
            <dd className="num">{data.metrics.total_events}</dd>
            <dt>Blocked attempts</dt>
            <dd className="num">{data.metrics.blocked_attempts}</dd>
            <dt>High-severity events</dt>
            <dd className="num">{data.metrics.high_severity_events}</dd>
            <dt>Failures in the last 10 minutes</dt>
            <dd className="num">{data.metrics.recent_failures_10min}</dd>
            {layers.length > 0 && (
              <>
                <dt>By security layer</dt>
                <dd>
                  {layers.map(([layer, count], i) => (
                    <span key={layer}>
                      {i > 0 && ', '}
                      <bdi>{layer}</bdi> {count}
                    </span>
                  ))}
                </dd>
              </>
            )}
            <dt>Generated</dt>
            <dd>{formatUtcLong(data.generated_at)}</dd>
          </dl>
          <p className="hint" style={{ margin: 0 }}>
            The server counts failures in the last 10 minutes in its own memory, so that count starts again when it
            restarts.
          </p>
          {summary.isRefetchError && (
            <p className="note" role="alert" style={{ margin: 0 }}>
              The threat summary could not be refreshed, so it may be out of date. {threatSummaryError(summary.error)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
