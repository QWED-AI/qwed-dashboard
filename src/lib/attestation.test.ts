import { describe, expect, it } from 'vitest';
import type { Jwks } from '../api/types';
import { DID, keyPair, part, sha256Ref, signAttestation } from '../test/attest';
import { attestationHeadline, checkAttestation, type AttestationReport, type StoredFacts } from './attestation';

const NOW = 1_793_000_000;
const REQUEST = '2 + 2 = 5';
const STORED: StoredFacts = { request: REQUEST, verdict: 'VERIFIED', proofRef: 'sha256:7fa3', admissionWord: 'BLOCKED' };
const KID = `${DID}#thumb`;

async function setup() {
  const { privateKey, jwk } = await keyPair(KID);
  const jwks: Jwks = { keys: [jwk] };
  const sign = (o: { kid?: string; header?: object; claims?: object; qwed?: object } = {}) =>
    signAttestation(privateKey, { kid: KID, request: REQUEST, now: NOW, ...o });
  return { sign, jwks };
}

const states = (r: AttestationReport) => Object.fromEntries(r.items.map((i) => [i.id, i.state]));

describe('checkAttestation', () => {
  it('passes a token the server signed that matches the record', async () => {
    const { sign, jwks } = await setup();
    const r = await checkAttestation(await sign(), jwks, STORED, NOW);
    expect(r.problem).toBeNull();
    expect(states(r)).toEqual({
      signature: 'pass',
      issuer: 'pass',
      request: 'pass',
      verdict: 'pass',
      proof: 'pass',
      admission: 'pass',
      expiry: 'pass',
    });
    expect(attestationHeadline(r)).toBe('The attestation checks out: the server signed it, and it matches this record.');
    expect(r.kid).toBe(KID);
    expect(r.expiresAt).toBe(NOW + 86_400);
  });

  it('fails the signature when the claims were changed after signing', async () => {
    const { sign, jwks } = await setup();
    const [h, , s] = (await sign()).split('.');
    const forged = part({ iss: DID, sub: await sha256Ref('2 + 2 = 4'), iat: NOW, exp: NOW + 60, jti: 'x', qwed: { result: { status: 'VERIFIED' } } });
    const r = await checkAttestation(`${h}.${forged}.${s}`, jwks, STORED, NOW);
    expect(states(r).signature).toBe('fail');
    expect(attestationHeadline(r)).toMatch(/^The signature does not match/);
  });

  it('fails the signature when another key signed it under the same kid', async () => {
    const { jwks } = await setup();
    const other = await keyPair(KID);
    const r = await checkAttestation(await signAttestation(other.privateKey, { kid: KID, request: REQUEST, now: NOW }), jwks, STORED, NOW);
    expect(states(r).signature).toBe('fail');
  });

  it('cannot check the signature when the server no longer has the key', async () => {
    const { sign, jwks } = await setup();
    const r = await checkAttestation(await sign({ kid: `${DID}#rotated` }), jwks, STORED, NOW);
    expect(states(r).signature).toBe('unknown');
    expect(r.items.find((i) => i.id === 'signature')?.detail).toMatch(/rotated, or the server signs with a key it makes per process/);
    expect(attestationHeadline(r)).toBe('The signature cannot be checked: the server no longer has this key.');
  });

  it('says when a signed attestation has expired', async () => {
    const { sign, jwks } = await setup();
    const r = await checkAttestation(await sign({ claims: { exp: NOW - 1 } }), jwks, STORED, NOW);
    expect(states(r)).toMatchObject({ signature: 'pass', expiry: 'fail' });
    expect(attestationHeadline(r)).toBe('The server signed this attestation, and it matches this record, but it has expired.');
  });

  it('never says it checks out when the attestation states no expiry', async () => {
    const { sign, jwks } = await setup();
    const r = await checkAttestation(await sign({ claims: { exp: undefined } }), jwks, STORED, NOW);
    expect(states(r)).toMatchObject({ signature: 'pass', expiry: 'unknown' });
    expect(attestationHeadline(r)).toBe('The server signed this attestation, and it matches this record, but it states no expiry.');
  });

  it('names a claim it could not compare in the headline of an expired attestation', async () => {
    const { sign, jwks } = await setup();
    const r = await checkAttestation(await sign({ claims: { exp: NOW - 1 }, qwed: { proof_hash: undefined } }), jwks, STORED, NOW);
    expect(states(r)).toMatchObject({ proof: 'unknown', expiry: 'fail' });
    expect(attestationHeadline(r)).toBe('The server signed this attestation, but it has expired, and some claims could not be compared.');
  });

  it('treats a time a Date cannot hold as not stated, so formatting it cannot throw', async () => {
    const { sign, jwks } = await setup();
    const r = await checkAttestation(await sign({ claims: { iat: 1e20, exp: -1e20 } }), jwks, STORED, NOW);
    expect(r.issuedAt).toBeNull();
    expect(r.expiresAt).toBeNull();
    expect(states(r).expiry).toBe('unknown');
  });

  it('fails each claim that does not match what the record stored', async () => {
    const { sign, jwks } = await setup();
    const r = await checkAttestation(
      await sign(),
      jwks,
      { request: '2 + 2 = 4', verdict: 'UNVERIFIABLE', proofRef: 'sha256:other', admissionWord: 'ADMIT' },
      NOW,
    );
    expect(states(r)).toMatchObject({ signature: 'pass', request: 'fail', verdict: 'fail', proof: 'fail', admission: 'fail' });
    expect(r.items.find((i) => i.id === 'verdict')?.detail).toBe('The attestation says VERIFIED; the record stored UNVERIFIABLE.');
    expect(attestationHeadline(r)).toBe('The server signed this attestation, but it does not match this record.');
  });

  it('fails the issuer when it is not the key’s owner', async () => {
    const { sign, jwks } = await setup();
    const r = await checkAttestation(await sign({ claims: { iss: 'did:qwed:node:other' } }), jwks, STORED, NOW);
    expect(states(r)).toMatchObject({ signature: 'pass', issuer: 'fail' });
  });

  it('leaves a claim unchecked when either side is missing', async () => {
    const { sign, jwks } = await setup();
    const r = await checkAttestation(await sign({ qwed: { proof_hash: undefined } }), jwks, { ...STORED, admissionWord: null }, NOW);
    expect(states(r)).toMatchObject({ proof: 'unknown', admission: 'unknown' });
    expect(attestationHeadline(r)).toBe('The server signed this attestation; some claims could not be compared.');
  });

  it('refuses a token of another type and a malformed token', async () => {
    const { sign, jwks } = await setup();
    const context = await checkAttestation(await sign({ header: { typ: 'qwed-context+jwt' } }), jwks, STORED, NOW);
    expect(context.problem).toMatch(/^The stored attestation is not a verdict attestation/);
    expect(context.items).toEqual([]);
    expect((await checkAttestation('not-a-jwt', jwks, STORED, NOW)).problem).toBe('The stored attestation is not a JWT.');
    expect((await checkAttestation('a.b.c', jwks, STORED, NOW)).problem).toBe('The stored attestation could not be read.');
  });

  it('says when the browser has no Web Crypto', async () => {
    const { sign, jwks } = await setup();
    // Off HTTPS and localhost, crypto.subtle is missing.
    const r = await checkAttestation(await sign(), jwks, STORED, NOW, null as unknown as undefined);
    expect(r.problem).toBe('This browser checks signatures only on HTTPS or on localhost.');
  });
});
