import { ApiError } from '../api/http';
import type { AttestationReport, CheckState } from '../lib/attestation';
import { formatUtcLong } from '../lib/format';
import { Mark } from './ChainCheck';

// What the attestation check (#39) and the document signature check (#54)
// share: the error for keys that did not load, and the report of a check.

const ok = (state: CheckState): boolean | undefined => (state === 'unknown' ? undefined : state === 'pass');
const utc = (seconds: number | null) => (seconds === null ? 'not stated' : formatUtcLong(new Date(seconds * 1000).toISOString()));

/** The keys failed to load: about the server's key route, not about this record. */
export class KeysUnavailable extends Error {}

export function keysError(err: unknown): KeysUnavailable {
  let reason = 'the request failed.';
  if (err instanceof ApiError) reason = err.unreachable ? err.message : `the server returned ${err.status}: ${err.message}`;
  return new KeysUnavailable(`The server’s public keys could not be loaded from /.well-known/jwks.json: ${reason}`);
}

/** A finished check: its headline, each item with a mark, and the token's key and times. */
export function SignatureReport({ report, headline }: Readonly<{ report: AttestationReport; headline: string }>) {
  return (
    <div aria-live="polite">
      <p className="sub" style={{ color: 'var(--ink)', fontWeight: 600, marginBottom: 6 }}>
        {headline}
      </p>
      {report.items.map((item) => (
        <div className="check" key={item.id}>
          <Mark ok={ok(item.state)} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span>{item.label}</span>
            <span className="muted" style={{ fontSize: 11.5, overflowWrap: 'anywhere' }}>
              {item.detail}
            </span>
          </span>
        </div>
      ))}
      {!report.problem && (
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>Key</dt>
          <dd className="mono" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
            {report.kid ?? 'not stated'}
          </dd>
          <dt>Issued</dt>
          <dd>{utc(report.issuedAt)}</dd>
          <dt>Expires</dt>
          <dd>{utc(report.expiresAt)}</dd>
        </dl>
      )}
    </div>
  );
}
