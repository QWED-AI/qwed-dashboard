import { describe, expect, it } from 'vitest';
import { columnSegments } from './VerdictChart';

const counts = (verified: number, unverifiable: number, blocked: number, none: number) => ({
  verified,
  unverifiable,
  blocked,
  none,
  denied: 0,
  total: verified + unverifiable + blocked + none,
});

const height = ({ gap, segs }: ReturnType<typeof columnSegments>) =>
  segs.reduce((sum, s) => sum + s.h, 0) + gap * (segs.length - 1);

describe('columnSegments', () => {
  it('keeps a column as tall as its total, so a smaller total never draws taller', () => {
    // On an axis to 200 (drawn 200 px tall), 10 records of one verdict are
    // 10 px and 4 records split four ways are 4 px.
    expect(height(columnSegments(counts(10, 0, 0, 0), 200))).toBeCloseTo(10);
    expect(height(columnSegments(counts(1, 1, 1, 1), 200))).toBeCloseTo(4);
  });

  it('fits the gaps inside the column, and drops them when it is too short', () => {
    const tall = columnSegments(counts(10, 10, 10, 10), 40);
    expect(tall.gap).toBe(2);
    expect(height(tall)).toBeCloseTo(200);
    expect(columnSegments(counts(1, 1, 1, 1), 200).gap).toBe(0);
  });

  it('lists the segments top first, leaving out verdicts with none', () => {
    expect(columnSegments(counts(3, 0, 1, 0), 4).segs.map((s) => s.key)).toEqual(['blocked', 'verified']);
    expect(columnSegments(counts(0, 0, 0, 0), 1).segs).toEqual([]);
  });
});
