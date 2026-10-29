// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { renderApp } from '../test/render';
import { passwordTooLong } from './LoginPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function signIn(password = 'not-a-real-password') {
  const user = userEvent.setup();
  renderApp(<App />, { route: '/login', signedIn: false });
  await user.type(await screen.findByLabelText('Email'), 'owner@example.com');
  // Typed in one go: user.type reads "[" and "{" as key names.
  await user.click(screen.getByLabelText('Password'));
  await user.paste(password);
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

  describe('a password over 72 bytes (qwed-verification #548)', () => {
    // 37 two-byte characters: 37 characters, 74 bytes in UTF-8.
    const long = 'é'.repeat(37);
    // 36 of them: 72 bytes, the most the server reads.
    const longest = 'é'.repeat(36);
    const LONG = 'This password is longer than 72 bytes, the most QWED reads of a password, so the server cannot accept it.';
    const answer = (status: number, detail: string) =>
      vi.fn(async () => new Response(JSON.stringify({ detail }), { status }));

    it('counts bytes, not characters', () => {
      expect(passwordTooLong(long)).toBe(true);
      expect(passwordTooLong(longest)).toBe(false);
      expect(passwordTooLong('a'.repeat(72))).toBe(false);
      expect(passwordTooLong('a'.repeat(73))).toBe(true);
    });

    it('says why a server after #548 refuses it (401)', async () => {
      const fetchMock = answer(401, 'Invalid email or password');
      vi.stubGlobal('fetch', fetchMock);
      expect(await signIn(long)).toBe(LONG);
      // The request is still sent: a server on bcrypt 4 accepted such a password.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('says why 8.0.0 fails on it (500)', async () => {
      vi.stubGlobal('fetch', answer(500, 'Internal Server Error'));
      expect(await signIn(long)).toBe(LONG);
    });

    it('says a password of 72 bytes or fewer is wrong, as before', async () => {
      vi.stubGlobal('fetch', answer(401, 'Invalid email or password'));
      expect(await signIn(longest)).toBe('The email or password is wrong.');
    });

    it('keeps the other reasons for a long password', async () => {
      vi.stubGlobal('fetch', answer(403, 'User is not active'));
      expect(await signIn(long)).toBe('This account is deactivated.');
    });
  });
});
