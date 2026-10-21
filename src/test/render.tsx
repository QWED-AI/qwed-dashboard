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

/**
 * Renders a screen inside the app's providers, signed in with sample data
 * unless `signedIn` is false. Each call gets its own query cache.
 */
export function renderApp(ui: ReactElement, { route = '/', signedIn = true } = {}) {
  sessionStorage.clear();
  if (signedIn) sessionStorage.setItem(SESSION_KEY, JSON.stringify(demoSession));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
}
