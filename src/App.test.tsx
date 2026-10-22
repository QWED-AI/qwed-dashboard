// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('folds the menu behind a button that opens it and closes on a pick', async () => {
    // The CSS hides the menu below 900px unless it is open; jsdom loads no
    // CSS, so this checks the state the CSS reads.
    const user = userEvent.setup();
    renderApp(<App />, { route: '/' });
    const button = await screen.findByRole('button', { name: 'Menu' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const menu = document.getElementById(button.getAttribute('aria-controls') ?? '');
    expect(menu?.contains(screen.getByRole('navigation', { name: 'Main' }))).toBe(true);

    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(menu?.closest('aside')?.classList.contains('open')).toBe(true);

    // Picking the page already shown still closes the menu.
    await user.click(screen.getByRole('link', { name: 'Home' }));
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(menu?.closest('aside')?.classList.contains('open')).toBe(false);
  });

  it('closes the menu when the brand link is picked', async () => {
    const user = userEvent.setup();
    renderApp(<App />, { route: '/' });
    const button = await screen.findByRole('button', { name: 'Menu' });
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    await user.click(screen.getByRole('link', { name: 'QWED Dashboard home' }));
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('sends a signed-out visitor to the sign-in page', async () => {
    renderApp(<App />, { route: '/keys', signedIn: false });
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
});
