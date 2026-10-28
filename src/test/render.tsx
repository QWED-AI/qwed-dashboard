import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { SessionProvider } from '../auth/session';

// With coverage on and several jsdom files in parallel, a first render can
// take longer than the one-second default, so findBy and waitFor get five.
configure({ asyncUtilTimeout: 5000 });

/** Same key as src/auth/session.tsx. */
export const SESSION_KEY = 'qwed-dashboard.session';

const demoSession = {
  mode: 'demo',
  token: 'demo',
  user: { id: 'demo', email: 'demo@example.com', org_id: 'demo', role: 'owner' },
};

/** A signed-in session against a QWED server; stub `fetch` to answer it. */
export const LIVE_TOKEN = 'live-session-token';
const liveSession = {
  mode: 'live',
  token: LIVE_TOKEN,
  user: { id: '1', email: 'owner@example.com', org_id: '1', role: 'owner' },
};

/**
 * Renders a screen inside the app's providers, signed in with sample data
 * unless `signedIn` is false, or against a server when `live` is true, as an
 * owner unless `role` says otherwise; `user` overrides other fields of the
 * signed-in user. Each call gets its own query cache.
 */
export function renderApp(
  ui: ReactElement,
  { route = '/', signedIn = true, live = false, role = 'owner', user = {} as Record<string, unknown> } = {},
) {
  sessionStorage.clear();
  const session = live ? liveSession : demoSession;
  if (signedIn) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, user: { ...session.user, ...user, role } }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}
