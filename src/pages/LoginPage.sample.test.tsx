// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { renderApp } from '../test/render';

// Where "Explore with sample data" sends the visitor. In jsdom React draws the
// sign-in page's own redirect before this call lands, so the page alone cannot
// show the bug; the call itself can. A browser runs them the other way round,
// and a shared link such as /ledger ended on the overview.
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

afterEach(() => {
  cleanup();
  navigate.mockClear();
});

async function explore(route: string) {
  const user = userEvent.setup();
  renderApp(<App />, { route, signedIn: false });
  await user.click(await screen.findByRole('button', { name: 'Explore with sample data' }));
}

describe('Explore with sample data', () => {
  it('returns a signed-out visitor to the page they asked for', async () => {
    await explore('/ledger');
    expect(navigate).toHaveBeenCalledWith('/ledger', { replace: true });
  });

  it('opens the overview from the sign-in page itself', async () => {
    await explore('/login');
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });
});
