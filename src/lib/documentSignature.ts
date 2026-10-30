import type { Jwks } from '../api/types';
import {
  compare,
  decode,
  expiryItem,
  failed,
  isObj,
  keyOf,
  seconds,
  sha256Ref,
  signatureItem,
  str,
  type AttestationItem,
  type AttestationReport,
} from './attestation';
import { canonicalJson, CanonicalJsonError } from './canonicalJson';

// Checks the signature of a Verification Context document (spec 1.1, #54):
// the `attestation` qwed-verification 8.0.0 signs each document it issues
// with. As spec 1.1 section 4 and the SDK's verify_document_attestation have
// it, the token must verify with a key in the server's JWKS, be a document's
// (typ qwed-context+jwt, qwed.version 1.1), and sign this document: the hash
// of every other field, and its verdict, admission and proof_ref. It shows
// the server issued the document as stored; it adds nothing to the verdict or
// the admission, and the dashboard works neither out.

/** The header typ of a document's token (qwed-verification attestation.py). */
export const CONTEXT_TOKEN_TYPE = 'qwed-context+jwt';
export const SIGNED_SPEC_VERSION = '1.1';

type Obj = Record<string, unknown>;

/** What a stored document carries to check, or why there is nothing to check. */
export type DocumentSignature =
  | { kind: 'signed'; token: string; document: Obj }
  | { kind: 'unsigned'; specVersion: string | null };

export function documentSignature(value: unknown): DocumentSignature {
  const document = isObj(value) ? value : {};
  const token = str(document.attestation);
  // Any document with a token is checked, whatever version it names: a
  // signed 1.1 document relabelled 1.0 must fail the check, not read as
  // unsigned.
  if (token) return { kind: 'signed', token, document };
  return { kind: 'unsigned', specVersion: str(document.spec_version) };
}

/**
 * qwed-verification before the #532 fix stored its copy of a document with
 * personal data replaced ("[EMAIL_REDACTED]"), after it signed it. Such a copy
 * is not the document it signed, so its hash cannot match. A server with the
 * fix (4295e18) stores the document as signed, but older records keep their
 * redacted copy. A marker makes redaction a likely cause of a mismatch, not a
 * proven one.
 */
const REDACTED = /\[[A-Z]+_REDACTED\]/g;

export function redactions(document: Obj): string[] {
  return [...new Set(JSON.stringify(document).match(REDACTED) ?? [])];
}

function at(obj: unknown, ...path: string[]): unknown {
  let cur = obj;
  for (const key of path) cur = isObj(cur) ? cur[key] : undefined;
  return cur;
}

const DOCUMENT_LABEL = 'Covers this document';

/** The hash of every field but the token, against the hash the token signs. */
async function documentItem(subtle: SubtleCrypto, document: Obj, qwed: Obj, sub: string | null): Promise<AttestationItem> {
  const item = (state: AttestationItem['state'], detail: string): AttestationItem => ({ id: 'document', label: DOCUMENT_LABEL, state, detail });
  const signed = str(qwed.document_hash);
  if (qwed.version !== SIGNED_SPEC_VERSION) {
    return item('fail', `The token signs a document of version ${String(qwed.version)}, not ${SIGNED_SPEC_VERSION}.`);
  }
  const version = document.spec_version;
  if (version !== SIGNED_SPEC_VERSION) {
    return item('fail', `The document names spec version ${String(version)}, but the token signs a ${SIGNED_SPEC_VERSION} document.`);
  }
  if (signed === null) return item('unknown', 'The token states no document hash.');
  if (sub !== signed) return item('fail', 'The token names two different documents: its sub and its document_hash differ.');
  const unsigned = Object.fromEntries(Object.entries(document).filter(([k]) => k !== 'attestation'));
  let hash: string;
  try {
    hash = await sha256Ref(subtle, canonicalJson(unsigned));
  } catch (err) {
    if (!(err instanceof CanonicalJsonError)) throw err;
    return item('fail', `The stored document cannot be encoded as the server encodes it: ${err.message}`);
  }
  if (hash === signed) return item('pass', `Every other field hashes to the signed ${signed}.`);
  const marks = redactions(unsigned);
  if (marks.length > 0) {
    return item(
      'fail',
      `The stored copy hashes to ${hash}, not the signed ${signed}. It holds redaction markers (${marks.join(', ')}): a server before the qwed-verification #532 fix replaced personal data in the copy it stored after signing, which would explain the difference; a record written by a fixed server should match. The dashboard cannot tell whether anything else changed.`,
    );
  }
  return item('fail', `The stored document hashes to ${hash}, not the signed ${signed}: it was changed after it was signed.`);
}

/** proof_ref is null in a document that is not VERIFIED, and the token signs that null. */
function proofItem(qwed: Obj, stored: unknown): AttestationItem {
  const label = 'States the stored proof_ref';
  if (!('proof_ref' in qwed)) return { id: 'proof', label, state: 'unknown', detail: 'The token does not state a proof_ref.' };
  const claim = qwed.proof_ref;
  const none = stored === null || stored === undefined;
  if (claim === null && none) {
    return { id: 'proof', label, state: 'pass', detail: 'None: the token and the document name no proof_ref.' };
  }
  if (none) return { id: 'proof', label, state: 'fail', detail: `The token states ${String(claim)}; the document has no proof_ref.` };
  return compare('proof', label, str(claim) ?? String(claim), str(stored), 'a proof_ref');
}

/**
 * Checks a document's signature against the server's keys. `subtle` is the
 * browser's Web Crypto, which exists only on HTTPS and on localhost; `now` is
 * in seconds.
 */
export async function checkDocumentSignature(
  token: string,
  document: Obj,
  jwks: Jwks,
  now: number,
  subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle,
): Promise<AttestationReport> {
  if (!subtle) return failed('This browser checks signatures only on HTTPS or on localhost.');
  const decoded = decode(token, CONTEXT_TOKEN_TYPE, 'a document signature');
  if (typeof decoded === 'string') return failed(decoded);
  const { header, claims } = decoded;
  // A QWED server names no critical extension; one the check does not know must not be ignored.
  if ('crit' in header) return failed('The signature names a critical header extension the dashboard does not support.');

  const kid = str(header.kid);
  const issuer = str(claims.iss);
  const qwed = isObj(claims.qwed) ? claims.qwed : {};
  const { key, keyOwner } = keyOf(jwks, kid);
  const items: AttestationItem[] = [
    await signatureItem(subtle, key, decoded),
    compare('issuer', 'Issued by the key’s owner', issuer, keyOwner, 'an issuer'),
    await documentItem(subtle, document, qwed, str(claims.sub)),
    compare('verdict', 'States the stored verdict', str(qwed.verdict), str(document.verdict), 'a verdict'),
    compare('admission', 'States the stored admission', str(qwed.admission), str(at(document, 'context', 'decision', 'admission')), 'an admission'),
    proofItem(qwed, at(document, 'context', 'evidence', 'proof_ref')),
    expiryItem(seconds(claims.exp), now),
  ];
  return { problem: null, items, kid, issuer, issuedAt: seconds(claims.iat), expiresAt: seconds(claims.exp) };
}

/** One sentence for the whole check; "checks out" only when every check passed. */
export function documentSignatureHeadline(report: AttestationReport): string {
  if (report.problem) return report.problem;
  const state = (id: AttestationItem['id']) => report.items.find((i) => i.id === id)?.state;
  if (state('signature') === 'fail') return 'The signature does not match: the server did not sign this token.';
  if (state('signature') === 'unknown') return 'The signature cannot be checked: the server no longer has this key.';
  const claims = report.items.filter((i) => i.id !== 'signature' && i.id !== 'expiry');
  if (claims.some((i) => i.state === 'fail')) return 'The server signed a document, but not this document as stored.';
  // Until the document's hash is compared, the token is all that was checked.
  if (state('document') !== 'pass') return 'The server signed this token, but it could not be checked against this document.';
  const partial = claims.some((i) => i.state === 'unknown');
  if (partial) return 'The server signed this document; some of what it signed could not be compared.';
  if (state('expiry') === 'fail') return 'The server issued this document as stored, but the signature has expired.';
  if (state('expiry') === 'unknown') return 'The server issued this document as stored; the signature states no expiry.';
  return 'The signature checks out: the server issued this document as stored.';
}
