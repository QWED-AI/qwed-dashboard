// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import type { ApiKeyItem } from '../api/types';
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
    expect(screen.getByRole('cell', { name: /^invoice pipeline/ })).toBeTruthy();
  });

  it('reports a failed revoke', async () => {
    const user = userEvent.setup();
    vi.spyOn(demoApi, 'revokeKey').mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
    renderApp(<KeysPage />);
    await user.click(await screen.findByRole('button', { name: 'Revoke invoice pipeline' }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Your role cannot do this.');
  });

  describe('owner, expiry and the rotation flag (#64)', () => {
    const key = (id: string, extra: Partial<ApiKeyItem>): ApiKeyItem => ({
      id,
      name: `key ${id}`,
      key_preview: `qwed_live_****000${id}`,
      created_at: '2026-10-01T10:00:00Z',
      last_used_at: null,
      is_revoked: false,
      ...extra,
    });
    const rowOf = async (name: string) => {
      const row = (await screen.findByRole('cell', { name: new RegExp(`^${name}`) })).closest('tr');
      if (!row) throw new Error(`No row for ${name}`);
      return within(row);
    };

    it('shows whose key it is, with the signed-in user as you', async () => {
      vi.spyOn(demoApi, 'listKeys').mockResolvedValue([
        key('1', { owner: { id: 'demo', email: 'demo@example.com' }, expires_at: null, rotation_required: false }),
        key('2', { owner: { id: '9', email: 'ops@example.com' }, expires_at: null, rotation_required: false }),
        key('3', { owner: null, expires_at: null, rotation_required: false }),
      ]);
      renderApp(<KeysPage />);
      expect((await rowOf('key 1')).getByRole('cell', { name: 'demo@example.com (you)' })).toBeTruthy();
      expect((await rowOf('key 2')).getByRole('cell', { name: 'ops@example.com' })).toBeTruthy();
      expect((await rowOf('key 3')).getByRole('cell', { name: 'No user' })).toBeTruthy();
      expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeTruthy();
    });

    it('shows when each key expires, and marks one past it', async () => {
      vi.spyOn(demoApi, 'listKeys').mockResolvedValue([
        key('1', { expires_at: null, rotation_required: false, owner: null }),
        key('2', { expires_at: '2099-01-02T03:04:05Z', rotation_required: false, owner: null }),
        key('3', { expires_at: '2020-01-02T03:04:05Z', rotation_required: false, owner: null }),
      ]);
      renderApp(<KeysPage />);
      expect((await rowOf('key 1')).getByRole('cell', { name: 'Never' })).toBeTruthy();
      const future = await rowOf('key 2');
      expect(future.getByRole('cell', { name: '2099-01-02 03:04:05 UTC' })).toBeTruthy();
      expect(future.queryByText('Expired')).toBeNull();
      expect((await rowOf('key 3')).getByRole('cell', { name: 'Expired 2020-01-02 03:04:05 UTC' })).toBeTruthy();
      expect(screen.getByRole('columnheader', { name: 'Expires (UTC)' })).toBeTruthy();
    });

    it('tags a key the server flags for rotation, and no other', async () => {
      vi.spyOn(demoApi, 'listKeys').mockResolvedValue([
        key('1', { rotation_required: true, expires_at: '2099-01-02T03:04:05Z', owner: null }),
        key('2', { rotation_required: false, expires_at: null, owner: null }),
      ]);
      renderApp(<KeysPage />);
      const flagged = await rowOf('key 1');
      expect(flagged.getByText('Rotation required')).toBeTruthy();
      expect(flagged.getByText(/The server asks for this key to be rotated\./)).toBeTruthy();
      expect((await rowOf('key 2')).queryByText('Rotation required')).toBeNull();
    });

    it('leaves the columns out for a server before qwed-verification #504', async () => {
      vi.spyOn(demoApi, 'listKeys').mockResolvedValue([key('1', {})]);
      renderApp(<KeysPage />);
      await rowOf('key 1');
      expect(screen.queryByRole('columnheader', { name: 'Owner' })).toBeNull();
      expect(screen.queryByRole('columnheader', { name: 'Expires (UTC)' })).toBeNull();
      expect(screen.queryByText('Rotation required')).toBeNull();
      expectStackedTable(screen.getByRole('table'));
    });

    it('names the column of the new cells, for the stacked rows on a phone', async () => {
      renderApp(<KeysPage />);
      await screen.findByRole('columnheader', { name: 'Owner' });
      expectStackedTable(screen.getByRole('table'));
    });
  });

  describe('Rotate (#56)', () => {
    async function askToRotate(user: ReturnType<typeof userEvent.setup>, name: string) {
      await user.click(await screen.findByRole('button', { name: `Rotate ${name}` }));
      expect(
        screen.getByText(
          'The server revokes this key and makes a new one in its place. Callers still sending the old key are refused until they have the new one.',
        ),
      ).toBeTruthy();
    }

    it('rotates a key after confirming, shows the new key once, and lists it in the old one’s place', async () => {
      const user = userEvent.setup();
      renderApp(<KeysPage />);
      await screen.findByText('payments-agent prod');
      await createKey(user, 'nightly');
      await user.click(screen.getByRole('button', { name: 'I have saved it' }));

      await askToRotate(user, 'nightly');
      await user.click(screen.getByRole('button', { name: 'Rotate' }));

      expect(await screen.findByText('nightly was rotated. The old key no longer works.')).toBeTruthy();
      expect(screen.getByText(/^qwed_test_[A-Za-z0-9]{36}$/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
      expect(await screen.findByRole('cell', { name: 'nightly (Rotated)' })).toBeTruthy();
      await waitFor(() => expect(screen.queryByRole('cell', { name: 'nightly' })).toBeNull());
    });

    it('drops a key it showed when that key is rotated', async () => {
      const user = userEvent.setup();
      renderApp(<KeysPage />);
      await screen.findByText('payments-agent prod');
      await createKey(user, 'shown');
      const first = screen.getByText(/^qwed_test_[A-Za-z0-9]{36}$/).textContent;

      await askToRotate(user, 'shown');
      await user.click(screen.getByRole('button', { name: 'Rotate' }));

      await screen.findByText('shown was rotated. The old key no longer works.');
      expect(screen.queryByText('shown is ready.')).toBeNull();
      expect(screen.getByText(/^qwed_test_[A-Za-z0-9]{36}$/).textContent).not.toBe(first);
    });

    it('keeps the key when the rotation is cancelled', async () => {
      const user = userEvent.setup();
      const rotate = vi.spyOn(demoApi, 'rotateKey');
      renderApp(<KeysPage />);
      await askToRotate(user, 'invoice pipeline');
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText(/The server revokes this key/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Rotate invoice pipeline' })).toBeTruthy();
      expect(rotate).not.toHaveBeenCalled();
    });

    it('shows the server’s reason when it refuses a key of a higher role', async () => {
      const user = userEvent.setup();
      vi.spyOn(demoApi, 'rotateKey').mockRejectedValue(new ApiError(403, 'Cannot rotate a key owned by a higher-privileged user'));
      renderApp(<KeysPage />, { role: 'admin' });
      await askToRotate(user, 'invoice pipeline');
      await user.click(screen.getByRole('button', { name: 'Rotate' }));
      expect((await screen.findByRole('alert')).textContent).toBe(
        'The server refused: Cannot rotate a key owned by a higher-privileged user.',
      );
      expect(screen.getByRole('cell', { name: /^invoice pipeline/ })).toBeTruthy();
    });

    it('says a key already gone was revoked or rotated, and refreshes the list', async () => {
      const user = userEvent.setup();
      vi.spyOn(demoApi, 'rotateKey').mockRejectedValue(new ApiError(404, 'Key not found'));
      const list = vi.spyOn(demoApi, 'listKeys');
      renderApp(<KeysPage />);
      await askToRotate(user, 'invoice pipeline');
      const before = list.mock.calls.length;
      await user.click(screen.getByRole('button', { name: 'Rotate' }));
      expect((await screen.findByRole('alert')).textContent).toBe(
        'The server no longer has this key: it was revoked or rotated already.',
      );
      await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before));
    });

    it('says an older server rotates only with an API key, and keeps the session', async () => {
      const user = userEvent.setup();
      vi.spyOn(demoApi, 'rotateKey').mockRejectedValue(new ApiError(401, 'Missing x-api-key header'));
      renderApp(<KeysPage />);
      await askToRotate(user, 'invoice pipeline');
      await user.click(screen.getByRole('button', { name: 'Rotate' }));
      expect((await screen.findByRole('alert')).textContent).toBe(
        'This server rotates a key only with an API key, not a signed-in session. Rotating from the dashboard needs a qwed-verification release with #505.',
      );
      expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
    });

    it('signs out when the session has ended', async () => {
      const user = userEvent.setup();
      vi.spyOn(demoApi, 'rotateKey').mockRejectedValue(new ApiError(401, 'Not authenticated'));
      renderApp(<KeysPage />);
      await askToRotate(user, 'invoice pipeline');
      await user.click(screen.getByRole('button', { name: 'Rotate' }));
      await waitFor(() => expect(sessionStorage.getItem(SESSION_KEY)).toBeNull());
    });

    it('is not offered to a viewer, who may still revoke', async () => {
      renderApp(<KeysPage />, { role: 'viewer' });
      expect(await screen.findByRole('button', { name: 'Revoke invoice pipeline' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Rotate invoice pipeline' })).toBeNull();
    });

    const disabled = (name: string) => (screen.getByRole('button', { name }) as HTMLButtonElement).disabled;

    it('replaces nothing while a shown key is unsaved, except by rotating that key', async () => {
      const user = userEvent.setup();
      renderApp(<KeysPage />);
      await screen.findByText('payments-agent prod');
      await createKey(user, 'unsaved');
      expect(screen.getByText(/Creating or rotating another key waits until you have saved this one\./)).toBeTruthy();

      await user.type(screen.getByLabelText('New key name'), 'second');
      expect(disabled('Create key')).toBe(true);
      expect(disabled('Rotate invoice pipeline')).toBe(true);
      // Its own key may be rotated: the shown secret would no longer work.
      expect(disabled('Rotate unsaved')).toBe(false);

      await user.click(screen.getByRole('button', { name: 'I have saved it' }));
      expect(disabled('Create key')).toBe(false);
      expect(disabled('Rotate invoice pipeline')).toBe(false);
    });

    it('lets no second key be made while a rotation is in flight', async () => {
      const user = userEvent.setup();
      let finish: (v: Awaited<ReturnType<typeof demoApi.rotateKey>>) => void = () => undefined;
      const rotate = vi
        .spyOn(demoApi, 'rotateKey')
        .mockImplementation(() => new Promise((resolve) => (finish = resolve)));
      renderApp(<KeysPage />);
      await askToRotate(user, 'invoice pipeline');
      await user.click(screen.getByRole('button', { name: 'Rotate' }));
      expect(await screen.findByRole('button', { name: 'Rotating…' })).toBeTruthy();

      await user.type(screen.getByLabelText('New key name'), 'meanwhile');
      expect(disabled('Create key')).toBe(true);
      expect(disabled('Rotate payments-agent prod')).toBe(true);
      // Opening a Revoke would reset the rotation and free Create before the
      // rotation's secret arrives, so it waits too.
      expect(disabled('Revoke payments-agent prod')).toBe(true);
      await user.click(screen.getByRole('button', { name: 'Revoke payments-agent prod' }));
      expect(screen.queryByText('Calls with this key will fail.')).toBeNull();
      expect(screen.getByRole('button', { name: 'Rotating…' })).toBeTruthy();
      expect(disabled('Create key')).toBe(true);

      finish({ oldKeyId: '1', newKeyId: '99', newKeyPreview: 'qwed_test_****abcd', newKey: 'qwed_test_secret' });
      expect(await screen.findByText('invoice pipeline was rotated. The old key no longer works.')).toBeTruthy();
      expect(screen.getByText('qwed_test_secret')).toBeTruthy();
      expect(rotate).toHaveBeenCalledTimes(1);
    });

    it('drops a shown key when the server no longer has it', async () => {
      const user = userEvent.setup();
      renderApp(<KeysPage />);
      await screen.findByText('payments-agent prod');
      await createKey(user, 'gone elsewhere');
      vi.spyOn(demoApi, 'rotateKey').mockRejectedValue(new ApiError(404, 'Key not found'));
      await askToRotate(user, 'gone elsewhere');
      await user.click(screen.getByRole('button', { name: 'Rotate' }));
      expect((await screen.findByRole('alert')).textContent).toBe(
        'The server no longer has this key: it was revoked or rotated already.',
      );
      expect(screen.queryByText('gone elsewhere is ready.')).toBeNull();
      expect(screen.queryByText(/^qwed_test_[A-Za-z0-9]{36}$/)).toBeNull();
    });

    it('keeps the reason in view when the refresh empties the list', async () => {
      const user = userEvent.setup();
      vi.spyOn(demoApi, 'listKeys')
        .mockResolvedValueOnce([
          { id: '9', name: 'last one', key_preview: 'qwed_live_****abcd', created_at: '2026-10-21T10:00:00', last_used_at: null, is_revoked: false },
        ])
        .mockResolvedValue([]);
      vi.spyOn(demoApi, 'rotateKey').mockRejectedValue(new ApiError(404, 'Key not found'));
      renderApp(<KeysPage />);
      await askToRotate(user, 'last one');
      await user.click(screen.getByRole('button', { name: 'Rotate' }));
      expect(await screen.findByText('No active keys')).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toBe(
        'The server no longer has this key: it was revoked or rotated already.',
      );
    });

    it('offers one confirmation at a time', async () => {
      const user = userEvent.setup();
      renderApp(<KeysPage />);
      await askToRotate(user, 'invoice pipeline');
      await user.click(screen.getByRole('button', { name: 'Revoke payments-agent prod' }));
      expect(screen.queryByText(/The server revokes this key/)).toBeNull();
      expect(screen.getByText('Calls with this key will fail.')).toBeTruthy();
    });
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
