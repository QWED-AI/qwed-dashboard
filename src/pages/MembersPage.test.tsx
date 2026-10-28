// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { demoApi } from '../api/demo';
import { ApiError } from '../api/http';
import type { OrgUser } from '../api/types';
import { renderApp, SESSION_KEY } from '../test/render';
import { expectStackedTable } from '../test/table';
import { MembersPage } from './MembersPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const member = (id: string, extra: Partial<OrgUser> = {}): OrgUser => ({
  id,
  email: `user${id}@example.com`,
  role: 'member',
  is_active: true,
  created_at: '2026-10-01T10:00:00Z',
  ...extra,
});

/** The tile's number, by its label. */
function tile(label: string) {
  const tiles = within(screen.getByRole('region', { name: 'Members by role' }));
  return tiles.getByText(label).closest('.tile')?.querySelector('.tile-value')?.textContent;
}

/** The table row of a user. The side menu names the signed-in user too, so the search stays in the table. */
async function rowOf(email: string) {
  const table = within(await screen.findByRole('region', { name: 'Members' }));
  const row = (await table.findByText(email)).closest('tr');
  if (!row) throw new Error(`No row for ${email}`);
  return within(row);
}

describe('MembersPage', () => {
  it('lists the organisation’s users in the server’s order, with you marked', async () => {
    vi.spyOn(demoApi, 'listUsers').mockResolvedValue([
      member('demo', { email: 'demo@example.com', role: 'owner', created_at: '2026-07-01T09:00:00Z' }),
      member('2', { role: 'admin' }),
      member('3'),
    ]);
    renderApp(<MembersPage />);
    const you = await rowOf('demo@example.com');
    expect(you.getByText('(you)')).toBeTruthy();
    expect(you.getByRole('cell', { name: 'owner' })).toBeTruthy();
    expect(you.getByRole('cell', { name: '2026-07-01 09:00:00 UTC' })).toBeTruthy();
    expect((await rowOf('user2@example.com')).queryByText('(you)')).toBeNull();
    const emails = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('bdi')?.textContent);
    expect(emails).toEqual(['demo@example.com', 'user2@example.com', 'user3@example.com']);
    expect(screen.getByText('3 users in your organisation.')).toBeTruthy();
  });

  it('counts the active users by role, and the deactivated apart', async () => {
    vi.spyOn(demoApi, 'listUsers').mockResolvedValue([
      member('1', { role: 'owner' }),
      member('2', { role: 'admin' }),
      member('3'),
      member('4'),
      member('5', { role: 'viewer' }),
      member('6', { is_active: false }),
    ]);
    renderApp(<MembersPage />);
    await rowOf('user6@example.com');
    expect(tile('Active members')).toBe('5');
    expect(tile('owner')).toBe('1');
    expect(tile('admin')).toBe('1');
    expect(tile('member')).toBe('2');
    expect(tile('viewer')).toBe('1');
    expect(tile('Deactivated')).toBe('1');
    expect(screen.queryByText('Another role')).toBeNull();
    expect((await rowOf('user6@example.com')).getByText('Deactivated')).toBeTruthy();
    expect((await rowOf('user3@example.com')).getByRole('cell', { name: 'Active' })).toBeTruthy();
  });

  it('counts a role the dashboard does not know apart, as stored', async () => {
    vi.spyOn(demoApi, 'listUsers').mockResolvedValue([member('1', { role: 'auditor' })]);
    renderApp(<MembersPage />);
    expect((await rowOf('user1@example.com')).getByRole('cell', { name: 'auditor' })).toBeTruthy();
    expect(tile('Another role')).toBe('1');
  });

  it('tells a member or viewer that only owners and admins can see members', async () => {
    vi.spyOn(demoApi, 'listUsers').mockRejectedValue(new ApiError(403, 'Insufficient permissions'));
    renderApp(<MembersPage />, { role: 'member' });
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /Only owners and admins can see the organisation’s members\./,
    );
  });

  it('says an older server does not list members', async () => {
    vi.spyOn(demoApi, 'listUsers').mockRejectedValue(new ApiError(404, 'Not Found'));
    renderApp(<MembersPage />);
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /This server does not list members\. That needs a qwed-verification release with #507\./,
    );
  });

  it('signs out when the session has ended', async () => {
    vi.spyOn(demoApi, 'listUsers').mockRejectedValue(new ApiError(401, 'Not authenticated'));
    renderApp(<MembersPage />);
    await waitFor(() => expect(sessionStorage.getItem(SESSION_KEY)).toBeNull());
  });

  it('says so when the server lists no users', async () => {
    vi.spyOn(demoApi, 'listUsers').mockResolvedValue([]);
    renderApp(<MembersPage />);
    expect(await screen.findByText('No members listed')).toBeTruthy();
  });

  it('names the column of each small cell, for the stacked rows on a phone', async () => {
    renderApp(<MembersPage />);
    await rowOf('ops@example.com');
    expectStackedTable(screen.getByRole('table'));
  });

  it('is in the Settings menu and opens at /members', async () => {
    renderApp(<App />, { route: '/members' });
    const link = screen.getByRole('link', { name: 'Members' });
    expect(link.getAttribute('href')).toBe('/members');
    expect(await screen.findByRole('heading', { name: 'Members' })).toBeTruthy();
    // The sample organisation: one owner (you), one admin, two members (one deactivated), one viewer.
    await rowOf('contractor@example.com');
    expect(tile('Active members')).toBe('4');
    expect(tile('Deactivated')).toBe('1');
  });
});
