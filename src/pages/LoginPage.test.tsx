// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { renderApp } from '../test/render';
import { LONG_PASSWORD_NOTE, passwordTooLong } from './LoginPage';

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
    const answer = (status: number, detail: string) =>
      vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ detail }), { status }));

    it('counts bytes, not characters', () => {
      expect(passwordTooLong(long)).toBe(true);
      expect(passwordTooLong(longest)).toBe(false);
      expect(passwordTooLong('a'.repeat(72))).toBe(false);
      expect(passwordTooLong('a'.repeat(73))).toBe(true);
    });

    it('names the length as a possible cause of a 401, beside the usual reason', async () => {
      // A server after #548 answers this 401 for a wrong password too.
      const fetchMock = answer(401, 'Invalid email or password');
      vi.stubGlobal('fetch', fetchMock);
      expect(await signIn(long)).toBe(`The email or password is wrong. ${LONG_PASSWORD_NOTE}`);
      // The request is still sent, with the whole password: a server on
      // bcrypt 4 read the first 72 bytes and accepted it.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).password).toBe(long);
    });

    it('names the length as a possible cause of a 500, beside the server error', async () => {
      // 8.0.0 answers 500 for such a password; a 500 can have other causes.
      vi.stubGlobal('fetch', answer(500, 'Internal Server Error'));
      expect(await signIn(long)).toBe(`Sign-in failed: Internal Server Error ${LONG_PASSWORD_NOTE}`);
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
