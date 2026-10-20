import { Link, useParams } from 'react-router';
import { ChainCheck } from '../components/ChainCheck';
import { Icon } from '../components/Icon';
import { JsonView } from '../components/JsonView';
import { Shell } from '../components/Shell';
import { VerdictChip } from '../components/VerdictChip';
import { formatUtcLong } from '../lib/format';
import { toRecord } from '../lib/result';
import { describeError, useAuthedQuery } from '../lib/useAuthedQuery';

const SHAPE_LABEL = {
  diagnostic: 'Engine result (DiagnosticResult)',
  'verification-context': 'Verification Context document',
  truncated: 'Shortened by the server',
  unknown: 'Unrecognised',
} as const;

export function RecordPage() {
  const { id = '' } = useParams();
  const log = useAuthedQuery(['log', id], (api, token) => api.getLog(token, id));
  const crumbs = [{ label: 'Decision ledger', to: '/ledger' }, { label: `Record ${id}` }];

  if (log.isPending) {
    return (
      <Shell crumbs={crumbs}>
        <div className="state" aria-busy="true">
          <span className="sk" style={{ width: 180, height: 22 }} />
          <span className="sk" style={{ width: '70%', height: 18 }} />
          <span className="sk" style={{ width: '40%' }} />
        </div>
      </Shell>
    );
  }

  if (log.isError) {
    return (
      <Shell crumbs={crumbs}>
        <div className="state" role="alert">
          <span className="state-icon">
            <Icon name="alert" size={20} />
          </span>
          <h2>This record could not be loaded</h2>
          <p className="sub">{describeError(log.error)}</p>
          <div>
            <Link className="btn" to="/ledger">
              Back to the ledger
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  const r = toRecord(log.data);
  const { result } = r;
  const multiline = r.query.includes('\n');

  return (
    <Shell crumbs={crumbs}>
      <div style={{ padding: '24px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <VerdictChip verdict={result.verdict} admission={result.admission} large />
          <span className="spacer" />
          <Link className="btn btn-sm" to="/ledger">
            <Icon name="back" size={14} />
            Ledger
          </Link>
        </div>
        <h1 className={multiline ? 'statement code' : 'statement'}>{r.query}</h1>
        <div className="meta-row">
          <div className="meta">
            <span className="k">Record</span>
            <span className="v mono" style={{ fontSize: 12 }}>
              {r.id}
            </span>
          </div>
          <div className="meta">
            <span className="k">Verifier</span>
            <span className="v">{r.domain.toLowerCase()}</span>
          </div>
          <div className="meta">
            <span className="k">Received</span>
            <span className="v mono num" style={{ fontSize: 12 }}>
              {formatUtcLong(r.createdAt)}
            </span>
          </div>
          <div className="meta">
            <span className="k">Stored as</span>
            <span className="v">{SHAPE_LABEL[result.shape]}</span>
          </div>
        </div>
      </div>

      <div className="split">
        <section className="main" aria-label="Stored result">
          <p className="sub" style={{ fontSize: 12.5 }}>
            The result exactly as the server stored it in the audit row.
          </p>
          <JsonView value={result.value} fallback={r.raw} />
        </section>

        <aside className="aside" aria-label="Details and checks">
          {result.agentMessage && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="sub" style={{ fontSize: 12 }}>
                What the verifier said
              </span>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink)' }}>{result.agentMessage}</p>
            </div>
          )}

          {result.error && <p className="note">{result.error}</p>}

          <dl className="kv">
            <dt>Verdict</dt>
            <dd className="mono" style={{ fontSize: 12 }}>
              {result.verdict ?? 'not recorded'}
            </dd>
            <dt>Admission</dt>
            <dd className="mono" style={{ fontSize: 12 }}>
              {result.admission ?? 'not recorded'}
            </dd>
            <dt>proof_ref</dt>
            <dd className="mono" style={{ fontSize: 12 }}>
              {result.proofRef ?? 'none'}
            </dd>
            <dt>Authoritative</dt>
            <dd className="mono" style={{ fontSize: 12 }}>
              {result.isAuthoritative === null ? 'not recorded' : String(result.isAuthoritative)}
            </dd>
          </dl>

          {result.shape === 'diagnostic' && result.admission === null && (
            <p className="note">
              <strong>Why admission is not recorded.</strong> The verify routes store the engine result, which has no
              admission field. Some routes return an admission to the caller, but the server does not keep it with the
              record yet.
            </p>
          )}

          <ChainCheck logId={r.id} />
        </aside>
      </div>
    </Shell>
  );
}
