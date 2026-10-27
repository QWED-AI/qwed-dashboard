// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, httpApi } from '../api/http';
import { renderApp } from '../test/render';
import { ServerPage } from './ServerPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

const region = async (name: string) => within(await screen.findByRole('region', { name }));
const key = (kid: string) => ({ kid, kty: 'EC', crv: 'P-256', alg: 'ES256', use: 'sig' });

function serve(version: string | undefined, kids: string[]) {
  vi.spyOn(httpApi, 'health').mockResolvedValue({ status: 'healthy', ...(version ? { version } : {}) });
  return vi.spyOn(httpApi, 'getJwks').mockResolvedValue({ keys: kids.map(key) });
}

describe('ServerPage (#55)', () => {
  it('names the server, the dashboard and where it calls', async () => {
    serve('8.0.0', ['did:qwed:node:local#k1']);
    renderApp(<ServerPage />, { live: true });
    const connection = await region('Connection');
    expect(await connection.findByText('Connected.')).toBeTruthy();
    expect(connection.getByText('8.0.0')).toBeTruthy();
    expect(connection.getByText('/api, on this dashboard’s own origin')).toBeTruthy();
    const dashboard = await region('This dashboard');
    expect(dashboard.getByText(__APP_VERSION__)).toBeTruthy();
  });

  it('lists the signing keys with when this browser first saw each', async () => {
    serve('8.0.0', ['did:qwed:node:local#k1']);
    renderApp(<ServerPage />, { live: true });
    const keys = await region('Signing keys');
    const row = (await keys.findByText('did:qwed:node:local#k1')).closest('tr');
    const cells = [...(row?.querySelectorAll('td') ?? [])].map((c) => c.textContent);
    expect(cells.slice(0, 4)).toEqual(['did:qwed:node:local#k1', 'ES256', 'P-256', 'Signing']);
    expect(cells[4]).toMatch(/ UTC$/);
  });

  it('says when a key this browser saw before is gone, until dismissed', async () => {
    localStorage.setItem(
      'qwed-dashboard.signing-keys',
      JSON.stringify({ keys: { 'did:qwed:node:local#old': '2026-10-26T10:21:00.000Z' }, gone: [] }),
    );
    serve('8.0.0', ['did:qwed:node:local#new']);
    const user = userEvent.setup();
    renderApp(<ServerPage />, { live: true });
    const keys = await region('Signing keys');
    const note = await keys.findByRole('note');
    expect(note.textContent).toMatch(/^A signing key this browser saw before is no longer published\./);
    expect(note.textContent).toMatch(/set QWED_SIGNING_KEY or QWED_SIGNING_KEY_FILE on the server\./);
    expect(within(note).getByText('did:qwed:node:local#old')).toBeTruthy();

    await user.click(within(note).getByRole('button', { name: 'Dismiss' }));
    expect(keys.queryByRole('note')).toBeNull();
    expect(JSON.parse(localStorage.getItem('qwed-dashboard.signing-keys') ?? '{}').gone).toEqual([]);
  });

  it('marks each feature supported on 8.0.0, and as needing 8.0.0 on an older server', async () => {
    serve('7.3.0', []);
    renderApp(<ServerPage />, { live: true });
    const supports = await region('What this server supports');
    expect(await supports.findAllByText('Needs 8.0.0')).toHaveLength(supports.getAllByRole('row').length - 1);
    expect((await region('Connection')).getByText('Connected, to a version older than 8.0.0.')).toBeTruthy();
    cleanup();

    serve('8.0.0', []);
    renderApp(<ServerPage />, { live: true });
    const current = await region('What this server supports');
    expect(await current.findAllByText('Supported')).toHaveLength(current.getAllByRole('row').length - 1);
  });

  it('says why when the keys cannot be loaded, or the server publishes none', async () => {
    vi.spyOn(httpApi, 'health').mockResolvedValue({ version: '8.0.0' });
    vi.spyOn(httpApi, 'getJwks').mockRejectedValue(new ApiError(0, 'The QWED server could not be reached.'));
    renderApp(<ServerPage />, { live: true });
    expect(await (await region('Signing keys')).findByText(/could not be reached/)).toBeTruthy();
    cleanup();

    serve('8.0.0', []);
    renderApp(<ServerPage />, { live: true });
    expect(await (await region('Signing keys')).findByText('The server publishes no signing keys.')).toBeTruthy();
  });

  it('asks no server for its health with sample data', async () => {
    const health = vi.spyOn(httpApi, 'health');
    renderApp(<ServerPage />);
    expect(
      await (await region('Connection')).findByText('Sample data: there is no server, and nothing is sent anywhere.'),
    ).toBeTruthy();
    expect(health).not.toHaveBeenCalled();
    expect((await region('What this server supports')).getAllByText('Sample data').length).toBeGreaterThan(0);
  });

  it('leaves a live server’s key history alone when sample data is opened (live, demo, live)', async () => {
    const stored = { keys: { 'did:qwed:node:local#k1': '2026-10-26T10:21:00.000Z' }, gone: [] };
    localStorage.setItem('qwed-dashboard.signing-keys', JSON.stringify(stored));
    renderApp(<ServerPage />);
    expect(await (await region('Signing keys')).findByText('The server publishes no signing keys.')).toBeTruthy();
    expect(screen.queryByRole('note')).toBeNull();
    expect(JSON.parse(localStorage.getItem('qwed-dashboard.signing-keys') ?? '{}')).toEqual(stored);
    cleanup();

    serve('8.0.0', ['did:qwed:node:local#k1']);
    renderApp(<ServerPage />, { live: true });
    const keys = await region('Signing keys');
    expect(await keys.findByText('26 Oct 10:21:00 UTC')).toBeTruthy();
    expect(keys.queryByRole('note')).toBeNull();
  });

  it('keeps a saved notice while the keys cannot be loaded', async () => {
    localStorage.setItem(
      'qwed-dashboard.signing-keys',
      JSON.stringify({
        keys: {},
        gone: [{ kid: 'did:qwed:node:local#old', firstSeen: '2026-10-26T10:21:00.000Z', goneBy: '2026-10-26T11:00:00.000Z' }],
      }),
    );
    vi.spyOn(httpApi, 'health').mockResolvedValue({ version: '8.0.0' });
    vi.spyOn(httpApi, 'getJwks').mockRejectedValue(new ApiError(0, 'The QWED server could not be reached.'));
    renderApp(<ServerPage />, { live: true });
    const keys = await region('Signing keys');
    expect(await keys.findByText(/could not be reached/)).toBeTruthy();
    expect(within(keys.getByRole('note')).getByText('did:qwed:node:local#old')).toBeTruthy();
  });

  it('says when a refresh of the keys fails, and that the list is from the last check that worked', async () => {
    vi.spyOn(httpApi, 'health').mockResolvedValue({ version: '8.0.0' });
    vi.spyOn(httpApi, 'getJwks')
      .mockResolvedValueOnce({ keys: [key('did:qwed:node:local#k1')] })
      .mockRejectedValue(new ApiError(0, 'The QWED server could not be reached.'));
    const user = userEvent.setup();
    renderApp(<ServerPage />, { live: true });
    const keys = await region('Signing keys');
    await keys.findByText('did:qwed:node:local#k1');
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    const alert = await keys.findByRole('alert');
    expect(alert.textContent).toMatch(/^The latest check failed: .*could not be reached.* The keys below are from the last check that worked, at .* UTC\.$/);
    expect(keys.getByText('did:qwed:node:local#k1')).toBeTruthy();
  });

  it('does not break on a version that is not a string', async () => {
    vi.spyOn(httpApi, 'health').mockResolvedValue({ version: 8 } as unknown as { version: string });
    vi.spyOn(httpApi, 'getJwks').mockResolvedValue({ keys: [] });
    renderApp(<ServerPage />, { live: true });
    const connection = await region('Connection');
    expect(await connection.findByText('An answer came back, with no version the dashboard can read.')).toBeTruthy();
    expect(connection.getByText('not given')).toBeTruthy();
  });

  it('is in the menu under Settings', async () => {
    serve('8.0.0', []);
    renderApp(<ServerPage />, { live: true });
    const menu = within(await screen.findByRole('navigation', { name: 'Main' }));
    expect(menu.getByRole('link', { name: 'Server' }).getAttribute('href')).toBe('/server');
  });
});
