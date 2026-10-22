// @vitest-environment jsdom
import { focusManager } from '@tanstack/react-query';
import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import type { AuditLog } from '../api/types';
import { renderApp } from '../test/render';
import { LedgerPage } from './LedgerPage';

const row = (id: string, extra: Partial<AuditLog> = {}): AuditLog => ({
  id,
  request_input: `claim ${id}`,
  verification_result: JSON.stringify({ status: 'VERIFIED', agent_message: `message ${id}` }),
  engine_used: 'MATH',
  status: 'verified',
  created_at: '2026-10-21T10:00:00',
  ...extra,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The table row whose request link has this text. */
async function rowFor(request: string) {
  const link = await screen.findByRole('link', { name: request });
  const row = link.closest('tr');
  if (!row) throw new Error(`No row for ${request}`);
  return row;
}

describe('LedgerPage', () => {
  it('shows what the verifier said next to a VERIFIED verdict', async () => {
    renderApp(<LedgerPage />);
    // A false identity is still VERIFIED: the check ran to a proof. Only the
    // message tells the reader the claim does not hold.
    const row = await rowFor('(a + b)**2 = a**2 + b**2');
    expect(within(row).getByText('VERIFIED')).toBeTruthy();
    expect(within(row).getByText('The identity is false.')).toBeTruthy();
  });

  it('says so when the stored result has no message', async () => {
    renderApp(<LedgerPage />);
    const row = await rowFor('Mean order value in [FILE] is 1,240.50');
    expect(within(row).getByText('No message recorded')).toBeTruthy();
  });

  it('reads the message from a Verification Context document', async () => {
    renderApp(<LedgerPage />);
    const row = await rowFor('Invoice total 4 × 249.00 + 18% GST equals 1,175.28');
    expect(within(row).getByText('The stated total matches.')).toBeTruthy();
  });

  it('finds records by the verifier message', async () => {
    const user = userEvent.setup();
    renderApp(<LedgerPage />);
    await rowFor('(x + 1)**2 = x**2 + 2*x + 1');
    await user.type(screen.getByRole('searchbox'), 'writes outside');

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('The code writes outside the workspace.')]);
  });

  it('shows the empty state when there are no records', async () => {
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: [], nextBefore: null });
    renderApp(<LedgerPage />);
    expect(await screen.findByText('No records yet')).toBeTruthy();
  });

  it('loads older records with the cursor the server gave', async () => {
    const user = userEvent.setup();
    const list = vi
      .spyOn(demoApi, 'listLogs')
      .mockResolvedValueOnce({ logs: [row('2')], nextBefore: '2' })
      .mockResolvedValueOnce({ logs: [row('1')], nextBefore: null });
    renderApp(<LedgerPage />);
    await rowFor('claim 2');
    expect(screen.queryByRole('link', { name: 'claim 1' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Load 200 older records' }));

    expect(await rowFor('claim 1')).toBeTruthy();
    expect(list).toHaveBeenLastCalledWith(expect.anything(), 200, '2');
    // The second page ended the ledger: no button, and no paging note.
    expect(screen.queryByRole('button', { name: /older records/ })).toBeNull();
    expect(screen.queryByText(/does not page/)).toBeNull();
  });

  it('says when a server does not page and a full page may hide older records', async () => {
    const page = Array.from({ length: 200 }, (_, i) => row(String(1000 - i)));
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: page, nextBefore: undefined });
    renderApp(<LedgerPage />);
    expect(await screen.findByText(/This server returns at most 200 records and does not page/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /older records/ })).toBeNull();
  });

  it('keeps the loaded records when older ones cannot be loaded', async () => {
    const user = userEvent.setup();
    vi.spyOn(demoApi, 'listLogs')
      .mockResolvedValueOnce({ logs: [row('2')], nextBefore: '2' })
      .mockRejectedValueOnce(new ApiError(403, 'Insufficient permissions'));
    renderApp(<LedgerPage />);
    await rowFor('claim 2');

    await user.click(screen.getByRole('button', { name: 'Load 200 older records' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/Older records could not be loaded/);
    expect(screen.getByRole('link', { name: 'claim 2' })).toBeTruthy();
  });

  it('keeps the records and warns when a refresh fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(demoApi, 'listLogs')
      .mockResolvedValueOnce({ logs: [row('2')], nextBefore: null })
      .mockRejectedValueOnce(new ApiError(403, 'Insufficient permissions'))
      .mockResolvedValueOnce({ logs: [row('3'), row('2')], nextBefore: null });
    renderApp(<LedgerPage />);
    await rowFor('claim 2');

    // Coming back to the tab refetches the ledger.
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be refreshed/);
    expect(screen.getByRole('link', { name: 'claim 2' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await rowFor('claim 3')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    focusManager.setFocused(undefined);
  });

  it('shows the verdict the server sends over its own reading, null included', async () => {
    // The stored result says VERIFIED; a server after #484 says it holds no
    // verdict (as it does for a batch row), and the ledger follows the server.
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue({ logs: [row('3', { verdict: null })], nextBefore: null });
    renderApp(<LedgerPage />);
    const r = await rowFor('claim 3');
    expect(within(r).getByLabelText('No verdict recorded, admission not recorded')).toBeTruthy();
  });
});
