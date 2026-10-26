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
  /**
   * The admission the row's route decided (#307): "ADMIT" or "BLOCKED" on the
   * verify routes, "ADMIT" or "DENY" on /verification-context/from-diagnostic,
   * null where the route decides none or on a row written before it was stored.
   */
  admission?: string | null;
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
 * One row of GET /admin/security/events (#486). The server masks anything
 * shaped like an API key or agent token in `reason` and `query`.
 */
export interface SecurityEvent {
  id: string;
  timestamp: string;
  /** For example SECRET_LEAK_AUTO_REVOKED. */
  event_type: string;
  /** low, medium, high or critical, as the writer set it. */
  severity: string;
  security_layer: string | null;
  reason: string;
  query: string;
  user_id: number | null;
}

/** GET /admin/security/events */
export interface SecurityEventList {
  total: number;
  next_before: string | null;
  events: SecurityEvent[];
}

/** One page of security events, with the cursor for older ones or null. */
export interface SecurityEventPage {
  events: SecurityEvent[];
  nextBefore: string | null;
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

/**
 * How a compliance route is called: with the signed-in session (a server
 * after #485) or with an owner or admin API key (any server).
 */
export type ComplianceAuth = { session: string } | { apiKey: string };

/** A public key from GET /.well-known/jwks.json, which checks the server's attestations. */
export interface Jwk {
  kid?: string;
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
  alg?: string;
  use?: string;
}

export interface Jwks {
  keys: Jwk[];
}

/**
 * GET /admin/compliance/verify-trail (#485): the signature and hash-chain
 * check of every audit entry in a period. VERIFIED only when there are
 * entries and all check out, with a proof_ref over the range checked.
 */
export interface TrailCheck {
  status: 'VERIFIED' | 'NOT_VERIFIED' | 'NO_ENTRIES';
  proof_ref: string | null;
  evidence: {
    first_entry_id: number | null;
    last_entry_id: number | null;
    entries: number;
    head_hash: string | null;
  } | null;
  /** What the check covers, in the server's words. */
  scope: string;
  /** Null when the check could not run. */
  total_entries: number | null;
  verified_entries: number | null;
  failed_entries: number | null;
  first_failed_entry_id: number | null;
  legacy_entries: number | null;
  errors: string[];
  total_errors: number;
  errors_truncated: boolean;
}

/**
 * GET /admin/compliance/report/soc2/{org_id}: the security activity summary
 * (#476), for a signed-in owner or admin since #485. Every value is counted
 * by the server over the last 90 days. In the server's own words, it is not
 * a SOC 2 report.
 */
export interface ActivitySummary {
  report_type: string;
  disclaimer: string;
  organization: { id: number; name: string | null; tier: string | null };
  period: { start: string; end: string; days: number };
  metrics: {
    total_verifications: number;
    security_events_detected: number;
    security_events_by_type: Record<string, number>;
    active_users: number;
    active_api_keys: number;
  };
  /** The signature and chain check of the entries in the period, as verify-trail returns it. */
  audit_trail: TrailCheck;
  generated_at: string;
}
