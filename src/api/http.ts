import type {
  ActivitySummary,
  ApiKeyCreated,
  ApiKeyItem,
  AuditLog,
  AuditLogList,
  AuditLogPage,
  ComplianceAuth,
  EntryCheck,
  Jwks,
  SecurityEventList,
  SecurityEventPage,
  ServerHealth,
  SignInResponse,
  TrailCheck,
  User,
} from './types';

/** The base without trailing slashes; a loop, not a regex, so the time stays linear. */
function trimTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return s.slice(0, end);
}

/** Where the dashboard sends its requests: `/api` on its own origin, or `VITE_QWED_API_BASE`. */
export const API_BASE = trimTrailingSlashes((import.meta.env.VITE_QWED_API_BASE as string | undefined) ?? '/api');

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;
  /**
   * The QWED server never answered (#40): the network failed, or a proxy in
   * front of it answered 502, 503 or 504 without a JSON body. `status` keeps
   * the proxy's code, or 0 for a network failure.
   */
  readonly unreachable: boolean;

  constructor(status: number, message: string, retryAfter: string | null = null, unreachable = status === 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
    this.unreachable = unreachable;
  }
}

const UNREACHABLE = 'The QWED server could not be reached.';

// What a proxy, not the QWED server, answers when the server is down or slow.
// QWED itself answers with a JSON body, so a 503 that has one is the server's.
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/** The server's `detail`, or null when the body is not QWED's JSON error. */
async function readDetail(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string') return detail;
    }
  } catch {
    // Not JSON.
  }
  return null;
}

async function failure(res: Response): Promise<ApiError> {
  const detail = await readDetail(res);
  const retryAfter = res.headers.get('Retry-After');
  if (detail === null && GATEWAY_STATUSES.has(res.status)) {
    const answer = [res.status, res.statusText].filter(Boolean).join(' ');
    return new ApiError(res.status, `${UNREACHABLE} The proxy in front of it answered ${answer}.`, retryAfter, true);
  }
  return new ApiError(res.status, detail ?? (res.statusText || `HTTP ${res.status}`), retryAfter);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(0, UNREACHABLE);
  }
  if (!res.ok) throw await failure(res);
  // A success with no body (204, 205) has nothing to parse.
  if (res.status === 204 || res.status === 205) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    // A static host or an SPA fallback answers 200 with HTML when /api is not
    // routed to the QWED server.
    throw new ApiError(res.status, 'The server did not return JSON. Check that /api points at the QWED server.');
  }
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export const httpApi = {
  signIn(email: string, password: string): Promise<SignInResponse> {
    return request('/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  },

  me(token: string): Promise<User> {
    return request('/auth/me', { headers: bearer(token) });
  },

  /**
   * One page of at most 200 rows, newest first. Pass a page's `nextBefore`
   * as `before` for the rows after it.
   */
  async listLogs(token: string, limit = 200, before?: string): Promise<AuditLogPage> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (before !== undefined) query.set('before', before);
    const data = await request<AuditLogList>(`/audit/logs?${query}`, { headers: bearer(token) });
    return { logs: data.logs, nextBefore: data.next_before };
  },

  getLog(token: string, id: string): Promise<AuditLog> {
    return request(`/audit/logs/${encodeURIComponent(id)}`, { headers: bearer(token) });
  },

  listKeys(token: string): Promise<ApiKeyItem[]> {
    return request('/auth/api-keys', { headers: bearer(token) });
  },

  createKey(token: string, name: string): Promise<ApiKeyCreated> {
    return request('/auth/api-keys', {
      method: 'POST',
      headers: { ...bearer(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  },

  async revokeKey(token: string, id: string): Promise<void> {
    await request<unknown>(`/auth/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE', headers: bearer(token) });
  },

  /** Checks one audit entry, with the session (after #485) or an API key. */
  checkEntry(auth: ComplianceAuth, id: string): Promise<EntryCheck> {
    return request(`/admin/compliance/verify/${encodeURIComponent(id)}`, { headers: complianceHeaders(auth) });
  },

  /** Checks every audit entry of the organisation (#485); open-ended without a period. */
  verifyTrail(auth: ComplianceAuth): Promise<TrailCheck> {
    return request('/admin/compliance/verify-trail', { headers: complianceHeaders(auth) });
  },

  /**
   * The security activity summary for the last 90 days (#476), with the
   * session (#485). Owners and admins only. The server checks every audit
   * entry in the period to answer, so it is slow on a large trail.
   */
  activitySummary(token: string, orgId: string): Promise<ActivitySummary> {
    return request(`/admin/compliance/report/soc2/${encodeURIComponent(orgId)}`, { headers: bearer(token) });
  },

  /**
   * One page of the organisation's security events, newest first (#486).
   * Owners and admins only; pass a page's `nextBefore` as `before`.
   */
  async listSecurityEvents(
    token: string,
    { limit = 50, before, eventType }: { limit?: number; before?: string; eventType?: string } = {},
  ): Promise<SecurityEventPage> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (before !== undefined) query.set('before', before);
    if (eventType) query.set('event_type', eventType);
    const data = await request<SecurityEventList>(`/admin/security/events?${query}`, { headers: bearer(token) });
    return { events: data.events, nextBefore: data.next_before };
  },

  /** The server's public keys for its attestations (#39). No credential: anyone may check one. */
  getJwks(): Promise<Jwks> {
    return request('/.well-known/jwks.json');
  },

  /** The server's health and version (#50). No credential. */
  health(): Promise<ServerHealth> {
    return request('/health');
  },
};

function complianceHeaders(auth: ComplianceAuth): Record<string, string> {
  return 'apiKey' in auth ? { 'x-api-key': auth.apiKey } : bearer(auth.session);
}

/**
 * Whether a compliance route refused the session because the server takes
 * only API keys there (a server before #485). That server answers 401
 * "Missing x-api-key header"; one after #485 says "... or bearer token".
 */
export function sessionNotAccepted(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401 && err.message === 'Missing x-api-key header';
}

export type QwedApi = typeof httpApi;
