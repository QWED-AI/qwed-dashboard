// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('does not claim a version, or QWED, when the answer gives no version', async () => {
    vi.spyOn(httpApi, 'health').mockResolvedValue({ status: 'healthy' });
    renderShell({ live: true });
    expect(await screen.findByText('No server version given')).toBeTruthy();
    expect(footer().getByText('Server: no version given, at /api')).toBeTruthy();
  });

  it('says the check failed when a page that is not the server’s health answers', async () => {
    const reason = 'The server did not return JSON. Check that /api points at the QWED server.';
    vi.spyOn(httpApi, 'health').mockRejectedValue(new ApiError(200, reason));
    renderShell({ live: true });
    const pill = await screen.findByText('Server check failed');
    expect(pill.getAttribute('title')).toBe(reason);
    expect(footer().getByText(`Server: the health check at /api failed. ${reason}`)).toBeTruthy();
    expect(screen.queryByText(/version given/)).toBeNull();
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

describe('Shell: find a record (#51)', () => {
  const box = () => screen.getByRole('searchbox', { name: 'Find a record by id or proof_ref' });

  it.each([
    ['opens a record by its id', ' 1042 ', '/records/1042'],
    ['searches the ledger for anything else, such as a proof_ref', 'sha256:41aa3f90', '/ledger?q=sha256%3A41aa3f90'],
    ['does nothing for an empty search', '   ', '/'],
  ])('%s', async (_name, typed, where) => {
    const user = userEvent.setup();
    renderShell();
    await user.type(box(), `${typed}{Enter}`);
    expect(screen.getByTestId('where').textContent).toBe(where);
  });

  it('moves the focus to the box on "/", but not while typing elsewhere', async () => {
    const user = userEvent.setup();
    renderApp(
      <Shell crumbs={[{ label: 'Overview' }]}>
        <label>
          Other field
          <input />
        </label>
      </Shell>,
    );
    await user.keyboard('/');
    expect(document.activeElement).toBe(box());
    expect((box() as HTMLInputElement).value).toBe('');

    const other = screen.getByRole('textbox', { name: 'Other field' });
    await user.click(other);
    await user.keyboard('/');
    expect(document.activeElement).toBe(other);
    expect((other as HTMLInputElement).value).toBe('/');
  });
});
