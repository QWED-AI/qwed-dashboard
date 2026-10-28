// @vitest-environment jsdom
import { focusManager } from '@tanstack/react-query';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import type { ThreatSummary as Summary } from '../api/types';
import { SecurityEventsPage } from '../pages/SecurityEventsPage';
import { renderApp, SESSION_KEY } from '../test/render';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
});

function refocus() {
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
}

const summary = (extra: Partial<Summary> = {}): Summary => ({
  organization_id: 1,
  period_hours: 24,
  threat_level: 'LOW',
  metrics: { total_events: 7, blocked_attempts: 3, high_severity_events: 2, recent_failures_10min: 1 },
  security_layer_breakdown: { prompt_guard: 2, rate_limit: 5 },
  generated_at: '2026-10-28T06:00:00+00:00',
  ...extra,
});

async function card() {
  return within(await screen.findByRole('region', { name: 'Threat summary' }));
}

/** The value next to a label in the card. */
function value(c: Awaited<ReturnType<typeof card>>, label: string) {
  return c.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
}

describe('ThreatSummary', () => {
  it('shows the server’s level and counts for the period, for the signed-in organisation', async () => {
    const call = vi.spyOn(demoApi, 'threatSummary').mockResolvedValue(summary({ threat_level: 'MEDIUM' }));
    renderApp(<SecurityEventsPage />);
    const c = await card();
    expect(await c.findByText('MEDIUM')).toBeTruthy();
    expect(c.getByText(/The server’s threat level for the last 24 hours:/)).toBeTruthy();
    expect(c.getByText(/rates it from its own thresholds/)).toBeTruthy();
    expect(value(c, 'Security events')).toBe('7');
    expect(value(c, 'Blocked attempts')).toBe('3');
    expect(value(c, 'High-severity events')).toBe('2');
    expect(value(c, 'Failures in the last 10 minutes')).toBe('1');
    // The busiest layer first.
    expect(value(c, 'By security layer')).toBe('rate_limit 5, prompt_guard 2');
    expect(value(c, 'Generated')).toBe('2026-10-28 06:00:00 UTC');
    expect(c.getByText(/starts again when it restarts/)).toBeTruthy();
    expect(call).toHaveBeenCalledWith('demo', 'demo');
  });

  it('marks a high or critical level, and leaves out an empty layer breakdown', async () => {
    vi.spyOn(demoApi, 'threatSummary').mockResolvedValue(summary({ threat_level: 'CRITICAL', security_layer_breakdown: {} }));
    renderApp(<SecurityEventsPage />);
    const c = await card();
    expect((await c.findByText('CRITICAL')).className).toBe('tag sev-critical');
    expect(c.queryByText('By security layer')).toBeNull();
  });

  it('shows a level it does not know as the server sent it', async () => {
    vi.spyOn(demoApi, 'threatSummary').mockResolvedValue(summary({ threat_level: 'ELEVATED' }));
    renderApp(<SecurityEventsPage />);
    expect((await (await card()).findByText('ELEVATED')).className).toBe('tag');
  });

  it('says an older server gives it only for an API key, and keeps the session', async () => {
    vi.spyOn(demoApi, 'threatSummary').mockRejectedValue(new ApiError(401, 'Missing x-api-key header'));
    renderApp(<SecurityEventsPage />);
    const c = await card();
    expect((await c.findByRole('alert')).textContent).toBe(
      'This server gives the threat summary only for an API key, not a signed-in session. That needs a qwed-verification release with #506.',
    );
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it('tells a member or viewer that only owners and admins can see it', async () => {
    vi.spyOn(demoApi, 'threatSummary').mockRejectedValue(new ApiError(403, 'Insufficient permissions for this operation'));
    renderApp(<SecurityEventsPage />, { role: 'viewer' });
    expect((await (await card()).findByRole('alert')).textContent).toBe('Only owners and admins can see the threat summary.');
  });

  it('gives the server’s reason for any other refusal', async () => {
    vi.spyOn(demoApi, 'threatSummary').mockRejectedValue(new ApiError(403, 'Organization is not active'));
    renderApp(<SecurityEventsPage />);
    expect((await (await card()).findByRole('alert')).textContent).toBe('The server refused: Organization is not active.');
  });

  it('keeps the summary when a refresh fails, and drops it when a refresh is refused', async () => {
    const call = vi
      .spyOn(demoApi, 'threatSummary')
      .mockResolvedValueOnce(summary())
      // A 4xx is not retried, so the test does not wait out the retry delays.
      .mockRejectedValueOnce(new ApiError(429, 'Too many requests'))
      .mockRejectedValue(new ApiError(403, 'Insufficient permissions for this operation'));
    renderApp(<SecurityEventsPage />);
    const c = await card();
    await c.findByText('LOW');
    refocus();
    expect(await c.findByText(/The threat summary could not be refreshed, so it may be out of date\./)).toBeTruthy();
    expect(c.getByText('LOW')).toBeTruthy();
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    refocus();
    expect(await c.findByText('Only owners and admins can see the threat summary.')).toBeTruthy();
    expect(c.queryByText('LOW')).toBeNull();
  });

  it('signs out when the session has ended', async () => {
    vi.spyOn(demoApi, 'threatSummary').mockRejectedValue(new ApiError(401, 'Not authenticated'));
    renderApp(<SecurityEventsPage />);
    await waitFor(() => expect(sessionStorage.getItem(SESSION_KEY)).toBeNull());
  });

  it('shows the sample summary with sample data', async () => {
    renderApp(<SecurityEventsPage />);
    const c = await card();
    expect(await c.findByText('MEDIUM')).toBeTruthy();
    expect(value(c, 'High-severity events')).toBe('1');
  });
});
