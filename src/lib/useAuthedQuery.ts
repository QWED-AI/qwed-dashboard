import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, sessionNotAccepted, type QwedApi } from '../api/http';
import { useSession } from '../auth/session';

// A 4xx will not change on a retry; anything else gets two more tries.
const retry = (count: number, err: unknown) =>
  !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2;

// An older server answers a route that takes only API keys with 401
// "Missing x-api-key header" (see sessionNotAccepted): the session has not
// ended, so that one does not sign the user out.
function useSignOutOn401(error: unknown, signOut: () => void) {
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401 && !sessionNotAccepted(error)) signOut();
  }, [error, signOut]);
}

/** A query that needs the session token. A 401 signs the user out, unless it is an older server refusing the session. */
export function useAuthedQuery<T>(key: readonly unknown[], fn: (api: QwedApi, token: string) => Promise<T>) {
  const { api, token, mode, user, signOut } = useSession();
  const query = useQuery({
    // The user and organisation are part of the key, so two sessions never share a cache entry.
    queryKey: [mode, user?.org_id ?? null, user?.id ?? null, ...key],
    queryFn: () => fn(api, token as string),
    enabled: token !== null,
    retry,
  });
  useSignOutOn401(query.error, signOut);
  return query;
}

/**
 * The ledger, a page at a time, newest first. Each next page asks for the
 * rows after the last page's `nextBefore` cursor (#484); there is no next
 * page once the server returns null, or on a server that does not page.
 */
export function useLedgerPages(limit: number) {
  const { api, token, mode, user, signOut } = useSession();
  const query = useInfiniteQuery({
    queryKey: [mode, user?.org_id ?? null, user?.id ?? null, 'log-pages', limit],
    queryFn: ({ pageParam }) => api.listLogs(token as string, limit, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: token !== null,
    retry,
  });
  useSignOutOn401(query.error, signOut);
  return query;
}

/**
 * The organisation's security events, a page at a time, newest first
 * (#486), optionally of one type. Paged like the ledger.
 */
export function useSecurityEventPages(limit: number, eventType: string | null) {
  const { api, token, mode, user, signOut } = useSession();
  const query = useInfiniteQuery({
    queryKey: [mode, user?.org_id ?? null, user?.id ?? null, 'security-event-pages', limit, eventType],
    queryFn: ({ pageParam }) =>
      api.listSecurityEvents(token as string, { limit, before: pageParam, eventType: eventType ?? undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: token !== null,
    retry,
  });
  useSignOutOn401(query.error, signOut);
  return query;
}

/**
 * The query's data, unless the server has refused it (403) since that data
 * loaded. A refused refresh keeps the data loaded before, and a later failure
 * of another kind replaces the 403 as the query's error, so the refusal is
 * held until the server answers again with data. A failure that is not a
 * refusal keeps the data, for the page to mark as maybe out of date.
 */
export function useDataUnlessRefused<T>(
  query: Readonly<{ data: T | undefined; error: unknown; dataUpdatedAt: number; errorUpdatedAt: number }>,
): T | undefined {
  const refusedNow = query.error instanceof ApiError && query.error.status === 403;
  const [refusedAt, setRefusedAt] = useState(0);
  useEffect(() => {
    if (refusedNow) setRefusedAt(query.errorUpdatedAt);
  }, [refusedNow, query.errorUpdatedAt]);
  if (refusedNow || (refusedAt > 0 && query.dataUpdatedAt <= refusedAt)) return undefined;
  return query.data;
}

/** Turns an API error into one sentence for the page. */
export function describeError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong while loading this page.';
  // The server never answered: say so, not "The server returned 502" (#40).
  if (err.unreachable) return err.message;
  if (err.status === 401) return 'Your session has ended. Sign in again.';
  if (err.status === 403) return `The server refused this request: ${err.message}`;
  if (err.status === 404) return 'This record does not exist, or it belongs to another organisation.';
  if (err.status === 429) {
    return err.retryAfter ? `Too many requests. Try again in ${err.retryAfter} seconds.` : 'Too many requests. Try again shortly.';
  }
  return `The server returned ${err.status}: ${err.message}`;
}
