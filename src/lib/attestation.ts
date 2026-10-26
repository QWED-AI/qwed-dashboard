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
  id: 'signature' | 'issuer' | 'request' | 'verdict' | 'proof' | 'admission' | 'expiry';
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
  /** Seconds since the epoch, as the token states them. */
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
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Base64url to bytes; throws on text that is not base64url. */
function fromBase64Url(part: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(part)) throw new Error('not base64url');
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decodeJson(part: string): Obj | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(part)));
    return isObj(value) ? value : null;
  } catch {
    return null;
  }
}

async function sha256Ref(subtle: SubtleCrypto, text: string): Promise<string> {
  const digest = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return `sha256:${Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

const failed = (problem: string): AttestationReport => ({
  problem,
  items: [],
  kid: null,
  issuer: null,
  issuedAt: null,
  expiresAt: null,
});

/** One comparison of a claim with what the record stored. */
function compare(
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
  const parts = token.split('.');
  const [h, p, s] = parts;
  if (parts.length !== 3 || h === undefined || p === undefined || s === undefined) {
    return failed('The stored attestation is not a JWT.');
  }
  const header = decodeJson(h);
  const claims = decodeJson(p);
  if (!header || !claims) return failed('The stored attestation could not be read.');
  if (header.alg !== 'ES256' || header.typ !== ATTESTATION_TYPE) {
    return failed(`The stored attestation is not a verdict attestation (alg ${String(header.alg)}, typ ${String(header.typ)}).`);
  }

  const kid = str(header.kid);
  const issuer = str(claims.iss);
  const issuedAt = num(claims.iat);
  const expiresAt = num(claims.exp);
  const qwed = isObj(claims.qwed) ? claims.qwed : {};
  const result = isObj(qwed.result) ? qwed.result : {};

  const items: AttestationItem[] = [];
  const key: Jwk | undefined = kid === null ? undefined : jwks.keys.find((k) => k.kid === kid);
  if (!key) {
    items.push({
      id: 'signature',
      label: 'Signed with the server’s key',
      state: 'unknown',
      detail:
        'The server’s keys do not include this key. It was rotated, or the server signs with a key it makes per process and has restarted since.',
    });
  } else {
    let valid: boolean;
    try {
      const publicKey = await subtle.importKey(
        'jwk',
        { kty: key.kty, crv: key.crv, x: key.x, y: key.y },
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
      const signature = fromBase64Url(s);
      valid =
        signature.length === 64 &&
        (await subtle.verify(
          { name: 'ECDSA', hash: 'SHA-256' },
          publicKey,
          signature,
          new TextEncoder().encode(`${h}.${p}`),
        ));
    } catch {
      valid = false;
    }
    items.push({
      id: 'signature',
      label: 'Signed with the server’s key',
      state: valid ? 'pass' : 'fail',
      detail: valid
        ? 'The ES256 signature matches the server’s public key.'
        : 'The signature does not match the server’s public key: the token was changed, or another key signed it.',
    });
  }

  // The key ID is the issuer's DID and the key's thumbprint, "<did>#<thumbprint>".
  const keyOwner = kid?.split('#')[0] ?? null;
  items.push(compare('issuer', 'Issued by the key’s owner', issuer, keyOwner, 'an issuer'));
  items.push(compare('request', 'About this record’s request', str(claims.sub), await sha256Ref(subtle, stored.request), 'a request'));
  items.push(compare('verdict', 'States the stored verdict', str(result.status), stored.verdict, 'a verdict'));
  items.push(compare('proof', 'States the stored proof_ref', str(qwed.proof_hash), stored.proofRef, 'a proof_ref'));
  items.push(compare('admission', 'States the stored admission', str(qwed.admission), stored.admissionWord, 'an admission'));

  if (expiresAt === null) {
    items.push({ id: 'expiry', label: 'Not expired', state: 'unknown', detail: 'The attestation states no expiry.' });
  } else if (now < expiresAt) {
    items.push({ id: 'expiry', label: 'Not expired', state: 'pass', detail: `Valid until ${isoOf(expiresAt)}.` });
  } else {
    items.push({
      id: 'expiry',
      label: 'Not expired',
      state: 'fail',
      detail: `Expired at ${isoOf(expiresAt)}. A consumer no longer accepts it; the signature still shows what the server signed.`,
    });
  }

  return { problem: null, items, kid, issuer, issuedAt, expiresAt };
}

const isoOf = (seconds: number) => `${new Date(seconds * 1000).toISOString().replace('.000Z', 'Z')}`;

/** One sentence for the whole check. */
export function attestationHeadline(report: AttestationReport): string {
  if (report.problem) return report.problem;
  const state = (id: AttestationItem['id']) => report.items.find((i) => i.id === id)?.state;
  if (state('signature') === 'fail') return 'The signature does not match: this is not the attestation the server signed.';
  if (state('signature') === 'unknown') return 'The signature cannot be checked: the server no longer has this key.';
  const claims = report.items.filter((i) => i.id !== 'signature' && i.id !== 'expiry');
  if (claims.some((i) => i.state === 'fail')) return 'The server signed this attestation, but it does not match this record.';
  if (state('expiry') === 'fail') return 'The server signed this attestation, and it matches this record, but it has expired.';
  if (claims.some((i) => i.state === 'unknown')) return 'The server signed this attestation; some claims could not be compared.';
  return 'The attestation checks out: the server signed it, and it matches this record.';
}
