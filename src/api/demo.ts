import { CALLER_SUPPLIED_NOTICE, parseResult } from '../lib/result';
import { NEEDED_VERSION } from '../lib/server';
import { ApiError, type QwedApi } from './http';
import type {
  ActivitySummary,
  ApiKeyCreated,
  ApiKeyItem,
  ApiKeyRotated,
  AuditLog,
  EntryCheck,
  OrgUser,
  ThreatSummary,
  Jwks,
  SecurityEvent,
  ServerHealth,
  TrailCheck,
  User,
} from './types';

// Sample data for exploring the dashboard without a QWED server. Shaped like
// the real /audit/logs rows; none of it comes from a real verification.

const demoUser: User = { id: 'demo', email: 'demo@example.com', org_id: 'demo', org_name: 'Sample Organisation', role: 'owner' };
const demoOwner = { id: demoUser.id, email: demoUser.email };

function diagnostic(
  status: 'VERIFIED' | 'UNVERIFIABLE' | 'BLOCKED',
  agentMessage: string,
  developerFields: Record<string, unknown>,
  proofRef: string | null,
): string {
  return JSON.stringify({
    status,
    agent_message: agentMessage,
    developer_fields: developerFields,
    proof_ref: proofRef,
    is_authoritative: proofRef !== null,
  });
}

const contextDocument = JSON.stringify({
  spec_version: '1.0',
  object: { formal_statement: 'Invoice total 4 × 249.00 + 18% GST equals 1,175.28' },
  context: {
    interpretation: { theory: 'math verification' },
    proof: { verifier: 'math', verifier_version: '7.3.0' },
    evidence: {
      // As a server after qwed-verification #321 stores it: its own notice,
      // with the caller's diagnostic kept apart.
      evidence: {
        status: 'VERIFIED',
        agent_message: CALLER_SUPPLIED_NOTICE,
        developer_fields: {
          constraint_id: 'verification_context.caller_supplied_diagnostic',
          caller_supplied: { agent_message: 'The stated total matches.', developer_fields: {} },
        },
      },
      proof_ref: 'sha256:sample-41aa-3f90',
    },
    decision: { admission: 'ADMIT' },
  },
  verdict: 'VERIFIED',
});

const baseLogs: AuditLog[] = [
  {
    id: '1042',
    request_input: 'Refund of 3,400.00 for order [ORDER ID] is within the 30-day return window',
    verification_result: diagnostic('UNVERIFIABLE', 'Logic constraints are unsatisfiable', { status: 'UNSAT', dsl_code: '[DSL]' }, null),
    engine_used: 'LOGIC',
    status: 'blocked',
    created_at: '2026-10-20T09:41:12',
  },
  {
    id: '1041',
    request_input: 'SELECT id, total FROM orders WHERE id = 7; DELETE FROM orders',
    verification_result: diagnostic('VERIFIED', 'The query is not read-only.', { is_valid: false }, 'sha256:sample-9c41-e07a'),
    engine_used: 'SQL',
    status: 'blocked',
    created_at: '2026-10-20T09:12:05',
  },
  {
    id: '1040',
    request_input: 'Invoice total 4 × 249.00 + 18% GST equals 1,175.28',
    verification_result: contextDocument,
    engine_used: 'VERIFICATION_CONTEXT',
    status: 'verified',
    created_at: '2026-10-20T08:57:44',
  },
  {
    id: '1039',
    request_input: 'Supplier VAT number [VAT ID] matches the registry extract supplied',
    verification_result: diagnostic('UNVERIFIABLE', 'The extract supports the claim; a fact check never reaches VERIFIED.', { verdict: 'SUPPORTED' }, null),
    engine_used: 'FACT',
    status: 'blocked',
    created_at: '2026-10-20T08:30:19',
  },
  {
    id: '1038',
    request_input: 'Supplier [NAME] is registered in Germany',
    verification_result: diagnostic('BLOCKED', 'The documents supplied contradict the claim.', { verdict: 'REFUTED' }, null),
    engine_used: 'FACT',
    status: 'blocked',
    created_at: '2026-10-20T08:14:33',
  },
  {
    id: '1037',
    request_input: '(a + b)**2 = a**2 + b**2',
    verification_result: diagnostic('VERIFIED', 'The identity is false.', { is_valid: false }, 'sha256:sample-d3e9-5b10'),
    engine_used: 'MATH',
    status: 'blocked',
    created_at: '2026-10-20T08:02:51',
  },
  {
    id: '1036',
    request_input: 'Agent tool call stays inside the workspace directory',
    verification_result: diagnostic('VERIFIED', 'The code writes outside the workspace.', { is_valid: false }, 'sha256:sample-2b77-a6c4'),
    engine_used: 'CODE',
    status: 'blocked',
    created_at: '2026-10-20T07:48:30',
  },
  {
    // The code checked out, but the server could not sign the VERIFIED
    // result, so it stored BLOCKED with the verdict beside it (#320).
    id: '1035',
    request_input: 'def refund_total(items):\n    return sum(i.price for i in items)',
    verification_result: diagnostic(
      'BLOCKED',
      'Attestation unavailable — cannot sign VERIFIED result',
      {
        constraint_id: 'api.attestation.signing_error',
        attestation_error: 'SIGNING_FAILURE',
        engine: 'code',
        verdict_status: 'VERIFIED',
        verdict_proof_ref: 'sha256:sample-5f12-c08e',
      },
      null,
    ),
    engine_used: 'CODE',
    status: 'blocked',
    created_at: '2026-10-20T07:33:10',
  },
  {
    id: '1034',
    request_input: 'Mean order value in [FILE] is 1,240.50',
    verification_result: JSON.stringify({ truncated: true, preview: "{'status': 'UNVERIFIABLE', 'agent_message': 'Sandboxed computation ran..." }),
    engine_used: 'STATS',
    status: 'blocked',
    created_at: '2026-10-20T06:52:40',
  },
  {
    id: '1033',
    request_input: '(x + 1)**2 = x**2 + 2*x + 1',
    verification_result: diagnostic('VERIFIED', 'The identity holds.', { is_valid: true }, 'sha256:sample-6e08-b2d9'),
    engine_used: 'MATH',
    status: 'verified',
    created_at: '2026-10-20T06:44:17',
  },
];

// Older sample rows, 14 to 19 Oct, so a week of the overview has something
// to show. Built from a fixed list in a fixed order, so every load is the
// same. Request texts differ from the rows above.
// `admission` is what the route decided, as the server stores it since #307:
// ADMIT or BLOCKED on the verify routes, ADMIT or DENY on a Verification
// Context, null where the route decides none (logic, stats, fact). A claim
// proven false, or code proven unsafe, is VERIFIED with BLOCKED.
const HISTORY_TEMPLATES: readonly {
  status: 'VERIFIED' | 'UNVERIFIABLE' | 'BLOCKED' | 'TRUNCATED';
  engine: string;
  claim: string;
  message: string;
  admission: 'ADMIT' | 'BLOCKED' | null;
}[] = [
  { status: 'VERIFIED', engine: 'MATH', claim: 'Monthly interest on 12,000.00 at 1.5% is 180.00', message: 'The arithmetic holds.', admission: 'ADMIT' },
  { status: 'VERIFIED', engine: 'SQL', claim: 'SELECT region, SUM(total) FROM orders GROUP BY region', message: 'The query is read-only.', admission: 'ADMIT' },
  { status: 'VERIFIED', engine: 'CODE', claim: 'Report export writes only under ./reports', message: 'The code stays inside the allowed paths.', admission: 'ADMIT' },
  { status: 'UNVERIFIABLE', engine: 'FACT', claim: 'Vendor [NAME] holds a current ISO 27001 certificate', message: 'The documents supplied do not settle the claim.', admission: null },
  { status: 'VERIFIED', engine: 'MATH', claim: 'Line items for invoice [INVOICE ID] add up to 2,950.00', message: 'The arithmetic holds.', admission: 'ADMIT' },
  { status: 'VERIFIED', engine: 'LOGIC', claim: 'No discount stacks above 30% under the pricing rules', message: 'The constraints hold for every case.', admission: null },
  { status: 'VERIFIED', engine: 'MATH', claim: 'Tax on 2,400.00 at 18% is 412.00', message: 'The stated value is wrong; the tax is 432.00.', admission: 'BLOCKED' },
  { status: 'VERIFIED', engine: 'STATS', claim: 'Median basket size in [FILE] is 3 items', message: 'The computation matches the stated value.', admission: null },
  { status: 'VERIFIED', engine: 'SQL', claim: 'SELECT id, status FROM shipments WHERE eta < NOW()', message: 'The query is read-only.', admission: 'ADMIT' },
  { status: 'UNVERIFIABLE', engine: 'LOGIC', claim: 'Every region meets the two-day shipping promise', message: 'The rules supplied do not decide the claim.', admission: null },
  { status: 'VERIFIED', engine: 'VERIFICATION_CONTEXT', claim: 'Refund of 120.00 matches the returned items', message: 'The stated total matches.', admission: 'ADMIT' },
  { status: 'VERIFIED', engine: 'CODE', claim: 'Report builder runs the query text it is given', message: 'The code runs input as code.', admission: 'BLOCKED' },
  { status: 'BLOCKED', engine: 'FACT', claim: 'Supplier [NAME] has no open sanctions listing', message: 'The documents supplied contradict the claim.', admission: null },
  { status: 'TRUNCATED', engine: 'STATS', claim: 'Churn in [FILE] fell 4% month on month', message: '', admission: null },
];

// Records per day, oldest first, from 14 Oct.
const HISTORY_PER_DAY = [5, 7, 4, 8, 6, 7];

/** Which sample key made an older row: key 7 exists from 15 Oct 09:30, so earlier rows came from 6 or 5. */
function historyCaller(i: number, createdAt: string): string {
  if (createdAt < '2026-10-15T09:30:00') return i % 2 === 0 ? '6' : '5';
  return ['7', '6', '7', '5', '6'][i % 5] ?? '7';
}

function historyResult(t: (typeof HISTORY_TEMPLATES)[number], n: number): string {
  if (t.status === 'TRUNCATED') {
    return JSON.stringify({ truncated: true, preview: "{'status': 'VERIFIED', 'agent_message': 'Sandboxed computation ran..." });
  }
  const proofRef = t.status === 'VERIFIED' ? `sha256:sample-h${String(n).padStart(3, '0')}` : null;
  return diagnostic(t.status, t.message, {}, proofRef);
}

function buildHistory(): AuditLog[] {
  const rows: AuditLog[] = [];
  let n = 0;
  HISTORY_PER_DAY.forEach((count, day) => {
    for (let k = 0; k < count; k++) {
      const t = HISTORY_TEMPLATES[(n * 5) % HISTORY_TEMPLATES.length];
      if (!t) continue;
      const hour = 7 + Math.floor((k * 11) / count);
      const minute = (n * 17 + 3) % 60;
      const createdAt = `2026-10-${String(14 + day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String((n * 23) % 60).padStart(2, '0')}`;
      rows.push({
        id: String(996 + n),
        request_input: t.claim,
        verification_result: historyResult(t, n),
        engine_used: t.engine,
        status: t.status === 'VERIFIED' ? 'verified' : 'blocked',
        created_at: createdAt,
        api_key_id: historyCaller(n, createdAt),
        admission: t.admission,
      });
      n += 1;
    }
  });
  // Newest first, as the server lists them.
  return rows.reverse();
}

const history = buildHistory();

/** A sample 64-character hex string, the length of a SHA-256. Not a real hash. */
function sampleHex(seed: string): string {
  // FNV-1a over the whole seed, so seeds that differ anywhere differ here.
  let h = 0x811c9dc5;
  for (const ch of seed) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  let out = '';
  // Eight rounds of eight hex digits.
  for (let i = 0; i < 8; i++) {
    h = Math.imul(h ^ (i + 1), 0x01000193) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return out;
}

// Which sample key wrote each of the newest rows. Key 5 is no longer in the
// key list (as a revoked key would not be). Rows 1034 and 1033 were made
// without a key (a signed-in session), so they have none.
const CALLER: Record<string, string | null> = {
  '1042': '7', '1041': '7', '1040': '6', '1039': '6', '1038': '6',
  '1037': '7', '1036': '5', '1035': '5', '1034': null, '1033': null,
};

// The admission each of the newest rows' routes decided (#307). The logic,
// fact and stats routes decide none.
const ADMISSION: Record<string, string | null> = {
  '1042': null, '1041': 'BLOCKED', '1040': 'ADMIT', '1039': null, '1038': null,
  '1037': 'BLOCKED', '1036': 'BLOCKED', '1035': 'BLOCKED', '1034': null, '1033': 'ADMIT',
};

// Four of the 17 Oct rows came from one /verify/batch job (#477, #57): the
// server stores each item's result under details.result, with the job's id
// beside it, and writes the items within seconds of each other. One request
// sent them, so they share its key. Their verdicts and admissions are the
// ones the rows already had.
const SAMPLE_BATCH_JOB = 'sample-batch-1017';
const BATCH_ITEMS: Record<string, { item: number; at: string }> = {
  '1013': { item: 0, at: '2026-10-17T08:42:05' },
  '1014': { item: 1, at: '2026-10-17T08:42:06' },
  '1015': { item: 2, at: '2026-10-17T08:42:06' },
  '1016': { item: 3, at: '2026-10-17T08:42:07' },
};

function asBatchItem(log: AuditLog): AuditLog {
  const place = BATCH_ITEMS[log.id];
  if (!place) return log;
  const result = JSON.parse(log.verification_result) as { status?: string };
  return {
    ...log,
    created_at: place.at,
    api_key_id: '7',
    verification_result: JSON.stringify({
      batch_job_id: SAMPLE_BATCH_JOB,
      batch_item_id: `item-${place.item}`,
      batch_item_type: log.engine_used.toLowerCase(),
      item_status: 'completed',
      verdict: result.status ?? null,
      details: { result, error: null },
    }),
  };
}

// The fields a server after #484 and #307 adds: the stored verdict (read the
// same way the dashboard reads it), the chain entry, the caller and the
// admission.
const chain = [...baseLogs, ...history.map(asBatchItem)];
const logs: AuditLog[] = chain.map((log, i) => {
  const older = chain[i + 1];
  const keyId = log.id in CALLER ? (CALLER[log.id] ?? null) : (log.api_key_id ?? null);
  return {
    ...log,
    verdict: parseResult(log.verification_result).verdict,
    entry_hash: sampleHex(`entry-${log.id}`),
    previous_hash: older ? sampleHex(`entry-${older.id}`) : null,
    hmac_signature: sampleHex(`hmac-${log.id}`),
    api_key_id: keyId,
    verifier_version: keyId === null ? null : '7.3.0',
    admission: log.id in ADMISSION ? (ADMISSION[log.id] ?? null) : (log.admission ?? null),
  };
});

/** The list route leaves out the link and the signature, as the server does. */
function listed(log: AuditLog): AuditLog {
  return { ...log, previous_hash: undefined, hmac_signature: undefined };
}

// Sample keys live in memory and reset on reload. Created keys are random
// sample strings, not keys any server accepts.
let keys: ApiKeyItem[] = [
  {
    id: '7',
    name: 'payments-agent prod',
    key_preview: 'qwed_live_****x7Qa',
    created_at: '2026-10-15T09:30:00',
    // The newest sample rows each key made (1042 and 1040), as #486 records.
    last_used_at: '2026-10-20T09:41:12',
    is_revoked: false,
    expires_at: null,
    rotation_required: false,
    owner: demoOwner,
  },
  {
    // Another member's key, which an owner sees too. It expires 90 days
    // after it was made, and the server flags it for rotation in the 7 days
    // before that.
    id: '6',
    name: 'invoice pipeline',
    key_preview: 'qwed_live_****9mBe',
    created_at: '2026-07-22T11:04:00',
    last_used_at: '2026-10-20T08:57:44',
    is_revoked: false,
    expires_at: '2026-10-20T11:04:00',
    rotation_required: true,
    owner: { id: 'sample-2', email: 'ops@example.com' },
  },
];

// The sample organisation's users, oldest first, as GET /auth/users lists
// them. One was deactivated and stays listed.
const users: OrgUser[] = [
  { id: demoUser.id, email: demoUser.email, role: 'owner', is_active: true, created_at: '2026-07-01T09:00:00Z' },
  { id: 'sample-2', email: 'ops@example.com', role: 'member', is_active: true, created_at: '2026-07-22T10:58:00Z' },
  { id: 'sample-3', email: 'security@example.com', role: 'admin', is_active: true, created_at: '2026-08-04T14:12:00Z' },
  { id: 'sample-4', email: 'auditor@example.com', role: 'viewer', is_active: true, created_at: '2026-09-15T08:30:00Z' },
  { id: 'sample-5', email: 'contractor@example.com', role: 'member', is_active: false, created_at: '2026-09-20T16:45:00Z' },
];

// Sample security events, of the one type the server writes today: a key
// reported as leaked in public is revoked, and the event names it by its
// preview only. Key 5 made sample rows 1035 and 1036, then was revoked.
const securityEvents: SecurityEvent[] = [
  {
    id: '12',
    timestamp: '2026-10-20T07:55:02',
    event_type: 'SECRET_LEAK_AUTO_REVOKED',
    severity: 'high',
    security_layer: null,
    reason: 'Public leak auto-revoked: source=github url=https://example.com/[sample]/config.env',
    query: 'leaked key qwed_live_****Kd3p',
    user_id: 1,
  },
  {
    id: '4',
    timestamp: '2026-09-02T14:10:47',
    event_type: 'SECRET_LEAK_AUTO_REVOKED',
    severity: 'high',
    security_layer: null,
    reason: 'Public leak auto-revoked: source=github url=https://example.com/[sample]/notebook.ipynb',
    query: 'leaked key qwed_live_****p2Wt',
    user_id: 1,
  },
];
let nextKeyId = 8;

function sampleKey(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(36));
  return `qwed_test_${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

// The delays make the sample feel like a network in the browser. Tests skip
// them: under coverage, a create, a revoke and a refetch in a row could pass
// Testing Library's one-second wait and fail at random.
const wait = (ms: number) =>
  import.meta.env.MODE === 'test' ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

function find(id: string): AuditLog {
  const log = logs.find((l) => l.id === id);
  if (!log) throw new ApiError(404, 'Log not found');
  return log;
}

// Agrees with checkEntry: the sample entry 1037 fails its signature, so the
// whole chain does not check out and 1037 is the first failure.
function sampleTrail(): TrailCheck {
  return {
    status: 'NOT_VERIFIED',
    proof_ref: null,
    evidence: null,
    scope:
      'Signature and hash-chain check of the audit entries recorded in the period. It does not show that every request was recorded.',
    total_entries: logs.length,
    verified_entries: logs.length - 1,
    failed_entries: 1,
    first_failed_entry_id: 1037,
    legacy_entries: 0,
    errors: ['Entry 1037: HMAC signature mismatch (sample data)'],
    total_errors: 1,
    errors_truncated: false,
  };
}

export const demoApi: QwedApi = {
  signIn() {
    return Promise.resolve({ access_token: 'demo', token_type: 'bearer', user: demoUser });
  },
  me() {
    return Promise.resolve(demoUser);
  },
  async listLogs(_token, limit, before) {
    await wait(250);
    const size = limit ?? 200;
    const start = before === undefined ? 0 : logs.findIndex((l) => l.id === before) + 1;
    if (start === 0 && before !== undefined) throw new ApiError(404, 'Log not found');
    const page = logs.slice(start, start + size).map(listed);
    const full = page.length > 0 && page.length === size;
    return { logs: page, nextBefore: full ? (page.at(-1)?.id ?? null) : null };
  },
  async getLog(_token, id) {
    await wait(150);
    return find(id);
  },
  // The server's summary of the sample events in the 24 hours up to the
  // newest sample row: one high-severity event, which its thresholds rate
  // MEDIUM.
  async threatSummary(): Promise<ThreatSummary> {
    await wait(200);
    return {
      organization_id: 0,
      period_hours: 24,
      threat_level: 'MEDIUM',
      metrics: { total_events: 1, blocked_attempts: 0, high_severity_events: 1, recent_failures_10min: 0 },
      security_layer_breakdown: {},
      generated_at: '2026-10-20T10:00:00+00:00',
    };
  },
  async listUsers(): Promise<OrgUser[]> {
    await wait(200);
    return users;
  },
  async listKeys() {
    await wait(200);
    return keys;
  },
  async createKey(_token, name): Promise<ApiKeyCreated> {
    await wait(200);
    const key = sampleKey();
    const created = { id: String(nextKeyId++), name, key, created_at: new Date().toISOString() };
    keys = [
      {
        id: created.id,
        name,
        key_preview: `${key.slice(0, 10)}****${key.slice(-4)}`,
        created_at: created.created_at,
        last_used_at: null,
        is_revoked: false,
        expires_at: null,
        rotation_required: false,
        owner: demoOwner,
      },
      ...keys,
    ];
    return created;
  },
  async revokeKey(_token, id) {
    await wait(200);
    if (!keys.some((k) => k.id === id)) throw new ApiError(404, 'API key not found');
    keys = keys.filter((k) => k.id !== id);
  },
  // As the server rotates one: the old key goes, and its replacement is named after it.
  async rotateKey(_token, id): Promise<ApiKeyRotated> {
    await wait(200);
    const old = keys.find((k) => k.id === id);
    if (!old) throw new ApiError(404, 'Key not found');
    const key = sampleKey();
    const replacement: ApiKeyItem = {
      id: String(nextKeyId++),
      name: `${old.name} (Rotated)`,
      key_preview: `${key.slice(0, 10)}****${key.slice(-4)}`,
      created_at: new Date().toISOString(),
      last_used_at: null,
      is_revoked: false,
      // The server gives a rotated key 90 days, and the old key's owner.
      expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      rotation_required: false,
      owner: old.owner ?? null,
    };
    keys = [replacement, ...keys.filter((k) => k.id !== id)];
    return { oldKeyId: id, newKeyId: replacement.id, newKeyPreview: replacement.key_preview, newKey: key };
  },
  async checkEntry(_auth, id): Promise<EntryCheck> {
    await wait(300);
    find(id);
    if (id === '1037') {
      return {
        valid: false,
        checks: { hash_valid: true, signature_valid: false, chain_valid: true },
        errors: ['HMAC signature mismatch (sample data)'],
        log_id: Number(id),
      };
    }
    return { valid: true, checks: { hash_valid: true, signature_valid: true, chain_valid: true }, errors: [], log_id: Number(id) };
  },
  // The sample rows carry no attestation, so there is no key to publish.
  async getJwks(): Promise<Jwks> {
    await wait(200);
    return { keys: [] };
  },
  async health(): Promise<ServerHealth> {
    await wait(100);
    return { status: 'healthy', service: 'Sample data', version: NEEDED_VERSION };
  },
  async verifyTrail(): Promise<TrailCheck> {
    await wait(400);
    return sampleTrail();
  },
  // The sample period ends with the newest sample row, so every sample row
  // and event falls inside its 90 days.
  async activitySummary(): Promise<ActivitySummary> {
    await wait(600);
    const byType: Record<string, number> = {};
    for (const e of securityEvents) byType[e.event_type] = (byType[e.event_type] ?? 0) + 1;
    return {
      report_type: 'Security activity summary',
      disclaimer: "Generated by the QWED server from its own records. It is not a SOC 2 report or an auditor's attestation.",
      organization: { id: 0, name: 'Organisation demo', tier: null },
      period: { start: '2026-07-22T10:00:00+00:00', end: '2026-10-20T10:00:00+00:00', days: 90 },
      metrics: {
        total_verifications: logs.length,
        security_events_detected: securityEvents.length,
        security_events_by_type: byType,
        active_users: 1,
        active_api_keys: keys.length,
      },
      audit_trail: sampleTrail(),
      generated_at: '2026-10-20T10:00:00+00:00',
    };
  },
  async listSecurityEvents(_token, { limit = 50, before, eventType } = {}) {
    await wait(200);
    const matching = securityEvents.filter((e) => !eventType || e.event_type === eventType);
    const start = before === undefined ? 0 : matching.findIndex((e) => e.id === before) + 1;
    if (start === 0 && before !== undefined) throw new ApiError(404, 'Event not found');
    const page = matching.slice(start, start + limit);
    const full = page.length > 0 && page.length === limit;
    return { events: page, nextBefore: full ? (page.at(-1)?.id ?? null) : null };
  },
};
