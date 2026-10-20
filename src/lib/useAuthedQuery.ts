import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError, type QwedApi } from '../api/http';
import { useSession } from '../auth/session';

/** A query that needs the session token. A 401 signs the user out. */
export function useAuthedQuery<T>(key: readonly unknown[], fn: (api: QwedApi, token: string) => Promise<T>) {
  const { api, token, mode, signOut } = useSession();
  const query = useQuery({
    queryKey: [mode, ...key],
    queryFn: () => fn(api, token as string),
    enabled: token !== null,
    retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
  });

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) signOut();
  }, [query.error, signOut]);

  return query;
}

/** Turns an API error into one sentence for the page. */
export function describeError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong while loading this page.';
  if (err.status === 0) return err.message;
  if (err.status === 401) return 'Your session has ended. Sign in again.';
  if (err.status === 403) return `The server refused this request: ${err.message}`;
  if (err.status === 404) return 'This record does not exist, or it belongs to another organisation.';
  if (err.status === 429) {
    return err.retryAfter ? `Too many requests. Try again in ${err.retryAfter} seconds.` : 'Too many requests. Try again shortly.';
  }
  return `The server returned ${err.status}: ${err.message}`;
}
