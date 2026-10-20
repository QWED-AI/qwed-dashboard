import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Verdict } from '../api/types';
import { Icon } from '../components/Icon';
import { Shell } from '../components/Shell';
import { VerdictChip } from '../components/VerdictChip';
import { formatUtc } from '../lib/format';
import { toRecord, type LedgerRecord } from '../lib/result';
import { describeError, useAuthedQuery } from '../lib/useAuthedQuery';

type Facet = 'all' | Verdict | 'none';

const FACETS: { id: Facet; label: string; dot: string }[] = [
  { id: 'all', label: 'All records', dot: '' },
  { id: 'VERIFIED', label: 'VERIFIED', dot: 'd-VERIFIED' },
  { id: 'UNVERIFIABLE', label: 'UNVERIFIABLE', dot: 'd-UNVERIFIABLE' },
  { id: 'BLOCKED', label: 'BLOCKED', dot: 'd-BLOCKED' },
  { id: 'none', label: 'No verdict recorded', dot: 'd-none' },
];

const LIMIT = 200;

const matches = (r: LedgerRecord, facet: Facet) =>
  facet === 'all' ? true : facet === 'none' ? r.result.verdict === null : r.result.verdict === facet;

const FIRST_REQUEST = `curl -X POST https://[YOUR QWED SERVER]/verify/math \\
  -H "x-api-key: qwed_live_[YOUR KEY]" \\
  -H "Content-Type: application/json" \\
  -d '{"expression": "(x + 1)**2 = x**2 + 2*x + 1"}'`;

export function LedgerPage() {
  const [params, setParams] = useSearchParams();
  const facet = (FACETS.find((f) => f.id === params.get('verdict'))?.id ?? 'all') as Facet;
  const q = params.get('q') ?? '';
  const domain = params.get('verifier') ?? 'all';

  const logs = useAuthedQuery(['logs', LIMIT], (api, token) => api.listLogs(token, LIMIT));
  const records = useMemo(() => (logs.data ?? []).map(toRecord), [logs.data]);
  const domains = useMemo(
    () => [...new Set(records.map((r) => r.domain))].sort((a, b) => a.localeCompare(b)),
    [records],
  );

  const shown = records.filter(
    (r) =>
      matches(r, facet) &&
      (domain === 'all' || r.domain === domain) &&
      (!q || `${r.query} ${r.id} ${r.result.proofRef ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  );

  function set(key: string, value: string, empty: string) {
    const next = new URLSearchParams(params);
    if (value === empty) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  return (
    <Shell crumbs={[{ label: 'Verification' }, { label: 'Decision ledger' }]}>
      <div className="page-head">
        <div>
          <h1 className="h1">Decision ledger</h1>
          <p className="sub">
            Every verification your organisation ran, newest first, as the server stored it. Admission shows as not
            recorded where the server did not store one; the dashboard never works it out.
          </p>
        </div>
      </div>

      {logs.isPending && <LedgerSkeleton />}

      {logs.isError && (
        <div className="state" role="alert">
          <span className="state-icon">
            <Icon name="alert" size={20} />
          </span>
          <h2>The ledger could not be loaded</h2>
          <p className="sub">{describeError(logs.error)}</p>
          <div>
            <button type="button" className="btn" onClick={() => logs.refetch()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {logs.isSuccess && records.length === 0 && (
        <div className="state">
          <span className="state-icon">
            <Icon name="ledger" size={20} />
          </span>
          <h2>No records yet</h2>
          <p className="sub" style={{ fontSize: 14 }}>
            Records show up here once a key from your organisation calls a verify route. Every call is written to the
            audit chain before its result goes back.
          </p>
          <pre className="code-block">{FIRST_REQUEST}</pre>
        </div>
      )}

      {logs.isSuccess && records.length > 0 && (
        <>
          <div role="group" aria-label="Filter by verdict" className="facets">
            {FACETS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="facet"
                aria-pressed={facet === f.id}
                onClick={() => set('verdict', f.id, 'all')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {f.dot && <span className={`dot ${f.dot}`} aria-hidden="true" />}
                  {f.label}
                </span>
                <span className="n">{records.filter((r) => matches(r, f.id)).length}</span>
              </button>
            ))}
          </div>

          <div className="filters">
            <label className="search" style={{ flex: '1 1 280px' }}>
              <Icon name="search" size={14} />
              <span className="sr-only">Search records</span>
              <input
                type="search"
                value={q}
                onChange={(e) => set('q', e.target.value, '')}
                placeholder="Search statement, record id or proof_ref"
              />
            </label>
            <label className="pill">
              Verifier
              <select value={domain} onChange={(e) => set('verifier', e.target.value, 'all')}>
                <option value="all">All</option>
                {domains.map((d) => (
                  <option key={d} value={d}>
                    {d.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="table-wrap" style={{ borderTop: '1px solid var(--line)' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Received (UTC)</th>
                  <th scope="col">Verdict · admission</th>
                  <th scope="col">Request</th>
                  <th scope="col">Verifier</th>
                  <th scope="col">Record</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="mono num muted" style={{ fontSize: 12 }}>
                      {formatUtc(r.createdAt)}
                    </td>
                    <td>
                      <VerdictChip verdict={r.result.verdict} admission={r.result.admission} />
                    </td>
                    <td>
                      <Link className="row-link" to={`/records/${encodeURIComponent(r.id)}`}>
                        {r.query.split('\n')[0]}
                      </Link>
                    </td>
                    <td>{r.domain.toLowerCase()}</td>
                    <td className="mono muted" style={{ fontSize: 12 }}>
                      {r.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && <p className="sub" style={{ padding: '18px 24px' }}>No records match these filters.</p>}
          </div>

          <div className="table-foot">
            <span className="num">
              Showing {shown.length} of the newest {records.length} records.
            </span>
            {records.length >= LIMIT && <span>The server returns at most {LIMIT} records and has no paging yet.</span>}
          </div>
        </>
      )}
    </Shell>
  );
}

function LedgerSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading records</span>
      <div className="facets">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="facet" aria-hidden="true" style={{ cursor: 'default' }}>
            <span className="sk" style={{ width: '60%' }} />
            <span className="sk" style={{ width: '30%', height: 16 }} />
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--line)', padding: '8px 24px' }} aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} style={{ display: 'flex', gap: 24, padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
            <span className="sk" style={{ width: 110 }} />
            <span className="sk" style={{ width: 150 }} />
            <span className="sk" style={{ width: `${40 + ((i * 13) % 35)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
