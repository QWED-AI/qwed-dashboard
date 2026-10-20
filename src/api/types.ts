// Shapes returned by the QWED server (qwed-verification), as of main 64c78b9.

export type Verdict = 'VERIFIED' | 'UNVERIFIABLE' | 'BLOCKED';
export type Admission = 'ADMIT' | 'DENY';

export interface User {
  id: string;
  email: string;
  org_id: string;
  role: string;
}

/** POST /auth/signin */
export interface SignInResponse {
  access_token: string;
  token_type: string;
  user: User;
}

/**
 * One row of GET /audit/logs and GET /audit/logs/{id}.
 *
 * `status` is derived on the server from `is_verified` ("verified" or
 * "blocked"), so an UNVERIFIABLE result also reads "blocked". The dashboard
 * never uses it as the verdict; it reads the verdict from
 * `verification_result` instead.
 */
export interface AuditLog {
  id: string;
  request_input: string;
  verification_result: string;
  engine_used: string;
  status: string;
  latency_ms?: number;
  created_at: string;
}

/** GET /audit/logs */
export interface AuditLogList {
  total: number;
  logs: AuditLog[];
}

/**
 * One row of GET /auth/api-keys. The server lists only active keys and does
 * not return the owner, expiry or rotation state yet.
 */
export interface ApiKeyItem {
  id: string;
  name: string;
  key_preview: string;
  created_at: string;
  last_used_at: string | null;
  is_revoked: boolean;
}

/** POST /auth/api-keys. `key` is the full key, returned this once only. */
export interface ApiKeyCreated {
  id: string;
  name: string;
  key: string;
  created_at: string;
}

/** GET /admin/compliance/verify/{log_id} (needs an owner or admin API key). */
export interface EntryCheck {
  valid: boolean;
  legacy?: boolean;
  checks: {
    hash_valid?: boolean;
    signature_valid?: boolean;
    chain_valid?: boolean;
  };
  errors: string[];
  log_id?: number;
  timestamp?: string;
}
