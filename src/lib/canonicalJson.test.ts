import { describe, expect, it } from 'vitest';
import { contextFixtures } from '../test/fixtures/verificationContext';
import { canonicalJson, CanonicalJsonError } from './canonicalJson';

const stored = (name: keyof typeof contextFixtures.documents) => {
  const doc = JSON.parse(contextFixtures.documents[name].row.verification_result) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(doc).filter(([k]) => k !== 'attestation'));
};

describe('canonicalJson', () => {
  it('encodes the documents a server stored exactly as qwed-verification does', () => {
    for (const name of ['admitted', 'tricky', 'redacted'] as const) {
      expect(canonicalJson(stored(name))).toBe(contextFixtures.documents[name].storedCanonical);
    }
  });

  it('sorts keys by UTF-16 code units, not code points', () => {
    // U+1F600 is a surrogate pair, D83D DE00, so it sorts before U+FF61.
    expect(canonicalJson({ '｡': 1, '😀': 2, é: 3, a: 4, A: 5, '': 6 })).toBe('{"":6,"A":5,"a":4,"é":3,"😀":2,"｡":1}');
  });

  it('writes numbers as ECMAScript does', () => {
    expect(canonicalJson([1, 1.5, 2.0, -0, 0.1, 1e-7, 1e21, 5e-324, 123456789.125])).toBe(
      '[1,1.5,2,0,0.1,1e-7,1e+21,5e-324,123456789.125]',
    );
  });

  it('writes strings as json.dumps(ensure_ascii=False) does, without white space', () => {
    expect(canonicalJson({ s: 'tab\there "q" \\ \u0001   ü 😀', l: [true, false, null, {}, []] })).toBe(
      '{"l":[true,false,null,{},[]],"s":"tab\\there \\"q\\" \\\\ \\u0001   ü 😀"}',
    );
  });

  it('refuses what the server refuses to encode', () => {
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(CanonicalJsonError);
    expect(() => canonicalJson([Infinity])).toThrow(CanonicalJsonError);
    expect(() => canonicalJson('\ud800 alone')).toThrow(CanonicalJsonError);
    expect(() => canonicalJson({ '\udc00': 1 })).toThrow(CanonicalJsonError);
    expect(() => canonicalJson(undefined)).toThrow(CanonicalJsonError);
  });
});
