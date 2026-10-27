import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../api/http';
import type { ServerHealth } from '../api/types';
import { useSession } from '../auth/session';

// Which QWED server the dashboard talks to, read from GET /health (#50). The
// version only picks what the header and footer say: it never changes a
// verdict or an admission the dashboard shows.

/**
 * The qwed-verification release the dashboard is built against: the first
 * with stored admissions and paging (#484, #307), the audit checks with a
 * session (#485), key last-used times and security events (#486), and
 * caller diagnostics kept apart (#321).
 */
export const NEEDED_VERSION = '8.0.0';

/** A version's numbers, from its leading "major.minor.patch"; null when it has none. */
function parts(version: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Negative when `a` is older than `b`, 0 when the same, positive when newer; null when either cannot be read. */
export function compareVersions(a: string, b: string): number | null {
  const x = parts(a);
  const y = parts(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) {
    const d = (x[i] as number) - (y[i] as number);
    if (d !== 0) return d;
  }
  return 0;
}

export type ServerStatus =
  | { kind: 'demo' }
  | { kind: 'checking' }
  /** The server answered with a version at least NEEDED_VERSION. */
  | { kind: 'current'; version: string }
  /** The server answered with an older version. */
  | { kind: 'older'; version: string }
  /** The server answered, with no version the dashboard can read. */
  | { kind: 'unknown'; version: string | null }
  /** The server, or the proxy in front of it, did not answer (#40). */
  | { kind: 'unreachable' }
  /**
   * Something answered, but not with the server's health: an error status,
   * or a page that is not JSON, as when /api is not routed to QWED.
   */
  | { kind: 'failed'; reason: string };

/** What the header and footer say about the server, from the /health query. */
export function serverStatus(health: ServerHealth | undefined, error: unknown, demo: boolean): ServerStatus {
  if (demo) return { kind: 'demo' };
  // The latest attempt decides: a failed refetch says so, whatever the
  // server said before, since an earlier version may no longer be what
  // answers at this address.
  if (error instanceof ApiError && error.unreachable) return { kind: 'unreachable' };
  if (error) return { kind: 'failed', reason: error instanceof Error ? error.message : 'The health request failed.' };
  if (!health) return { kind: 'checking' };
  const version = typeof health.version === 'string' && health.version.trim() !== '' ? health.version.trim() : null;
  const order = version === null ? null : compareVersions(version, NEEDED_VERSION);
  if (version === null || order === null) return { kind: 'unknown', version };
  return order < 0 ? { kind: 'older', version } : { kind: 'current', version };
}

/** The shared /health query: asked again every minute and whenever the tab regains focus. None for sample data. */
export function useServerHealth() {
  const { api, mode } = useSession();
  return useQuery({
    queryKey: [mode, 'health'],
    queryFn: () => api.health(),
    enabled: mode !== 'demo',
    staleTime: 60_000,
    // Asked again on focus even within the minute, so a returning reader sees the server as it is now.
    refetchOnWindowFocus: 'always',
    refetchInterval: 60_000,
    retry: false,
  });
}

/** The server's status, from the shared /health query. */
export function useServerStatus(): ServerStatus {
  const { mode } = useSession();
  const health = useServerHealth();
  return serverStatus(health.data, health.error, mode === 'demo');
}

/**
 * The features the dashboard uses that need qwed-verification NEEDED_VERSION
 * (#55), and the screens that show them.
 */
export const FEATURES: readonly { name: string; where: string }[] = [
  { name: 'The stored verdict and admission on every row (#484, #307)', where: 'Overview, Decision ledger' },
  { name: 'Paging back through older records (#484)', where: 'Decision ledger' },
  { name: 'Audit chain checks with your session, and the whole-chain check (#485)', where: 'Record, Overview' },
  { name: 'Key last-used times and security events (#486)', where: 'API keys, Security events' },
  { name: 'A caller’s diagnostic kept apart from the server’s notice (#321)', where: 'Record, Decision ledger' },
  { name: 'The attestation the server signs with each VERIFIED result (#319)', where: 'Record' },
];
