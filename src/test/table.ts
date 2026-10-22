import { expect } from 'vitest';

/**
 * On a phone a stacked table hides its header row, and a small cell names
 * its column with data-label instead. Checks that each label is the start of
 * the header above its cell, so the two cannot drift apart.
 */
export function expectCellLabelsMatchHeaders(table: HTMLElement) {
  const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent ?? '');
  const labelled = [...table.querySelectorAll<HTMLTableCellElement>('tbody td[data-label]')];
  expect(labelled.length).toBeGreaterThan(0);
  for (const td of labelled) {
    const label = td.dataset.label ?? '';
    expect(headers[td.cellIndex]?.slice(0, label.length)).toBe(label);
  }
}
