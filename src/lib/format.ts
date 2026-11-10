// The server sends naive UTC timestamps (no offset), so they are read as UTC.
export function parseUtc(iso: string): Date | null {
  const withZone = /(?:[zZ]|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "20 Oct 09:41:12", always in UTC. */
export function formatUtc(iso: string): string {
  const d = parseUtc(iso);
  if (!d) return iso;
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** "2026-10-20 09:41:12 UTC" */
export function formatUtcLong(iso: string): string {
  const d = parseUtc(iso);
  if (!d) return iso;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

/** "20 Oct", the UTC day of a time in milliseconds. */
export function formatUtcDay(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}`;
}

/** "09:00", the UTC hour of a time in milliseconds. */
export function formatUtcHour(ms: number): string {
  return `${pad(new Date(ms).getUTCHours())}:00`;
}

/**
 * "10:30", the UTC time of a time in milliseconds, with its seconds
 * ("10:30:15") or milliseconds ("10:30:15.250") only when it has them.
 */
export function formatUtcTime(ms: number): string {
  const d = new Date(ms);
  const minutes = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  const millis = d.getUTCMilliseconds();
  if (millis) return `${minutes}:${pad(d.getUTCSeconds())}.${String(millis).padStart(3, '0')}`;
  return d.getUTCSeconds() ? `${minutes}:${pad(d.getUTCSeconds())}` : minutes;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
const UNITS: readonly [number, string][] = [
  [365 * DAY, 'year'],
  [30 * DAY, 'month'],
  [DAY, 'day'],
  [HOUR, 'hour'],
  [MINUTE, 'minute'],
];

/**
 * "3 days ago", "in 4 hours": how far a time (ms) is from now, in its largest
 * whole unit. It sits beside the UTC time, never in its place.
 */
export function formatRelative(ms: number, now: number): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  for (const [size, unit] of UNITS) {
    if (abs >= size) {
      const n = Math.floor(abs / size);
      const span = `${n} ${unit}${n === 1 ? '' : 's'}`;
      return diff < 0 ? `${span} ago` : `in ${span}`;
    }
  }
  return diff < 0 ? 'just now' : 'in under a minute';
}

/** "sha256:86a6c8a8…7c21" */
export function shortHash(value: string, head = 15, tail = 4): string {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}
