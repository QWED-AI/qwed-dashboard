// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { renderApp } from './test/render';

afterEach(cleanup);

describe('App routes', () => {
  it('opens Home at the root, and only Home is the current page', async () => {
    renderApp(<App />, { route: '/' });
    expect(await screen.findByRole('heading', { name: 'Needs attention', level: 1 })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Decision ledger' }).getAttribute('aria-current')).toBeNull();
  });

  it('opens the API keys screen from the sidebar route', async () => {
    renderApp(<App />, { route: '/keys' });
    expect(await screen.findByRole('heading', { name: 'API keys' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'API keys' }).getAttribute('aria-current')).toBe('page');
  });

  it('sends a signed-out visitor to the sign-in page', async () => {
    renderApp(<App />, { route: '/keys', signedIn: false });
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
});
