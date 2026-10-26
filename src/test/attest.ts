import type { Jwk } from '../api/types';
import { ATTESTATION_TYPE } from '../lib/attestation';

// Signs attestations shaped as qwed-verification signs them, with a key made
// for the test, so the check runs against real ES256 signatures.

const subtle = globalThis.crypto.subtle;
export const DID = 'did:qwed:node:local';

export const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

export const part = (obj: unknown) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

export async function sha256Ref(text: string) {
  const d = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return `sha256:${Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function keyPair(kid: string): Promise<{ privateKey: CryptoKey; jwk: Jwk }> {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', pair.publicKey);
  return { privateKey: pair.privateKey, jwk: { kid, kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, alg: 'ES256', use: 'sig' } };
}

/** A token for `request`, with any header, claim or qwed claim overridden. */
export async function signAttestation(
  privateKey: CryptoKey,
  {
    kid,
    request,
    now,
    header = {},
    claims = {},
    qwed = {},
  }: { kid: string; request: string; now: number; header?: object; claims?: object; qwed?: object },
) {
  const h = part({ alg: 'ES256', kid, typ: ATTESTATION_TYPE, ...header });
  const p = part({
    iss: DID,
    sub: await sha256Ref(request),
    iat: now - 60,
    exp: now + 86_400,
    jti: 'att_1',
    qwed: {
      version: '1.0',
      result: { status: 'VERIFIED', verified: false, engine: 'math', confidence: 1 },
      query_hash: await sha256Ref(request),
      proof_hash: 'sha256:7fa3',
      admission: 'BLOCKED',
      ...qwed,
    },
    ...claims,
  });
  const sig = new Uint8Array(
    await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(`${h}.${p}`)),
  );
  return `${h}.${p}.${b64url(sig)}`;
}
