import { useCallback, useEffect, useState } from 'react';
import { readStorage, writeStorage } from './storage';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'qwed-dashboard.theme';
const NEXT_THEME: Readonly<Record<ThemeChoice, ThemeChoice>> = { system: 'light', light: 'dark', dark: 'system' };

function apply(choice: ThemeChoice) {
  const { dataset } = document.documentElement;
  if (choice === 'system') delete dataset.theme;
  else dataset.theme = choice;
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
    setChoice((c) => NEXT_THEME[c]);
  }, []);

  return [choice, cycle];
}
