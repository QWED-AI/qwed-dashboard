// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoApi } from '../api/demo';
import { renderApp } from '../test/render';
import { LedgerPage } from './LedgerPage';

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
    vi.spyOn(demoApi, 'listLogs').mockResolvedValue([]);
    renderApp(<LedgerPage />);
    expect(await screen.findByText('No records yet')).toBeTruthy();
  });
});
