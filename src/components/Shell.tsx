import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { useSession } from '../auth/session';
import { useTheme } from '../lib/theme';
import { Icon, type IconName } from './Icon';
import { Mark } from './Mark';

export interface Crumb {
  label: string;
  to?: string;
}

const THEME_LABEL = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' } as const;

function NavItem({ to, icon, label, onPick }: Readonly<{ to: string; icon: IconName; label: string; onPick: () => void }>) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'nav active' : 'nav')} onClick={onPick}>
      <Icon name={icon} />
      {label}
    </NavLink>
  );
}

export function Shell({ crumbs, children }: Readonly<{ crumbs: Crumb[]; children: ReactNode }>) {
  const { user, mode, signOut } = useSession();
  const [theme, cycleTheme] = useTheme();
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
              <span>Organisation {user?.org_id ?? ''}</span>
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
              <NavItem to="/" icon="home" label="Home" onPick={closeMenu} />
              <NavItem to="/ledger" icon="ledger" label="Decision ledger" onPick={closeMenu} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div className="grp">Settings</div>
              <NavItem to="/keys" icon="key" label="API keys" onPick={closeMenu} />
              <NavItem to="/security" icon="shield" label="Security events" onPick={closeMenu} />
            </div>
          </nav>

          <div className="side-foot">
            {mode === 'demo' && (
              <span className="tag" style={{ alignSelf: 'flex-start' }}>
                <span className="dot d-mute" aria-hidden="true" />
                <span>Sample data, not a server</span>
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
