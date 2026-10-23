import type { Admission, AuditLog, Verdict } from '../api/types';

// Reads what the server stored for a verification. The dashboard only reports
// these values; it never works out a verdict or an admission itself (the
// verifier is the only authority for both). When a value is missing or is not
// one the specification allows, it is shown as not recorded.

export type ResultShape = 'diagnostic' | 'verification-context' | 'batch-item' | 'truncated' | 'unknown';

export interface ParsedResult {
  shape: ResultShape;
  verdict: Verdict | null;
  admission: Admission | null;
  agentMessage: string | null;
  proofRef: string | null;
  isAuthoritative: boolean | null;
  /** The parsed JSON, or null when the stored text is not valid JSON. */
  value: unknown;
  error: string | null;
}

const VERDICTS: readonly Verdict[] = ['VERIFIED', 'UNVERIFIABLE', 'BLOCKED'];
const ADMISSIONS: readonly Admission[] = ['ADMIT', 'DENY'];

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);
/** A message with no text says nothing, so it counts as not recorded. */
const asMessage = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const asVerdict = (v: unknown): Verdict | null => (VERDICTS as readonly unknown[]).includes(v) ? (v as Verdict) : null;
const asAdmission = (v: unknown): Admission | null =>
  (ADMISSIONS as readonly unknown[]).includes(v) ? (v as Admission) : null;

function at(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isObj(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

const empty = (shape: ResultShape, value: unknown, error: string | null): ParsedResult => ({
  shape,
  verdict: null,
  admission: null,
  agentMessage: null,
  proofRef: null,
  isAuthoritative: null,
  value,
  error,
});

export function parseResult(raw: string): ParsedResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return empty('unknown', null, 'The stored result is not valid JSON.');
  }
  if (!isObj(value)) return empty('unknown', value, 'The stored result is not an object.');

  if (value.truncated === true) {
    return empty('truncated', value, 'The server stored a shortened copy of this result, so its verdict cannot be read.');
  }

  // A Verification Context document (stored by the /verification-context routes).
  if ('spec_version' in value && 'verdict' in value) {
    return {
      shape: 'verification-context',
      verdict: asVerdict(value.verdict),
      admission: asAdmission(at(value, 'context', 'decision', 'admission')),
      agentMessage: asMessage(at(value, 'context', 'evidence', 'evidence', 'agent_message')),
      proofRef: asString(at(value, 'context', 'evidence', 'proof_ref')),
      isAuthoritative: null,
      value,
      error: null,
    };
  }

  if ('batch_job_id' in value) return fromBatchItem(value);

  // A DiagnosticResult (stored by the /verify/* routes). It carries no admission.
  if ('status' in value) return fromDiagnostic(value, value);

  return empty('unknown', value, 'The stored result has no verdict field.');
}

/** A /verify/batch item row (#477): the item's own result sits under
 * details.result, read as the server reads it (#484). */
function fromBatchItem(value: Obj): ParsedResult {
  const details = isObj(value.details) ? value.details : null;
  if (details?.truncated === true) {
    return empty('truncated', value, 'The server stored a shortened copy of this batch item, so its verdict cannot be read.');
  }
  const inner = details?.result;
  if (isObj(inner)) return { ...fromDiagnostic(inner, value), shape: 'batch-item' };
  const failure = asMessage(details?.error);
  return empty('batch-item', value, failure ? `This batch item failed: ${failure}` : 'This batch item stored no result.');
}

function fromDiagnostic(result: Obj, value: unknown): ParsedResult {
  return {
    shape: 'diagnostic',
    verdict: asVerdict(result.status),
    admission: asAdmission(result.admission),
    agentMessage: asMessage(result.agent_message),
    proofRef: asString(result.proof_ref),
    isAuthoritative: typeof result.is_authoritative === 'boolean' ? result.is_authoritative : null,
    value,
    error: null,
  };
}

export interface LedgerRecord {
  id: string;
  query: string;
  domain: string;
  createdAt: string;
  /** The API key that made the request: null when none did, undefined before #484. */
  apiKeyId: string | null | undefined;
  result: ParsedResult;
  raw: string;
}

export function toRecord(log: AuditLog): LedgerRecord {
  const result = parseResult(log.verification_result);
  // A server after #484 sends the verdict it read from the stored result, by
  // its own rules (it also reads /verify/batch rows). It wins, null included;
  // an older server sends no field, and the dashboard reads the result itself.
  if ('verdict' in log) result.verdict = asVerdict(log.verdict);
  return {
    id: log.id,
    query: log.request_input,
    domain: log.engine_used,
    createdAt: log.created_at,
    apiKeyId: log.api_key_id,
    result,
    raw: log.verification_result,
  };
}
