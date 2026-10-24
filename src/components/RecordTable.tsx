import { Link } from 'react-router';
import { formatUtc } from '../lib/format';
import { attestationVerdictLabel, type LedgerRecord } from '../lib/result';
import { VerdictChip } from './VerdictChip';

/** Records as the ledger lists them, newest first. On a phone each row stacks (see .tbl-stack). */
export function RecordTable({ records }: Readonly<{ records: readonly LedgerRecord[] }>) {
  return (
    <table className="tbl tbl-stack">
      <thead>
        <tr>
          <th scope="col">Received (UTC)</th>
          <th scope="col">Verdict · admission</th>
          <th scope="col">Request · what the verifier said</th>
          <th scope="col">Verifier</th>
          <th scope="col">Record</th>
        </tr>
      </thead>
      <tbody>
        {records.map((r) => (
          <tr key={r.id}>
            <td className="mono num muted cell-small" style={{ fontSize: 12 }} data-label="Received (UTC)">
              {formatUtc(r.createdAt)}
            </td>
            <td>
              <VerdictChip verdict={r.result.verdict} admission={r.result.admission} admissionStored={r.result.admissionStored} />
            </td>
            <td>
              <Link className="row-link" to={`/records/${encodeURIComponent(r.id)}`}>
                {r.query.split('\n')[0]}
              </Link>
              {/* VERIFIED means the check ran to a proof, not that the claim
                  holds: "Identity is false" is VERIFIED too. The message says
                  which, so it sits next to the verdict. */}
              <span className={r.result.agentMessage === null ? 'row-note none' : 'row-note'}>
                {r.result.agentMessage ?? 'No message recorded'}
              </span>
              {r.result.attestationBlock && (
                <span className="row-note">
                  Blocked by the attestation check. The verifier’s verdict:{' '}
                  {attestationVerdictLabel(r.result.attestationBlock)}.
                </span>
              )}
            </td>
            <td className="cell-small" data-label="Verifier">
              {r.domain.toLowerCase()}
            </td>
            <td className="mono muted cell-small" style={{ fontSize: 12 }} data-label="Record">
              {r.id}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
