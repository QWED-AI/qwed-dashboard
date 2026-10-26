import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { Verdict } from '../api/types';
import { useSession } from '../auth/session';
import { Icon } from '../components/Icon';
import { RecordTable } from '../components/RecordTable';
import { RefreshError } from '../components/RefreshError';
import { Shell } from '../components/Shell';
import { downloadLedgerCsv } from '../lib/csv';
import { inPeriod, periodName, readPeriod } from '../lib/overview';
import { toRecord, type LedgerRecord } from '../lib/result';
import { describeError, useLedgerPages } from '../lib/useAuthedQuery';

type Facet = 'all' | Verdict | 'none';

const FACETS: { id: Facet; label: string; dot: string }[] = [
  { id: 'all', label: 'All records', dot: '' },
  { id: 'VERIFIED', label: 'VERIFIED', dot: 'd-VERIFIED' },
  { id: 'UNVERIFIABLE', label: 'UNVERIFIABLE', dot: 'd-UNVERIFIABLE' },
  { id: 'BLOCKED', label: 'BLOCKED', dot: 'd-BLOCKED' },
  { id: 'none', label: 'No verdict recorded', dot: 'd-none' },
];

const LIMIT = 200;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function matches(r: LedgerRecord, facet: Facet): boolean {
  if (facet === 'all') return true;
  if (facet === 'none') return r.result.verdict === null;
  return r.result.verdict === facet;
}

// The admission the server stored (#38), read as the chips read it: a stored
// BLOCKED counts as DENY. "Not recorded" includes a stored word the dashboard
// does not know, since that is not an admission.
type AdmissionFilter = 'all' | 'ADMIT' | 'DENY' | 'none';

const ADMISSIONS: { id: AdmissionFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ADMIT', label: 'ADMIT' },
  { id: 'DENY', label: 'DENY' },
  { id: 'none', label: 'Not recorded' },
];

function admitted(r: LedgerRecord, filter: AdmissionFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return r.result.admission === null;
  return r.result.admission === filter;
}

const FIRST_REQUEST = String.raw`curl -X POST https://[YOUR QWED SERVER]/verify/math \
  -H "x-api-key: qwed_live_[YOUR KEY]" \
  -H "Content-Type: application/json" \
  -d '{"expression": "(x + 1)**2 = x**2 + 2*x + 1"}'`;

export function LedgerPage() {
  const [params, setParams] = useSearchParams();
  const facet = (FACETS.find((f) => f.id === params.get('verdict'))?.id ?? 'all') as Facet;
  const q = params.get('q') ?? '';
  const domain = params.get('verifier') ?? 'all';
  const admission = ADMISSIONS.find((a) => a.id === params.get('admission'))?.id ?? 'all';
  // The Overview opens the ledger on the range it counted (#46).
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const period = useMemo(() => readPeriod(fromParam, toParam), [fromParam, toParam]);

  const { user } = useSession();
  // Export is offered to owners and admins only (#32). The file holds the rows
  // the ledger already shows, so this limits the button, not what a member sees.
  const canExport = user?.role === 'owner' || user?.role === 'admin';
  const logs = useLedgerPages(LIMIT);
  const records = useMemo(() => (logs.data?.pages ?? []).flatMap((p) => p.logs).map(toRecord), [logs.data]);
  // The records the facets count and the filters narrow: those of the period, if one is set.
  const inRange = useMemo(() => (period ? records.filter((r) => inPeriod(r, period)) : records), [records, period]);
  // A server before #484 sends no cursor: a full page may hide older rows.
  const lastPage = logs.data?.pages.at(-1);
  const noPaging = lastPage !== undefined && lastPage.nextBefore === undefined && lastPage.logs.length >= LIMIT;
  // The chosen verifier stays an option when the range holds none of its
  // records, so the select still shows the filter that empties the table.
  const domains = useMemo(() => {
    const known = new Set(inRange.map((r) => r.domain));
    if (domain !== 'all') known.add(domain);
    return [...known].sort((a, b) => a.localeCompare(b));
  }, [inRange, domain]);

  const shown = inRange.filter(
    (r) =>
      matches(r, facet) &&
      admitted(r, admission) &&
      (domain === 'all' || r.domain === domain) &&
      (!q ||
        `${r.query} ${r.result.agentMessage ?? ''} ${r.result.callerMessage ?? ''} ${r.id} ${r.result.proofRef ?? ''}`
          .toLowerCase()
          .includes(q.toLowerCase())),
  );

  function set(key: string, value: string, empty: string) {
    const next = new URLSearchParams(params);
    if (value === empty) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  function showAllDates() {
    const next = new URLSearchParams(params);
    next.delete('from');
    next.delete('to');
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

      {logs.isError && !logs.data && (
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

      {logs.isRefetchError && <RefreshError what="The ledger" error={logs.error} onRetry={() => logs.refetch()} />}

      {logs.data && records.length === 0 && (
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

      {logs.data && records.length > 0 && (
        <>
          {period && (
            <p className="note" style={{ margin: '0 24px 12px', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <span>
                Received {periodName(period)}, the range the Overview counted:{' '}
                {plural(inRange.length, 'record', 'records')} of the {records.length} loaded.
              </span>
              <button type="button" className="btn btn-sm" onClick={showAllDates}>
                Show all dates
              </button>
            </p>
          )}

          <fieldset className="facets">
            <legend className="sr-only">Filter by verdict</legend>
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
                <span className="n">{inRange.filter((r) => matches(r, f.id)).length}</span>
              </button>
            ))}
          </fieldset>

          <div className="filters">
            <label className="search" style={{ flex: '1 1 280px' }}>
              <Icon name="search" size={14} />
              <span className="sr-only">Search records</span>
              <input
                type="search"
                value={q}
                onChange={(e) => set('q', e.target.value, '')}
                placeholder="Search statement, verifier message, record id or proof_ref"
              />
            </label>
            <label className="pill">
              <span>Verifier</span>
              <select value={domain} onChange={(e) => set('verifier', e.target.value, 'all')}>
                <option value="all">All</option>
                {domains.map((d) => (
                  <option key={d} value={d}>
                    {d.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="pill">
              <span>Admission</span>
              <select value={admission} onChange={(e) => set('admission', e.target.value, 'all')}>
                {ADMISSIONS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            {canExport && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={shown.length === 0}
                aria-describedby="export-note"
                onClick={() => downloadLedgerCsv(shown)}
              >
                Export CSV
              </button>
            )}
          </div>
          {canExport ? (
            <p id="export-note" className="hint" style={{ margin: '0 24px 12px' }}>
              The CSV holds the {shown.length} records shown, with the stored verdict and admission as the ledger shows
              them. It is built in your browser from the loaded records, not exported by the server.
            </p>
          ) : (
            <p className="hint" style={{ margin: '0 24px 12px' }}>
              An owner or admin of your organisation can export these records as CSV.
            </p>
          )}

          <div className="table-wrap" style={{ borderTop: '1px solid var(--line)' }}>
            <RecordTable records={shown} />
            {shown.length === 0 && <p className="sub table-empty">No records match these filters.</p>}
          </div>

          <div className="table-foot">
            <span className="num">
              Showing {shown.length} of the newest {records.length} records
              {logs.hasNextPage ? ' loaded so far' : ''}. Filters and counts cover the loaded records.
            </span>
            {logs.hasNextPage && (
              <button
                type="button"
                className="btn btn-sm"
                // Any fetch, not only the next page: a refresh of the same
                // pages would race this one.
                disabled={logs.isFetching}
                onClick={() => logs.fetchNextPage()}
              >
                {logs.isFetchingNextPage ? 'Loading…' : `Load ${LIMIT} older records`}
              </button>
            )}
            {!logs.hasNextPage && noPaging && (
              <span>This server returns at most {LIMIT} records and does not page, so older records are not shown.</span>
            )}
          </div>
          {logs.isFetchNextPageError && (
            <p className="note" role="alert" style={{ margin: '0 24px 16px' }}>
              Older records could not be loaded. {describeError(logs.error)}
            </p>
          )}
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
