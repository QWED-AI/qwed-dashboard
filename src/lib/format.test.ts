import { describe, expect, it } from 'vitest';
import { DAY, formatRelative, formatUtc, formatUtcLong, shortHash } from './format';

describe('formatUtc', () => {
  it('reads a naive timestamp as UTC', () => {
    expect(formatUtc('2026-10-20T09:41:12')).toBe('20 Oct 09:41:12');
  });

  it('keeps an explicit Z or offset', () => {
    expect(formatUtc('2026-10-20T09:41:12Z')).toBe('20 Oct 09:41:12');
    expect(formatUtc('2026-10-20T09:41:12+00:00')).toBe('20 Oct 09:41:12');
    expect(formatUtcLong('2026-10-20T11:41:12+02:00')).toBe('2026-10-20 09:41:12 UTC');
  });

  it('returns text it cannot parse unchanged', () => {
    expect(formatUtc('not a date')).toBe('not a date');
  });
});

describe('shortHash', () => {
  it('shortens long values and keeps short ones', () => {
    expect(shortHash('sha256:86a6c8a886e105fe6d73d17a5c81d9c87721033ab8df27603eaf62748f547c21')).toBe('sha256:86a6c8a8…7c21');
    expect(shortHash('sha256:abc')).toBe('sha256:abc');
  });
});

describe('formatRelative', () => {
  const now = Date.UTC(2026, 10, 10, 12, 0, 0);
  it('names the largest whole unit, before or after now', () => {
    expect(formatRelative(now - 3 * DAY - 5_000, now)).toBe('3 days ago');
    expect(formatRelative(now + 4 * DAY, now)).toBe('in 4 days');
    expect(formatRelative(now - 60 * 60_000, now)).toBe('1 hour ago');
    expect(formatRelative(now + 90 * 60_000, now)).toBe('in 1 hour');
    expect(formatRelative(now - 2 * 60_000, now)).toBe('2 minutes ago');
    expect(formatRelative(now - 400 * DAY, now)).toBe('1 year ago');
    expect(formatRelative(now - 45 * DAY, now)).toBe('1 month ago');
  });

  it('says so under a minute', () => {
    expect(formatRelative(now - 20_000, now)).toBe('just now');
    expect(formatRelative(now + 20_000, now)).toBe('in under a minute');
    expect(formatRelative(now, now)).toBe('just now');
  });
});
