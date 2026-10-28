// @vitest-environment jsdom
import { focusManager } from '@tanstack/react-query';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import type { AgentActivity, AgentSummary } from '../api/types';
import { renderApp, SESSION_KEY } from '../test/render';
import { expectStackedTable } from '../test/table';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
});

const agent = (id: number, extra: Partial<AgentSummary> = {}): AgentSummary => ({
  id,
  name: `agent-${id}`,
  type: 'autonomous',
  status: 'active',
  created_at: '2026-10-01T10:00:00+00:00',
  last_active: '2026-10-20T09:00:00+00:00',
  ...extra,
});

const activity = (extra: Partial<AgentActivity> = {}): AgentActivity => ({
  agent_id: 3,
  agent_name: 'agent-3',
  total_activities: 2,
  current_cost_today: 1.5,
  max_cost_per_day: 20,
  activities: [
    { type: 'tool_call_blocked', description: 'Tool call blocked', status: 'blocked', cost: 0, timestamp: '2026-10-20T09:00:00+00:00' },
    { type: 'verification_request', description: 'Checked a total', status: 'VERIFIED', cost: 0.25, timestamp: '2026-10-19T08:00:00+00:00' },
  ],
  ...extra,
});

const refocus = () =>
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });

/** A row of a table, by the text of its link or first cell. */
async function rowOf(region: string, text: string) {
  const table = within(await screen.findByRole('region', { name: region }));
  const row = (await table.findByText(text)).closest('tr');
  if (!row) throw new Error(`No row for ${text}`);
  return within(row);
}

describe('AgentsPage', () => {
  it('lists the agents in the server’s order, with every status and "Never" for one not yet active', async () => {
    vi.spyOn(demoApi, 'listAgents').mockResolvedValue([
      agent(1),
      agent(2, { status: 'suspended', type: 'supervised' }),
      agent(3, { status: 'deactivated', last_active: null }),
    ]);
    renderApp(<App />, { route: '/agents' });
    const first = await rowOf('Agents', 'agent-1');
    expect(first.getByRole('link', { name: 'agent-1' }).getAttribute('href')).toBe('/agents/1');
    expect(first.getByText('active').className).toBe('tag');
    expect(first.getByRole('cell', { name: '2026-10-01 10:00:00 UTC' })).toBeTruthy();
    const suspended = await rowOf('Agents', 'agent-2');
    expect(suspended.getByText('suspended').className).toBe('tag sev-high');
    expect(suspended.getByRole('cell', { name: 'supervised' })).toBeTruthy();
    expect((await rowOf('Agents', 'agent-3')).getByRole('cell', { name: 'Never' })).toBeTruthy();
    const names = within(screen.getByRole('table')).getAllByRole('link').map((a) => a.textContent);
    expect(names).toEqual(['agent-1', 'agent-2', 'agent-3']);
    expect(screen.getByText('3 agents in your organisation.')).toBeTruthy();
  });

  it('is in the menu, and lists the sample agents', async () => {
    renderApp(<App />, { route: '/agents' });
    expect(screen.getByRole('link', { name: 'Agents' }).getAttribute('href')).toBe('/agents');
    await rowOf('Agents', 'invoice-reconciler');
    expectStackedTable(screen.getByRole('table'));
  });

  it('tells a member or viewer that only owners and admins can see agents', async () => {
    vi.spyOn(demoApi, 'listAgents').mockRejectedValue(new ApiError(403, 'Insufficient permissions for this operation'));
    renderApp(<App />, { route: '/agents' });
    expect((await screen.findByRole('alert')).textContent).toMatch(/Only owners and admins can see the organisation’s agents\./);
  });

  it('gives the server’s reason for any other refusal', async () => {
    vi.spyOn(demoApi, 'listAgents').mockRejectedValue(new ApiError(403, 'Organization is not active'));
    renderApp(<App />, { route: '/agents' });
    expect((await screen.findByRole('alert')).textContent).toMatch(/The server refused: Organization is not active\./);
  });

  it('says an older server does not list agents', async () => {
    vi.spyOn(demoApi, 'listAgents').mockRejectedValue(new ApiError(404, 'Not Found'));
    renderApp(<App />, { route: '/agents' });
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /This server does not list agents\. That needs a qwed-verification release with #527\./,
    );
  });

  it('says so when there are no agents', async () => {
    vi.spyOn(demoApi, 'listAgents').mockResolvedValue([]);
    renderApp(<App />, { route: '/agents' });
    expect(await screen.findByText('No agents')).toBeTruthy();
  });

  it('keeps the agents on a failed refresh, and hides them once refused', async () => {
    vi.spyOn(demoApi, 'listAgents')
      .mockResolvedValueOnce([agent(1)])
      // A 4xx is not retried, so the test does not wait out the retry delays.
      .mockRejectedValueOnce(new ApiError(429, 'Too many requests'))
      .mockRejectedValue(new ApiError(403, 'Insufficient permissions for this operation'));
    renderApp(<App />, { route: '/agents' });
    await rowOf('Agents', 'agent-1');
    refocus();
    expect(await screen.findByText(/The agents could not be refreshed/)).toBeTruthy();
    expect(screen.getByText('agent-1')).toBeTruthy();
    await waitFor(() => expect(demoApi.listAgents).toHaveBeenCalledTimes(2));
    refocus();
    expect(await screen.findByText('The agents could not be loaded')).toBeTruthy();
    expect(screen.queryByText('agent-1')).toBeNull();
  });

  it('signs out when the session has ended', async () => {
    vi.spyOn(demoApi, 'listAgents').mockRejectedValue(new ApiError(401, 'Not authenticated'));
    renderApp(<App />, { route: '/agents' });
    await waitFor(() => expect(sessionStorage.getItem(SESSION_KEY)).toBeNull());
  });
});

describe('AgentPage', () => {
  it('shows the agent’s spend and activity, newest first, as the server stored it', async () => {
    const call = vi.spyOn(demoApi, 'agentActivity').mockResolvedValue(activity());
    renderApp(<App />, { route: '/agents/3' });
    expect(await screen.findByRole('heading', { name: 'agent-3', level: 1 })).toBeTruthy();
    const tiles = within(screen.getByRole('region', { name: 'Spend' }));
    expect(tiles.getByText('Spent today').nextElementSibling?.textContent).toBe('1.50');
    expect(tiles.getByText('Daily limit').nextElementSibling?.textContent).toBe('20.00');
    const blocked = await rowOf('Activity', 'Tool call blocked');
    expect(blocked.getByText('blocked').className).toBe('tag sev-high');
    expect(blocked.getByText('tool_call_blocked')).toBeTruthy();
    expect(blocked.getByRole('cell', { name: '2026-10-20 09:00:00 UTC' })).toBeTruthy();
    const verified = await rowOf('Activity', 'Checked a total');
    expect(verified.getByText('VERIFIED').className).toBe('tag');
    expect(verified.getByRole('cell', { name: '0.25' })).toBeTruthy();
    expect(call).toHaveBeenCalledWith('demo', '3', 50);
    // Fewer than were asked for, so there is no more to show.
    expect(screen.queryByRole('button', { name: /Show the newest/ })).toBeNull();
  });

  it('shows the newest 200 on request', async () => {
    const user = userEvent.setup();
    const full = activity({
      activities: Array.from({ length: 50 }, (_, i) => ({
        type: 'tool_call_success',
        description: `call ${i}`,
        status: 'success',
        cost: 0,
        timestamp: `2026-10-20T09:${String(59 - i).padStart(2, '0')}:00+00:00`,
      })),
    });
    const call = vi.spyOn(demoApi, 'agentActivity').mockResolvedValue(full);
    renderApp(<App />, { route: '/agents/3' });
    await user.click(await screen.findByRole('button', { name: 'Show the newest 200' }));
    await waitFor(() => expect(call).toHaveBeenLastCalledWith('demo', '3', 200));
  });

  it('keeps the newest 50 shown while the 200 load, and when they fail', async () => {
    const user = userEvent.setup();
    const fifty = activity({
      activities: Array.from({ length: 50 }, (_, i) => ({
        type: 'tool_call_success',
        description: `call ${i}`,
        status: 'success',
        cost: 0,
        timestamp: `2026-10-20T09:${String(59 - i).padStart(2, '0')}:00+00:00`,
      })),
    });
    let fail: (e: unknown) => void = () => undefined;
    vi.spyOn(demoApi, 'agentActivity').mockImplementation((_t, _id, limit) =>
      limit === 50 ? Promise.resolve(fifty) : new Promise((_, reject) => (fail = reject)),
    );
    renderApp(<App />, { route: '/agents/3' });
    await user.click(await screen.findByRole('button', { name: 'Show the newest 200' }));
    expect(await screen.findByRole('button', { name: 'Loading…' })).toBeTruthy();
    expect(screen.getByText('call 0')).toBeTruthy();
    // A 4xx is not retried, so the test does not wait out the retry delays.
    await act(async () => fail(new ApiError(429, 'Too many requests')));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The newest 200 could not be loaded, so the newest 50 are shown. Too many requests. Try again shortly.',
    );
    expect(screen.getByText('call 0')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show the newest 200' })).toBeTruthy();
  });

  it('hides the newest 200 too when a refresh of the 50 is refused', async () => {
    const user = userEvent.setup();
    const rows = (n: number) =>
      activity({
        activities: Array.from({ length: n }, (_, i) => ({
          type: 'tool_call_success',
          description: `call ${i}`,
          status: 'success',
          cost: 0,
          timestamp: `2026-10-20T09:00:${String(59 - (i % 60)).padStart(2, '0')}+00:00`,
        })),
      });
    let fiftyCalls = 0;
    vi.spyOn(demoApi, 'agentActivity').mockImplementation((_t, _id, limit) => {
      if (limit === 200) return Promise.resolve(rows(120));
      fiftyCalls += 1;
      return fiftyCalls === 1
        ? Promise.resolve(rows(50))
        : Promise.reject(new ApiError(403, 'Insufficient permissions for this operation'));
    });
    renderApp(<App />, { route: '/agents/3' });
    await user.click(await screen.findByRole('button', { name: 'Show the newest 200' }));
    expect(await screen.findByText('call 119')).toBeTruthy();
    refocus();
    expect(await screen.findByText('Only owners and admins can see the organisation’s agents.')).toBeTruthy();
    expect(screen.queryByText('call 119')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Activity' })).toBeNull();
  });

  it('shows a small cost as the server stored it', async () => {
    vi.spyOn(demoApi, 'agentActivity').mockResolvedValue(
      activity({
        current_cost_today: 0.004,
        activities: [{ type: 'verification_request', description: 'Tiny', status: 'VERIFIED', cost: 0.001, timestamp: '2026-10-20T09:00:00+00:00' }],
      }),
    );
    renderApp(<App />, { route: '/agents/3' });
    expect((await rowOf('Activity', 'Tiny')).getByRole('cell', { name: '0.001' })).toBeTruthy();
    const tiles = within(screen.getByRole('region', { name: 'Spend' }));
    expect(tiles.getByText('Spent today').nextElementSibling?.textContent).toBe('0.004');
  });

  it('says when the organisation has no agent with that id', async () => {
    vi.spyOn(demoApi, 'agentActivity').mockRejectedValue(new ApiError(404, 'Agent not found'));
    renderApp(<App />, { route: '/agents/999' });
    expect((await screen.findByRole('alert')).textContent).toMatch(/Your organisation has no agent with this id\./);
  });

  it('says when the agent has no activity', async () => {
    vi.spyOn(demoApi, 'agentActivity').mockResolvedValue(activity({ activities: [], total_activities: 0 }));
    renderApp(<App />, { route: '/agents/3' });
    expect(await screen.findByText('No activity recorded')).toBeTruthy();
  });

  it('opens from the list, with the sample agent’s activity', async () => {
    const user = userEvent.setup();
    renderApp(<App />, { route: '/agents' });
    await user.click(await screen.findByRole('link', { name: 'invoice-reconciler' }));
    expect(await screen.findByRole('heading', { name: 'invoice-reconciler', level: 1 })).toBeTruthy();
    await rowOf('Activity', 'Invoice total for [INVOICE ID]');
    expectStackedTable(screen.getByRole('table'));
  });
});
