// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import { renderApp, SESSION_KEY } from '../test/render';
import { expectStackedTable } from '../test/table';
import { KeysPage } from './KeysPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function createKey(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByLabelText('New key name'), name);
  await user.click(screen.getByRole('button', { name: 'Create key' }));
  await screen.findByText(`${name} is ready.`);
}

describe('KeysPage', () => {
  it('lists the active keys with when each was last used', async () => {
    renderApp(<KeysPage />);
    const row = (await screen.findByRole('cell', { name: 'payments-agent prod' })).closest('tr');
    expect(row?.textContent).toMatch(/2026-10-20 09:41:12 UTC/);
  });

  it('names the column of each small cell, for the stacked rows on a phone', async () => {
    renderApp(<KeysPage />);
    await screen.findByRole('cell', { name: 'payments-agent prod' });
    expectStackedTable(screen.getByRole('table'));
  });

  it('says no use is recorded for a key with no last use', async () => {
    vi.spyOn(demoApi, 'listKeys').mockResolvedValue([
      { id: '9', name: 'fresh', key_preview: 'qwed_live_****abcd', created_at: '2026-10-21T10:00:00', last_used_at: null, is_revoked: false },
    ]);
    renderApp(<KeysPage />);
    const row = (await screen.findByRole('cell', { name: 'fresh' })).closest('tr');
    expect(row?.textContent).toMatch(/No use recorded/);
    expect(screen.queryByText('Not recorded')).toBeNull();
  });

  it('shows a new key once and drops it when dismissed', async () => {
    const user = userEvent.setup();
    renderApp(<KeysPage />);
    await screen.findByText('payments-agent prod');
    await createKey(user, 'ci runner');

    expect(screen.getByText(/^qwed_test_[A-Za-z0-9]{36}$/)).toBeTruthy();
    expect(await screen.findByRole('cell', { name: 'ci runner' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'I have saved it' }));
    expect(screen.queryByText('ci runner is ready.')).toBeNull();
    // The full key is gone; only the masked preview stays in the list.
    expect(screen.queryByText(/^qwed_test_[A-Za-z0-9]{36}$/)).toBeNull();
    expect(screen.getByText(/^qwed_test_\*{4}/)).toBeTruthy();
  });

  it('copies the key', async () => {
    const user = userEvent.setup();
    renderApp(<KeysPage />);
    await screen.findByText('payments-agent prod');
    await createKey(user, 'copy me');

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when the browser refuses to copy', async () => {
    const user = userEvent.setup();
    renderApp(<KeysPage />);
    await screen.findByText('payments-agent prod');
    await createKey(user, 'no clipboard');
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/copy it by hand/);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });

  it('revokes a key after confirming, and hides its panel', async () => {
    const user = userEvent.setup();
    renderApp(<KeysPage />);
    await screen.findByText('payments-agent prod');
    await createKey(user, 'temp key');

    await user.click(await screen.findByRole('button', { name: 'Revoke temp key' }));
    expect(screen.getByText('Calls with this key will fail.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(screen.queryByRole('cell', { name: 'temp key' })).toBeNull());
    expect(screen.queryByText('temp key is ready.')).toBeNull();
  });

  it('keeps the key when the revoke is cancelled', async () => {
    const user = userEvent.setup();
    renderApp(<KeysPage />);
    await user.click(await screen.findByRole('button', { name: 'Revoke invoice pipeline' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Calls with this key will fail.')).toBeNull();
    expect(screen.getByRole('cell', { name: 'invoice pipeline' })).toBeTruthy();
  });

  it('reports a failed revoke', async () => {
    const user = userEvent.setup();
    vi.spyOn(demoApi, 'revokeKey').mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
    renderApp(<KeysPage />);
    await user.click(await screen.findByRole('button', { name: 'Revoke invoice pipeline' }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Your role cannot do this.');
  });

  it('tells a user without the role that they cannot create keys', async () => {
    const user = userEvent.setup();
    vi.spyOn(demoApi, 'createKey').mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
    renderApp(<KeysPage />);
    await screen.findByText('payments-agent prod');
    await user.type(screen.getByLabelText('New key name'), 'not allowed');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Your role cannot do this.');
  });

  it('signs out when the session has ended', async () => {
    const user = userEvent.setup();
    vi.spyOn(demoApi, 'createKey').mockRejectedValue(new ApiError(401, 'Not authenticated'));
    renderApp(<KeysPage />);
    await screen.findByText('payments-agent prod');
    await user.type(screen.getByLabelText('New key name'), 'expired');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await waitFor(() => expect(sessionStorage.getItem(SESSION_KEY)).toBeNull());
  });

  it('does not submit an empty name', async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(demoApi, 'createKey');
    renderApp(<KeysPage />);
    await screen.findByText('payments-agent prod');
    await user.type(screen.getByLabelText('New key name'), '   ');
    expect((screen.getByRole('button', { name: 'Create key' }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('New key name'), '{Enter}');
    expect(create).not.toHaveBeenCalled();
  });

  it('shows an empty state when there are no keys', async () => {
    vi.spyOn(demoApi, 'listKeys').mockResolvedValue([]);
    renderApp(<KeysPage />);
    expect(await screen.findByText('No active keys')).toBeTruthy();
  });

  it('shows an error state when the list cannot be loaded', async () => {
    vi.spyOn(demoApi, 'listKeys').mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
    renderApp(<KeysPage />);
    expect(await screen.findByText('The keys could not be loaded')).toBeTruthy();
    expect(screen.getByText('Your role cannot do this.')).toBeTruthy();
  });
});
