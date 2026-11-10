import { useEffect, useState } from 'react';
import { readStorage, writeStorage } from './storage';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'qwed-dashboard.theme';

function apply(choice: ThemeChoice) {
  const { dataset } = document.documentElement;
  if (choice === 'system') delete dataset.theme;
  else dataset.theme = choice;
}

/** The theme chosen (system until one is), and the way to choose another. */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    const saved = readStorage('local', KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });

  useEffect(() => {
    apply(choice);
    writeStorage('local', KEY, choice === 'system' ? null : choice);
  }, [choice]);

  return [choice, setChoice];
}
