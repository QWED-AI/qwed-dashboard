// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIVE_TOKEN, renderApp } from '../test/render';
import { ChainCheck } from './ChainCheck';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const intact = { valid: true, checks: { hash_valid: true, signature_valid: true, chain_valid: true }, errors: [], log_id: 7 };

/** Answers each request in turn and records the headers it was sent with. */
function serve(...responses: Response[]) {
  const sent: Headers[] = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(new Headers(init.headers));
    const next = responses.shift();
    if (!next) throw new Error('No more responses');
    return next;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { sent, fetchMock };
}

async function card() {
  return within(await screen.findByRole('region', { name: 'Audit chain entry' }));
}

describe('ChainCheck against a server', () => {
  it('checks the entry with the signed-in session', async () => {
    const user = userEvent.setup();
    const { sent, fetchMock } = serve(json(intact));
    renderApp(<ChainCheck logId="7" />, { live: true });
    const c = await card();
    expect(c.getByText(/Runs with your session/)).toBeTruthy();

    await user.click(c.getByRole('button', { name: 'Check this entry' }));

    expect(await c.findByText('This entry is intact.')).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/admin/compliance/verify/7');
    expect(sent[0]?.get('Authorization')).toBe(`Bearer ${LIVE_TOKEN}`);
    expect(sent[0]?.get('x-api-key')).toBeNull();
  });

  it('asks for an API key when the server does not take sessions there (before #485)', async () => {
    const user = userEvent.setup();
    const { sent } = serve(json({ detail: 'Missing x-api-key header' }, 401), json(intact));
    renderApp(<ChainCheck logId="7" />, { live: true });
    const c = await card();
    await user.click(c.getByRole('button', { name: 'Check this entry' }));

    // The refusal switches to the key form; it is not shown as an error.
    expect(await c.findByText(/This server checks entries with an API key only/)).toBeTruthy();
    expect(c.queryByRole('alert')).toBeNull();

    await user.type(c.getByLabelText(/Owner or admin API key/), 'qwed_live_key');
    await user.click(c.getByRole('button', { name: 'Check this entry' }));

    expect(await c.findByText('This entry is intact.')).toBeTruthy();
    expect(sent[1]?.get('x-api-key')).toBe('qwed_live_key');
    expect(sent[1]?.get('Authorization')).toBeNull();
    expect(c.getByRole('button', { name: 'Forget the API key' })).toBeTruthy();
  });

  it('says only owners and admins can check when the session is refused for its role', async () => {
    const user = userEvent.setup();
    serve(json({ detail: 'Insufficient role' }, 403));
    renderApp(<ChainCheck logId="7" />, { live: true });
    const c = await card();
    await user.click(c.getByRole('button', { name: 'Check this entry' }));

    expect((await c.findByRole('alert')).textContent).toMatch(/Only an owner or admin can check audit entries/);
    expect(c.queryByLabelText(/Owner or admin API key/)).toBeNull();
  });

  it('forgets a key the server rejects and asks again', async () => {
    const user = userEvent.setup();
    serve(json({ detail: 'Missing x-api-key header' }, 401), json({ detail: 'Invalid or revoked API Key' }, 403));
    renderApp(<ChainCheck logId="7" />, { live: true });
    const c = await card();
    await user.click(c.getByRole('button', { name: 'Check this entry' }));
    await user.type(await c.findByLabelText(/Owner or admin API key/), 'qwed_live_bad');
    await user.click(c.getByRole('button', { name: 'Check this entry' }));

    expect((await c.findByRole('alert')).textContent).toMatch(/did not accept this API key: Invalid or revoked API Key/);
    expect(c.getByLabelText(/Owner or admin API key/)).toBeTruthy();
  });
});
