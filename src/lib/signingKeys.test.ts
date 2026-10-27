// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { compareKeys, readSeenKeys, writeSeenKeys, type SeenKeys } from './signingKeys';

const NONE: SeenKeys = { keys: {}, gone: [] };
const t1 = '2026-10-26T10:00:00.000Z';
const t2 = '2026-10-26T11:00:00.000Z';
const t3 = '2026-10-26T12:00:00.000Z';

afterEach(() => localStorage.clear());

describe('compareKeys (#55)', () => {
  it('records when each key was first seen, and keeps that time on later loads', () => {
    const first = compareKeys(NONE, [{ kid: 'a' }, { kid: 'b' }], t1);
    expect(first).toEqual({ keys: { a: t1, b: t1 }, gone: [] });
    expect(compareKeys(first, [{ kid: 'a' }, { kid: 'b' }], t2)).toEqual(first);
  });

  it('reports a key no longer published, with when it was first seen and found gone', () => {
    const before = compareKeys(NONE, [{ kid: 'a' }], t1);
    const after = compareKeys(before, [{ kid: 'b' }], t2);
    expect(after).toEqual({ keys: { b: t2 }, gone: [{ kid: 'a', firstSeen: t1, goneBy: t2 }] });
  });

  it('keeps a gone key across loads until it is dismissed, and drops it if it is published again', () => {
    const gone = compareKeys(compareKeys(NONE, [{ kid: 'a' }], t1), [{ kid: 'b' }], t2);
    expect(compareKeys(gone, [{ kid: 'b' }], t3).gone).toEqual([{ kid: 'a', firstSeen: t1, goneBy: t2 }]);
    const back = compareKeys(gone, [{ kid: 'a' }, { kid: 'b' }], t3);
    expect(back.gone).toEqual([]);
    expect(back.keys).toEqual({ a: t1, b: t2 });
  });

  it('ignores a key with no id, which cannot be told apart from others', () => {
    expect(compareKeys(NONE, [{ kty: 'EC' }, { kid: '' }], t1)).toEqual(NONE);
  });
});

describe('the stored keys', () => {
  it('reads back what it writes', () => {
    const seen: SeenKeys = { keys: { b: t2 }, gone: [{ kid: 'a', firstSeen: t1, goneBy: t2 }] };
    writeSeenKeys(seen);
    expect(readSeenKeys()).toEqual(seen);
  });

  it('starts afresh from storage it cannot read', () => {
    localStorage.setItem('qwed-dashboard.signing-keys', 'not json');
    expect(readSeenKeys()).toEqual(NONE);
    localStorage.setItem('qwed-dashboard.signing-keys', JSON.stringify({ keys: { a: 1 }, gone: [{ kid: 'x' }] }));
    expect(readSeenKeys()).toEqual(NONE);
  });
});
