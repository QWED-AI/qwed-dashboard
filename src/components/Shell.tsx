import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { useSession } from '../auth/session';
import { useTheme } from '../lib/theme';
import { Icon } from './Icon';
import { Mark } from './Mark';

export interface Crumb {
  label: string;
  to?: string;
}

const THEME_LABEL = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' } as const;

export function Shell({ crumbs, children }: { crumbs: Crumb[]; children: ReactNode }) {
  const { user, mode, signOut } = useSession();
  const [theme, cycleTheme] = useTheme();
  const initial = (user?.email ?? '?').slice(0, 1).toUpperCase();

  return (
    <div className="app">
      <aside className="side">
        <Link to="/" className="brand" aria-label="QWED Dashboard home">
          <span className="brand-tile">
            <Mark />
          </span>
          <span className="brand-name">
            <strong>QWED Dashboard</strong>
            <span>Organisation {user?.org_id ?? ''}</span>
          </span>
        </Link>

        <nav aria-label="Main" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div className="grp">Verification</div>
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
              <Icon name="home" />
              Home
            </NavLink>
            <NavLink to="/ledger" className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
              <Icon name="ledger" />
              Decision ledger
            </NavLink>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div className="grp">Settings</div>
            <NavLink to="/keys" className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
              <Icon name="key" />
              API keys
            </NavLink>
            <NavLink to="/security" className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
              <Icon name="shield" />
              Security events
            </NavLink>
          </div>
        </nav>

        <div className="side-foot">
          {mode === 'demo' && (
            <span className="tag" style={{ alignSelf: 'flex-start' }}>
              <span className="dot d-mute" aria-hidden="true" />
              Sample data, not a server
            </span>
          )}
          <div className="who">
            <span className="avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="brand-name">
              <strong style={{ fontWeight: 500, fontSize: 12.5 }}>{user?.email}</strong>
              <span style={{ textTransform: 'capitalize' }}>{user?.role}</span>
            </span>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={cycleTheme}>
            <Icon name="theme" size={14} />
            {THEME_LABEL[theme]}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
            <Icon name="out" size={14} />
            Sign out
          </button>
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
          <a className="btn btn-sm" href="https://docs.qwedai.tech" target="_blank" rel="noreferrer">
            Docs
          </a>
        </div>
        {children}
      </main>
    </div>
  );
}
