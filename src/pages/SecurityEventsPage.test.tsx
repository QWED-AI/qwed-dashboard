// @vitest-environment jsdom
import { focusManager } from '@tanstack/react-query';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import type { SecurityEvent } from '../api/types';
import { renderApp } from '../test/render';
import { expectStackedTable } from '../test/table';

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
    const [first, second] = await waitFor(() => {
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

  it('names the column of each small cell, for the stacked rows on a phone', async () => {
    renderApp(<App />, { route: '/security' });
    await waitFor(() => expect(rows()).toHaveLength(2));
    expectStackedTable(screen.getByRole('table'));
  });

  it('filters by type on the server', async () => {
    const user = userEvent.setup();
    const list = vi.spyOn(demoApi, 'listSecurityEvents');
    renderApp(<App />, { route: '/security' });
    await screen.findByRole('table');
    await user.selectOptions(screen.getByRole('combobox'), 'SECRET_LEAK_AUTO_REVOKED');

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ eventType: 'SECRET_LEAK_AUTO_REVOKED' })),
    );
  });

  it('keeps every type in the filter, so one type can be swapped for another', async () => {
    const user = userEvent.setup();
    const all = [event('9', { event_type: 'OTHER_EVENT' }), event('8')];
    const list = vi
      .spyOn(demoApi, 'listSecurityEvents')
      .mockImplementation(async (_token, { eventType } = {}) => ({
        events: all.filter((e) => !eventType || e.event_type === eventType),
        nextBefore: null,
      }));
    renderApp(<App />, { route: '/security' });
    await screen.findByText('leaked key 9');

    await user.selectOptions(screen.getByRole('combobox'), 'OTHER_EVENT');
    await waitFor(() => expect(screen.queryByText('leaked key 8')).toBeNull());
    // Only OTHER_EVENT rows are loaded now, but the other type is still offered.
    const options = within(screen.getByRole('combobox')).getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(options).toEqual(['', 'OTHER_EVENT', 'SECRET_LEAK_AUTO_REVOKED']);

    await user.selectOptions(screen.getByRole('combobox'), 'SECRET_LEAK_AUTO_REVOKED');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ eventType: 'SECRET_LEAK_AUTO_REVOKED' })),
    );
  });

  it('shows one alert when older events cannot be loaded', async () => {
    const user = userEvent.setup();
    vi.spyOn(demoApi, 'listSecurityEvents')
      .mockResolvedValueOnce({ events: [event('9')], nextBefore: '9' })
      .mockRejectedValueOnce(new ApiError(500, 'Internal Server Error'));
    renderApp(<App />, { route: '/security' });
    await screen.findByText('leaked key 9');

    await user.click(screen.getByRole('button', { name: 'Load 50 older events' }));

    // A next-page failure is not also a refresh failure (TanStack Query keeps
    // isRefetchError false for it), so only the inline note shows.
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
    expect(screen.getByRole('alert').textContent).toMatch(/Older events could not be loaded/);
    expect(screen.queryByText(/could not be refreshed/)).toBeNull();
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

  it.each(['constructor', 'toString', 'hasOwnProperty'])('shows a type of %s from the URL as plain text', async (name) => {
    // An object lookup would return an inherited value for these, which
    // React cannot render as the option's label.
    vi.spyOn(demoApi, 'listSecurityEvents').mockResolvedValue({ events: [], nextBefore: null });
    renderApp(<App />, { route: `/security?type=${name}` });
    const option = await screen.findByRole('option', { name });
    expect(option.getAttribute('value')).toBe(name);
    expect(screen.getByRole('heading', { name: 'No security events' })).toBeTruthy();
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

  describe('the user of each event (#70)', () => {
    const userCell = (row: HTMLElement) => row.querySelector('td[data-label="User"]')?.textContent;

    it('names each user by email from the members list, with you marked', async () => {
      vi.spyOn(demoApi, 'listSecurityEvents').mockResolvedValue({
        events: [event('1', { user_id: 2 }), event('2', { user_id: 9 }), event('3', { user_id: null })],
        nextBefore: null,
      });
      vi.spyOn(demoApi, 'listUsers').mockResolvedValue([
        { id: '2', email: 'ops@example.com', role: 'member', is_active: true, created_at: '2026-07-22T10:58:00Z' },
        { id: '9', email: 'demo-9@example.com', role: 'owner', is_active: true, created_at: '2026-07-01T09:00:00Z' },
      ]);
      renderApp(<App />, { route: '/security', user: { id: '9' } });
      await waitFor(() => expect(userCell(rows()[0] as HTMLElement)).toBe('ops@example.com'));
      const [, mine, none] = rows();
      expect(userCell(mine as HTMLElement)).toBe('demo-9@example.com (you)');
      expect(userCell(none as HTMLElement)).toBe('not recorded');
      expect(screen.getByRole('columnheader', { name: 'User' })).toBeTruthy();
    });

    it('names a user by id when the members list does not name them, or cannot be loaded', async () => {
      vi.spyOn(demoApi, 'listSecurityEvents').mockResolvedValue({ events: [event('1', { user_id: 4 })], nextBefore: null });
      const list = vi.spyOn(demoApi, 'listUsers').mockResolvedValue([]);
      renderApp(<App />, { route: '/security' });
      await waitFor(() => expect(userCell(rows()[0] as HTMLElement)).toBe('User 4'));
      cleanup();
      // A server before qwed-verification #507 has no members list.
      list.mockRejectedValue(new ApiError(404, 'Not Found'));
      renderApp(<App />, { route: '/security' });
      await waitFor(() => expect(userCell(rows()[0] as HTMLElement)).toBe('User 4'));
      expect(screen.queryByText(/does not list members/)).toBeNull();
    });

    it('marks your own events "(you)" by id when the list does not name you', async () => {
      vi.spyOn(demoApi, 'listSecurityEvents').mockResolvedValue({ events: [event('1', { user_id: 4 })], nextBefore: null });
      vi.spyOn(demoApi, 'listUsers').mockRejectedValue(new ApiError(404, 'Not Found'));
      renderApp(<App />, { route: '/security', user: { id: '4' } });
      await waitFor(() => expect(userCell(rows()[0] as HTMLElement)).toBe('User 4 (you)'));
    });

    it('stops naming users by email once the members list is refused', async () => {
      vi.spyOn(demoApi, 'listSecurityEvents').mockResolvedValue({ events: [event('1', { user_id: 2 })], nextBefore: null });
      vi.spyOn(demoApi, 'listUsers')
        .mockResolvedValueOnce([
          { id: '2', email: 'ops@example.com', role: 'member', is_active: true, created_at: '2026-07-22T10:58:00Z' },
        ])
        .mockRejectedValue(new ApiError(403, 'Insufficient permissions for this operation'));
      renderApp(<App />, { route: '/security' });
      await waitFor(() => expect(userCell(rows()[0] as HTMLElement)).toBe('ops@example.com'));
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await waitFor(() => expect(userCell(rows()[0] as HTMLElement)).toBe('User 2'));
    });

    it('names the sample events’ user', async () => {
      renderApp(<App />, { route: '/security' });
      await waitFor(() => expect(userCell(rows()[0] as HTMLElement)).toBe('ops@example.com'));
      expectStackedTable(screen.getByRole('table'));
    });
  });
});
