import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ApiKeyItem, Verdict } from '../api/types';
import { ActivitySummaryCard } from '../components/ActivitySummary';
import { ChainTrail } from '../components/ChainTrail';
import { Icon } from '../components/Icon';
import { RecordTable } from '../components/RecordTable';
import { RefreshError } from '../components/RefreshError';
import { Shell } from '../components/Shell';
import { BarList, StatTile, type BarRow } from '../components/Stat';
import { VerdictChart } from '../components/VerdictChart';
import { formatUtc } from '../lib/format';
import {
  comparedText,
  countBy,
  overviewWindow,
  periodParams,
  RANGES,
  type OverviewWindow,
  type Period,
  type Range,
} from '../lib/overview';
import { toRecord, type LedgerRecord } from '../lib/result';
import { securityEventsError, typeLabel } from '../lib/securityEvents';
import { describeError, useAuthedQuery, useSecurityEventPages } from '../lib/useAuthedQuery';

// The overview reads the newest page only. The keys query shares its cache
// with the keys screen; the ledger pages through its own.
const LIMIT = 200;
const LATEST = 5;

interface Attention {
  id: string;
  dot: string;
  title: string;
  detail: ReactNode;
  action: string;
  to: string;
}

type KeysQuery = ReturnType<typeof useAuthedQuery<ApiKeyItem[]>>;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Keys with no use recorded: never used since #486, or a server that does not record use. */
const unusedKeys = (keys: ApiKeyItem[]) => keys.filter((k) => !k.last_used_at).length;

/**
 * The newest record of a group: its request, what the verifier said, and when.
 * Each on a line of its own under its label, and the request isolated in a
 * <bdi>: the caller wrote it, so it must not read as the verifier's words.
 */
function latest(r: LedgerRecord): ReactNode {
  const said = r.result.agentMessage ?? r.result.error ?? 'No message recorded';
  return (
    <>
      <span>
        Newest request: <bdi>{r.query.split('\n')[0]}</bdi>
      </span>
      <span>The verifier said: {said}</span>
      <span>Received {formatUtc(r.createdAt)} UTC</span>
    </>
  );
}

// Groups by what the server stored. A VERIFIED record is listed only when the
// server stored DENY as its admission (#38): its message alone never puts it
// here, since whether the claim holds is the verifier's call, not one the
// dashboard makes. BLOCKED and UNVERIFIABLE records are listed by verdict, so
// a denied one is not counted twice.
//
// It counts the records of the chosen range, as the tiles do, and opens the
// ledger on that range (#46). `period` is null only when no record has a
// readable time; then it counts every loaded record.
function needsAttention(records: LedgerRecord[], activeKeys: number | null, period: Period | null): Attention[] {
  const items: Attention[] = [];
  const range = period ? `&${periodParams(period)}` : '';
  const ledger = (filters: string) => `/ledger?${filters}${range}`;
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
      to: ledger(`verdict=${g.facet}`),
    });
  }
  const denied = records.filter((r) => r.result.verdict === 'VERIFIED' && r.result.admission === 'DENY');
  const [firstDenied] = denied;
  if (firstDenied) {
    items.push({
      id: 'denied',
      dot: 'd-DENY',
      title: plural(denied.length, 'VERIFIED record not admitted', 'VERIFIED records not admitted'),
      detail: latest(firstDenied),
      action: 'Open in the ledger',
      to: ledger('verdict=VERIFIED&admission=DENY'),
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

/** "12.5% of these records" */
const shareOf = (n: number, total: number) => `${(Math.round((n / total) * 1000) / 10).toFixed(1)}% of these records`;

export function HomePage() {
  const [params, setParams] = useSearchParams();
  const range: Range = params.get('range') === '7d' ? '7d' : '24h';
  const logs = useAuthedQuery(['logs', LIMIT], (api, token) => api.listLogs(token, LIMIT));
  const keys = useAuthedQuery(['keys'], (api, token) => api.listKeys(token));
  const records = useMemo(() => (logs.data?.logs ?? []).map(toRecord), [logs.data]);
  const nextBefore = logs.data?.nextBefore;
  // All the server has: it said nothing is older, or it does not page and sent less than a page.
  const complete = nextBefore === null || (nextBefore === undefined && records.length < LIMIT);
  const win = useMemo(() => overviewWindow(records, range, complete), [records, range, complete]);
  const activeKeys = keys.data ? keys.data.length : null;
  const items = useMemo(
    () => needsAttention(win ? win.records : records, activeKeys, win),
    [win, records, activeKeys],
  );
  const name = RANGES[range].name;

  function pick(next: Range) {
    const p = new URLSearchParams(params);
    if (next === '24h') p.delete('range');
    else p.set('range', next);
    setParams(p, { replace: true });
  }

  return (
    <Shell crumbs={[{ label: 'Verification' }, { label: 'Overview' }]}>
      <div className="page-head">
        <div>
          <h1 className="h1">Overview</h1>
          <p className="sub">
            {records[0]
              ? `The ${name} up to the newest record, received ${formatUtc(records[0].createdAt)} UTC. `
              : 'What your organisation’s verifications show, once there are some. '}
            The dashboard groups what the server stored; it never works out a verdict.
          </p>
        </div>
        <fieldset className="seg">
          <legend className="sr-only">Time range</legend>
          <button type="button" aria-pressed={range === '24h'} onClick={() => pick('24h')}>
            24 hours
          </button>
          <button type="button" aria-pressed={range === '7d'} onClick={() => pick('7d')}>
            7 days
          </button>
        </fieldset>
      </div>

      {logs.isPending && <HomeSkeleton />}

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

      {/* One tree once the records have been asked for, failed or not, so the
          cards that ask the server for themselves stay mounted, with their
          results, through a retry: a retry after a failed first load puts the
          query back to pending, with no error and no data, until it answers.
          On data, not on success: a failed refresh keeps what loaded. */}
      {(logs.data || logs.isFetched) && (
        <div className="overview">
          {logs.data && (
            <>
              {win?.reachesBackTo && (
                <p className="note" style={{ margin: 0 }}>
                  The loaded records reach back to {formatUtc(new Date(win.reachesBackTo).toISOString())} UTC only, so
                  older records in these {name} are not counted. <Link to="/ledger">The ledger</Link> loads older ones.
                </p>
              )}

              <div className="tiles">
                {win && <RecordTiles win={win} />}
                <KeysTile keys={keys} />
              </div>

              <div className="ov-row">
                {win && (
                  <div className="wide">
                    <VerdictChart win={win} />
                  </div>
                )}
                <section className="card narrow" aria-labelledby="attention-title">
                  <div className="card-head">
                    <h2 id="attention-title">Needs attention</h2>
                    <Link to="/ledger">Ledger</Link>
                  </div>
                  <AttentionList items={items} total={records.length} win={win} />
                </section>
              </div>
            </>
          )}

          <div className="ov-grid">
            {win && <Breakdowns win={win} keys={keys} />}
            <ServerCards />
          </div>

          {records.length > 0 && (
            <section className="card flush" aria-labelledby="latest-title">
              <div className="card-head">
                <h2 id="latest-title">Latest records</h2>
                <Link to="/ledger">Open the ledger</Link>
              </div>
              <div className="table-wrap" style={{ borderTop: '1px solid var(--line)' }}>
                <RecordTable records={records.slice(0, LATEST)} />
              </div>
            </section>
          )}
        </div>
      )}
    </Shell>
  );
}

function RecordTiles({ win }: Readonly<{ win: OverviewWindow }>) {
  const t = win.totals;
  const name = RANGES[win.range].name;
  const series = (key: 'total' | 'blocked' | 'unverifiable' | 'none' | 'denied') => win.buckets.map((b) => b[key]);
  return (
    <>
      <StatTile label="Records" value={t.total} trend={series('total')}>
        {comparedText(t.total, win.previousTotal, name) ?? `In the ${name} up to the newest record.`}
      </StatTile>
      <StatTile label="Not admitted (DENY)" dot="d-DENY" value={t.denied} trend={series('denied')}>
        {shareOf(t.denied, t.total)}, any verdict
      </StatTile>
      <StatTile label="BLOCKED" dot="d-BLOCKED" value={t.blocked} trend={series('blocked')}>
        {shareOf(t.blocked, t.total)}
      </StatTile>
      <StatTile label="UNVERIFIABLE" dot="d-UNVERIFIABLE" value={t.unverifiable} trend={series('unverifiable')}>
        {shareOf(t.unverifiable, t.total)}
      </StatTile>
      <StatTile label="No verdict recorded" dot="d-none" value={t.none} trend={series('none')}>
        {shareOf(t.none, t.total)}
      </StatTile>
    </>
  );
}

function KeysTile({ keys }: Readonly<{ keys: KeysQuery }>) {
  let note: ReactNode = null;
  if (keys.isError && !keys.data) note = describeError(keys.error);
  else if (keys.data) {
    const unused = unusedKeys(keys.data);
    note = (
      <>
        <Link to="/keys">{plural(keys.data.length, 'active key', 'active keys')}</Link>
        {unused > 0 && `, ${unused} with no use recorded`}.
      </>
    );
  }
  return (
    <StatTile
      label="API keys"
      value={keys.data ? keys.data.length : <span className="sk" style={{ width: 40, height: 24 }} aria-hidden="true" />}
      after={
        keys.isRefetchError && (
          <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
            <p className="hint" style={{ margin: 0 }}>
              The key list could not be refreshed, so this count may be out of date. {describeError(keys.error)}
            </p>
            <button type="button" className="btn btn-sm" onClick={() => keys.refetch()}>
              Try the key list again
            </button>
          </div>
        )
      }
    >
      {note}
    </StatTile>
  );
}

/** Who made the records: the key's name from the key list, else its id. */
function keyRow(id: string, n: number, list: ApiKeyItem[] | undefined): BarRow {
  if (id === '') return { key: 'none', label: 'Not recorded', n, note: 'No key made these, or the server did not keep the caller.' };
  const key = list?.find((k) => k.id === id);
  if (key) {
    const used = key.last_used_at ? `last used ${formatUtc(key.last_used_at)} UTC` : 'no use recorded';
    return { key: id, label: key.name, n, note: `${key.key_preview}, ${used}` };
  }
  // The list holds active keys only, and only your own unless you are an owner or admin.
  return { key: id, label: list ? `Key ${id}, not in your key list` : `Key ${id}`, n };
}

function Breakdowns({ win, keys }: Readonly<{ win: OverviewWindow; keys: KeysQuery }>) {
  const count = plural(win.totals.total, 'record', 'records');
  const verifiers = countBy(win.records, (r) => r.domain.toLowerCase()).map(
    ({ key, n }): BarRow => ({ key, label: <span className="mono">{key}</span>, n }),
  );
  const callers = countBy(win.records, (r) => r.apiKeyId ?? '').map(({ key, n }) => keyRow(key, n, keys.data));
  return (
    <>
      <section className="card" aria-labelledby="by-verifier-title">
        <div className="card-head">
          <h2 id="by-verifier-title">By verifier</h2>
          <span className="hint num">{count}</span>
        </div>
        <BarList rows={verifiers} />
      </section>
      <section className="card" aria-labelledby="by-key-title">
        <div className="card-head">
          <h2 id="by-key-title">By API key</h2>
          <Link to="/keys">API keys</Link>
        </div>
        <BarList rows={callers} />
      </section>
    </>
  );
}

/** The cards that ask the server for themselves, not from the loaded records. */
function ServerCards() {
  return (
    <div className="ov-stack">
      <ActivitySummaryCard />
      <ChainTrail />
      <SecurityCard />
    </div>
  );
}

/** The newest security event, for owners and admins (#486). */
function SecurityCard() {
  const events = useSecurityEventPages(LATEST, null);
  const newest = events.data?.pages[0]?.events[0];
  let body: ReactNode;
  if (events.isPending) body = <span className="sk" style={{ width: '60%' }} aria-hidden="true" />;
  else if (!events.data) body = <p className="sub">{securityEventsError(events.error)}</p>;
  else if (newest) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className={`tag sev-${newest.severity}`}>{newest.severity}</span>
          <span style={{ color: 'var(--ink)', fontWeight: 500, fontSize: 13 }}>{typeLabel(newest.event_type)}</span>
          <span className="mono num muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>
            {formatUtc(newest.timestamp)}
          </span>
        </div>
        {/* The request is the caller's, the reason the server's: apart, labelled. */}
        <p className="hint" style={{ margin: 0, overflowWrap: 'anywhere' }}>
          Request: <bdi>{newest.query}</bdi>
        </p>
        <p className="hint" style={{ margin: 0, overflowWrap: 'anywhere' }}>
          Reason: {newest.reason}
        </p>
      </div>
    );
  } else body = <p className="sub">No security events.</p>;
  return (
    <section className="card" aria-labelledby="security-title">
      <div className="card-head">
        <h2 id="security-title">Security events</h2>
        <Link to="/security">All events</Link>
      </div>
      {body}
      {/* A failed refresh keeps the event that loaded, so say it may be out of date. */}
      {events.isRefetchError && (
        <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <p className="hint" style={{ margin: 0 }}>
            The security events could not be refreshed, so this may be out of date. {describeError(events.error)}
          </p>
          <button type="button" className="btn btn-sm" onClick={() => events.refetch()}>
            Try the security events again
          </button>
        </div>
      )}
    </section>
  );
}

// With no records the note comes first, but the list still shows: a new
// organisation with no key needs the "No active API keys" line most.
function AttentionList({
  items,
  total,
  win,
}: Readonly<{ items: Attention[]; total: number; win: OverviewWindow | null }>) {
  const scope = win
    ? `the ${plural(win.records.length, 'record', 'records')} of these ${RANGES[win.range].name}`
    : `the newest ${plural(total, 'record', 'records')}`;
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
          Nothing needs attention in {scope}: none is BLOCKED or UNVERIFIABLE,
          no VERIFIED one was denied, and every stored result has a verdict.
        </div>
      )}
      {items.length > 0 && <Items items={items} />}
    </>
  );
}

function Items({ items }: Readonly<{ items: Attention[] }>) {
  return (
    <ul className="attn compact">
      {items.map((it) => (
        <li key={it.id}>
          <span className={`dot ${it.dot}`} aria-hidden="true" />
          <div className="attn-text">
            <strong>{it.title}</strong>
            {typeof it.detail === 'string' ? <span>{it.detail}</span> : it.detail}
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
    <div className="overview" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {/* As many as load (RecordTiles and the keys tile), so the page does not shift. */}
      <div className="tiles" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card tile">
            <span className="sk" style={{ width: '50%' }} />
            <span className="sk" style={{ width: '30%', height: 24 }} />
          </div>
        ))}
      </div>
      <div className="card" aria-hidden="true" style={{ height: 280 }}>
        <span className="sk" style={{ width: '30%' }} />
      </div>
    </div>
  );
}
