// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { renderApp } from '../test/render';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function signIn() {
  const user = userEvent.setup();
  renderApp(<App />, { route: '/login', signedIn: false });
  await user.type(await screen.findByLabelText('Email'), 'owner@example.com');
  await user.type(screen.getByLabelText('Password'), 'not-a-real-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return (await screen.findByRole('alert')).textContent;
}

describe('LoginPage', () => {
  it('says the server cannot be reached when the proxy answers for it (#40)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502, statusText: 'Bad Gateway' })));
    expect(await signIn()).toBe(
      'The QWED server could not be reached. The proxy in front of it answered 502 Bad Gateway. Check that it is running and that the dashboard points at it.',
    );
  });

  it('says the server cannot be reached when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    expect(await signIn()).toBe(
      'The QWED server could not be reached. Check that it is running and that the dashboard points at it.',
    );
  });

  it('still says a wrong password is wrong', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'Invalid credentials' }), { status: 401 })),
    );
    expect(await signIn()).toBe('The email or password is wrong.');
  });
});
