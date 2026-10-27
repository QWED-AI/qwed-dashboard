import { useMutation } from '@tanstack/react-query';
import type { Jwks } from '../api/types';
import { useSession } from '../auth/session';
import { attestationHeadline, checkAttestation } from '../lib/attestation';
import type { LedgerRecord } from '../lib/result';
import { Icon } from './Icon';
import { KeysUnavailable, keysError, SignatureReport } from './SignatureReport';

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
      let jwks: Jwks;
      try {
        jwks = await api.getJwks();
      } catch (err) {
        throw keysError(err);
      }
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

  // A stored result the dashboard cannot read (shortened, or not JSON) may
  // still have carried one; only a readable result shows there is none.
  let missing = 'No attestation was stored with this record, so there is nothing to check. The server signs VERIFIED results; this one carries no signature.';
  if (record.result.error) missing = `${record.result.error} Any attestation it carried cannot be checked.`;

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
          {missing}
        </p>
      )}

      {check.isError && (
        <p className="alert" role="alert">
          {check.error instanceof KeysUnavailable ? check.error.message : 'The attestation could not be checked.'}
        </p>
      )}

      {report && <SignatureReport report={report} headline={attestationHeadline(report)} />}
    </section>
  );
}
