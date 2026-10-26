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
  /**
   * The word the server stored for the admission, when the dashboard does not
   * show that word: "BLOCKED", shown as DENY, or a word it does not know,
   * shown as stored and not as an admission.
   */
  admissionStored: string | null;
  /** What the verifier or the server said. Never text a caller supplied. */
  agentMessage: string | null;
  /**
   * A message a caller supplied, which the stored result carries but the
   * verifier did not write: the diagnostic message in a Verification Context
   * document. Shown apart, and labelled as the caller's.
   */
  callerMessage: string | null;
  proofRef: string | null;
  isAuthoritative: boolean | null;
  /** Set when the trust gate or attestation signing, not the verifier, made this result BLOCKED. */
  attestationBlock: AttestationBlock | null;
  /** The attestation JWT the server signed and stored with the result, if any (#39). */
  attestation: string | null;
  /** The parsed JSON, or null when the stored text is not valid JSON. */
  value: unknown;
  error: string | null;
}

/**
 * A result the attestation check refused (qwed-verification #320). The verify
 * routes sign every VERIFIED result; when the attestation cannot be issued or
 * does not check out, they store BLOCKED instead, and most refusals keep the
 * verdict the verifier reached or its proof_ref beside it. Those were not
 * admitted, and the dashboard shows them only as what the verifier said.
 */
export interface AttestationBlock {
  /** The server's id for the refusal, such as trust_gate.mandatory_attestation_missing. */
  constraintId: string;
  /** The verifier's verdict, when it is one the specification allows. */
  verdict: Verdict | null;
  /** What the server stored for that verdict when it is not one the dashboard knows. */
  verdictStored: string | null;
  proofRef: string | null;
}

// Matched by prefix: qwed-verification #320 is still open, so the ids behind
// these prefixes may still change.
const ATTESTATION_PREFIXES = ['trust_gate.', 'api.attestation.'];

const VERDICTS: readonly Verdict[] = ['VERIFIED', 'UNVERIFIABLE', 'BLOCKED'];

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);
/** A message with no text says nothing, so it counts as not recorded. */
const asMessage = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const asVerdict = (v: unknown): Verdict | null => (VERDICTS as readonly unknown[]).includes(v) ? (v as Verdict) : null;

/**
 * An admission as stored. The verify routes store BLOCKED for the decision a
 * Verification Context calls DENY (qwed-verification #307, #324): the same
 * decision under another name, so it is shown as DENY and the stored word is
 * kept. A word the dashboard does not know is kept and not shown as one.
 */
export function readAdmission(v: unknown): Pick<ParsedResult, 'admission' | 'admissionStored'> {
  if (v === 'ADMIT' || v === 'DENY') return { admission: v, admissionStored: null };
  if (v === 'BLOCKED') return { admission: 'DENY', admissionStored: 'BLOCKED' };
  if (typeof v === 'string' && v.trim() !== '') return { admission: null, admissionStored: v };
  return { admission: null, admissionStored: null };
}

function at(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isObj(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/**
 * The attestation refusal a BLOCKED result's developer_fields name, if any.
 * Most refusals keep the verifier's verdict as verdict_status and its proof_ref
 * as verdict_proof_ref. The claim mismatches keep only what they compared:
 * result_status (claims_status_mismatch) or result_proof_ref
 * (claims_proof_mismatch). The query mismatch and the snapshot failure keep
 * neither, so those read as not recorded.
 */
function readAttestationBlock(verdict: Verdict | null, fields: unknown): AttestationBlock | null {
  if (verdict !== 'BLOCKED') return null;
  const constraintId = asString(at(fields, 'constraint_id'));
  if (!constraintId || !ATTESTATION_PREFIXES.some((p) => constraintId.startsWith(p))) return null;
  const stored = at(fields, 'verdict_status') ?? at(fields, 'result_status');
  const reached = asVerdict(stored);
  return {
    constraintId,
    verdict: reached,
    verdictStored: reached ? null : asMessage(stored),
    proofRef: asString(at(fields, 'verdict_proof_ref') ?? at(fields, 'result_proof_ref')),
  };
}

/** The verifier's verdict as a refusal records it, for the card and the ledger. */
export function attestationVerdictLabel(block: AttestationBlock): string {
  if (block.verdict) return block.verdict;
  if (block.verdictStored) return `${block.verdictStored} (not a verdict the dashboard knows)`;
  return 'not recorded';
}

const empty = (shape: ResultShape, value: unknown, error: string | null): ParsedResult => ({
  shape,
  verdict: null,
  admission: null,
  admissionStored: null,
  agentMessage: null,
  callerMessage: null,
  proofRef: null,
  isAuthoritative: null,
  attestationBlock: null,
  attestation: null,
  value,
  error,
});

/**
 * The message a qwed-verification server after #321 writes into every
 * Verification Context document. It is the only message in such a document
 * the server wrote. If a later server words it differently, the dashboard
 * shows that text as the caller's, which says less, not more.
 */
export const CALLER_SUPPLIED_NOTICE =
  'Built from a diagnostic the caller supplied; QWED did not produce its message or fields';

/**
 * Whether the result's message is the server's notice, not the verifier's
 * words: in a Verification Context document it can only be the notice.
 */
export const isServerNotice = (r: ParsedResult): boolean => r.shape === 'verification-context' && r.agentMessage !== null;

/**
 * The messages of a Verification Context document. Only
 * POST /verification-context/from-diagnostic stores one, built from a
 * diagnostic its caller sent. A server before qwed-verification #321 kept the
 * caller's message as the document's message; a later one writes its own
 * notice there and keeps the caller's under developer_fields.caller_supplied.
 * Neither marker can be trusted to tell them apart: an older server stored
 * the caller's developer_fields too. So only the notice's exact text counts as
 * the server's, and any other message is the caller's.
 */
function contextMessages(evidence: unknown): Pick<ParsedResult, 'agentMessage' | 'callerMessage'> {
  const message = asMessage(at(evidence, 'agent_message'));
  if (message === CALLER_SUPPLIED_NOTICE) {
    return {
      agentMessage: message,
      callerMessage: asMessage(at(evidence, 'developer_fields', 'caller_supplied', 'agent_message')),
    };
  }
  return { agentMessage: null, callerMessage: message };
}

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
    const verdict = asVerdict(value.verdict);
    return {
      shape: 'verification-context',
      verdict,
      ...readAdmission(at(value, 'context', 'decision', 'admission')),
      ...contextMessages(at(value, 'context', 'evidence', 'evidence')),
      proofRef: asString(at(value, 'context', 'evidence', 'proof_ref')),
      isAuthoritative: null,
      attestationBlock: readAttestationBlock(verdict, at(value, 'context', 'evidence', 'evidence', 'developer_fields')),
      // A document's own signature is not a verdict attestation (#319).
      attestation: null,
      value,
      error: null,
    };
  }

  if ('batch_job_id' in value) return fromBatchItem(value);

  // A DiagnosticResult (stored by the /verify/* routes). It carries no
  // admission; the row does, since #307.
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
  const verdict = asVerdict(result.status);
  return {
    shape: 'diagnostic',
    verdict,
    ...readAdmission(result.admission),
    agentMessage: asMessage(result.agent_message),
    callerMessage: null,
    proofRef: asString(result.proof_ref),
    isAuthoritative: typeof result.is_authoritative === 'boolean' ? result.is_authoritative : null,
    attestationBlock: readAttestationBlock(verdict, result.developer_fields),
    attestation: asMessage(result.attestation),
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
  // The refusal explains a BLOCKED verdict, so it goes with one.
  if (result.verdict !== 'BLOCKED') result.attestationBlock = null;
  // The admission the route decided (#307) wins when the row has one. A null
  // is not the same as the verdict's: the server sends it on every row
  // written before #307 too, and a Verification Context record from then
  // keeps its admission in the stored document, so that one stands.
  if (log.admission !== undefined && log.admission !== null) Object.assign(result, readAdmission(log.admission));
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
