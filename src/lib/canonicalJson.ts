// The canonical JSON qwed-verification hashes a Verification Context document
// with (verification_context._canonical_json, #54). A document's signature
// covers the SHA-256 of this text, so it must match the server's byte for
// byte: keys sorted by their UTF-16 code units, numbers written as
// ECMAScript writes them, strings as Python's json.dumps(ensure_ascii=False)
// writes them, and no white space. Text the server refuses to encode (a
// number that is not finite, a lone surrogate) is refused here too.

export class CanonicalJsonError extends Error {}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** UTF-16 code unit order, which is how the server sorts keys (by their UTF-16-BE bytes). */
function byCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function encodeString(value: string): string {
  if (LONE_SURROGATE.test(value)) throw new CanonicalJsonError('A string holds a lone surrogate.');
  // JSON.stringify escapes exactly what json.dumps(ensure_ascii=False) does:
  // the quote, the backslash and the control characters, in lower-case hex.
  return JSON.stringify(value);
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CanonicalJsonError('A number is not finite.');
    // ECMAScript's Number::toString, which the server reproduces; it writes -0 as 0.
    return String(value);
  }
  if (typeof value === 'string') return encodeString(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const members = Object.keys(obj)
      .sort(byCodeUnits)
      .map((k) => `${encodeString(k)}:${canonicalJson(obj[k])}`);
    return `{${members.join(',')}}`;
  }
  throw new CanonicalJsonError(`A value of type ${typeof value} cannot be encoded.`);
}
