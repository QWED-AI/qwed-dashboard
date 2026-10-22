// @vitest-environment jsdom
import { focusManager } from '@tanstack/react-query';
import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import type { SecurityEvent } from '../api/types';
import { renderApp } from '../test/render';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
});

const event = (id: string, extra: Partial<SecurityEvent> = {}): SecurityEvent => ({
  id,
  timestamp: '2026-10-21T10:00:00',
  event_type: 'SECRET_LEAK_AUTO_REVOKED',
  severity: 'high',
  security_layer: null,
  reason: `reason ${id}`,
  query: `leaked key ${id}`,
  user_id: 1,
  ...extra,
});

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('SecurityEventsPage', () => {
  it('lists the sample events newest first, with what happened and why', async () => {
    renderApp(<App />, { route: '/security' });
    expect(await screen.findByRole('heading', { name: 'Security events', level: 1 })).toBeTruthy();
    const [first, second] = await vi.waitFor(() => {
      const r = rows();
      expect(r).toHaveLength(2);
      return r;
    });
    expect(first?.textContent).toMatch(/20 Oct 07:55:02/);
    expect(first?.textContent).toMatch(/Leaked API key revoked/);
    expect(first?.textContent).toMatch(/SECRET_LEAK_AUTO_REVOKED/);
    expect(first?.textContent).toMatch(/leaked key qwed_live_\*\*\*\*Kd3p/);
    expect(first?.textContent).toMatch(/Public leak auto-revoked/);
    expect(second?.textContent).toMatch(/02 Sep 14:10:47/);
    expect(screen.getByText('2 events.')).toBeTruthy();
    // The sidebar marks this page.
    expect(screen.getByRole('link', { name: 'Security events' }).getAttribute('aria-current')).toBe('page');
  });

  it('filters by type on the server', async () => {
    const user = userEvent.setup();
    const list = vi.spyOn(demoApi, 'listSecurityEvents');
    renderApp(<App />, { route: '/security' });
    await screen.findByRole('table');
    await user.selectOptions(screen.getByRole('combobox'), 'SECRET_LEAK_AUTO_REVOKED');

    await vi.waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ eventType: 'SECRET_LEAK_AUTO_REVOKED' })),
    );
  });

  it('loads older events with the cursor the server gave', async () => {
    const user = userEvent.setup();
    const list = vi
      .spyOn(demoApi, 'listSecurityEvents')
      .mockResolvedValueOnce({ events: [event('9')], nextBefore: '9' })
      .mockResolvedValueOnce({ events: [event('3')], nextBefore: null });
    renderApp(<App />, { route: '/security' });
    expect(await screen.findByText('leaked key 9')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Load 50 older events' }));

    expect(await screen.findByText('leaked key 3')).toBeTruthy();
    expect(list).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ before: '9' }));
    expect(screen.queryByRole('button', { name: /older events/ })).toBeNull();
  });

  it('shows an empty state', async () => {
    vi.spyOn(demoApi, 'listSecurityEvents').mockResolvedValue({ events: [], nextBefore: null });
    renderApp(<App />, { route: '/security' });
    expect(await screen.findByRole('heading', { name: 'No security events' })).toBeTruthy();
    expect(screen.getByText(/revokes an API key reported as leaked/)).toBeTruthy();
  });

  it.each([
    [403, 'Insufficient role', /Only owners and admins can see security events/],
    [404, 'Not Found', /This server does not list security events/],
  ])('explains a %i', async (status, detail, message) => {
    vi.spyOn(demoApi, 'listSecurityEvents').mockRejectedValue(new ApiError(status, detail));
    renderApp(<App />, { route: '/security' });
    expect((await screen.findByRole('alert')).textContent).toMatch(message);
  });

  it('keeps the events and warns when a refresh fails', async () => {
    vi.spyOn(demoApi, 'listSecurityEvents')
      .mockResolvedValueOnce({ events: [event('9')], nextBefore: null })
      .mockRejectedValueOnce(new ApiError(403, 'Insufficient role'));
    renderApp(<App />, { route: '/security' });
    expect(await screen.findByText('leaked key 9')).toBeTruthy();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(await screen.findByText(/The security events could not be refreshed/)).toBeTruthy();
    expect(screen.getByText('leaked key 9')).toBeTruthy();
  });
});
