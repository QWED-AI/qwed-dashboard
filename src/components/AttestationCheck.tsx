import { useMutation } from '@tanstack/react-query';
import { useSession } from '../auth/session';
import { attestationHeadline, checkAttestation, type CheckState } from '../lib/attestation';
import { formatUtcLong } from '../lib/format';
import type { LedgerRecord } from '../lib/result';
import { describeError } from '../lib/useAuthedQuery';
import { Mark } from './ChainCheck';
import { Icon } from './Icon';

const ok = (state: CheckState): boolean | undefined => (state === 'unknown' ? undefined : state === 'pass');
const utc = (seconds: number | null) => (seconds === null ? 'not stated' : formatUtcLong(new Date(seconds * 1000).toISOString()));

/**
 * Checks the attestation the record stored (#39) with the server's public
 * keys (GET /.well-known/jwks.json). The check runs in the browser and needs
 * no credential: an attestation is meant to be checked by anyone it reaches.
 */
export function AttestationCheck({ record }: Readonly<{ record: LedgerRecord }>) {
  const { api } = useSession();
  const token = record.result.attestation;
  const check = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('No attestation was stored with this record.');
      const jwks = await api.getJwks();
      return checkAttestation(
        token,
        jwks,
        {
          request: record.query,
          verdict: record.result.verdict,
          proofRef: record.result.proofRef,
          admissionWord: record.result.admissionStored ?? record.result.admission,
        },
        Date.now() / 1000,
      );
    },
  });

  const report = check.data;
  let label = 'Check attestation';
  if (check.isPending) label = 'Checking…';
  else if (report) label = 'Check again';

  return (
    <section className="card" aria-labelledby="attestation-check-title">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="shield" />
        <h2 id="attestation-check-title">Attestation</h2>
      </div>

      {token ? (
        <>
          <button type="button" className="btn" onClick={() => check.mutate()} disabled={check.isPending}>
            {label}
          </button>
          <span className="hint">
            Checks the signature the server stored with this result against its public keys, in your browser.
          </span>
        </>
      ) : (
        <p className="sub" style={{ margin: 0 }}>
          No attestation was stored with this record, so there is nothing to check. The server signs VERIFIED
          results; this one carries no signature.
        </p>
      )}

      {check.isError && (
        <p className="alert" role="alert">
          {describeError(check.error)}
        </p>
      )}

      {report && (
        <div aria-live="polite">
          <p className="sub" style={{ color: 'var(--ink)', fontWeight: 600, marginBottom: 6 }}>
            {attestationHeadline(report)}
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
      )}
    </section>
  );
}
