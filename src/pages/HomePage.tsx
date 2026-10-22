import { useMemo } from 'react';
import { Link } from 'react-router';
import type { Admission, Verdict } from '../api/types';
import { Icon } from '../components/Icon';
import { Shell } from '../components/Shell';
import { VerdictChip } from '../components/VerdictChip';
import { formatUtc } from '../lib/format';
import { toRecord, type LedgerRecord } from '../lib/result';
import { describeError, useAuthedQuery } from '../lib/useAuthedQuery';

// Home reads the newest page only. The keys query shares its cache with the
// keys screen; the ledger pages through its own.
const LIMIT = 200;

interface Attention {
  id: string;
  dot: string;
  title: string;
  detail: string;
  action: string;
  to: string;
}

interface Pair {
  verdict: Verdict | null;
  admission: Admission | null;
  n: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One line about the newest record of a group: its request and what the verifier said. */
function latest(r: LedgerRecord): string {
  const said = r.result.agentMessage ?? r.result.error ?? 'No message recorded';
  return `Newest: ${r.query.split('\n')[0]} (${said}) at ${formatUtc(r.createdAt)} UTC.`;
}

// Groups by the stored verdict only. A VERIFIED record is never listed here,
// even when its message says the claim does not hold: that is the verifier's
// call, shown in the ledger, not one the dashboard makes.
function needsAttention(records: LedgerRecord[], activeKeys: number | null): Attention[] {
  const items: Attention[] = [];
  const groups: { verdict: Verdict | null; facet: string; one: string; many: string }[] = [
    { verdict: 'BLOCKED', facet: 'BLOCKED', one: 'BLOCKED record', many: 'BLOCKED records' },
    { verdict: 'UNVERIFIABLE', facet: 'UNVERIFIABLE', one: 'UNVERIFIABLE record', many: 'UNVERIFIABLE records' },
    { verdict: null, facet: 'none', one: 'record with no readable verdict', many: 'records with no readable verdict' },
  ];
  for (const g of groups) {
    const hits = records.filter((r) => r.result.verdict === g.verdict);
    const [first] = hits;
    if (!first) continue;
    items.push({
      id: g.facet,
      dot: g.verdict ? `d-${g.verdict}` : 'd-none',
      title: plural(hits.length, g.one, g.many),
      detail: latest(first),
      action: 'Open in the ledger',
      to: `/ledger?verdict=${g.facet}`,
    });
  }
  if (activeKeys === 0) {
    items.push({
      id: 'keys',
      dot: 'd-mute',
      title: 'No active API keys',
      detail: 'Nothing can call the verify routes for your organisation until a key exists.',
      action: 'Create a key',
      to: '/keys',
    });
  }
  return items;
}

function countPairs(records: LedgerRecord[]): Pair[] {
  const pairs = new Map<string, Pair>();
  for (const r of records) {
    const k = `${r.result.verdict ?? ''}|${r.result.admission ?? ''}`;
    const p = pairs.get(k) ?? { verdict: r.result.verdict, admission: r.result.admission, n: 0 };
    p.n += 1;
    pairs.set(k, p);
  }
  return [...pairs.values()].sort((a, b) => b.n - a.n);
}

export function HomePage() {
  const logs = useAuthedQuery(['logs', LIMIT], (api, token) => api.listLogs(token, LIMIT));
  const keys = useAuthedQuery(['keys'], (api, token) => api.listKeys(token));
  const records = useMemo(() => (logs.data?.logs ?? []).map(toRecord), [logs.data]);
  const nextBefore = logs.data?.nextBefore;
  const activeKeys = keys.data ? keys.data.length : null;
  const items = useMemo(() => needsAttention(records, activeKeys), [records, activeKeys]);
  const pairs = useMemo(() => countPairs(records), [records]);

  return (
    <Shell crumbs={[{ label: 'Verification' }, { label: 'Home' }]}>
      <div className="page-head">
        <div>
          <h1 className="h1">Needs attention</h1>
          <p className="sub">
            What to look at first, from the newest records and the key list. Each line opens the place where you can see
            more. The dashboard only groups what the server stored; it never works out a verdict.
          </p>
        </div>
      </div>

      {logs.isPending && <HomeSkeleton />}

      {logs.isError && (
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

      {logs.isSuccess && (
        <div className="split">
          <section className="main" aria-labelledby="attention-title">
            <h2 id="attention-title" className="sr-only">
              Needs attention
            </h2>
            <AttentionList items={items} total={records.length} />
          </section>

          <aside className="aside" aria-label="At a glance">
            <section className="card" aria-labelledby="counts-title">
              <h2 id="counts-title">Newest records</h2>
              {records.length === 0 ? (
                <p className="sub">No records yet.</p>
              ) : (
                <>
                  <p className="sub">
                    {plural(records.length, 'record', 'records')}, the newest received{' '}
                    {formatUtc(records[0]?.createdAt ?? '')} UTC.
                  </p>
                  <ul className="pairs">
                    {pairs.map((p) => (
                      <li key={`${p.verdict}|${p.admission}`}>
                        <Link to={`/ledger?verdict=${p.verdict ?? 'none'}`}>
                          <VerdictChip verdict={p.verdict} admission={p.admission} />
                        </Link>
                        <span className="num">{p.n}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="hint">
                    Counts, not a chart. Open one to see the records with that verdict.
                    {typeof nextBefore === 'string' && ` These cover the newest ${LIMIT}; the ledger loads older ones.`}
                    {nextBefore === undefined &&
                      records.length >= LIMIT &&
                      ` This server returns at most ${LIMIT} records and does not page.`}
                  </p>
                </>
              )}
            </section>

            <section className="card" aria-labelledby="keys-title">
              <h2 id="keys-title">API keys</h2>
              {keys.isPending && <span className="sk" style={{ width: '50%' }} aria-hidden="true" />}
              {keys.isError && <p className="sub">{describeError(keys.error)}</p>}
              {keys.isSuccess && (
                <p className="sub">
                  <Link to="/keys">{plural(keys.data.length, 'active key', 'active keys')}</Link>. The server does not
                  record when a key was last used yet.
                </p>
              )}
            </section>

            <section className="card" aria-labelledby="chain-title">
              <h2 id="chain-title">Audit chain</h2>
              <p className="sub">
                Not checked from here. The server checks one entry at a time, with an owner or admin API key: open a
                record to check its entry. A check of the whole chain will show here once the server offers one.
              </p>
            </section>
          </aside>
        </div>
      )}
    </Shell>
  );
}

// With no records the note comes first, but the list still shows: a new
// organisation with no key needs the "No active API keys" line most.
function AttentionList({ items, total }: Readonly<{ items: Attention[]; total: number }>) {
  return (
    <>
      {total === 0 && (
        <div className="note">
          No records yet. Records show up once a key from your organisation calls a verify route.{' '}
          <Link to="/ledger">The ledger</Link> shows a first request to try.
        </div>
      )}
      {total > 0 && items.length === 0 && (
        <div className="note">
          Nothing needs attention in the newest {plural(total, 'record', 'records')}: none is BLOCKED or UNVERIFIABLE,
          and every stored result has a verdict.
        </div>
      )}
      {items.length > 0 && <Items items={items} />}
    </>
  );
}

function Items({ items }: Readonly<{ items: Attention[] }>) {
  return (
    <ul className="attn">
      {items.map((it) => (
        <li key={it.id}>
          <span className={`dot ${it.dot}`} aria-hidden="true" />
          <div className="attn-text">
            <strong>{it.title}</strong>
            <span>{it.detail}</span>
          </div>
          <Link className="btn btn-sm" to={it.to} aria-label={`${it.action}: ${it.title}`}>
            {it.action}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" style={{ padding: '0 24px 24px' }}>
      <span className="sr-only">Loading</span>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} aria-hidden="true" style={{ display: 'flex', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
          <span className="sk" style={{ width: 180 }} />
          <span className="sk" style={{ width: `${45 + i * 10}%` }} />
        </div>
      ))}
    </div>
  );
}
