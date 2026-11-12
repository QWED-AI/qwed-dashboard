import { useEffect, useRef, useState, type ReactNode, type SubmitEvent } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { API_BASE } from '../api/http';
import { useSession } from '../auth/session';
import { NEEDED_VERSION, useServerStatus, type ServerStatus } from '../lib/server';
import { useTheme } from '../lib/theme';
import { Icon, type IconName } from './Icon';
import { Mark } from './Mark';

const REPO = 'https://github.com/QWED-AI/qwed-dashboard';

export interface Crumb {
  label: string;
  to?: string;
}

// The three choices side by side, so one click picks any of them.
const THEMES = [
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['system', 'System'],
] as const;

function NavItem({ to, icon, label, onPick }: Readonly<{ to: string; icon: IconName; label: string; onPick: () => void }>) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'nav active' : 'nav')} onClick={onPick}>
      <Icon name={icon} />
      {label}
    </NavLink>
  );
}

/** The header's word on the server (#50): its version, or why there is none. */
function statusPill(s: ServerStatus): { cls: string; label: string } {
  switch (s.kind) {
    case 'demo':
      return { cls: 'status', label: 'Sample data, no server' };
    case 'checking':
      return { cls: 'status', label: 'Checking the server…' };
    case 'current':
      return { cls: 'status ok', label: `QWED ${s.version} · connected` };
    case 'older':
      return { cls: 'status old', label: `QWED ${s.version} · update to ${NEEDED_VERSION}` };
    case 'unknown':
      // A JSON answer with no version: nothing says it is QWED's.
      return { cls: 'status', label: s.version ? `Server ${s.version}` : 'No server version given' };
    case 'unreachable':
      return { cls: 'status down', label: 'Server unreachable' };
    case 'failed':
      return { cls: 'status down', label: 'Server check failed' };
  }
}

/** The footer's line on the server (#52). */
function serverLine(s: ServerStatus): string {
  switch (s.kind) {
    case 'demo':
      return 'Server: none, the sample data stays in this browser';
    case 'checking':
      return `Server: checking ${API_BASE}`;
    case 'unreachable':
      return `Server: not reached at ${API_BASE}`;
    case 'failed':
      return `Server: the health check at ${API_BASE} failed. ${s.reason}`;
    case 'unknown': {
      const named = s.version ? `version ${s.version}` : 'no version given';
      return `Server: ${named}, at ${API_BASE}`;
    }
    default:
      return `Server: QWED ${s.version} at ${API_BASE}`;
  }
}

/** True when a key press should stay with what has focus: a field, or a key with a modifier. */
function typing(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const el = e.target;
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/**
 * Find a record (#51). A record id opens the record; anything else, a
 * proof_ref for one, opens the ledger with it as the search, which covers
 * the loaded records: the server has no route that finds a record by
 * proof_ref. "/" moves the focus here.
 */
function FindRecord() {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || typing(e)) return;
      e.preventDefault();
      input.current?.focus();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    // navigate() settles once the route has changed; nothing waits on it.
    if (/^\d+$/.test(q)) void navigate(`/records/${q}`);
    else void navigate(`/ledger?q=${encodeURIComponent(q)}`);
  }

  return (
    <form role="search" className="find" onSubmit={submit}>
      <Icon name="search" size={14} />
      <label htmlFor="find-record" className="sr-only">
        Find a record by id or proof_ref
      </label>
      <input
        id="find-record"
        ref={input}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Record id or proof_ref"
        aria-keyshortcuts="/"
      />
      {/* The shortcut, shown as the site shows its search key; aria-keyshortcuts says it to screen readers. */}
      <kbd className="kbd" aria-hidden="true">
        /
      </kbd>
    </form>
  );
}

export function Shell({ crumbs, children }: Readonly<{ crumbs: Crumb[]; children: ReactNode }>) {
  const { user, signOut } = useSession();
  const server = useServerStatus();
  const pill = statusPill(server);
  const [theme, setTheme] = useTheme();
  // Below 900px the menu folds away behind a button, so the page starts at
  // the top of a phone screen. Wider screens always show it and hide the button.
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const initial = (user?.email ?? '?').slice(0, 1).toUpperCase();

  return (
    <div className="app">
      <aside className={menuOpen ? 'side open' : 'side'}>
        <div className="side-top">
          <Link to="/" className="brand" aria-label="QWED Dashboard home" onClick={closeMenu}>
            <span className="brand-tile">
              <Mark />
            </span>
            <span className="brand-name">
              <strong>QWED Dashboard</strong>
              {/* The name from qwed-verification #518; an older server, or a session signed in before it, has only the id. */}
              <span>{user?.org_name ?? `Organisation ${user?.org_id ?? ''}`}</span>
            </span>
          </Link>
          <button
            type="button"
            className="btn btn-sm menu-btn"
            aria-expanded={menuOpen}
            aria-controls="side-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? 'cross' : 'menu'} size={14} />
            Menu
          </button>
        </div>

        <div id="side-menu" className="side-menu">
          <nav aria-label="Main" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div className="grp">Verification</div>
              <NavItem to="/" icon="home" label="Overview" onPick={closeMenu} />
              <NavItem to="/ledger" icon="ledger" label="Decision ledger" onPick={closeMenu} />
              <NavItem to="/agents" icon="agent" label="Agents" onPick={closeMenu} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div className="grp">Settings</div>
              <NavItem to="/keys" icon="key" label="API keys" onPick={closeMenu} />
              <NavItem to="/members" icon="users" label="Members" onPick={closeMenu} />
              <NavItem to="/security" icon="shield" label="Security events" onPick={closeMenu} />
              <NavItem to="/server" icon="server" label="Server" onPick={closeMenu} />
            </div>
          </nav>

          <div className="side-foot">
            <div className="who">
              <span className="avatar" aria-hidden="true">
                {initial}
              </span>
              <span className="brand-name">
                <strong style={{ fontWeight: 500, fontSize: 12.5 }}>{user?.email}</strong>
                <span style={{ textTransform: 'capitalize' }}>{user?.role}</span>
              </span>
            </div>
            <fieldset className="seg theme-seg">
              <legend className="sr-only">Theme</legend>
              {THEMES.map(([value, label]) => (
                <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}>
                  {label}
                </button>
              ))}
            </fieldset>
            <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
              <Icon name="out" size={14} />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="sheet">
        <div className="topbar">
          <nav aria-label="Breadcrumb" className="crumbs">
            {crumbs.map((c, i) => (
              <span key={c.label} style={{ display: 'contents' }}>
                {i > 0 && <span aria-hidden="true">/</span>}
                {c.to && i < crumbs.length - 1 ? (
                  <Link to={c.to}>{c.label}</Link>
                ) : (
                  <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>
                )}
              </span>
            ))}
          </nav>
          <span className="spacer" />
          <FindRecord />
          {/* The pill opens the Server screen (#55); the <output> inside keeps its status live. */}
          <Link to="/server" className="status-link" title={server.kind === 'failed' ? server.reason : undefined}>
            <output className={pill.cls}>
              <span className="dot" aria-hidden="true" />
              {pill.label}
            </output>
          </Link>
        </div>
        {/* Each screen already says what it could not load; the pill says the
            server is down. Only an older server needs more words. */}
        {server.kind === 'older' && (
          <p className="server-note" role="note">
            <strong>This server is QWED {server.version}.</strong> Some of what the dashboard shows needs{' '}
            {NEEDED_VERSION}: <Link to="/server">Server</Link> lists which features this server lacks. Where one is
            missing, its screen says so or shows the value as not recorded.
          </p>
        )}
        {children}
        <footer className="foot">
          <span>
            QWED Dashboard <span className="mono">{__APP_VERSION__}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span>{serverLine(server)}</span>
          <nav aria-label="Footer">
            <a href="https://docs.qwedai.tech" target="_blank" rel="noreferrer">
              Docs
            </a>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={`${REPO}/security/policy`} target="_blank" rel="noreferrer">
              Security policy
            </a>
            <a href={`${REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">
              Changelog
            </a>
            <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
              Licence: Apache-2.0
            </a>
          </nav>
        </footer>
      </main>
    </div>
  );
}
