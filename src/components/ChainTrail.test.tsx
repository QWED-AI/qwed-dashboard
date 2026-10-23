// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrailCheck } from '../api/types';
import { useSession } from '../auth/session';
import { LIVE_TOKEN, renderApp, SESSION_KEY } from '../test/render';
import { ChainTrail } from './ChainTrail';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const SCOPE =
  'Signature and hash-chain check of the audit entries recorded in the period. It does not show that every request was recorded.';

const trail = (extra: Partial<TrailCheck>): TrailCheck => ({
  status: 'NOT_VERIFIED',
  proof_ref: null,
  evidence: null,
  scope: SCOPE,
  total_entries: 0,
  verified_entries: 0,
  failed_entries: 0,
  first_failed_entry_id: null,
  legacy_entries: 0,
  errors: [],
  total_errors: 0,
  errors_truncated: false,
  ...extra,
});

function serve(response: Response) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function run(options: { live?: boolean } = {}) {
  const user = userEvent.setup();
  renderApp(<ChainTrail />, options);
  const c = within(await screen.findByRole('region', { name: 'Audit chain' }));
  await user.click(c.getByRole('button', { name: 'Check the whole chain' }));
  return c;
}

/** Puts an API key in memory, as the record page does for a key-only server. */
function WithStoredKey({ children }: Readonly<{ children: ReactNode }>) {
  const { setAdminKey } = useSession();
  useEffect(() => setAdminKey('qwed_live_stored'), [setAdminKey]);
  return <>{children}</>;
}

describe('ChainTrail', () => {
  it('sends the session even when an API key is in memory', async () => {
    const user = userEvent.setup();
    const fetchMock = serve(json(trail({ status: 'NO_ENTRIES' })));
    renderApp(
      <WithStoredKey>
        <ChainTrail />
      </WithStoredKey>,
      { live: true },
    );
    const c = within(await screen.findByRole('region', { name: 'Audit chain' }));
    await user.click(c.getByRole('button', { name: 'Check the whole chain' }));

    expect(await c.findByText('There are no audit entries to check yet.')).toBeTruthy();
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${LIVE_TOKEN}`);
    expect(headers.get('x-api-key')).toBeNull();
  });

  it('reports an intact chain with its range and proof_ref, using the session', async () => {
    const fetchMock = serve(
      json(
        trail({
          status: 'VERIFIED',
          proof_ref: 'sha256:abc',
          evidence: { first_entry_id: 1, last_entry_id: 10, entries: 10, head_hash: 'h' },
          total_entries: 10,
          verified_entries: 10,
        }),
      ),
    );
    const c = await run({ live: true });

    expect(await c.findByText('The chain checks out.')).toBeTruthy();
    expect(c.getByText(/10 entries checked, from record 1 to record 10/)).toBeTruthy();
    expect(c.getByText('sha256:abc')).toBeTruthy();
    expect(c.getByText(SCOPE)).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/admin/compliance/verify-trail');
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${LIVE_TOKEN}`);
  });

  it('names the first failed entry and links to it (sample data)', async () => {
    const c = await run();
    expect(await c.findByText('The chain does not check out.')).toBeTruthy();
    expect(c.getByText(/1 of 47 entries failed/)).toBeTruthy();
    expect(c.getByRole('link', { name: 'record 1037' }).getAttribute('href')).toBe('/records/1037');
    expect(c.getByText('Entry 1037: HMAC signature mismatch (sample data)')).toBeTruthy();
  });

  it('says when there is nothing to check', async () => {
    serve(json(trail({ status: 'NO_ENTRIES' })));
    const c = await run({ live: true });
    expect(await c.findByText('There are no audit entries to check yet.')).toBeTruthy();
  });

  it('says when the check could not run', async () => {
    serve(json(trail({ total_entries: null, failed_entries: null, errors: ['The audit trail could not be checked (OperationalError).'], total_errors: 1 })));
    const c = await run({ live: true });
    expect(await c.findByText('The chain could not be checked.')).toBeTruthy();
    expect(c.queryByText(/entries failed/)).toBeNull();
  });

  it('notes legacy entries and errors it does not list', async () => {
    const errors = Array.from({ length: 5 }, (_, i) => `Entry ${i + 1}: hash mismatch`);
    serve(
      json(
        trail({ total_entries: 12, failed_entries: 7, first_failed_entry_id: 1, legacy_entries: 2, errors, total_errors: 7, errors_truncated: true }),
      ),
    );
    const c = await run({ live: true });
    expect(await c.findByText(/7 of 12 entries failed/)).toBeTruthy();
    expect(c.getAllByText(/hash mismatch/)).toHaveLength(5);
    expect(c.getByText('2 more errors not shown.')).toBeTruthy();
    expect(c.getByText('2 entries were written before the chain existed and cannot be checked.')).toBeTruthy();
  });

  it.each([
    ['a server with no whole-chain route', json({ detail: 'Not Found' }, 404)],
    ['a server that takes only API keys there', json({ detail: 'Missing x-api-key header' }, 401)],
  ])('says the check is not available on %s', async (_name, response) => {
    serve(response);
    const c = await run({ live: true });
    expect((await c.findByRole('alert')).textContent).toMatch(/This server cannot check the whole chain/);
  });

  it('signs out when the server says the session has ended', async () => {
    serve(json({ detail: 'Could not validate credentials' }, 401));
    await run({ live: true });
    await waitFor(() => expect(sessionStorage.getItem(SESSION_KEY)).toBeNull());
  });

  it('stays signed in when an older server refuses the session there', async () => {
    serve(json({ detail: 'Missing x-api-key header' }, 401));
    const c = await run({ live: true });
    await c.findByRole('alert');
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it('says only owners and admins can check', async () => {
    serve(json({ detail: 'Insufficient role' }, 403));
    const c = await run({ live: true });
    expect((await c.findByRole('alert')).textContent).toMatch(/Only an owner or admin can check the audit chain/);
  });
});
