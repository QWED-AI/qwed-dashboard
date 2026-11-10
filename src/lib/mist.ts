import type { CSSProperties } from 'react';

/**
 * The halftone mist behind a screen's heading, as on qwedai.tech: dawn in the
 * light theme, a lake at dusk in the dark one. Each screen has its own pair,
 * drawn by scripts/mist.mjs with the site's code. The CSS picks the one for the
 * theme in use, so the browser fetches only that picture.
 */
const files = import.meta.glob<string>('../assets/mist/*.webp', { eager: true, query: '?url', import: 'default' });

export type MistScreen = 'ledger' | 'agents' | 'agent' | 'batch' | 'keys' | 'members' | 'security' | 'server';

/**
 * The style that gives a `.mist` heading its screen's pictures. A picture
 * missing from src/assets/mist (a screen added here but not to the script)
 * is none, so the heading keeps its plain ground rather than ask for a bad
 * address.
 */
export function mist(screen: MistScreen): CSSProperties {
  const url = (look: 'dawn' | 'lake') => {
    const file = files[`../assets/mist/${screen}-${look}.webp`];
    return file ? `url("${file}")` : 'none';
  };
  return { '--mist-dawn': url('dawn'), '--mist-lake': url('lake') } as CSSProperties;
}
