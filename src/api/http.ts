import type {
  ApiKeyCreated,
  ApiKeyItem,
  AuditLog,
  AuditLogList,
  AuditLogPage,
  EntryCheck,
  SignInResponse,
  User,
} from './types';

const API_BASE = ((import.meta.env.VITE_QWED_API_BASE as string | undefined) ?? '/api').replace(/\/+$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;

  constructor(status: number, message: string, retryAfter: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function readDetail(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string') return detail;
    }
  } catch {
    // Not JSON; fall through to the status text.
  }
  return res.statusText || `HTTP ${res.status}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'The QWED server could not be reached.');
  }
  if (!res.ok) {
    throw new ApiError(res.status, await readDetail(res), res.headers.get('Retry-After'));
  }
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

  /** Takes an API key, not the session token: the admin routes authenticate by x-api-key. */
  checkEntry(adminKey: string, id: string): Promise<EntryCheck> {
    return request(`/admin/compliance/verify/${encodeURIComponent(id)}`, {
      headers: { 'x-api-key': adminKey },
    });
  },
};

export type QwedApi = typeof httpApi;
