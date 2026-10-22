// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import type { AuditLog } from '../api/types';
import { renderApp } from '../test/render';
import { HomePage } from './HomePage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const verified = (id: string, message: string): AuditLog => ({
  id,
  request_input: `claim ${id}`,
  verification_result: JSON.stringify({ status: 'VERIFIED', agent_message: message, proof_ref: `sha256:${id}` }),
  engine_used: 'MATH',
  status: 'verified',
  created_at: '2026-10-21T10:00:00',
});

describe('HomePage', () => {
  it('lists the BLOCKED, UNVERIFIABLE and unreadable records, each linked to its ledger filter', async () => {
    renderApp(<HomePage />);
    expect(await screen.findByText('2 BLOCKED records')).toBeTruthy();
    expect(screen.getByText('2 UNVERIFIABLE records')).toBeTruthy();
    expect(screen.getByText('1 record with no readable verdict')).toBeTruthy();

    const links = screen.getAllByRole('link', { name: /^Open in the ledger/ }).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/ledger?verdict=BLOCKED', '/ledger?verdict=UNVERIFIABLE', '/ledger?verdict=none']);
  });

  it('names the newest record of a group and what the verifier said', async () => {
    renderApp(<HomePage />);
    expect(
      await screen.findByText(
        'Newest: Supplier [NAME] is registered in Germany (The documents supplied contradict the claim.) at 20 Oct 08:14:33 UTC.',
      ),
    ).toBeTruthy();
  });

  it('never lists a VERIFIED record, even when its message says the claim does not hold', async () => {
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({
      logs: [verified('1', 'The identity is false.'), verified('2', 'The identity holds.')],
      nextBefore: null,
    });
    renderApp(<HomePage />);
    expect(await screen.findByText(/Nothing needs attention in the newest 2 records/)).toBeTruthy();
    expect(screen.queryByText(/The identity is false/)).toBeNull();
  });

  it('counts records by verdict and admission, as stored', async () => {
    renderApp(<HomePage />);
    const counts = within(await screen.findByRole('region', { name: 'Newest records' }));
    expect(counts.getByText(/^10 records, the newest received/)).toBeTruthy();
    const rows = counts.getAllByRole('listitem').map((li) => [li.querySelector('.chip')?.getAttribute('aria-label'), li.textContent?.match(/\d+$/)?.[0]]);
    expect(rows).toEqual([
      ['VERIFIED, admission not recorded', '4'],
      ['UNVERIFIABLE, admission not recorded', '2'],
      ['BLOCKED, admission not recorded', '2'],
      ['VERIFIED, admission ADMIT', '1'],
      ['No verdict recorded, admission not recorded', '1'],
    ]);
  });

  it('says the counts cover the newest page when the ledger has older records', async () => {
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: [verified('1', 'ok')], nextBefore: '1' });
    renderApp(<HomePage />);
    expect(await screen.findByText(/These cover the newest 200; the ledger loads older ones/)).toBeTruthy();
  });

  it('asks for a key when the organisation has none', async () => {
    vi.spyOn(demoApi, 'listKeys').mockResolvedValue([]);
    renderApp(<HomePage />);
    expect(await screen.findByText('No active API keys')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create a key: No active API keys' }).getAttribute('href')).toBe('/keys');
    expect(screen.getByRole('link', { name: '0 active keys' })).toBeTruthy();
  });

  it('still shows the records when the key list is refused', async () => {
    vi.spyOn(demoApi, 'listKeys').mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
    renderApp(<HomePage />);
    expect(await screen.findByText('2 BLOCKED records')).toBeTruthy();
    const keys = within(screen.getByRole('region', { name: 'API keys' }));
    expect(await keys.findByText('The server refused this request: Insufficient permissions')).toBeTruthy();
    expect(screen.queryByText('No active API keys')).toBeNull();
  });

  it('asks a new organisation, with no records and no keys, for a key', async () => {
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: [], nextBefore: null });
    vi.spyOn(demoApi, 'listKeys').mockResolvedValue([]);
    renderApp(<HomePage />);
    expect(await screen.findByText(/^No records yet\. Records show up/)).toBeTruthy();
    expect(await screen.findByText('No active API keys')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create a key: No active API keys' }).getAttribute('href')).toBe('/keys');
  });

  it('says so when there are no records yet', async () => {
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: [], nextBefore: null });
    renderApp(<HomePage />);
    expect(await screen.findByText(/^No records yet\. Records show up/)).toBeTruthy();
  });

  it('shows an error state when the records cannot be loaded', async () => {
    // A 4xx is not retried, so the error shows at once.
    vi.spyOn(demoApi, 'listLogs').mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
    renderApp(<HomePage />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/The records could not be loaded/);
    expect(alert.textContent).toMatch(/Insufficient permissions/);
  });
});
