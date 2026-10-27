import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { API_BASE } from '../api/http';
import { useSession } from '../auth/session';
import { Icon } from '../components/Icon';
import { Shell } from '../components/Shell';
import { formatUtc } from '../lib/format';
import { FEATURES, NEEDED_VERSION, useServerHealth, useServerStatus, type ServerStatus } from '../lib/server';
import { compareKeys, readSeenKeys, writeSeenKeys, type SeenKeys } from '../lib/signingKeys';
import { describeError } from '../lib/useAuthedQuery';

// Settings › Server (#55): the QWED server this dashboard talks to, the keys
// it signs with and what its version supports. Everything here comes from
// routes that need no sign-in: GET /health and GET /.well-known/jwks.json.

/** "Connected", or why not, for the Connection card. */
function stateLine(s: ServerStatus): string {
  switch (s.kind) {
    case 'demo':
      return 'Sample data: there is no server, and nothing is sent anywhere.';
    case 'checking':
      return 'Checking…';
    case 'current':
      return 'Connected.';
    case 'older':
      return `Connected, to a version older than ${NEEDED_VERSION}.`;
    case 'unknown':
      return 'An answer came back, with no version the dashboard can read.';
    case 'unreachable':
      return 'The server could not be reached.';
    case 'failed':
      return `The health check failed. ${s.reason}`;
  }
}

/** Where the dashboard sends its requests. */
const apiBase = API_BASE === '/api' ? '/api, on this dashboard’s own origin' : `${API_BASE}, set by VITE_QWED_API_BASE`;

function Connection() {
  const status = useServerStatus();
  const health = useServerHealth();
  // The server's JSON may hold anything here; only a string is a version.
  const sent = health.data?.version;
  const version = typeof sent === 'string' ? sent.trim() : '';
  return (
    <section className="card" aria-labelledby="connection-title">
      <div className="card-head">
        <h2 id="connection-title">Connection</h2>
      </div>
      <p className="sub" style={{ margin: 0 }}>
        {stateLine(status)}
      </p>
      {status.kind !== 'demo' && (
        <ul className="pairs">
          <li>
            <span className="muted">Server version</span>
            <span className="mono">{version || 'not given'}</span>
          </li>
          <li>
            <span className="muted">Address</span>
            <span className="mono">{apiBase}</span>
          </li>
          <li>
            <span className="muted">Last answer</span>
            <span>{health.dataUpdatedAt ? `${formatUtc(new Date(health.dataUpdatedAt).toISOString())} UTC` : 'none yet'}</span>
          </li>
        </ul>
      )}
    </section>
  );
}

function Dashboard() {
  return (
    <section className="card" aria-labelledby="dashboard-title">
      <div className="card-head">
        <h2 id="dashboard-title">This dashboard</h2>
      </div>
      <ul className="pairs">
        <li>
          <span className="muted">Version</span>
          <span className="mono">{__APP_VERSION__}</span>
        </li>
        <li>
          <span className="muted">Calls</span>
          <span className="mono">{apiBase}</span>
        </li>
      </ul>
    </section>
  );
}

function SigningKeys() {
  const { api, mode } = useSession();
  const jwks = useQuery({ queryKey: [mode, 'jwks'], queryFn: () => api.getJwks(), retry: false });
  // The history is a live server's: sample data neither reads nor changes it.
  const live = mode !== 'demo';
  // Read at once, so a saved notice shows even while the keys cannot be loaded.
  const [seen, setSeen] = useState<SeenKeys | null>(() => (live ? readSeenKeys() : null));

  // Each load is compared with the keys this browser saw before (#55).
  useEffect(() => {
    if (!live || !jwks.data) return;
    const next = compareKeys(readSeenKeys(), jwks.data.keys, new Date().toISOString());
    writeSeenKeys(next);
    setSeen(next);
  }, [live, jwks.data, jwks.dataUpdatedAt]);

  function dismiss() {
    if (!seen) return;
    const next = { ...seen, gone: [] };
    writeSeenKeys(next);
    setSeen(next);
  }

  const keys = jwks.data?.keys ?? [];
  const gone = seen?.gone ?? [];
  const lastLoaded = jwks.dataUpdatedAt ? `${formatUtc(new Date(jwks.dataUpdatedAt).toISOString())} UTC` : null;
  return (
    <section className="card flush" aria-labelledby="keys-title">
      <div className="card-head">
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h2 id="keys-title">Signing keys</h2>
          <p className="hint" style={{ margin: 0 }}>
            The public keys the server publishes. The record page checks attestations against these.
          </p>
        </div>
      </div>
      {gone.length > 0 && (
        <div className="server-note" role="note" style={{ margin: '0 16px 12px' }}>
          <p style={{ margin: 0 }}>
            <strong>
              {gone.length === 1 ? 'A signing key' : `${gone.length} signing keys`} this browser saw before{' '}
              {gone.length === 1 ? 'is' : 'are'} no longer published.
            </strong>{' '}
            The key was rotated, or the server was given no key: then it makes a new one each time it starts, and
            attestations signed before the restart no longer check out. To keep one key, set{' '}
            <code>QWED_SIGNING_KEY</code> or <code>QWED_SIGNING_KEY_FILE</code> on the server.
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {gone.map((g) => (
              <li key={g.kid}>
                <span className="mono" style={{ overflowWrap: 'anywhere' }}>
                  {g.kid}
                </span>
                , first seen {formatUtc(g.firstSeen)} UTC, gone by {formatUtc(g.goneBy)} UTC
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-sm" style={{ marginTop: 10 }} onClick={dismiss}>
            Dismiss
          </button>
        </div>
      )}
      {jwks.isPending && <p className="sub card-text">Loading the keys…</p>}
      {jwks.isError && !jwks.data && <p className="sub card-text">{describeError(jwks.error)}</p>}
      {/* A failed refresh keeps the last keys: say they are not from this check. */}
      {jwks.isRefetchError && (
        <p className="sub card-text" role="alert">
          The latest check failed: {describeError(jwks.error)} The keys below are from the last check that worked
          {lastLoaded ? `, at ${lastLoaded}` : ''}.
        </p>
      )}
      {jwks.data && keys.length === 0 && <p className="sub card-text">The server publishes no signing keys.</p>}
      {keys.length > 0 && (
        <div className="table-wrap" style={{ borderTop: '1px solid var(--line)' }}>
          <table className="tbl" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th scope="col">Key id</th>
                <th scope="col">Algorithm</th>
                <th scope="col">Curve</th>
                <th scope="col">Use</th>
                <th scope="col">First seen in this browser</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k, i) => (
                <tr key={k.kid ?? `key-${i}`}>
                  <td className="mono" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                    {k.kid ?? 'none given'}
                  </td>
                  <td className="mono">{k.alg ?? 'not given'}</td>
                  <td className="mono">{k.crv ?? 'not given'}</td>
                  <td>{k.use === 'sig' ? 'Signing' : (k.use ?? 'not given')}</td>
                  <td className="muted">
                    {k.kid && seen && Object.hasOwn(seen.keys, k.kid)
                      ? `${formatUtc(seen.keys[k.kid] as string)} UTC`
                      : 'not recorded'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Each feature supported or not, from the server's version only. */
function support(s: ServerStatus): string {
  if (s.kind === 'current') return 'Supported';
  if (s.kind === 'older') return `Needs ${NEEDED_VERSION}`;
  if (s.kind === 'demo') return 'Sample data';
  return 'Not known';
}

function Supports() {
  const status = useServerStatus();
  const word = support(status);
  return (
    <section className="card flush" aria-labelledby="supports-title">
      <div className="card-head">
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h2 id="supports-title">What this server supports</h2>
          <p className="hint" style={{ margin: 0 }}>
            The features the dashboard uses that need qwed-verification {NEEDED_VERSION}, read from the server’s
            version. Where one is missing, its screen shows the value as not recorded.
          </p>
        </div>
      </div>
      <div className="table-wrap" style={{ borderTop: '1px solid var(--line)' }}>
        <table className="tbl" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Where it shows</th>
              <th scope="col">On this server</th>
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((f) => (
              <tr key={f.name}>
                <td style={{ whiteSpace: 'normal' }}>{f.name}</td>
                <td className="muted" style={{ whiteSpace: 'normal' }}>
                  {f.where}
                </td>
                <td>{word}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ServerPage() {
  const { api, mode } = useSession();
  const health = useServerHealth();
  const jwks = useQuery({ queryKey: [mode, 'jwks'], queryFn: () => api.getJwks(), retry: false });
  const busy = health.isFetching || jwks.isFetching;
  return (
    <Shell crumbs={[{ label: 'Settings' }, { label: 'Server' }]}>
      <div className="page-head">
        <div>
          <h1 className="h1">Server</h1>
          <p className="sub">
            The QWED server this dashboard talks to, the keys it signs with, and what its version supports. All of it
            comes from routes that need no sign-in: <span className="mono">GET /health</span> and{' '}
            <span className="mono">GET /.well-known/jwks.json</span>.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            if (mode !== 'demo') void health.refetch();
            void jwks.refetch();
          }}
        >
          <Icon name="refresh" size={14} />
          {busy ? 'Checking…' : 'Check again'}
        </button>
      </div>
      <div className="overview">
        <div className="ov-grid">
          <Connection />
          <Dashboard />
        </div>
        <SigningKeys />
        <Supports />
      </div>
    </Shell>
  );
}
