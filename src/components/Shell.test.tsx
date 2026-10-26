// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, httpApi } from '../api/http';
import { renderApp } from '../test/render';
import { Shell } from './Shell';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Where the router is, so a test can see where the search went. */
function Where() {
  const l = useLocation();
  return <output data-testid="where">{`${l.pathname}${l.search}`}</output>;
}

function renderShell(options: Parameters<typeof renderApp>[1] = {}) {
  return renderApp(
    <>
      <Shell crumbs={[{ label: 'Overview' }]}>
        <p>Page</p>
      </Shell>
      <Where />
    </>,
    options,
  );
}

const footer = () => within(screen.getByRole('contentinfo'));

describe('Shell: the server (#50, #52)', () => {
  it('names a current server in the header and the footer', async () => {
    vi.spyOn(httpApi, 'health').mockResolvedValue({ status: 'healthy', service: 'QWED Platform', version: '8.0.0' });
    renderShell({ live: true });
    expect(await screen.findByText('QWED 8.0.0 · connected')).toBeTruthy();
    expect(footer().getByText('Server: QWED 8.0.0 at /api')).toBeTruthy();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('says an older server is older, and what needs 8.0.0', async () => {
    vi.spyOn(httpApi, 'health').mockResolvedValue({ status: 'healthy', version: '7.3.0' });
    renderShell({ live: true });
    expect(await screen.findByText('QWED 7.3.0 · update to 8.0.0')).toBeTruthy();
    expect(screen.getByRole('note').textContent).toMatch(/^This server is QWED 7\.3\.0\. The stored admissions, paging/);
  });

  it('says so when the server cannot be reached, and adds no note of its own', async () => {
    vi.spyOn(httpApi, 'health').mockRejectedValue(new ApiError(0, 'The QWED server could not be reached.'));
    renderShell({ live: true });
    expect(await screen.findByText('Server unreachable')).toBeTruthy();
    expect(footer().getByText('Server: not reached at /api')).toBeTruthy();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('does not claim a version the server did not send', async () => {
    vi.spyOn(httpApi, 'health').mockResolvedValue({ status: 'healthy' });
    renderShell({ live: true });
    expect(await screen.findByText('QWED server · no version given')).toBeTruthy();
    expect(footer().getByText('Server: QWED, no version given, at /api')).toBeTruthy();
  });

  it('asks no server for sample data', async () => {
    const health = vi.spyOn(httpApi, 'health');
    renderShell();
    expect(await screen.findByText('Sample data, no server')).toBeTruthy();
    expect(footer().getByText('Server: none, the sample data stays in this browser')).toBeTruthy();
    expect(health).not.toHaveBeenCalled();
  });
});

describe('Shell: the footer (#52)', () => {
  it('names the dashboard version and links the project pages', () => {
    renderShell();
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+/);
    expect(footer().getByText(__APP_VERSION__)).toBeTruthy();
    const links = Object.fromEntries(
      footer()
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    );
    expect(links).toEqual({
      Docs: 'https://docs.qwedai.tech',
      GitHub: 'https://github.com/QWED-AI/qwed-dashboard',
      'Security policy': 'https://github.com/QWED-AI/qwed-dashboard/security/policy',
      Changelog: 'https://github.com/QWED-AI/qwed-dashboard/blob/main/CHANGELOG.md',
      'Licence: Apache-2.0': 'https://github.com/QWED-AI/qwed-dashboard/blob/main/LICENSE',
    });
  });
});
