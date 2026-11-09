import type { CSSProperties } from 'react';

/**
 * The halftone mist behind a screen's heading, as on qwedai.tech: dawn in the
 * light theme, a lake at dusk in the dark one. Each screen has its own pair,
 * drawn by scripts/mist.mjs with the site's code. The CSS picks the one for the
 * theme in use, so the browser fetches only that picture.
 */
const files = import.meta.glob<string>('../assets/mist/*.webp', { eager: true, query: '?url', import: 'default' });

export type MistScreen = 'ledger' | 'agents' | 'agent' | 'batch' | 'keys' | 'members' | 'security' | 'server';

/** The style that gives a `.mist` heading its screen's pictures. */
export function mist(screen: MistScreen): CSSProperties {
  const url = (look: 'dawn' | 'lake') => files[`../assets/mist/${screen}-${look}.webp`];
  return { '--mist-dawn': `url("${url('dawn')}")`, '--mist-lake': `url("${url('lake')}")` } as CSSProperties;
}
