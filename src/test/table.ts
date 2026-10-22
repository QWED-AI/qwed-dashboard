import { expect } from 'vitest';

/**
 * On a phone a stacked table hides its header row from sight, and each small
 * cell names its column with data-label instead. Checks that every small cell
 * has a label and that it is the start of the header above it, so the two
 * cannot drift apart, and that each table part spells out its role, which the
 * phone CSS would otherwise put at risk by changing its display.
 */
export function expectStackedTable(table: HTMLElement) {
  const roles: [string, string][] = [
    ['table', 'table'],
    ['thead, tbody', 'rowgroup'],
    ['tr', 'row'],
    ['th', 'columnheader'],
    ['td', 'cell'],
  ];
  for (const [selector, role] of roles) {
    const parts = table.matches(selector) ? [table] : [...table.querySelectorAll(selector)];
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) expect(part.getAttribute('role')).toBe(role);
  }

  const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent ?? '');
  const small = [...table.querySelectorAll<HTMLTableCellElement>('tbody td.cell-small')];
  expect(small.length).toBeGreaterThan(0);
  for (const td of small) {
    const label = td.dataset.label ?? '';
    expect(label).not.toBe('');
    expect(headers[td.cellIndex]?.slice(0, label.length)).toBe(label);
  }
}
