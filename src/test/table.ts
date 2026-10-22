import { expect } from 'vitest';

/**
 * On a phone a stacked table hides its header row from sight, and each small
 * cell names its column with data-label instead. Checks that every small cell
 * has a label and that it is the start of the header above it, so the two
 * cannot drift apart.
 */
export function expectStackedTable(table: HTMLElement) {
  const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent ?? '');
  const small = [...table.querySelectorAll<HTMLTableCellElement>('tbody td.cell-small')];
  expect(small.length).toBeGreaterThan(0);
  for (const td of small) {
    const label = td.dataset.label ?? '';
    expect(label).not.toBe('');
    expect(headers[td.cellIndex]?.slice(0, label.length)).toBe(label);
  }
}
