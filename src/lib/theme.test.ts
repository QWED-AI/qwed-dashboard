// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applySavedTheme } from './theme';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('applySavedTheme', () => {
  it('puts a saved light or dark theme on the page', () => {
    localStorage.setItem('qwed-dashboard.theme', 'dark');
    applySavedTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('leaves the system theme when none is saved, or the saved value is not a theme', () => {
    applySavedTheme();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    localStorage.setItem('qwed-dashboard.theme', 'purple');
    applySavedTheme();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
