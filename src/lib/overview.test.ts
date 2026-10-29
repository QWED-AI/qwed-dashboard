import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Verdict } from '../api/types';
import {
  bucketLabel,
  bucketName,
  comparedText,
  countBy,
  deniedBy,
  formatMs,
  inPeriod,
  latencyBy,
  median,
  niceScale,
  overviewWindow,
  percentile,
  periodName,
  periodParams,
  readPeriod,
} from './overview';
import { parseResult, type LedgerRecord } from './result';

const rec = (createdAt: string, verdict: Verdict | null, domain = 'MATH', admission?: string): LedgerRecord => {
  const result = parseResult(JSON.stringify({ status: verdict ?? 'SAT', ...(admission ? { admission } : {}) }));
  return { id: createdAt, query: 'q', domain, createdAt, apiKeyId: null, latencyMs: null, result, raw: '' };
};

describe('time to answer (#53)', () => {
  const timed = (domain: string, latencyMs: number | null): LedgerRecord => ({ ...rec('2026-10-20T09:00:00', 'VERIFIED', domain), latencyMs });

  it('takes a percentile by nearest rank', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(twenty, 50)).toBe(10);
    expect(percentile(twenty, 95)).toBe(19);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([3, 9], 50)).toBe(3);
    expect(Number.isNaN(percentile([], 50))).toBe(true);
  });

  it('takes the median as the middle value, or the mean of the two middle ones', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([200, 400])).toBe(300);
    expect(median([100, 200, 300, 400])).toBe(250);
    expect(median([7])).toBe(7);
    expect(Number.isNaN(median([]))).toBe(true);
  });

  it('gives each verifier the median and 95th percentile of its measured records, slowest first', () => {
    const records = [
      ...[100, 300, 200, 400].map((ms) => timed('MATH', ms)),
      timed('MATH', null),
      ...[900, 1500].map((ms) => timed('FACT', ms)),
      timed('SQL', null),
    ];
    expect(latencyBy(records, (r) => r.domain)).toEqual([
      { key: 'FACT', median: 1200, p95: 1500, measured: 2, of: 2 },
      { key: 'MATH', median: 250, p95: 400, measured: 4, of: 5 },
    ]);
  });

  it('writes milliseconds, and seconds from one second up', () => {
    expect(formatMs(850)).toBe('850 ms');
    expect(formatMs(999.6)).toBe('1000 ms');
    expect(formatMs(1000)).toBe('1.0 s');
    expect(formatMs(2450)).toBe('2.5 s');
  });
});

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
    expect(w.totals).toEqual({
      verified: 1,
      unverifiable: 0,
      blocked: 1,
      none: 1,
      denied: 0,
      admitted: 0,
      noAdmission: 3,
      total: 3,
    });
  });

  it('counts the stored admissions across verdicts, a stored BLOCKED as DENY (#38, #53)', () => {
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
    expect(w.totals).toEqual({
      verified: 3,
      unverifiable: 1,
      blocked: 0,
      none: 0,
      denied: 2,
      admitted: 1,
      noAdmission: 1,
      total: 4,
    });
    expect(w.buckets.at(-1)?.denied).toBe(2);
    expect(w.buckets.at(-1)?.admitted).toBe(1);
  });

  it('counts an admission word it does not know as not recorded, not as a decision', () => {
    const w = overviewWindow([rec('2026-10-20T09:41:12', 'VERIFIED', 'MATH', 'MAYBE')], '24h', true);
    expect(w && { admitted: w.totals.admitted, denied: w.totals.denied, noAdmission: w.totals.noAdmission }).toEqual({
      admitted: 0,
      denied: 0,
      noAdmission: 1,
    });
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
    const hour = { start: Date.UTC(2026, 9, 20, 9), end: Date.UTC(2026, 9, 20, 10), verified: 0, unverifiable: 0, blocked: 0, none: 0, denied: 0, admitted: 0, noAdmission: 0, total: 0 };
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

describe('the ledger period (#46)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const start = Date.UTC(2026, 9, 20, 11);
  const end = Date.UTC(2026, 9, 21, 11);

  it('reads back the parameters it writes', () => {
    expect(periodParams({ start, end })).toBe('from=2026-10-20T11:00:00.000Z&to=2026-10-21T11:00:00.000Z');
    expect(readPeriod('2026-10-20T11:00:00.000Z', '2026-10-21T11:00:00.000Z')).toEqual({ start, end });
  });

  it('reads a time with no offset as UTC, as record times are, whatever the browser’s zone', () => {
    vi.stubEnv('TZ', 'Asia/Kolkata');
    expect(readPeriod('2026-10-20T11:00:00', '2026-10-21T11:00:00')).toEqual({ start, end });
    expect(readPeriod('2026-10-20T16:30:00+05:30', '2026-10-21T11:00:00Z')).toEqual({ start, end });
  });

  it('is null when an end is missing or unreadable, or the range is empty', () => {
    expect(readPeriod(null, '2026-10-21T11:00:00Z')).toBeNull();
    expect(readPeriod('2026-10-20T11:00:00Z', '')).toBeNull();
    expect(readPeriod('yesterday', '2026-10-21T11:00:00Z')).toBeNull();
    expect(readPeriod('2026-10-21T11:00:00Z', '2026-10-21T11:00:00Z')).toBeNull();
    expect(readPeriod('2026-10-21T11:00:00Z', '2026-10-20T11:00:00Z')).toBeNull();
  });

  it('holds a record from its start up to, not including, its end', () => {
    const p = { start, end };
    expect(inPeriod(rec('2026-10-20T11:00:00', 'VERIFIED'), p)).toBe(true);
    expect(inPeriod(rec('2026-10-20T10:59:59', 'VERIFIED'), p)).toBe(false);
    expect(inPeriod(rec('2026-10-21T11:00:00', 'VERIFIED'), p)).toBe(false);
    expect(inPeriod(rec('not a time', 'VERIFIED'), p)).toBe(false);
  });

  it('names each end as precisely as it is', () => {
    expect(periodName({ start, end })).toBe('20 Oct, 11:00 to 21 Oct, 11:00 UTC');
    expect(periodName({ start: start + 30 * 60_000, end: end + 15_000 })).toBe('20 Oct, 11:30 to 21 Oct, 11:00:15 UTC');
    expect(periodName({ start: start + 250, end })).toBe('20 Oct, 11:00:00.250 to 21 Oct, 11:00 UTC');
  });
});

describe('denials by group (#53)', () => {
  const at = '2026-10-20T09:00:00';

  it('groups the records stored with DENY, a stored BLOCKED included, with each group’s total', () => {
    const records = [
      rec(at, 'VERIFIED', 'SQL', 'BLOCKED'),
      rec(at, 'VERIFIED', 'SQL', 'ADMIT'),
      rec(at, 'VERIFIED', 'SQL', 'DENY'),
      rec(at, 'UNVERIFIABLE', 'MATH', 'DENY'),
      rec(at, 'VERIFIED', 'CODE', 'ADMIT'),
    ];
    expect(deniedBy(records, (r) => r.domain)).toEqual([
      { key: 'SQL', denied: 2, of: 3 },
      { key: 'MATH', denied: 1, of: 1 },
    ]);
  });
});
