import type { Jwk, Jwks, Verdict } from '../api/types';

// Checks the attestation a record stored (#39): the JWT the server signs for a
// VERIFIED result. It runs in the browser with the server's public keys, the
// way any consumer can check one: the ES256 signature, the header type, the
// issuer, the expiry, and whether the claims agree with what the record
// stored. It reports what it found; it never works out a verdict or an
// admission.

/** The header type of a verdict's attestation (qwed-verification attestation.py). */
export const ATTESTATION_TYPE = 'qwed-attestation+jwt';

export type CheckState = 'pass' | 'fail' | 'unknown';

export interface AttestationItem {
  /** `document` is a Verification Context document's signature only (#54). */
  id: 'signature' | 'issuer' | 'request' | 'document' | 'verdict' | 'proof' | 'admission' | 'expiry';
  label: string;
  state: CheckState;
  detail: string;
}

export interface AttestationReport {
  /** Why nothing could be checked, or null when the checks ran. */
  problem: string | null;
  items: AttestationItem[];
  kid: string | null;
  issuer: string | null;
  /** Seconds since the epoch, as the token states them; null when absent or not a time a Date can hold. */
  issuedAt: number | null;
  expiresAt: number | null;
}

/** What the record stored, to compare the claims with. */
export interface StoredFacts {
  request: string;
  verdict: Verdict | null;
  proofRef: string | null;
  /** The admission word as the server stored it: ADMIT, or BLOCKED for DENY. */
  admissionWord: string | null;
}

type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
export const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** The largest time a Date can hold, in seconds: a larger one throws when formatted. */
const MAX_SECONDS = 8.64e12;
export const seconds = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_SECONDS ? v : null;

/** Base64url to bytes; throws on text that is not base64url. */
function fromBase64Url(part: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(part)) throw new Error('not base64url');
  const b64 = part.replaceAll('-', '+').replaceAll('_', '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  // atob gives one character per byte, each below 256.
  return Uint8Array.from(bin, (c) => c.codePointAt(0) ?? 0);
}

function decodeJson(part: string): Obj | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(part)));
    return isObj(value) ? value : null;
  } catch {
    return null;
  }
}

export async function sha256Ref(subtle: SubtleCrypto, text: string): Promise<string> {
  const digest = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return `sha256:${Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export const failed = (problem: string): AttestationReport => ({
  problem,
  items: [],
  kid: null,
  issuer: null,
  issuedAt: null,
  expiresAt: null,
});

const isoOf = (s: number) => new Date(s * 1000).toISOString().replace('.000Z', 'Z');

/** One comparison of a claim with what the record stored. */
export function compare(
  id: AttestationItem['id'],
  label: string,
  claim: string | null,
  stored: string | null,
  what: string,
): AttestationItem {
  if (claim === null) return { id, label, state: 'unknown', detail: `The attestation does not state ${what}.` };
  if (stored === null) return { id, label, state: 'unknown', detail: `The record did not store ${what}.` };
  if (claim === stored) return { id, label, state: 'pass', detail: claim };
  return { id, label, state: 'fail', detail: `The attestation says ${claim}; the record stored ${stored}.` };
}

export interface Decoded {
  header: Obj;
  claims: Obj;
  signingInput: string;
  signature: string;
}

/** The token's parts, or why it cannot be checked: `type` is the header typ it must have, `kind` names it. */
export function decode(token: string, type = ATTESTATION_TYPE, kind = 'a verdict attestation'): Decoded | string {
  const parts = token.split('.');
  const [h, p, s] = parts;
  if (parts.length !== 3 || h === undefined || p === undefined || s === undefined) return 'The stored attestation is not a JWT.';
  const header = decodeJson(h);
  const claims = decodeJson(p);
  if (!header || !claims) return 'The stored attestation could not be read.';
  if (header.alg !== 'ES256' || header.typ !== type) {
    return `The stored attestation is not ${kind} (alg ${String(header.alg)}, typ ${String(header.typ)}).`;
  }
  return { header, claims, signingInput: `${h}.${p}`, signature: s };
}

const SIGNATURE_LABEL = 'Signed with the server’s key';

/** The ES256 signature, checked with the JWKS key named by the token's kid. */
export async function signatureItem(subtle: SubtleCrypto, key: Jwk | undefined, token: Decoded): Promise<AttestationItem> {
  if (!key) {
    return {
      id: 'signature',
      label: SIGNATURE_LABEL,
      state: 'unknown',
      detail:
        'The server’s keys do not include this key. It was rotated, or the server signs with a key it makes per process and has restarted since.',
    };
  }
  let valid = false;
  try {
    const publicKey = await subtle.importKey(
      'jwk',
      { kty: key.kty, crv: key.crv, x: key.x, y: key.y },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const signature = fromBase64Url(token.signature);
    valid =
      signature.length === 64 &&
      (await subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signature,
        new TextEncoder().encode(token.signingInput),
      ));
  } catch {
    valid = false;
  }
  return {
    id: 'signature',
    label: SIGNATURE_LABEL,
    state: valid ? 'pass' : 'fail',
    detail: valid
      ? 'The ES256 signature matches the server’s public key.'
      : 'The signature does not match the server’s public key: the token was changed, or another key signed it.',
  };
}

export function expiryItem(expiresAt: number | null, now: number): AttestationItem {
  const label = 'Not expired';
  if (expiresAt === null) return { id: 'expiry', label, state: 'unknown', detail: 'The attestation states no expiry the dashboard can read.' };
  if (now < expiresAt) return { id: 'expiry', label, state: 'pass', detail: `Valid until ${isoOf(expiresAt)}.` };
  return {
    id: 'expiry',
    label,
    state: 'fail',
    detail: `Expired at ${isoOf(expiresAt)}. A consumer no longer accepts it; the signature still shows what the server signed.`,
  };
}

/** The JWKS key a token's kid names, and the DID that owns it. */
export function keyOf(jwks: Jwks, kid: string | null): { key: Jwk | undefined; keyOwner: string | null } {
  // The key ID is the issuer's DID and the key's thumbprint, "<did>#<thumbprint>".
  return { key: jwks.keys.find((k) => kid !== null && k.kid === kid), keyOwner: kid?.split('#')[0] ?? null };
}

/**
 * Checks a stored attestation against the server's keys and the record.
 * `subtle` is the browser's Web Crypto, which exists only on HTTPS and on
 * localhost; `now` is in seconds.
 */
export async function checkAttestation(
  token: string,
  jwks: Jwks,
  stored: StoredFacts,
  now: number,
  subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle,
): Promise<AttestationReport> {
  if (!subtle) return failed('This browser checks signatures only on HTTPS or on localhost.');
  const decoded = decode(token);
  if (typeof decoded === 'string') return failed(decoded);

  const { header, claims } = decoded;
  const kid = str(header.kid);
  const issuer = str(claims.iss);
  const expiresAt = seconds(claims.exp);
  const qwed = isObj(claims.qwed) ? claims.qwed : {};
  const result = isObj(qwed.result) ? qwed.result : {};
  const { key, keyOwner } = keyOf(jwks, kid);

  const items: AttestationItem[] = [
    await signatureItem(subtle, key, decoded),
    compare('issuer', 'Issued by the key’s owner', issuer, keyOwner, 'an issuer'),
    compare('request', 'About this record’s request', str(claims.sub), await sha256Ref(subtle, stored.request), 'a request'),
    compare('verdict', 'States the stored verdict', str(result.status), stored.verdict, 'a verdict'),
    compare('proof', 'States the stored proof_ref', str(qwed.proof_hash), stored.proofRef, 'a proof_ref'),
    compare('admission', 'States the stored admission', str(qwed.admission), stored.admissionWord, 'an admission'),
    expiryItem(expiresAt, now),
  ];
  return { problem: null, items, kid, issuer, issuedAt: seconds(claims.iat), expiresAt };
}

/**
 * One sentence for the whole check. It says "checks out" only when every
 * check passed; a check that could not be made stays named in it.
 */
export function attestationHeadline(report: AttestationReport): string {
  if (report.problem) return report.problem;
  const state = (id: AttestationItem['id']) => report.items.find((i) => i.id === id)?.state;
  if (state('signature') === 'fail') return 'The signature does not match: this is not the attestation the server signed.';
  if (state('signature') === 'unknown') return 'The signature cannot be checked: the server no longer has this key.';
  const claims = report.items.filter((i) => i.id !== 'signature' && i.id !== 'expiry');
  if (claims.some((i) => i.state === 'fail')) return 'The server signed this attestation, but it does not match this record.';
  const partial = claims.some((i) => i.state === 'unknown');
  if (state('expiry') === 'fail') {
    return partial
      ? 'The server signed this attestation, but it has expired, and some claims could not be compared.'
      : 'The server signed this attestation, and it matches this record, but it has expired.';
  }
  if (partial) return 'The server signed this attestation; some claims could not be compared.';
  if (state('expiry') === 'unknown') return 'The server signed this attestation, and it matches this record, but it states no expiry.';
  return 'The attestation checks out: the server signed it, and it matches this record.';
}
