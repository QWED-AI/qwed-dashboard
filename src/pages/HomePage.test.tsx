// @vitest-environment jsdom
import { focusManager } from '@tanstack/react-query';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import type { AuditLog } from '../api/types';
import { renderApp } from '../test/render';
import { HomePage } from './HomePage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
});

/** Coming back to the tab refetches every query on the page. */
function refocus() {
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
}

const verified = (id: string, message: string): AuditLog => ({
  id,
  request_input: `claim ${id}`,
  verification_result: JSON.stringify({ status: 'VERIFIED', agent_message: message, proof_ref: `sha256:${id}` }),
  engine_used: 'MATH',
  status: 'verified',
  created_at: '2026-10-21T10:00:00',
});

describe('HomePage', () => {
  it('lists the BLOCKED, UNVERIFIABLE, unreadable and denied VERIFIED records, each linked to its ledger filter', async () => {
    renderApp(<HomePage />);
    expect(await screen.findByText('5 BLOCKED records')).toBeTruthy();
    expect(screen.getByText('6 UNVERIFIABLE records')).toBeTruthy();
    expect(screen.getByText('3 records with no readable verdict')).toBeTruthy();

    const links = screen.getAllByRole('link', { name: /^Open in the ledger/ }).map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      '/ledger?verdict=BLOCKED',
      '/ledger?verdict=UNVERIFIABLE',
      '/ledger?verdict=none',
      '/ledger?verdict=VERIFIED&admission=DENY',
    ]);
  });

  it('lists a VERIFIED record the server stored as not admitted, once (#38)', async () => {
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({
      logs: [
        { ...verified('4', 'Identity is false'), admission: 'BLOCKED' },
        { ...verified('3', 'Identity is true'), admission: 'ADMIT' },
        {
          ...verified('2', 'Inconclusive'),
          verification_result: JSON.stringify({ status: 'UNVERIFIABLE', agent_message: 'Inconclusive' }),
          admission: 'BLOCKED',
        },
        verified('1', 'Identity is true'),
      ],
      nextBefore: null,
    });
    renderApp(<HomePage />);
    const attention = within(await screen.findByRole('region', { name: 'Needs attention' }));
    expect(await attention.findByText('1 VERIFIED record not admitted')).toBeTruthy();
    // The denied UNVERIFIABLE record is listed by its verdict, not counted again.
    expect(attention.getByText('1 UNVERIFIABLE record')).toBeTruthy();
    expect(attention.getByText(/^Newest: claim 4 \(Identity is false\)/)).toBeTruthy();
    const links = attention.getAllByRole('link', { name: /^Open in the ledger/ }).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/ledger?verdict=UNVERIFIABLE', '/ledger?verdict=VERIFIED&admission=DENY']);
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
    const attention = within(await screen.findByRole('region', { name: 'Needs attention' }));
    expect(await attention.findByText(/Nothing needs attention in the newest 2 records/)).toBeTruthy();
    expect(attention.queryByText(/The identity is false/)).toBeNull();
  });

  describe('the overview', () => {
    /** A tile's number and its line of context. */
    async function tile(name: string) {
      const t = await screen.findByRole('region', { name });
      return [t.querySelector('.tile-value')?.textContent, t.querySelector('.tile-note')?.textContent];
    }

    it('shows as many tiles while loading as once loaded, so the page does not shift', async () => {
      let answer: (page: { logs: AuditLog[]; nextBefore: null }) => void = () => {};
      vi.spyOn(demoApi, 'listLogs').mockReturnValue(new Promise((resolve) => (answer = resolve)));
      const { container } = renderApp(<HomePage />);
      const tiles = () => container.querySelectorAll('.tiles > .tile').length;
      await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeTruthy());
      const loading = tiles();

      act(() => answer({ logs: [verified('1', 'ok')], nextBefore: null }));
      await screen.findByRole('region', { name: 'Records' });
      await screen.findByRole('region', { name: 'API keys' });
      expect(tiles()).toBe(loading);
    });

    it('counts the records in the 24 hours up to the newest one, by stored verdict', async () => {
      renderApp(<HomePage />);
      expect(await screen.findByText(/^The 24 hours up to the newest record, received 20 Oct 09:41:12 UTC/)).toBeTruthy();
      // 15 records from 19 Oct 10:00 to 20 Oct 10:00, and 6 in the 24 hours before.
      expect(await tile('Records')).toEqual(['15', '150% more than the 24 hours before']);
      expect(await tile('BLOCKED')).toEqual(['3', '20.0% of these records']);
      expect(await tile('UNVERIFIABLE')).toEqual(['2', '13.3% of these records']);
      expect(await tile('No verdict recorded')).toEqual(['1', '6.7% of these records']);
    });

    it('counts the stored DENY admissions of any verdict (#38)', async () => {
      vi.spyOn(demoApi, 'listLogs').mockResolvedValue({
        logs: [
          { ...verified('4', 'Identity is false'), admission: 'BLOCKED' },
          { ...verified('3', 'Identity is true'), admission: 'ADMIT' },
          {
            ...verified('2', 'Inconclusive'),
            verification_result: JSON.stringify({ status: 'UNVERIFIABLE', agent_message: 'Inconclusive' }),
            admission: 'DENY',
          },
          verified('1', 'Identity is true'),
        ],
        nextBefore: null,
      });
      renderApp(<HomePage />);
      expect(await tile('Not admitted (DENY)')).toEqual(['2', '50.0% of these records, any verdict']);
    });

    it('compares with the window before when the loaded records reach it', async () => {
      vi.spyOn(demoApi, 'listLogs').mockResolvedValue({
        logs: [verified('3', 'ok'), { ...verified('2', 'ok'), created_at: '2026-10-21T09:00:00' }, { ...verified('1', 'ok'), created_at: '2026-10-20T10:30:00' }],
        nextBefore: null,
      });
      renderApp(<HomePage />);
      expect(await tile('Records')).toEqual(['2', '100% more than the 24 hours before']);
    });

    it('says how far back the loaded records reach when older ones are not loaded', async () => {
      vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: [verified('1', 'ok')], nextBefore: '1' });
      renderApp(<HomePage />);
      expect(await screen.findByText(/The loaded records reach back to 21 Oct 10:00:00 UTC only/)).toBeTruthy();
      // Older records may exist, so there is nothing to compare with.
      expect(await tile('Records')).toEqual(['1', 'In the 24 hours up to the newest record.']);
    });

    it('switches to seven days, kept in the address', async () => {
      const user = userEvent.setup();
      renderApp(<HomePage />);
      await user.click(await screen.findByRole('button', { name: '7 days' }));
      expect(screen.getByRole('button', { name: '7 days' }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByText(/^The 7 days up to the newest record/)).toBeTruthy();
      expect(screen.getByText('All 7 days')).toBeTruthy();
      expect(screen.getAllByRole('button', { name: /^\d\d Oct UTC, / })).toHaveLength(7);
    });

    it('opens on seven days from the address', async () => {
      renderApp(<HomePage />, { route: '/?range=7d' });
      expect((await screen.findByRole('button', { name: '7 days' })).getAttribute('aria-pressed')).toBe('true');
    });

    it('shows a column’s counts when it is focused, and the whole window otherwise', async () => {
      const user = userEvent.setup();
      renderApp(<HomePage />);
      const chart = within(await screen.findByRole('region', { name: 'Records by verdict' }));
      const legend = () => chart.getAllByRole('listitem').map((li) => li.textContent);
      expect(chart.getByText('All 24 hours')).toBeTruthy();
      expect(legend()).toEqual(['VERIFIED 9', 'UNVERIFIABLE 2', 'BLOCKED 3', 'No verdict recorded 1']);

      const eight = chart.getByRole('button', { name: /^20 Oct, 08:00 to 09:00 UTC, 4 records: / });
      await user.hover(eight);
      expect(chart.getByText('20 Oct, 08:00 to 09:00 UTC')).toBeTruthy();
      expect(legend()).toEqual(['VERIFIED 2', 'UNVERIFIABLE 1', 'BLOCKED 1', 'No verdict recorded 0']);
      await user.unhover(eight);
      expect(chart.getByText('All 24 hours')).toBeTruthy();

      act(() => eight.focus());
      expect(chart.getByText('20 Oct, 08:00 to 09:00 UTC')).toBeTruthy();
    });

    it('keeps the focused column’s counts when the pointer passes over another and leaves', async () => {
      const user = userEvent.setup();
      renderApp(<HomePage />);
      const chart = within(await screen.findByRole('region', { name: 'Records by verdict' }));
      const eight = chart.getByRole('button', { name: /^20 Oct, 08:00 to 09:00 UTC, / });
      const nine = chart.getByRole('button', { name: /^20 Oct, 09:00 to 10:00 UTC, / });
      act(() => eight.focus());
      await user.hover(nine);
      expect(chart.getByText('20 Oct, 09:00 to 10:00 UTC')).toBeTruthy();
      await user.unhover(nine);
      expect(document.activeElement).toBe(eight);
      expect(chart.getByText('20 Oct, 08:00 to 09:00 UTC')).toBeTruthy();
    });

    it('follows a new focus even while the pointer rests on another column', async () => {
      const user = userEvent.setup();
      renderApp(<HomePage />);
      const chart = within(await screen.findByRole('region', { name: 'Records by verdict' }));
      const eight = chart.getByRole('button', { name: /^20 Oct, 08:00 to 09:00 UTC, / });
      const nine = chart.getByRole('button', { name: /^20 Oct, 09:00 to 10:00 UTC, / });
      await user.hover(nine);
      act(() => eight.focus());
      expect(chart.getByText('20 Oct, 08:00 to 09:00 UTC')).toBeTruthy();
    });

    it('shows the same counts as a table', async () => {
      const user = userEvent.setup();
      renderApp(<HomePage />);
      const chart = within(await screen.findByRole('region', { name: 'Records by verdict' }));
      await user.click(chart.getByRole('button', { name: 'Table' }));
      const row = chart.getByRole('rowheader', { name: '20 Oct, 08:00 to 09:00' }).closest('tr');
      expect([...(row?.querySelectorAll('td') ?? [])].map((td) => td.textContent)).toEqual(['2', '1', '1', '0', '4']);
      expect(chart.getAllByRole('row')).toHaveLength(25);
    });

    it('counts the records by verifier and by API key', async () => {
      renderApp(<HomePage />);
      const rows = async (name: string) =>
        within(await screen.findByRole('region', { name }))
          .getAllByRole('listitem')
          .map((li) => li.querySelector('.bars-head')?.textContent);
      expect(await rows('By verifier')).toEqual(['code4', 'fact3', 'math3', 'stats2', 'logic1', 'sql1', 'verification_context1']);
      await waitFor(async () =>
        expect(await rows('By API key')).toEqual([
          'invoice pipeline5',
          'payments-agent prod5',
          'Key 5, not in your key list3',
          'Not recorded2',
        ]),
      );
    });

    it('shows the newest security event', async () => {
      renderApp(<HomePage />);
      const card = within(await screen.findByRole('region', { name: 'Security events' }));
      expect(await card.findByText('Leaked API key revoked')).toBeTruthy();
      expect(card.getByRole('link', { name: 'All events' }).getAttribute('href')).toBe('/security');
    });

    it('keeps the newest security event and warns when a refresh fails, then recovers', async () => {
      const user = userEvent.setup();
      const list = demoApi.listSecurityEvents.bind(demoApi);
      vi.spyOn(demoApi, 'listSecurityEvents')
        .mockImplementationOnce(list)
        .mockRejectedValueOnce(new ApiError(403, 'Insufficient permissions'))
        .mockImplementation(list);
      renderApp(<HomePage />);
      const card = within(await screen.findByRole('region', { name: 'Security events' }));
      expect(await card.findByText('Leaked API key revoked')).toBeTruthy();

      refocus();

      expect(await card.findByText(/The security events could not be refreshed, so this may be out of date/)).toBeTruthy();
      expect(card.getByText('Leaked API key revoked')).toBeTruthy();
      await user.click(card.getByRole('button', { name: 'Try the security events again' }));
      await waitFor(() => expect(card.queryByText(/could not be refreshed/)).toBeNull());
    });

    it('says why there are no security events for a member', async () => {
      vi.spyOn(demoApi, 'listSecurityEvents').mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
      renderApp(<HomePage />);
      const card = within(await screen.findByRole('region', { name: 'Security events' }));
      expect(await card.findByText('Only owners and admins can see security events.')).toBeTruthy();
    });

    it('lists the five newest records, each linked to its page', async () => {
      renderApp(<HomePage />);
      const latest = within(await screen.findByRole('region', { name: 'Latest records' }));
      expect(latest.getAllByRole('row')).toHaveLength(6);
      expect(
        latest.getByRole('link', { name: 'Refund of 3,400.00 for order [ORDER ID] is within the 30-day return window' }).getAttribute('href'),
      ).toBe('/records/1042');
    });
  });

  it('asks for a key when the organisation has none', async () => {
    vi.spyOn(demoApi, 'listKeys').mockResolvedValue([]);
    renderApp(<HomePage />);
    expect(await screen.findByText('No active API keys')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create a key: No active API keys' }).getAttribute('href')).toBe('/keys');
    expect(screen.getByRole('link', { name: '0 active keys' })).toBeTruthy();
  });

  it('counts the keys with no use recorded', async () => {
    const key = (id: string, lastUsed: string | null) => ({
      id,
      name: `key ${id}`,
      key_preview: 'qwed_live_****abcd',
      created_at: '2026-10-01T10:00:00',
      last_used_at: lastUsed,
      is_revoked: false,
    });
    vi.spyOn(demoApi, 'listKeys').mockResolvedValue([key('1', '2026-10-21T09:00:00'), key('2', null)]);
    renderApp(<HomePage />);
    const card = within(await screen.findByRole('region', { name: 'API keys' }));
    expect((await card.findByRole('link', { name: '2 active keys' })).parentElement?.textContent).toBe(
      '2 active keys, 1 with no use recorded.',
    );
  });

  it('says nothing more when every key has a recorded use', async () => {
    renderApp(<HomePage />);
    const card = within(await screen.findByRole('region', { name: 'API keys' }));
    expect((await card.findByRole('link', { name: '2 active keys' })).parentElement?.textContent).toBe('2 active keys.');
  });

  it('still shows the records when the key list is refused', async () => {
    vi.spyOn(demoApi, 'listKeys').mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
    renderApp(<HomePage />);
    expect(await screen.findByText('5 BLOCKED records')).toBeTruthy();
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

  it('keeps the cards that ask the server for themselves when the records cannot be loaded', async () => {
    vi.spyOn(demoApi, 'listLogs').mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
    renderApp(<HomePage />);
    expect(await screen.findByText('The records could not be loaded')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Load the 90-day summary' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check the whole chain' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Security events' })).toBeTruthy();
  });

  it('keeps a loaded summary while Try again waits for the records, and after', async () => {
    const user = userEvent.setup();
    const listLogs = demoApi.listLogs.bind(demoApi);
    let answer: () => void = () => undefined;
    vi.spyOn(demoApi, 'listLogs')
      .mockRejectedValueOnce(new ApiError(403, 'Insufficient permissions'))
      // The retry waits until the test lets it answer.
      .mockImplementationOnce((...args) => new Promise((resolve) => (answer = () => resolve(listLogs(...args)))));
    renderApp(<HomePage />);
    await user.click(await screen.findByRole('button', { name: 'Load the 90-day summary' }));
    const summary = () => within(screen.getByRole('region', { name: 'Last 90 days' }));
    expect(await summary().findByText('22 Jul to 20 Oct UTC, 90 days.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    // The records are on their way: the query is pending again, with no error.
    expect(await screen.findByText('Loading')).toBeTruthy();
    expect(summary().getByText('22 Jul to 20 Oct UTC, 90 days.')).toBeTruthy();

    await act(async () => answer());
    expect(await screen.findByText('5 BLOCKED records')).toBeTruthy();
    expect(summary().getByText('22 Jul to 20 Oct UTC, 90 days.')).toBeTruthy();
  });

  it('keeps what loaded and warns when a refresh fails, then recovers on Try again', async () => {
    const user = userEvent.setup();
    const listLogs = demoApi.listLogs.bind(demoApi);
    vi.spyOn(demoApi, 'listLogs')
      .mockImplementationOnce(listLogs)
      .mockRejectedValueOnce(new ApiError(403, 'Insufficient permissions'))
      .mockImplementation(listLogs);
    vi.spyOn(demoApi, 'listKeys').mockResolvedValueOnce([]).mockRejectedValueOnce(new ApiError(403, 'Denied'));
    renderApp(<HomePage />);
    expect(await screen.findByText('5 BLOCKED records')).toBeTruthy();
    expect(await screen.findByRole('link', { name: '0 active keys' })).toBeTruthy();

    refocus();

    expect(await screen.findByText(/The records could not be refreshed/)).toBeTruthy();
    expect(await screen.findByText(/The key list could not be refreshed/)).toBeTruthy();
    // Both cards still show what loaded.
    expect(screen.getByText('5 BLOCKED records')).toBeTruthy();
    expect(screen.getByRole('link', { name: '0 active keys' })).toBeTruthy();
    expect(screen.queryByText('The records could not be loaded')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText(/The records could not be refreshed/)).toBeNull());
    // The records' Try again does not touch the key list; it has its own.
    expect(screen.getByText(/The key list could not be refreshed/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Try the key list again' }));
    expect(await screen.findByRole('link', { name: '2 active keys' })).toBeTruthy();
    expect(screen.queryByText(/The key list could not be refreshed/)).toBeNull();
  });
});
