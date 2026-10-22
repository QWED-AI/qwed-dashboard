// Shapes returned by the QWED server (qwed-verification), as of main after
// #484 (#493, #495, #496). Fields added there are optional: an older server
// does not send them.

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
 * never uses it as the verdict. It uses `verdict`, which the server reads
 * from the stored result (#484), and falls back to reading
 * `verification_result` itself on a server that does not send `verdict`.
 * Neither is an admission.
 */
export interface AuditLog {
  id: string;
  request_input: string;
  verification_result: string;
  engine_used: string;
  status: string;
  latency_ms?: number;
  created_at: string;
  /** The stored verdict, or null when the result holds none (#484). */
  verdict?: Verdict | null;
  /** This row's chain entry hash (#484); null on a row outside the chain. */
  entry_hash?: string | null;
  /** The hash this row links to. Detail route only (#484). */
  previous_hash?: string | null;
  /** The row's HMAC signature. Detail route only (#484). */
  hmac_signature?: string | null;
  /** The ApiKey id that made the request; null when no key did or before #484. */
  api_key_id?: string | null;
  /** The server version that wrote the row; null before #484. */
  verifier_version?: string | null;
}

/** GET /audit/logs */
export interface AuditLogList {
  total: number;
  logs: AuditLog[];
  /** Cursor for the next page: set when the page is full, else null (#484). */
  next_before?: string | null;
}

/**
 * One page of the ledger. `nextBefore` is the cursor for older rows, null
 * when there are none, and undefined when the server does not page at all.
 */
export interface AuditLogPage {
  logs: AuditLog[];
  nextBefore: string | null | undefined;
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
