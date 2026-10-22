// @vitest-environment jsdom
import { focusManager } from '@tanstack/react-query';
import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import { renderApp } from '../test/render';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
});

async function section(name: string) {
  return within(await screen.findByRole('region', { name }));
}

describe('RecordPage', () => {
  it('keeps the record and the key name when a refresh fails, then recovers on Try again', async () => {
    const user = userEvent.setup();
    const getLog = demoApi.getLog.bind(demoApi);
    const listKeys = demoApi.listKeys.bind(demoApi);
    vi.spyOn(demoApi, 'getLog')
      .mockImplementationOnce(getLog)
      .mockRejectedValueOnce(new ApiError(403, 'Insufficient permissions'))
      .mockImplementation(getLog);
    vi.spyOn(demoApi, 'listKeys')
      .mockImplementationOnce(listKeys)
      .mockRejectedValueOnce(new ApiError(403, 'Denied'));
    renderApp(<App />, { route: '/records/1037' });
    const by = await section('Recorded by');
    expect(by.getByText('payments-agent prod (qwed_live_****x7Qa)')).toBeTruthy();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect((await screen.findByRole('alert')).textContent).toMatch(/This record could not be refreshed/);
    expect(screen.queryByText('This record could not be loaded')).toBeNull();
    expect(screen.getByRole('heading', { name: '(a + b)**2 = a**2 + b**2' })).toBeTruthy();
    // A key list that loaded once still names the key after its refresh fails.
    expect(by.getByText('payments-agent prod (qwed_live_****x7Qa)')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(screen.queryByText(/This record could not be refreshed/)).toBeNull());
  });

  it('names the key that made the record and the server version', async () => {
    renderApp(<App />, { route: '/records/1037' });
    const by = await section('Recorded by');
    expect(by.getByText('payments-agent prod (qwed_live_****x7Qa)')).toBeTruthy();
    expect(by.getByText('7.3.0')).toBeTruthy();
  });

  it('shows the id of a key that is not in the key list', async () => {
    renderApp(<App />, { route: '/records/1036' });
    const by = await section('Recorded by');
    expect(by.getByText('Key 5, not in your key list')).toBeTruthy();
  });

  it('shows the key id, and says the list failed, when the key list is refused', async () => {
    vi.spyOn(demoApi, 'listKeys').mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
    renderApp(<App />, { route: '/records/1037' });
    const by = await section('Recorded by');
    expect(await by.findByText('Key 7 (the key list could not be loaded)')).toBeTruthy();
    // Without a list, nothing says the key is missing from it.
    expect(by.queryByText(/not in your key list/)).toBeNull();
  });

  it('says not recorded for a record written before the server kept its caller', async () => {
    renderApp(<App />, { route: '/records/1033' });
    const by = await section('Recorded by');
    expect(by.getAllByText('not recorded')).toHaveLength(2);
    expect(by.getByText(/A row written before it did/)).toBeTruthy();
  });

  it('shows the chain entry as stored', async () => {
    renderApp(<App />, { route: '/records/1037' });
    const entry = await section('Chain entry, as stored');
    // Sample hashes: 64 hex characters, like a SHA-256.
    expect(entry.getAllByText(/^[0-9a-f]{64}$/)).toHaveLength(3);
  });

  it('says so for the first entry in the chain', async () => {
    renderApp(<App />, { route: '/records/1033' });
    const entry = await section('Chain entry, as stored');
    expect(entry.getByText('none: the first entry')).toBeTruthy();
  });

  it('does not call a row outside the chain its first entry', async () => {
    vi.spyOn(demoApi, 'getLog').mockResolvedValue({
      id: '1',
      request_input: 'q',
      verification_result: JSON.stringify({ status: 'VERIFIED', agent_message: 'ok' }),
      engine_used: 'MATH',
      status: 'verified',
      created_at: '2026-10-21T10:00:00',
      entry_hash: null,
      previous_hash: null,
      hmac_signature: null,
    });
    renderApp(<App />, { route: '/records/1' });
    const entry = await section('Chain entry, as stored');
    expect(entry.getByText('none: written outside the chain')).toBeTruthy();
    expect(entry.queryByText('none: the first entry')).toBeNull();
    expect(entry.getAllByText('none')).toHaveLength(2);
  });

  it('says not recorded for every field a server before #484 does not send', async () => {
    vi.spyOn(demoApi, 'getLog').mockResolvedValue({
      id: '1',
      request_input: 'q',
      verification_result: JSON.stringify({ status: 'VERIFIED', agent_message: 'ok' }),
      engine_used: 'MATH',
      status: 'verified',
      created_at: '2026-10-21T10:00:00',
    });
    renderApp(<App />, { route: '/records/1' });
    const entry = await section('Chain entry, as stored');
    expect(entry.getAllByText('not recorded')).toHaveLength(3);
    const by = await section('Recorded by');
    expect(by.getAllByText('not recorded')).toHaveLength(2);
  });
});
