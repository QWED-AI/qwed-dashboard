import { ApiError } from '../api/http';
import { describeError } from './useAuthedQuery';

// Plain names for the event types the server writes. Any other type shows
// as the server sent it. A Map, not an object: the type can come from the
// URL, and an object would answer an inherited name such as "constructor"
// with a function React cannot render.
export const TYPE_LABEL: ReadonlyMap<string, string> = new Map([['SECRET_LEAK_AUTO_REVOKED', 'Leaked API key revoked']]);

export const typeLabel = (type: string) => TYPE_LABEL.get(type) ?? type;

/** One sentence for a failed load of the security events, by what the server answered. */
export function securityEventsError(err: unknown): string {
  if (err instanceof ApiError && err.status === 403) {
    return 'Only owners and admins can see security events.';
  }
  if (err instanceof ApiError && err.status === 404) {
    return 'This server does not list security events. That needs a qwed-verification release with #486.';
  }
  return describeError(err);
}
