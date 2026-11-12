// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { useSession } from '../auth/session';
import { SAMPLE_ONLY_NOTE } from '../lib/sampleOnly';
import { renderApp, SESSION_KEY } from '../test/render';

// A build with VITE_SAMPLE_ONLY=true, as the hosted preview is (netlify.toml).
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('a sample-only build', () => {
  it('offers the sample data and no sign-in form', async () => {
    vi.stubEnv('VITE_SAMPLE_ONLY', 'true');
    renderApp(<App />, { route: '/login', signedIn: false });
    expect(await screen.findByRole('button', { name: 'Explore with sample data' })).toBeTruthy();
    expect(screen.getByText(/This is a hosted preview with sample data\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'run the dashboard next to your QWED server' }).getAttribute('href')).toBe(
      'https://github.com/QWED-AI/qwed-dashboard#run-it',
    );
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Create the first owner' })).toBeNull();
  });

  it('opens the sample data, on the page a link asked for', async () => {
    vi.stubEnv('VITE_SAMPLE_ONLY', 'true');
    const user = userEvent.setup();
    renderApp(<App />, { route: '/ledger', signedIn: false });
    await user.click(await screen.findByRole('button', { name: 'Explore with sample data' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Decision ledger' })).toBeTruthy();
  });

  it('refuses a sign-in without sending anything', async () => {
    vi.stubEnv('VITE_SAMPLE_ONLY', 'true');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    let outcome: Promise<unknown> | undefined;
    function TrySignIn() {
      const { signIn } = useSession();
      useEffect(() => {
        outcome = signIn('owner@example.com', 'not-a-real-password');
      }, [signIn]);
      return null;
    }
    renderApp(<TrySignIn />, { signedIn: false });
    await expect(outcome).rejects.toThrow(SAMPLE_ONLY_NOTE);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('drops a live session left in the tab, and sends its token nowhere', async () => {
    vi.stubEnv('VITE_SAMPLE_ONLY', 'true');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    // A live session stored by an earlier build of this tab.
    renderApp(<App />, { route: '/ledger', signedIn: true, live: true });
    expect(await screen.findByRole('button', { name: 'Explore with sample data' })).toBeTruthy();
    expect(screen.getByText('Hosted preview')).toBeTruthy();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps a stored sample-data session', async () => {
    vi.stubEnv('VITE_SAMPLE_ONLY', 'true');
    renderApp(<App />, { route: '/ledger', signedIn: true });
    expect(await screen.findByRole('heading', { level: 1, name: 'Decision ledger' })).toBeTruthy();
  });

  it('leaves an ordinary build as it was', async () => {
    renderApp(<App />, { route: '/login', signedIn: false });
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create the first owner' })).toBeTruthy();
    expect(screen.queryByText(/hosted preview/)).toBeNull();
  });
});
