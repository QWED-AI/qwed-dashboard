import { describe, expect, it } from 'vitest';
import type { Verdict } from '../api/types';
import { bucketLabel, bucketName, comparedText, countBy, niceScale, overviewWindow } from './overview';
import { parseResult, type LedgerRecord } from './result';

const rec = (createdAt: string, verdict: Verdict | null, domain = 'MATH', admission?: string): LedgerRecord => {
  const result = parseResult(JSON.stringify({ status: verdict ?? 'SAT', ...(admission ? { admission } : {}) }));
  return { id: createdAt, query: 'q', domain, createdAt, apiKeyId: null, result, raw: '' };
};

describe('overviewWindow', () => {
  it('ends with the hour of the newest record and counts each hour by verdict', () => {
    const w = overviewWindow(
      [rec('2026-10-20T09:41:12', 'BLOCKED'), rec('2026-10-20T09:05:00', 'VERIFIED'), rec('2026-10-20T07:59:59', null)],
      '24h',
      true,
    );
    if (!w) throw new Error('no window');
    expect(w.buckets).toHaveLength(24);
    expect(new Date(w.end).toISOString()).toBe('2026-10-20T10:00:00.000Z');
    expect(new Date(w.start).toISOString()).toBe('2026-10-19T10:00:00.000Z');
    const nine = w.buckets.at(-1);
    expect(nine && { blocked: nine.blocked, verified: nine.verified, total: nine.total }).toEqual({ blocked: 1, verified: 1, total: 2 });
    expect(w.buckets.at(-3)?.none).toBe(1);
    expect(w.totals).toEqual({ verified: 1, unverifiable: 0, blocked: 1, none: 1, denied: 0, total: 3 });
  });

  it('counts the stored DENY admissions across verdicts, a stored BLOCKED included (#38)', () => {
    const w = overviewWindow(
      [
        rec('2026-10-20T09:41:12', 'VERIFIED', 'MATH', 'BLOCKED'),
        rec('2026-10-20T09:30:00', 'UNVERIFIABLE', 'MATH', 'DENY'),
        rec('2026-10-20T09:20:00', 'VERIFIED', 'MATH', 'ADMIT'),
        rec('2026-10-20T09:10:00', 'VERIFIED'),
      ],
      '24h',
      true,
    );
    if (!w) throw new Error('no window');
    expect(w.totals).toEqual({ verified: 3, unverifiable: 1, blocked: 0, none: 0, denied: 2, total: 4 });
    expect(w.buckets.at(-1)?.denied).toBe(2);
  });

  it('ends with the day of the newest record for seven days', () => {
    const w = overviewWindow([rec('2026-10-20T09:41:12', 'VERIFIED'), rec('2026-10-14T00:00:00', 'VERIFIED')], '7d', true);
    expect(w?.buckets).toHaveLength(7);
    expect(new Date(w?.start ?? 0).toISOString()).toBe('2026-10-14T00:00:00.000Z');
    expect(w?.buckets[0]?.total).toBe(1);
    expect(w?.totals.total).toBe(2);
  });

  it('leaves out records older than the window and counts the window before', () => {
    const w = overviewWindow(
      [rec('2026-10-20T09:00:00', 'VERIFIED'), rec('2026-10-19T09:30:00', 'VERIFIED'), rec('2026-10-18T09:00:00', 'VERIFIED')],
      '24h',
      true,
    );
    expect(w?.records.map((r) => r.createdAt)).toEqual(['2026-10-20T09:00:00']);
    // 19 Oct 09:30 is in the 24 hours before; 18 Oct 09:00 is older still.
    expect(w?.previousTotal).toBe(1);
    expect(w?.reachesBackTo).toBeNull();
  });

  it('does not compare when the loaded records may not reach the window before', () => {
    // The window starts 19 Oct 10:00 and reaches back to 18 Oct 10:00 for
    // the one before; the loaded records stop at 19 Oct 08:00.
    const w = overviewWindow([rec('2026-10-20T09:00:00', 'VERIFIED'), rec('2026-10-19T08:00:00', 'VERIFIED')], '24h', false);
    expect(w?.previousTotal).toBeNull();
    expect(w?.reachesBackTo).toBeNull();
  });

  it('says how far back the loaded records reach when older ones may be missing', () => {
    const w = overviewWindow([rec('2026-10-20T09:00:00', 'VERIFIED'), rec('2026-10-20T03:00:00', 'VERIFIED')], '7d', false);
    expect(new Date(w?.reachesBackTo ?? 0).toISOString()).toBe('2026-10-20T03:00:00.000Z');
  });

  it('does not count a record at exactly a window start as proof the window is loaded', () => {
    // A next page may hold more records with that same time.
    const atStart = overviewWindow([rec('2026-10-20T09:00:00', 'VERIFIED'), rec('2026-10-19T10:00:00', 'VERIFIED')], '24h', false);
    expect(new Date(atStart?.reachesBackTo ?? 0).toISOString()).toBe('2026-10-19T10:00:00.000Z');
    expect(atStart?.previousTotal).toBeNull();

    const atPreviousStart = overviewWindow([rec('2026-10-20T09:00:00', 'VERIFIED'), rec('2026-10-18T10:00:00', 'VERIFIED')], '24h', false);
    expect(atPreviousStart?.reachesBackTo).toBeNull();
    expect(atPreviousStart?.previousTotal).toBeNull();

    const older = overviewWindow([rec('2026-10-20T09:00:00', 'VERIFIED'), rec('2026-10-18T09:59:59', 'VERIFIED')], '24h', false);
    expect(older?.previousTotal).toBe(0);
  });

  it('is null when no record has a readable time', () => {
    expect(overviewWindow([rec('not a date', 'VERIFIED')], '24h', true)).toBeNull();
    expect(overviewWindow([], '24h', true)).toBeNull();
  });
});

describe('bucket names', () => {
  it('names an hour and a day in UTC', () => {
    const hour = { start: Date.UTC(2026, 9, 20, 9), end: Date.UTC(2026, 9, 20, 10), verified: 0, unverifiable: 0, blocked: 0, none: 0, denied: 0, total: 0 };
    expect(bucketLabel(hour, '24h')).toBe('09:00');
    expect(bucketName(hour, '24h')).toBe('20 Oct, 09:00 to 10:00 UTC');
    expect(bucketLabel(hour, '7d')).toBe('20 Oct');
    expect(bucketName(hour, '7d')).toBe('20 Oct UTC');
  });
});

describe('countBy', () => {
  it('counts most first, ties in key order', () => {
    expect(countBy(['b', 'a', 'b', 'c', 'a'], (x) => x)).toEqual([
      { key: 'a', n: 2 },
      { key: 'b', n: 2 },
      { key: 'c', n: 1 },
    ]);
  });
});

describe('niceScale', () => {
  it('rounds the axis top up to a step of 1, 2 or 5 times a power of ten', () => {
    expect(niceScale(0)).toEqual({ top: 1, step: 1 });
    expect(niceScale(3)).toEqual({ top: 3, step: 1 });
    expect(niceScale(7)).toEqual({ top: 8, step: 2 });
    expect(niceScale(34)).toEqual({ top: 40, step: 10 });
    expect(niceScale(180)).toEqual({ top: 200, step: 50 });
  });
});

describe('comparedText', () => {
  it('says more, fewer or the same, and nothing when it cannot compare', () => {
    expect(comparedText(12, 10, '24 hours')).toBe('20% more than the 24 hours before');
    expect(comparedText(9, 10, '7 days')).toBe('10% fewer than the 7 days before');
    expect(comparedText(10, 10, '7 days')).toBe('The same as the 7 days before');
    expect(comparedText(4, 0, '24 hours')).toBe('None in the 24 hours before');
    expect(comparedText(0, 0, '24 hours')).toBeNull();
    expect(comparedText(4, null, '24 hours')).toBeNull();
  });
});
