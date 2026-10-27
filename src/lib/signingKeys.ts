import type { Jwk } from '../api/types';
import { readStorage, writeStorage } from './storage';

// Which of the server's signing keys this browser has seen, and when (#55).
// A server given no key makes a new one each time it starts, so attestations
// signed before a restart stop checking out. Remembering the keys seen here
// lets the Server screen say when one is gone, until the reader dismisses it.
// It is a convenience of this browser only: another browser, or cleared
// storage, starts afresh.

const STORE_KEY = 'qwed-dashboard.signing-keys';

export interface GoneKey {
  kid: string;
  /** When this browser first saw the key. */
  firstSeen: string;
  /** When this browser found it no longer published. */
  goneBy: string;
}

export interface SeenKeys {
  /** Key id to when this browser first saw it, for the keys published at the last load. */
  keys: Record<string, string>;
  /** Keys seen before that the server stopped publishing, kept until dismissed. */
  gone: GoneKey[];
}

const EMPTY: SeenKeys = { keys: {}, gone: [] };

/** A key's id, or null for a key that has none: it cannot be told apart from others. */
const kidOf = (k: Jwk): string | null => (typeof k.kid === 'string' && k.kid !== '' ? k.kid : null);

/** What this browser knows after a load that found `keys` published, at `now`. */
export function compareKeys(seen: SeenKeys, keys: readonly Jwk[], now: string): SeenKeys {
  const current: Record<string, string> = {};
  for (const k of keys) {
    const kid = kidOf(k);
    if (kid) current[kid] = seen.keys[kid] ?? seen.gone.find((g) => g.kid === kid)?.firstSeen ?? now;
  }
  const newlyGone = Object.entries(seen.keys)
    .filter(([kid]) => !(kid in current))
    .map(([kid, firstSeen]) => ({ kid, firstSeen, goneBy: now }));
  // A key published again is not gone.
  const gone = [...seen.gone.filter((g) => !(g.kid in current) && !(g.kid in seen.keys)), ...newlyGone];
  return { keys: current, gone };
}

export function readSeenKeys(): SeenKeys {
  const raw = readStorage('local', STORE_KEY);
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<SeenKeys> | null;
    const keys =
      value && typeof value.keys === 'object' && value.keys !== null && !Array.isArray(value.keys)
        ? Object.fromEntries(Object.entries(value.keys).filter((e): e is [string, string] => typeof e[1] === 'string'))
        : {};
    const gone = Array.isArray(value?.gone)
      ? value.gone.filter(
          (g): g is GoneKey =>
            !!g && typeof g.kid === 'string' && typeof g.firstSeen === 'string' && typeof g.goneBy === 'string',
        )
      : [];
    return { keys, gone };
  } catch {
    return EMPTY;
  }
}

export function writeSeenKeys(seen: SeenKeys): void {
  writeStorage('local', STORE_KEY, JSON.stringify(seen));
}
