import type { Admission, Verdict } from '../api/types';
import { formatUtcDay, formatUtcHour, formatUtcTime, parseUtc } from './format';
import type { LedgerRecord } from './result';

// The overview groups what the server stored, as the ledger does: by the
// stored verdict and admission, the verifier and the caller. It never works
// out a verdict or an admission. It counts only the records the dashboard has
// loaded, so every view says how far back those reach.

export type Range = '24h' | '7d';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const RANGES: Readonly<Record<Range, { span: number; size: number; name: string }>> = {
  '24h': { span: 24 * HOUR, size: HOUR, name: '24 hours' },
  '7d': { span: 7 * DAY, size: DAY, name: '7 days' },
};

export interface VerdictCounts {
  verified: number;
  unverifiable: number;
  blocked: number;
  none: number;
  /**
   * Records whose stored admission is DENY, a stored BLOCKED included (#38).
   * It cuts across the verdicts: a VERIFIED record can be denied.
   */
  denied: number;
  /** Records whose stored admission is ADMIT (#53). */
  admitted: number;
  /** Records with no admission the dashboard can read: none stored, or a word it does not know (#53). */
  noAdmission: number;
  total: number;
}

export interface Bucket extends VerdictCounts {
  start: number;
  end: number;
}

export interface OverviewWindow {
  range: Range;
  start: number;
  end: number;
  buckets: Bucket[];
  /** The loaded records inside the window, in the order given (newest first). */
  records: LedgerRecord[];
  totals: VerdictCounts;
  /** Records in the window of the same length just before, or null when the loaded records may not reach back that far. */
  previousTotal: number | null;
  /** The oldest loaded record's time, when older records the window should count may not be loaded. */
  reachesBackTo: number | null;
}

const zero = (): VerdictCounts => ({
  verified: 0,
  unverifiable: 0,
  blocked: 0,
  none: 0,
  denied: 0,
  admitted: 0,
  noAdmission: 0,
  total: 0,
});

function add(counts: VerdictCounts, verdict: Verdict | null, admission: Admission | null) {
  if (verdict === 'VERIFIED') counts.verified += 1;
  else if (verdict === 'UNVERIFIABLE') counts.unverifiable += 1;
  else if (verdict === 'BLOCKED') counts.blocked += 1;
  else counts.none += 1;
  if (admission === 'DENY') counts.denied += 1;
  else if (admission === 'ADMIT') counts.admitted += 1;
  else counts.noAdmission += 1;
  counts.total += 1;
}

const timeOf = (r: LedgerRecord) => parseUtc(r.createdAt)?.getTime() ?? null;

/**
 * The window of `range` that ends with the hour (or day) of the newest
 * loaded record, so the chart is never empty because the newest record is
 * older than now. `complete` is true when the loaded records are all the
 * server has. Null when no record has a readable time.
 */
export function overviewWindow(records: LedgerRecord[], range: Range, complete: boolean): OverviewWindow | null {
  const times = records.map(timeOf);
  const known = times.filter((t): t is number => t !== null);
  if (known.length === 0) return null;
  const newest = Math.max(...known);
  const oldest = Math.min(...known);
  const { span, size } = RANGES[range];
  const end = Math.floor(newest / size) * size + size;
  const start = end - span;
  const buckets: Bucket[] = Array.from({ length: span / size }, (_, i) => ({
    start: start + i * size,
    end: start + (i + 1) * size,
    ...zero(),
  }));
  const totals = zero();
  const inWindow: LedgerRecord[] = [];
  let previous = 0;
  records.forEach((r, i) => {
    const t = times[i];
    if (t === null || t === undefined) return;
    if (t >= start && t < end) {
      const bucket = buckets[Math.floor((t - start) / size)];
      if (bucket) add(bucket, r.result.verdict, r.result.admission);
      add(totals, r.result.verdict, r.result.admission);
      inWindow.push(r);
    } else if (t >= start - span && t < start) {
      previous += 1;
    }
  });
  return {
    range,
    start,
    end,
    buckets,
    records: inWindow,
    totals,
    // When older records may not be loaded, one at exactly a window's start
    // proves nothing: the next page can hold more with that same time. Only
    // an older record shows the window is covered.
    previousTotal: complete || oldest < start - span ? previous : null,
    reachesBackTo: !complete && oldest >= start ? oldest : null,
  };
}

/** A span of time the ledger can be opened on: from `start`, up to but not including `end`, in ms. */
export interface Period {
  start: number;
  end: number;
}

/** The ledger's address parameters for a period (#46): `from` and `to`, in UTC. */
export function periodParams(p: Period): string {
  return `from=${new Date(p.start).toISOString()}&to=${new Date(p.end).toISOString()}`;
}

/**
 * The period in the ledger's address, or null when either end is missing or
 * unreadable. A time with no offset is read as UTC, as record times are.
 */
export function readPeriod(from: string | null, to: string | null): Period | null {
  if (!from || !to) return null;
  const start = parseUtc(from)?.getTime();
  const end = parseUtc(to)?.getTime();
  return start !== undefined && end !== undefined && start < end ? { start, end } : null;
}

/** Whether a record was received in the period. A record with no readable time is in none. */
export function inPeriod(r: LedgerRecord, p: Period): boolean {
  const t = timeOf(r);
  return t !== null && t >= p.start && t < p.end;
}

/** "19 Oct, 10:00 to 20 Oct, 10:00 UTC", each end as precise as it is. */
export function periodName(p: Period): string {
  return `${formatUtcDay(p.start)}, ${formatUtcTime(p.start)} to ${formatUtcDay(p.end)}, ${formatUtcTime(p.end)} UTC`;
}

/** The short label under a column: "09:00" or "20 Oct". */
export function bucketLabel(b: Bucket, range: Range): string {
  return range === '24h' ? formatUtcHour(b.start) : formatUtcDay(b.start);
}

/** The full name of a bucket: "20 Oct, 09:00 to 10:00 UTC" or "20 Oct UTC". */
export function bucketName(b: Bucket, range: Range): string {
  if (range === '7d') return `${formatUtcDay(b.start)} UTC`;
  return `${formatUtcDay(b.start)}, ${formatUtcHour(b.start)} to ${formatUtcHour(b.end)} UTC`;
}

/** Counts per key, most first; ties in key order. */
export function countBy<T>(items: readonly T[], key: (item: T) => string): { key: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts]
    .map(([k, n]) => ({ key: k, n }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

/**
 * The records stored with DENY, grouped by `key`, with how many records each
 * group has in all (#53). Groups with none denied are left out; most denied
 * first, then by key.
 */
export function deniedBy(
  records: readonly LedgerRecord[],
  key: (r: LedgerRecord) => string,
): { key: string; denied: number; of: number }[] {
  const groups = new Map<string, { denied: number; of: number }>();
  for (const r of records) {
    const k = key(r);
    const g = groups.get(k) ?? { denied: 0, of: 0 };
    g.of += 1;
    if (r.result.admission === 'DENY') g.denied += 1;
    groups.set(k, g);
  }
  return [...groups]
    .map(([k, g]) => ({ key: k, ...g }))
    .filter((g) => g.denied > 0)
    .sort((a, b) => b.denied - a.denied || a.key.localeCompare(b.key));
}

/** The value at percentile `p` of sorted `values`, by nearest rank: the p95 of 20 values is the 19th. */
export function percentile(sorted: readonly number[], p: number): number {
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? Number.NaN;
}

/**
 * How long the server took for each group's records (#53, #528): the median
 * and the 95th percentile of the measured ones, with how many were measured
 * and how many there are. Groups with none measured are left out; slowest at
 * the 95th percentile first, then by key.
 */
export function latencyBy(
  records: readonly LedgerRecord[],
  key: (r: LedgerRecord) => string,
): { key: string; median: number; p95: number; measured: number; of: number }[] {
  const groups = new Map<string, { times: number[]; of: number }>();
  for (const r of records) {
    const k = key(r);
    const g = groups.get(k) ?? { times: [], of: 0 };
    g.of += 1;
    if (r.latencyMs !== null) g.times.push(r.latencyMs);
    groups.set(k, g);
  }
  return [...groups]
    .filter(([, g]) => g.times.length > 0)
    .map(([k, g]) => {
      const sorted = [...g.times].sort((a, b) => a - b);
      return { key: k, median: percentile(sorted, 50), p95: percentile(sorted, 95), measured: sorted.length, of: g.of };
    })
    .sort((a, b) => b.p95 - a.p95 || a.key.localeCompare(b.key));
}

/** "850 ms", or "1.2 s" from a second up. */
export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** A round axis top for counts up to `max`, with at most four steps: 34 → 40 by 10. */
export function niceScale(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 1, step: 1 };
  for (let unit = 1; ; unit *= 10) {
    for (const m of [1, 2, 5]) {
      const step = m * unit;
      const steps = Math.ceil(max / step);
      if (steps <= 4) return { top: steps * step, step };
    }
  }
}

/** How the window compares with the one before it, in words. */
export function comparedText(now: number, before: number | null, name: string): string | null {
  if (before === null) return null;
  if (before === 0) return now === 0 ? null : `None in the ${name} before`;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return `The same as the ${name} before`;
  return `${Math.abs(pct)}% ${pct > 0 ? 'more' : 'fewer'} than the ${name} before`;
}
