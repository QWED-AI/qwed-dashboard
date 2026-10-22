// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import { renderApp } from '../test/render';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function section(name: string) {
  return within(await screen.findByRole('region', { name }));
}

describe('RecordPage', () => {
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

  it('still shows the key id when the key list is refused', async () => {
    vi.spyOn(demoApi, 'listKeys').mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
    renderApp(<App />, { route: '/records/1037' });
    const by = await section('Recorded by');
    expect(by.getByText('Key 7, not in your key list')).toBeTruthy();
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
