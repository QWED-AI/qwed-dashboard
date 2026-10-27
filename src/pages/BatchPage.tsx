import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useSession } from '../auth/session';
import { Icon } from '../components/Icon';
import { RecordTable } from '../components/RecordTable';
import { RefreshError } from '../components/RefreshError';
import { Shell } from '../components/Shell';
import { downloadLedgerCsv } from '../lib/csv';
import { formatUtc, parseUtc } from '../lib/format';
import { toRecord } from '../lib/result';
import { describeError, useAuthedQuery, useLedgerPages } from '../lib/useAuthedQuery';

// One /verify/batch job's records together (#57). The server writes one audit
// row per item, with the job's id (#477), so the job is the loaded rows that
// carry it. Each keeps its own verdict and admission; the job has none of its
// own, and the dashboard works none out. Each row also records the API key
// that sent the request (#484), so the job's key is its items' key.

// The same page size as the ledger, so the two share their loaded pages.
const LIMIT = 200;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function BatchPage() {
  const { jobId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const onlyDenied = params.get('admission') === 'DENY';
  const { user } = useSession();
  const canExport = user?.role === 'owner' || user?.role === 'admin';
  const logs = useLedgerPages(LIMIT);
  const records = useMemo(() => (logs.data?.pages ?? []).flatMap((p) => p.logs).map(toRecord), [logs.data]);
  const items = useMemo(() => records.filter((r) => r.result.batch?.jobId === jobId), [records, jobId]);
  const shown = onlyDenied ? items.filter((r) => r.result.admission === 'DENY') : items;

  const admitted = items.filter((r) => r.result.admission === 'ADMIT').length;
  const denied = items.filter((r) => r.result.admission === 'DENY').length;
  // One request sends a whole job, so its items share a key; the page still
  // lists every key it finds rather than assume so.
  const keyList = useAuthedQuery(['keys'], (api, token) => api.listKeys(token));
  const keyIds = [...new Set(items.map((r) => r.apiKeyId).filter((k): k is string => typeof k === 'string'))];
  const keyName = (id: string) => keyList.data?.find((k) => k.id === id)?.name ?? `Key ${id}`;
  const times = items.map((r) => parseUtc(r.createdAt)?.getTime()).filter((t): t is number => typeof t === 'number');
  const received =
    times.length > 0
      ? `${formatUtc(new Date(Math.min(...times)).toISOString())} to ${formatUtc(new Date(Math.max(...times)).toISOString())} UTC`
      : null;

  function toggleDenied() {
    const next = new URLSearchParams(params);
    if (onlyDenied) next.delete('admission');
    else next.set('admission', 'DENY');
    setParams(next, { replace: true });
  }

  const more = logs.hasNextPage && (
    <button type="button" className="btn btn-sm" disabled={logs.isFetching} onClick={() => logs.fetchNextPage()}>
      {logs.isFetchingNextPage ? 'Loading…' : `Load ${LIMIT} older records`}
    </button>
  );

  return (
    <Shell crumbs={[{ label: 'Decision ledger', to: '/ledger' }, { label: 'Batch job' }]}>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="h1">
            Batch job <span className="mono" style={{ fontSize: '0.75em', overflowWrap: 'anywhere' }}>{jobId}</span>
          </h1>
          <p className="sub">
            The records the server stored for this job’s items, one per item, from the loaded records. Each keeps its
            own verdict and admission; the job has none of its own.
          </p>
        </div>
        <Link className="btn" to="/ledger">
          <Icon name="back" size={14} />
          Ledger
        </Link>
      </div>

      {logs.isPending && (
        <p className="sub" aria-busy="true" style={{ padding: '0 24px' }}>
          Loading the records…
        </p>
      )}

      {logs.isError && !logs.data && (
        <div className="state" role="alert">
          <span className="state-icon">
            <Icon name="alert" size={20} />
          </span>
          <h2>The records could not be loaded</h2>
          <p className="sub">{describeError(logs.error)}</p>
          <div>
            <button type="button" className="btn" onClick={() => logs.refetch()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {logs.isRefetchError && <RefreshError what="The records" error={logs.error} onRetry={() => logs.refetch()} />}

      {logs.data && items.length === 0 && (
        <div className="state">
          <h2>No item of this job is among the loaded records</h2>
          <p className="sub">
            The newest {plural(records.length, 'record', 'records')} hold none with this job id. Its items may be
            older, or the id may be wrong.
          </p>
          {more && <div>{more}</div>}
        </div>
      )}

      {logs.data && items.length > 0 && (
        <div className="overview">
          <section aria-label="This job’s items" className="tiles">
            <div className="card tile">
              <span className="tile-label">Items</span>
              <span className="tile-value num">{items.length}</span>
            </div>
            <div className="card tile">
              <span className="tile-label">
                <span className="dot d-ADMIT" aria-hidden="true" />{' '}
                ADMIT
              </span>
              <span className="tile-value num">{admitted}</span>
            </div>
            <div className="card tile">
              <span className="tile-label">
                <span className="dot d-DENY" aria-hidden="true" />{' '}
                Not admitted (DENY)
              </span>
              <span className="tile-value num">{denied}</span>
            </div>
            <div className="card tile">
              <span className="tile-label">
                <span className="dot d-none" aria-hidden="true" />{' '}
                Admission not recorded
              </span>
              <span className="tile-value num">{items.length - admitted - denied}</span>
            </div>
          </section>

          <div className="filters" style={{ padding: 0 }}>
            {received && <span className="tag">Received {received}</span>}
            {keyIds.length === 0 ? (
              <span className="tag">API key not recorded</span>
            ) : (
              <span className="tag">
                {keyIds.length === 1 ? 'API key ' : 'API keys '}
                {keyIds.map((id, i) => (
                  <span key={id}>
                    {i > 0 && ', '}
                    <Link to={`/ledger?key=${encodeURIComponent(id)}`}>{keyName(id)}</Link>
                  </span>
                ))}
              </span>
            )}
            <span className="spacer" />
            <label className="toggle">
              <input type="checkbox" checked={onlyDenied} onChange={toggleDenied} />{' '}
              Show only the items not admitted
            </label>
            {canExport && (
              <button type="button" className="btn btn-sm" disabled={shown.length === 0} onClick={() => downloadLedgerCsv(shown)}>
                Export CSV
              </button>
            )}
          </div>
          {!canExport && <p className="hint">An owner or admin of your organisation can export these items as CSV.</p>}

          <section className="card flush" aria-label="Items">
            <div className="table-wrap">
              <RecordTable records={shown} batchLinks={false} />
              {shown.length === 0 && <p className="sub table-empty">No item of this job was stored with DENY.</p>}
            </div>
            <div className="table-foot">
              <span className="num">
                {plural(items.length, 'item', 'items')} of this job among the newest {records.length} records
                {logs.hasNextPage ? ' loaded so far' : ''}.
              </span>
              {more}
            </div>
          </section>
        </div>
      )}

      {logs.isFetchNextPageError && (
        <p className="note" role="alert" style={{ margin: '0 24px 16px' }}>
          Older records could not be loaded. {describeError(logs.error)}
        </p>
      )}
    </Shell>
  );
}
