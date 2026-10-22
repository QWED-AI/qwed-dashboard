import { Link, useParams } from 'react-router';
import type { ApiKeyItem, AuditLog } from '../api/types';
import { ChainCheck } from '../components/ChainCheck';
import { Icon } from '../components/Icon';
import { JsonView } from '../components/JsonView';
import { RefreshError } from '../components/RefreshError';
import { Shell } from '../components/Shell';
import { VerdictChip } from '../components/VerdictChip';
import { formatUtcLong } from '../lib/format';
import { toRecord } from '../lib/result';
import { describeError, useAuthedQuery } from '../lib/useAuthedQuery';

const SHAPE_LABEL = {
  diagnostic: 'Engine result (DiagnosticResult)',
  'verification-context': 'Verification Context document',
  'batch-item': 'Batch item (engine result inside)',
  truncated: 'Shortened by the server',
  unknown: 'Unrecognised',
} as const;

/** The key-list query as the caller label needs it. */
interface KeyList {
  status: 'pending' | 'error' | 'success';
  data: ApiKeyItem[] | undefined;
}

/** The key that made a row, by name when the key list has it (#484). */
function keyLabel(keyId: string | null | undefined, keys: KeyList): string {
  if (keyId === undefined || keyId === null) return 'not recorded';
  // A list that loaded once is still a list when a later refresh fails.
  if (!keys.data) {
    return keys.status === 'error' ? `Key ${keyId} (the key list could not be loaded)` : `Key ${keyId}`;
  }
  const key = keys.data.find((k) => k.id === keyId);
  if (key) return `${key.name} (${key.key_preview})`;
  // The list holds active keys only, and only your own unless you are an
  // admin or owner, so a revoked or another member's key is not in it.
  return `Key ${keyId}, not in your key list`;
}

function RecordedBy({ log, keys }: Readonly<{ log: AuditLog; keys: KeyList }>) {
  return (
    <section aria-labelledby="recorded-by" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h2 id="recorded-by" className="sub" style={{ fontSize: 12, fontWeight: 400 }}>
        Recorded by
      </h2>
      <dl className="kv">
        <dt>API key</dt>
        <dd>{keyLabel(log.api_key_id, keys)}</dd>
        <dt>Server version</dt>
        <dd className="mono" style={{ fontSize: 12 }}>
          {log.verifier_version ?? 'not recorded'}
        </dd>
      </dl>
      {(log.api_key_id === null || log.api_key_id === undefined) && (
        <p className="hint">
          The server records the key on rows it writes for an API key request. A row written before it did, or
          without a key (a signed-in session, an agent token), has none.
        </p>
      )}
    </section>
  );
}

/** One stored chain field: absent on an older server, null when the row has none. */
function chainValue(value: string | null | undefined, none: string): string {
  if (value === undefined) return 'not recorded';
  return value ?? none;
}

function ChainEntry({ log }: Readonly<{ log: AuditLog }>) {
  return (
    <section aria-labelledby="chain-entry" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h2 id="chain-entry" className="sub" style={{ fontSize: 12, fontWeight: 400 }}>
        Chain entry, as stored
      </h2>
      <dl className="kv">
        <dt>entry_hash</dt>
        <dd className="mono" style={{ fontSize: 11.5 }}>
          {chainValue(log.entry_hash, 'none: written outside the chain')}
        </dd>
        <dt>previous_hash</dt>
        <dd className="mono" style={{ fontSize: 11.5 }}>
          {/* Only a row in the chain can be its first entry. */}
          {chainValue(log.previous_hash, log.entry_hash ? 'none: the first entry' : 'none')}
        </dd>
        <dt>HMAC</dt>
        <dd className="mono" style={{ fontSize: 11.5 }}>
          {chainValue(log.hmac_signature, 'none')}
        </dd>
      </dl>
      <p className="hint">These are the values the server stored. The check below recomputes them on the server.</p>
    </section>
  );
}

export function RecordPage() {
  const { id = '' } = useParams();
  const log = useAuthedQuery(['log', id], (api, token) => api.getLog(token, id));
  // Only to name the key; a role that cannot list keys still sees the id.
  const keys = useAuthedQuery(['keys'], (api, token) => api.listKeys(token));
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

  // No data after loading means the first load failed. A failed refresh keeps
  // the record and shows a warning above it instead.
  if (!log.data) {
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
      {log.isRefetchError && (
        <div style={{ paddingTop: 16 }}>
          <RefreshError what="This record" error={log.error} onRetry={() => log.refetch()} />
        </div>
      )}
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

          {(result.shape === 'diagnostic' || result.shape === 'batch-item') && result.admission === null && (
            <p className="note">
              <strong>Why admission is not recorded.</strong> The verify routes store the engine result, which has no
              admission field. Some routes return an admission to the caller, but the server does not keep it with the
              record yet.
            </p>
          )}

          <RecordedBy log={log.data} keys={{ status: keys.status, data: keys.data }} />
          <ChainEntry log={log.data} />
          <ChainCheck logId={r.id} />
        </aside>
      </div>
    </Shell>
  );
}
