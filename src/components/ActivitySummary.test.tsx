// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import { renderApp } from '../test/render';
import { ActivitySummaryCard } from './ActivitySummary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function load() {
  const user = userEvent.setup();
  renderApp(<ActivitySummaryCard />);
  const card = within(screen.getByRole('region', { name: 'Last 90 days' }));
  await user.click(card.getByRole('button', { name: 'Load the 90-day summary' }));
  return card;
}

/** The value next to a label in the summary. */
const value = (card: ReturnType<typeof within>, label: string) =>
  card.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

describe('ActivitySummaryCard', () => {
  it('asks the server only when asked', () => {
    const summary = vi.spyOn(demoApi, 'activitySummary');
    renderApp(<ActivitySummaryCard />);
    expect(summary).not.toHaveBeenCalled();
  });

  it('shows the server’s counts for the period, its chain check and its disclaimer', async () => {
    const card = await load();
    expect(await card.findByText('22 Jul to 20 Oct UTC, 90 days.')).toBeTruthy();
    expect(value(card, 'Verifications')).toBe('47');
    expect(value(card, 'Security events')).toBe('2Leaked API key revoked: 2');
    expect(value(card, 'Active users')).toBe('1');
    expect(value(card, 'Active API keys')).toBe('2');
    expect(card.getByText('The chain does not check out.')).toBeTruthy();
    expect(card.getByText(/1 of 47 entries failed/)).toBeTruthy();
    expect(card.getByText(/It is not a SOC 2 report/)).toBeTruthy();
    // What the chain check covers, in the server's words.
    expect(card.getByText(/It does not show that every request was recorded/)).toBeTruthy();
    expect(card.getByRole('button', { name: 'Load again' })).toBeTruthy();
  });

  it('says how many entries predate the chain, and reads a period without an offset as UTC', async () => {
    const sample = await demoApi.activitySummary('demo', 'demo');
    vi.spyOn(demoApi, 'activitySummary').mockResolvedValue({
      ...sample,
      // Just after midnight UTC: read as local time, it falls on another day east or west of UTC.
      period: { start: '2026-07-22T00:30:00', end: '2026-10-20T23:30:00', days: 90 },
      audit_trail: { ...sample.audit_trail, legacy_entries: 3 },
    });
    const card = await load();
    expect(await card.findByText('22 Jul to 20 Oct UTC, 90 days.')).toBeTruthy();
    expect(card.getByText('3 entries were written before the chain existed and cannot be checked.')).toBeTruthy();
  });

  it('signs out when the server says the session has ended', async () => {
    const user = userEvent.setup();
    vi.spyOn(demoApi, 'activitySummary').mockRejectedValue(new ApiError(401, 'Could not validate credentials'));
    renderApp(<App />, { route: '/' });
    await user.click(await screen.findByRole('button', { name: 'Load the 90-day summary' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it.each([
    [new ApiError(403, 'Insufficient permissions'), /Only an owner or admin can see the activity summary/],
    [new ApiError(401, 'Missing x-api-key header'), /takes only an API key for the activity summary/],
    [new ApiError(404, 'Not Found'), /This server has no activity summary/],
  ])('says why when the server refuses (%s)', async (err, text) => {
    vi.spyOn(demoApi, 'activitySummary').mockRejectedValue(err);
    const card = await load();
    expect((await card.findByRole('alert')).textContent).toMatch(text);
  });
});
