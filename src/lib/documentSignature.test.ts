import { describe, expect, it } from 'vitest';
import type { Jwks } from '../api/types';
import { DID, keyPair, sha256Ref, signAttestation, signContextToken } from '../test/attest';
import { contextFixtures, type ContextFixture } from '../test/fixtures/verificationContext';
import type { AttestationReport } from './attestation';
import { canonicalJson } from './canonicalJson';
import {
  checkDocumentSignature,
  documentSignature,
  documentSignatureHeadline,
  redactions,
} from './documentSignature';

type Obj = Record<string, unknown>;

const { jwks, documents } = contextFixtures;
const docOf = (f: ContextFixture) => JSON.parse(f.row.verification_result) as Obj;
const tokenOf = (doc: Obj) => doc.attestation as string;
/** The token's iat: the fixtures' tokens last 24 hours from it. */
const issuedAt = (doc: Obj) => {
  const payload = tokenOf(doc).split('.')[1] ?? '';
  return (JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/'))) as { iat: number }).iat;
};

async function check(doc: Obj, keys: Jwks = jwks, now = issuedAt(doc) + 60) {
  return checkDocumentSignature(tokenOf(doc), doc, keys, now);
}

const states = (r: AttestationReport) => Object.fromEntries(r.items.map((i) => [i.id, i.state]));
const detail = (r: AttestationReport, id: string) => r.items.find((i) => i.id === id)?.detail ?? '';

describe('checkDocumentSignature, on documents a qwed-verification 8.0.0 server signed and stored', () => {
  it('passes every check on an admitted VERIFIED document', async () => {
    const doc = docOf(documents.admitted);
    const report = await check(doc);
    expect(report.problem).toBeNull();
    expect(states(report)).toEqual({
      signature: 'pass',
      issuer: 'pass',
      document: 'pass',
      verdict: 'pass',
      admission: 'pass',
      proof: 'pass',
      expiry: 'pass',
    });
    expect(detail(report, 'document')).toBe(`Every other field hashes to the signed ${documents.admitted.signedHash}.`);
    expect(detail(report, 'verdict')).toBe('VERIFIED');
    expect(detail(report, 'admission')).toBe('ADMIT');
    expect(report.issuer).toBe(DID);
    expect(documentSignatureHeadline(report)).toBe('The signature checks out: the server issued this document as stored.');
  });

  it('hashes a document with hard text and numbers as the server does', async () => {
    const report = await check(docOf(documents.tricky));
    expect(states(report).document).toBe('pass');
    // Not VERIFIED, so no proof_ref, and the token signs that.
    expect(detail(report, 'proof')).toBe('None: the token and the document name no proof_ref.');
    expect(documentSignatureHeadline(report)).toBe('The signature checks out: the server issued this document as stored.');
  });

  it('names redaction as the likely reason a redacted stored copy does not match', async () => {
    const f = documents.redacted;
    expect(f.storedHash).not.toBe(f.signedHash); // as the server computes them
    const report = await check(docOf(f));
    expect(states(report).signature).toBe('pass');
    expect(states(report).document).toBe('fail');
    expect(detail(report, 'document')).toBe(
      `The stored copy hashes to ${f.storedHash}, not the signed ${f.signedHash}. It holds redaction markers ([EMAIL_REDACTED]): the server replaces personal data in the copy it stores after signing, which would explain the difference. The dashboard cannot tell whether anything else changed.`,
    );
    expect(documentSignatureHeadline(report)).toBe('The server signed a document, but not this document as stored.');
  });

  it('fails a document changed after it was signed', async () => {
    const doc = docOf(documents.admitted);
    const changed = { ...doc, object: { ...(doc.object as Obj), formal_statement: '2 + 2 = 5' } };
    const report = await check(changed);
    expect(states(report).document).toBe('fail');
    expect(detail(report, 'document')).toMatch(/: it was changed after it was signed\.$/);
    // A changed verdict fails its own check too.
    const relabelled = await check({ ...doc, verdict: 'UNVERIFIABLE' });
    expect(states(relabelled)).toMatchObject({ document: 'fail', verdict: 'fail' });
  });

  it('fails a signed document relabelled spec 1.0, rather than reading it as unsigned', async () => {
    const doc = { ...docOf(documents.admitted), spec_version: '1.0' };
    expect(documentSignature(doc).kind).toBe('signed');
    const report = await check(doc);
    expect(states(report)).toMatchObject({ signature: 'pass', document: 'fail' });
    expect(detail(report, 'document')).toBe('The document names spec version 1.0, but the token signs a 1.1 document.');
    expect(documentSignatureHeadline(report)).toBe('The server signed a document, but not this document as stored.');
  });

  it('says when the signature has expired, and still what the server signed', async () => {
    const doc = docOf(documents.admitted);
    const report = await check(doc, jwks, issuedAt(doc) + 2 * 86_400);
    expect(states(report)).toMatchObject({ signature: 'pass', document: 'pass', expiry: 'fail' });
    expect(documentSignatureHeadline(report)).toBe('The server issued this document as stored, but the signature has expired.');
  });

  it('cannot check a key the server no longer publishes, and fails another key’s', async () => {
    const doc = docOf(documents.admitted);
    const gone = await check(doc, { keys: [] });
    expect(states(gone).signature).toBe('unknown');
    expect(documentSignatureHeadline(gone)).toBe('The signature cannot be checked: the server no longer has this key.');
    const kid = jwks.keys[0]?.kid ?? '';
    const { jwk } = await keyPair(kid);
    const other = await check(doc, { keys: [jwk] });
    expect(states(other).signature).toBe('fail');
    expect(documentSignatureHeadline(other)).toBe('The signature does not match: the server did not sign this token.');
  });

  it('needs Web Crypto', async () => {
    const doc = docOf(documents.admitted);
    // Off HTTPS and localhost, crypto.subtle is missing.
    const report = await checkDocumentSignature(tokenOf(doc), doc, jwks, 0, null as unknown as undefined);
    expect(report.problem).toBe('This browser checks signatures only on HTTPS or on localhost.');
  });
});

describe('checkDocumentSignature, on tokens made for the test', () => {
  const KID = `${DID}#test-key`;
  const now = 1_800_000_000;

  async function signed(doc: Obj, options: { header?: object; claims?: object; qwed?: object } = {}) {
    const { privateKey, jwk } = await keyPair(KID);
    const documentHash = await sha256Ref(canonicalJson(doc));
    const token = await signContextToken(privateKey, { kid: KID, documentHash, now, ...options });
    return { report: await checkDocumentSignature(token, { ...doc, attestation: token }, { keys: [jwk] }, now), documentHash };
  }

  const doc: Obj = {
    spec_version: '1.1',
    object: { formal_statement: 's' },
    context: { decision: { admission: 'DENY' }, evidence: { proof_ref: null } },
    verdict: 'UNVERIFIABLE',
  };

  it('passes a document the test key signed', async () => {
    expect(documentSignatureHeadline((await signed(doc)).report)).toBe(
      'The signature checks out: the server issued this document as stored.',
    );
  });

  it('refuses a verdict’s attestation in a document', async () => {
    const { privateKey, jwk } = await keyPair(KID);
    const token = await signAttestation(privateKey, { kid: KID, request: 's', now });
    const report = await checkDocumentSignature(token, { ...doc, attestation: token }, { keys: [jwk] }, now);
    expect(report.problem).toBe('The stored attestation is not a document signature (alg ES256, typ qwed-attestation+jwt).');
  });

  it('refuses a token with a critical header extension', async () => {
    const { report } = await signed(doc, { header: { crit: ['x'] } });
    expect(report.problem).toBe('The signature names a critical header extension the dashboard does not support.');
  });

  it('fails a token for another version, or one whose sub and document_hash differ', async () => {
    const version = (await signed(doc, { qwed: { version: '1.0' } })).report;
    expect(detail(version, 'document')).toBe('The token signs a document of version 1.0, not 1.1.');
    const sub = (await signed(doc, { claims: { sub: 'sha256:other' } })).report;
    expect(detail(sub, 'document')).toBe('The token names two different documents: its sub and its document_hash differ.');
    const none = (await signed(doc, { qwed: { document_hash: undefined } })).report;
    expect(states(none).document).toBe('unknown');
    // Only the token was checked, so the headline does not say the document was.
    expect(documentSignatureHeadline(none)).toBe(
      'The server signed this token, but it could not be checked against this document.',
    );
  });

  it('compares the admission and proof_ref the token states with the document’s', async () => {
    const r = (await signed(doc, { qwed: { admission: 'ADMIT', proof_ref: 'sha256:abc' } })).report;
    expect(detail(r, 'admission')).toBe('The attestation says ADMIT; the record stored DENY.');
    expect(detail(r, 'proof')).toBe('The token states sha256:abc; the document has no proof_ref.');
    const unstated = (await signed(doc, { qwed: { proof_ref: undefined } })).report;
    expect(detail(unstated, 'proof')).toBe('The token does not state a proof_ref.');
    expect(documentSignatureHeadline(unstated)).toBe(
      'The server signed this document; some of what it signed could not be compared.',
    );
  });

  it('fails a document the server could not have encoded', async () => {
    const { privateKey, jwk } = await keyPair(KID);
    const token = await signContextToken(privateKey, { kid: KID, documentHash: 'sha256:x', now });
    const bad = { ...doc, object: { formal_statement: '\ud800' }, attestation: token };
    const report = await checkDocumentSignature(token, bad, { keys: [jwk] }, now);
    expect(detail(report, 'document')).toBe(
      'The stored document cannot be encoded as the server encodes it: A string holds a lone surrogate.',
    );
  });
});

describe('documentSignature and redactions', () => {
  it('finds a document’s token whatever version it names', () => {
    const doc = docOf(documents.admitted);
    expect(documentSignature(doc).kind).toBe('signed');
    expect(documentSignature({ ...doc, spec_version: '1.0' }).kind).toBe('signed');
    const { attestation: _, ...unsigned } = doc;
    expect(documentSignature({ ...unsigned, spec_version: '1.0' })).toEqual({ kind: 'unsigned', specVersion: '1.0' });
    expect(documentSignature({ ...doc, attestation: '' })).toEqual({ kind: 'unsigned', specVersion: '1.1' });
    expect(documentSignature(null)).toEqual({ kind: 'unsigned', specVersion: null });
  });

  it('lists each redaction marker once', () => {
    expect(redactions(docOf(documents.redacted))).toEqual(['[EMAIL_REDACTED]']);
    expect(redactions({ a: '[PHONE_REDACTED] [IP_REDACTED] [PHONE_REDACTED]' })).toEqual(['[PHONE_REDACTED]', '[IP_REDACTED]']);
    expect(redactions(docOf(documents.admitted))).toEqual([]);
  });
});
