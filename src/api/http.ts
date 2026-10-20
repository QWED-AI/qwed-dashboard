import type { AuditLog, AuditLogList, EntryCheck, SignInResponse, User } from './types';

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
  return (await res.json()) as T;
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

  /** The server returns at most 200 rows and has no paging yet. */
  async listLogs(token: string, limit = 200): Promise<AuditLog[]> {
    const data = await request<AuditLogList>(`/audit/logs?limit=${limit}`, { headers: bearer(token) });
    return data.logs;
  },

  getLog(token: string, id: string): Promise<AuditLog> {
    return request(`/audit/logs/${encodeURIComponent(id)}`, { headers: bearer(token) });
  },

  /** Takes an API key, not the session token: the admin routes authenticate by x-api-key. */
  checkEntry(adminKey: string, id: string): Promise<EntryCheck> {
    return request(`/admin/compliance/verify/${encodeURIComponent(id)}`, {
      headers: { 'x-api-key': adminKey },
    });
  },
};

export type QwedApi = typeof httpApi;
