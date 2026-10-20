import { useCallback, useEffect, useState } from 'react';
import { readStorage, writeStorage } from './storage';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'qwed-dashboard.theme';

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export function useTheme(): [ThemeChoice, () => void] {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    const saved = readStorage('local', KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });

  useEffect(() => {
    apply(choice);
    writeStorage('local', KEY, choice === 'system' ? null : choice);
  }, [choice]);

  const cycle = useCallback(() => {
    setChoice((c) => (c === 'system' ? 'light' : c === 'light' ? 'dark' : 'system'));
  }, []);

  return [choice, cycle];
}
