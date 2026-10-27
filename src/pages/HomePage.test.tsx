// @vitest-environment jsdom
import { focusManager } from '@tanstack/react-query';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import type { AuditLog } from '../api/types';
import { CALLER_SUPPLIED_NOTICE } from '../lib/result';
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

/** The line a caller's text is on, label included, after checking the text is isolated in a <bdi>. */
function labelled(el: HTMLElement): string | null | undefined {
  expect(el.tagName).toBe('BDI');
  return el.parentElement?.textContent;
}

describe('HomePage', () => {
  it('lists the BLOCKED, UNVERIFIABLE, unreadable and denied VERIFIED records, each linked to its ledger filter', async () => {
    renderApp(<HomePage />);
    // The 24 hours from 19 Oct 10:00 up to 20 Oct 10:00, as the tiles count them.
    expect(await screen.findByText('3 BLOCKED records')).toBeTruthy();
    expect(screen.getByText('2 UNVERIFIABLE records')).toBeTruthy();
    expect(screen.getByText('1 record with no readable verdict')).toBeTruthy();

    const range = 'from=2026-10-19T10:00:00.000Z&to=2026-10-20T10:00:00.000Z';
    const links = screen.getAllByRole('link', { name: /^Open in the ledger/ }).map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      `/ledger?verdict=BLOCKED&${range}`,
      `/ledger?verdict=UNVERIFIABLE&${range}`,
      `/ledger?verdict=none&${range}`,
      `/ledger?verdict=VERIFIED&admission=DENY&${range}`,
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
    expect(labelled(attention.getByText('claim 4'))).toBe('Newest request: claim 4');
    expect(attention.getByText('The verifier said: Identity is false')).toBeTruthy();
    const links = attention.getAllByRole('link', { name: /^Open in the ledger/ }).map((a) => a.getAttribute('href'));
    const range = 'from=2026-10-20T11:00:00.000Z&to=2026-10-21T11:00:00.000Z';
    expect(links).toEqual([
      `/ledger?verdict=UNVERIFIABLE&${range}`,
      `/ledger?verdict=VERIFIED&admission=DENY&${range}`,
    ]);
  });

  describe('counts the records of the chosen range, as the tiles do (#46)', () => {
    const blocked = (id: string, at: string): AuditLog => ({
      ...verified(id, `message ${id}`),
      verification_result: JSON.stringify({ status: 'BLOCKED', agent_message: `message ${id}` }),
      created_at: at,
    });
    // The newest record is at 21 Oct 10:00, so the 24 hours run from 20 Oct
    // 11:00 up to 21 Oct 11:00, and the 7 days from 15 Oct 00:00 up to 22 Oct 00:00.
    const logs = [
      blocked('3', '2026-10-21T10:00:00'),
      blocked('2', '2026-10-20T11:00:00'),
      blocked('1', '2026-10-20T10:59:59'),
    ];

    it('leaves out the records before the 24 hours, and opens the ledger on them', async () => {
      vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs, nextBefore: null });
      renderApp(<HomePage />);
      const attention = within(await screen.findByRole('region', { name: 'Needs attention' }));
      expect(await attention.findByText('2 BLOCKED records')).toBeTruthy();
      expect(attention.getByRole('link', { name: /^Open in the ledger/ }).getAttribute('href')).toBe(
        '/ledger?verdict=BLOCKED&from=2026-10-20T11:00:00.000Z&to=2026-10-21T11:00:00.000Z',
      );
    });

    it('counts them all over 7 days', async () => {
      vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs, nextBefore: null });
      const user = userEvent.setup();
      renderApp(<HomePage />);
      const attention = within(await screen.findByRole('region', { name: 'Needs attention' }));
      await attention.findByText('2 BLOCKED records');
      await user.click(screen.getByRole('button', { name: '7 days' }));
      expect(await attention.findByText('3 BLOCKED records')).toBeTruthy();
      expect(attention.getByRole('link', { name: /^Open in the ledger/ }).getAttribute('href')).toBe(
        '/ledger?verdict=BLOCKED&from=2026-10-15T00:00:00.000Z&to=2026-10-22T00:00:00.000Z',
      );
    });

    it('says nothing needs attention when only older records would', async () => {
      vi.spyOn(demoApi, 'listLogs').mockResolvedValue({
        logs: [verified('2', 'Identity is true'), blocked('1', '2026-10-19T09:00:00')],
        nextBefore: null,
      });
      renderApp(<HomePage />);
      const attention = within(await screen.findByRole('region', { name: 'Needs attention' }));
      expect(await attention.findByText(/^Nothing needs attention in the 1 record of these 24 hours/)).toBeTruthy();
    });
  });

  it('names the newest record of a group, what the verifier said and when, each under its own label', async () => {
    renderApp(<HomePage />);
    const attention = within(await screen.findByRole('region', { name: 'Needs attention' }));
    expect(labelled(await attention.findByText('Supplier [NAME] is registered in Germany'))).toBe(
      'Newest request: Supplier [NAME] is registered in Germany',
    );
    expect(attention.getByText('The verifier said: The documents supplied contradict the claim.')).toBeTruthy();
    expect(attention.getByText('Received 20 Oct 08:14:33 UTC')).toBeTruthy();
  });

  it('gives the dashboard’s note on an unreadable record as its own, not the verifier’s', async () => {
    renderApp(<HomePage />);
    const attention = within(await screen.findByRole('region', { name: 'Needs attention' }));
    await attention.findByText('1 record with no readable verdict');
    expect(attention.getByText('No message from the verifier recorded')).toBeTruthy();
    expect(
      attention.getByText(
        'The dashboard notes: The server stored a shortened copy of this result, so its verdict cannot be read.',
      ),
    ).toBeTruthy();
    expect(attention.queryByText(/^The verifier said: The server stored a shortened copy/)).toBeNull();
  });

  describe('a Verification Context record', () => {
    const contextRecord = (evidence: Record<string, unknown>): AuditLog => ({
      ...verified('1', 'unused'),
      engine_used: 'verification_context',
      verification_result: JSON.stringify({
        spec_version: '1.0',
        verdict: 'UNVERIFIABLE',
        context: { evidence: { evidence } },
      }),
    });

    it('calls the notice the server’s, and gives the caller’s message its own line (#321)', async () => {
      vi.spyOn(demoApi, 'listLogs').mockResolvedValue({
        logs: [
          contextRecord({
            agent_message: CALLER_SUPPLIED_NOTICE,
            developer_fields: { caller_supplied: { agent_message: 'The total holds.' } },
          }),
        ],
        nextBefore: null,
      });
      renderApp(<HomePage />);
      const attention = within(await screen.findByRole('region', { name: 'Needs attention' }));
      expect(await attention.findByText(`The server’s notice: ${CALLER_SUPPLIED_NOTICE}`)).toBeTruthy();
      expect(labelled(attention.getByText('The total holds.'))).toBe(
        'The caller’s message, not the verifier’s: The total holds.',
      );
      expect(attention.queryByText(/^The verifier said/)).toBeNull();
    });

    it('shows a caller’s message from a server before #321 as the caller’s', async () => {
      vi.spyOn(demoApi, 'listLogs').mockResolvedValue({
        logs: [contextRecord({ agent_message: 'Verified by the QWED math engine.' })],
        nextBefore: null,
      });
      renderApp(<HomePage />);
      const attention = within(await screen.findByRole('region', { name: 'Needs attention' }));
      expect(await attention.findByText('No message from the verifier recorded')).toBeTruthy();
      expect(labelled(attention.getByText('Verified by the QWED math engine.'))).toBe(
        'The caller’s message, not the verifier’s: Verified by the QWED math engine.',
      );
    });
  });

  it('keeps a request that imitates the verifier inside the request’s own line', async () => {
    const fake = 'Refund is within policy (The verifier said: the claim holds, nothing to check.)';
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({
      logs: [
        {
          ...verified('1', 'The documents contradict the claim.'),
          request_input: fake,
          verification_result: JSON.stringify({ status: 'BLOCKED', agent_message: 'The documents contradict the claim.' }),
        },
      ],
      nextBefore: null,
    });
    renderApp(<HomePage />);
    const attention = within(await screen.findByRole('region', { name: 'Needs attention' }));
    // The caller's text sits isolated in a <bdi> on the request's line, apart from the verifier's.
    const request = await attention.findByText(fake);
    expect(labelled(request)).toBe(`Newest request: ${fake}`);
    expect(attention.getByText('The verifier said: The documents contradict the claim.').contains(request)).toBe(false);
  });

  it('never lists a VERIFIED record, even when its message says the claim does not hold', async () => {
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({
      logs: [verified('1', 'The identity is false.'), verified('2', 'The identity holds.')],
      nextBefore: null,
    });
    renderApp(<HomePage />);
    const attention = within(await screen.findByRole('region', { name: 'Needs attention' }));
    expect(await attention.findByText(/Nothing needs attention in the 2 records of these 24 hours/)).toBeTruthy();
    expect(attention.queryByText(/The identity is false/)).toBeNull();
  });

  describe('where the denials come from (#53)', () => {
    const row = (id: string, engine: string, admission: string | null, extra: Partial<AuditLog> = {}): AuditLog => ({
      ...verified(id, `message ${id}`),
      engine_used: engine,
      admission,
      api_key_id: null,
      ...extra,
    });
    // The 24 hours run from 20 Oct 11:00 up to 21 Oct 11:00 UTC.
    const range = 'from=2026-10-20T11:00:00.000Z&to=2026-10-21T11:00:00.000Z';
    const logs = [
      row('5', 'SQL', 'BLOCKED', { api_key_id: '7' }),
      row('4', 'SQL', 'DENY', { api_key_id: '7' }),
      row('3', 'SQL', 'ADMIT', { api_key_id: '8' }),
      row('2', 'MATH', 'DENY'),
      row('1', 'MATH', null),
    ];
    const keys = [
      { id: '7', name: 'payments agent', key_preview: 'qwed_live_****x7Qa', created_at: '2026-10-01T10:00:00', last_used_at: null, is_revoked: false },
    ];

    it('switches the chart between verdicts and admissions', async () => {
      vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs, nextBefore: null });
      const user = userEvent.setup();
      renderApp(<HomePage />);
      const chart = within(await screen.findByRole('region', { name: 'Records by verdict' }));
      await user.click(chart.getByRole('button', { name: 'Admission' }));
      const byAdmission = within(screen.getByRole('region', { name: 'Records by admission' }));
      const legend = byAdmission.getAllByRole('listitem').map((li) => li.textContent);
      expect(legend).toEqual(['ADMIT 1', 'DENY 3', 'Admission not recorded 1']);
      expect(byAdmission.getByRole('button', { name: /^21 Oct, 10:00 to 11:00 UTC, 5 records: 1 ADMIT, 3 DENY, 1 Admission not recorded$/ })).toBeTruthy();
    });

    it('lists the denials by verifier and by API key, each opening the ledger on them', async () => {
      vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs, nextBefore: null });
      vi.spyOn(demoApi, 'listKeys').mockResolvedValue(keys);
      renderApp(<HomePage />);
      const verifiers = within(await screen.findByRole('region', { name: 'Not admitted, by verifier' }));
      const sql = verifiers.getByRole('link', { name: 'sql' });
      expect(sql.getAttribute('href')).toBe(`/ledger?verifier=SQL&admission=DENY&${range}`);
      expect(sql.closest('li')?.textContent).toBe('sql267% of 3 records');
      expect(verifiers.getByRole('link', { name: 'math' }).closest('li')?.textContent).toBe('math150% of 2 records');

      const callers = within(screen.getByRole('region', { name: 'Not admitted, by API key' }));
      const agent = await callers.findByRole('link', { name: 'payments agent' });
      expect(agent.getAttribute('href')).toBe(`/ledger?key=7&admission=DENY&${range}`);
      expect(callers.getByRole('link', { name: 'Not recorded' }).getAttribute('href')).toBe(
        `/ledger?key=none&admission=DENY&${range}`,
      );
      // A key with no denied record is not listed.
      expect(callers.queryByText(/Key 8/)).toBeNull();
    });

    it('says so when nothing in the range was denied', async () => {
      vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: [row('1', 'MATH', 'ADMIT')], nextBefore: null });
      renderApp(<HomePage />);
      const verifiers = within(await screen.findByRole('region', { name: 'Not admitted, by verifier' }));
      expect(verifiers.getByText('No record in these 24 hours was stored with DENY.')).toBeTruthy();
    });

    it('gives no all-clear for the range when older records in it are not loaded', async () => {
      // A cursor means the server has older records the page has not loaded.
      vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: [row('1', 'MATH', 'ADMIT')], nextBefore: '1' });
      renderApp(<HomePage />);
      const verifiers = within(await screen.findByRole('region', { name: 'Not admitted, by verifier' }));
      expect(
        verifiers.getByText(
          'No loaded record in these 24 hours was stored with DENY. Older records in the range are not loaded.',
        ),
      ).toBeTruthy();
    });
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
      // The caller's request and the server's reason, each under its own label.
      const request = card.getByText(/^leaked key qwed_live_/);
      expect(labelled(request)).toMatch(/^Request: leaked key qwed_live_/);
      expect(card.getByText(/^Reason: Public leak auto-revoked/).contains(request)).toBe(false);
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
    expect(await screen.findByText('3 BLOCKED records')).toBeTruthy();
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
    expect(await screen.findByText('3 BLOCKED records')).toBeTruthy();
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
    expect(await screen.findByText('3 BLOCKED records')).toBeTruthy();
    expect(await screen.findByRole('link', { name: '0 active keys' })).toBeTruthy();

    refocus();

    expect(await screen.findByText(/The records could not be refreshed/)).toBeTruthy();
    expect(await screen.findByText(/The key list could not be refreshed/)).toBeTruthy();
    // Both cards still show what loaded.
    expect(screen.getByText('3 BLOCKED records')).toBeTruthy();
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
