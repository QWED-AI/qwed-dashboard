import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { SecurityEvent } from '../api/types';
import { Icon } from '../components/Icon';
import { RefreshError } from '../components/RefreshError';
import { Shell } from '../components/Shell';
import { formatUtc } from '../lib/format';
import { securityEventsError, TYPE_LABEL, typeLabel } from '../lib/securityEvents';
import { describeError, useSecurityEventPages } from '../lib/useAuthedQuery';

const LIMIT = 50;

function EventRow({ event }: Readonly<{ event: SecurityEvent }>) {
  return (
    <tr>
      <td className="mono num muted cell-small" style={{ fontSize: 12 }} data-label="Time (UTC)">
        {formatUtc(event.timestamp)}
      </td>
      <td>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>{typeLabel(event.event_type)}</span>
          <span className="mono muted" style={{ fontSize: 11 }}>
            {event.event_type}
          </span>
        </span>
      </td>
      <td className="cell-small" data-label="Severity">
        <span className={`tag sev-${event.severity}`}>{event.severity}</span>
      </td>
      <td>
        <span className="row-link" style={{ whiteSpace: 'normal' }}>
          <bdi>{event.query}</bdi>
        </span>
        <span className="row-note" style={{ whiteSpace: 'normal' }}>
          {event.reason}
        </span>
      </td>
      <td className="muted cell-small" data-label="Layer">
        {event.security_layer ?? 'not recorded'}
      </td>
    </tr>
  );
}

export function SecurityEventsPage() {
  const [params, setParams] = useSearchParams();
  const type = params.get('type');
  const events = useSecurityEventPages(LIMIT, type);
  const rows = useMemo(() => (events.data?.pages ?? []).flatMap((p) => p.events), [events.data]);
  // The types to filter by: the ones the server is known to write, every type
  // seen on this page so far, and the chosen one. The list is kept, so with
  // one type chosen (and only its events loaded) the others stay to pick.
  const [seenTypes, setSeenTypes] = useState<ReadonlySet<string>>(() => new Set(TYPE_LABEL.keys()));
  useEffect(() => {
    setSeenTypes((prev) => {
      const fresh = rows.map((e) => e.event_type).filter((t) => !prev.has(t));
      return fresh.length ? new Set([...prev, ...fresh]) : prev;
    });
  }, [rows]);
  const types = useMemo(() => {
    const all = new Set(seenTypes);
    if (type) all.add(type);
    return [...all].sort((a, b) => a.localeCompare(b));
  }, [seenTypes, type]);

  const emptyText = type
    ? 'There are no events of this type.'
    : 'The server records an event when it acts on a security finding, for example when it revokes an API key reported as leaked in public.';

  function setType(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set('type', value);
    else next.delete('type');
    setParams(next, { replace: true });
  }

  return (
    <Shell crumbs={[{ label: 'Settings' }, { label: 'Security events' }]}>
      <div className="page-head">
        <div>
          <h1 className="h1">Security events</h1>
          <p className="sub">
            What the server did about a security finding in your organisation, newest first. The server masks anything
            shaped like an API key or agent token before it sends an event.
          </p>
        </div>
      </div>

      {events.isPending && (
        <div className="state" aria-busy="true">
          <span className="sr-only">Loading security events</span>
          <span className="sk" style={{ width: '60%' }} aria-hidden="true" />
          <span className="sk" style={{ width: '40%' }} aria-hidden="true" />
        </div>
      )}

      {events.isError && !events.data && (
        <div className="state" role="alert">
          <span className="state-icon">
            <Icon name="alert" size={20} />
          </span>
          <h2>The security events could not be loaded</h2>
          <p className="sub">{securityEventsError(events.error)}</p>
          <div>
            <button type="button" className="btn" onClick={() => events.refetch()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {events.isRefetchError && (
        <RefreshError what="The security events" error={events.error} onRetry={() => events.refetch()} />
      )}

      {events.data && (
        <>
          {(rows.length > 0 || type) && (
            <div className="filters">
              <label className="pill">
                <span>Type</span>
                <select value={type ?? ''} onChange={(e) => setType(e.target.value)}>
                  <option value="">All</option>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {typeLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="state">
              <span className="state-icon">
                <Icon name="shield" size={20} />
              </span>
              <h2>No security events</h2>
              <p className="sub">{emptyText}</p>
            </div>
          ) : (
            <div className="table-wrap" style={{ borderTop: '1px solid var(--line)' }}>
              <table className="tbl tbl-stack">
                <thead>
                  <tr>
                    <th scope="col">Time (UTC)</th>
                    <th scope="col">Event</th>
                    <th scope="col">Severity</th>
                    <th scope="col">Subject · reason</th>
                    <th scope="col">Layer</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <EventRow key={e.id} event={e} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="table-foot">
            <span className="num">
              {rows.length === 1 ? '1 event' : `${rows.length} events`}
              {events.hasNextPage ? ' loaded so far' : ''}.
            </span>
            {events.hasNextPage && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={events.isFetching}
                onClick={() => events.fetchNextPage()}
              >
                {events.isFetchingNextPage ? 'Loading…' : `Load ${LIMIT} older events`}
              </button>
            )}
          </div>
          {events.isFetchNextPageError && (
            <p className="note" role="alert" style={{ margin: '0 24px 16px' }}>
              Older events could not be loaded. {describeError(events.error)}
            </p>
          )}
        </>
      )}
    </Shell>
  );
}
