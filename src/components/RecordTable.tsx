import { Link } from 'react-router';
import { formatUtc } from '../lib/format';
import { attestationVerdictLabel, isServerNotice, type LedgerRecord } from '../lib/result';
import { VerdictChip } from './VerdictChip';

/**
 * Records as the ledger lists them, newest first. On a phone each row stacks
 * (see .tbl-stack). A batch item's row links its job (#57), unless the table
 * is that job's own list.
 */
export function RecordTable({
  records,
  batchLinks = true,
}: Readonly<{ records: readonly LedgerRecord[]; batchLinks?: boolean }>) {
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
                <bdi>{r.query.split('\n')[0]}</bdi>
              </Link>
              {/* VERIFIED means the check ran to a proof, not that the claim
                  holds: "Identity is false" is VERIFIED too. The message says
                  which, so it sits next to the verdict. */}
              <span className={r.result.agentMessage === null ? 'row-note none' : 'row-note'}>
                {isServerNotice(r.result) && 'The server’s notice: '}
                {r.result.agentMessage ?? 'No message recorded'}
              </span>
              {r.result.callerMessage !== null && (
                <span className="row-note">
                  The caller’s message, not the verifier’s: <bdi>{r.result.callerMessage}</bdi>
                </span>
              )}
              {r.result.attestationBlock && (
                <span className="row-note">
                  Blocked by the attestation check. The verifier’s verdict:{' '}
                  {attestationVerdictLabel(r.result.attestationBlock)}.
                </span>
              )}
              {/* A failed or shortened batch item stores no message, so its
                  row says why it has no verdict, as the Overview does. */}
              {r.result.batch && r.result.error !== null && (
                <span className="row-note">The dashboard notes: {r.result.error}</span>
              )}
              {batchLinks && r.result.batch && (
                <span className="row-note">
                  An item of batch job{' '}
                  <Link className="mono" to={`/batches/${encodeURIComponent(r.result.batch.jobId)}`}>
                    {r.result.batch.jobId}
                  </Link>
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
