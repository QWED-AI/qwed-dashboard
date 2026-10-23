import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ApiError, sessionNotAccepted } from '../api/http';
import type { ComplianceAuth, TrailCheck } from '../api/types';
import { useSession } from '../auth/session';
import { describeError } from '../lib/useAuthedQuery';

// Shown at most; the server says how many there were.
const SHOWN_ERRORS = 5;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One sentence for a failed request, by what the server refused. */
function refusal(err: unknown): string {
  // A server before #485 has no whole-chain route, or takes only API keys there.
  if (sessionNotAccepted(err) || (err instanceof ApiError && err.status === 404)) {
    return 'This server cannot check the whole chain. Open a record to check its entry.';
  }
  if (err instanceof ApiError && err.status === 403) {
    return `Only an owner or admin can check the audit chain. The server said: ${err.message}.`;
  }
  return describeError(err);
}

/** What a chain check found, for the whole-chain check and the activity summary. */
export function TrailResult({ trail }: Readonly<{ trail: TrailCheck }>) {
  if (trail.status === 'NO_ENTRIES') {
    return <p className="sub">There are no audit entries to check yet.</p>;
  }
  if (trail.status === 'VERIFIED' && trail.evidence) {
    const { entries, first_entry_id: first, last_entry_id: last } = trail.evidence;
    return (
      <>
        <p className="sub" style={{ color: 'var(--ink)', fontWeight: 600 }}>
          The chain checks out.
        </p>
        <p className="sub">
          {plural(entries, 'entry', 'entries')} checked, from record {first} to record {last}. Every signature matches
          and every link holds.
        </p>
        {trail.proof_ref && (
          <p className="mono" style={{ margin: 0, fontSize: 11.5, overflowWrap: 'anywhere' }}>
            {trail.proof_ref}
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <p className="sub" style={{ color: 'var(--ink)', fontWeight: 600 }}>
        {trail.total_entries === null ? 'The chain could not be checked.' : 'The chain does not check out.'}
      </p>
      {trail.total_entries !== null && trail.failed_entries !== null && (
        <p className="sub">
          {trail.failed_entries} of {plural(trail.total_entries, 'entry', 'entries')} failed.
          {trail.first_failed_entry_id !== null && (
            <>
              {' '}
              The first is{' '}
              <Link to={`/records/${trail.first_failed_entry_id}`}>record {trail.first_failed_entry_id}</Link>.
            </>
          )}
        </p>
      )}
      {trail.errors.length > 0 && (
        <ul className="sub" style={{ margin: 0, paddingLeft: 18 }}>
          {trail.errors.slice(0, SHOWN_ERRORS).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {trail.total_errors > Math.min(trail.errors.length, SHOWN_ERRORS) && (
        <p className="hint">
          {plural(trail.total_errors - Math.min(trail.errors.length, SHOWN_ERRORS), 'more error', 'more errors')} not
          shown.
        </p>
      )}
    </>
  );
}

/**
 * Checks every audit entry of the organisation, on request
 * (GET /admin/compliance/verify-trail, #485). It runs only when asked: the
 * server reads every entry to answer.
 *
 * It always sends the session. An API key in memory was entered for a
 * server that takes only keys, and such a server has no whole-chain route.
 */
export function ChainTrail() {
  const { api, token } = useSession();
  const trail = useMutation({ mutationFn: (auth: ComplianceAuth) => api.verifyTrail(auth) });
  const auth: ComplianceAuth | null = token ? { session: token } : null;
  let label = 'Check the whole chain';
  if (trail.isPending) label = 'Checking…';
  else if (trail.data) label = 'Check again';

  return (
    <section className="card" aria-labelledby="trail-title">
      <h2 id="trail-title">Audit chain</h2>
      <p className="sub">Checks the signature of every audit entry and the link between each one and the next.</p>
      <div>
        <button
          type="button"
          className="btn btn-sm"
          disabled={trail.isPending || !auth}
          onClick={() => auth && trail.mutate(auth)}
        >
          {label}
        </button>
      </div>
      {trail.isError && (
        <p className="alert" role="alert">
          {refusal(trail.error)}
        </p>
      )}
      {trail.data && (
        <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <TrailResult trail={trail.data} />
          {(trail.data.legacy_entries ?? 0) > 0 && (
            <p className="hint">
              {plural(trail.data.legacy_entries ?? 0, 'entry was', 'entries were')} written before the chain existed and
              cannot be checked.
            </p>
          )}
          <p className="hint">{trail.data.scope}</p>
        </div>
      )}
    </section>
  );
}
