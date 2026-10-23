// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VerdictChip } from './VerdictChip';

afterEach(cleanup);

const chip = (el: ReturnType<typeof render>) => el.container.querySelector('.chip');

describe('VerdictChip', () => {
  it('shows a stored BLOCKED admission as DENY and says what was stored', () => {
    const c = chip(render(<VerdictChip verdict="VERIFIED" admission="DENY" admissionStored="BLOCKED" />));
    expect(c?.textContent).toBe('VERIFIED·DENY');
    expect(c?.getAttribute('aria-label')).toBe('VERIFIED, admission DENY, stored as BLOCKED');
  });

  it('shows a word it does not know as stored, not as a decision', () => {
    const c = chip(render(<VerdictChip verdict="VERIFIED" admission={null} admissionStored="REVIEW" />));
    expect(c?.textContent).toBe('VERIFIED·REVIEW');
    expect(c?.querySelector('.a-DENY, .a-ADMIT')).toBeNull();
    expect(c?.getAttribute('aria-label')).toBe('VERIFIED, admission stored as REVIEW, not one the dashboard knows');
  });

  it('says not recorded when there is none', () => {
    const c = chip(render(<VerdictChip verdict="UNVERIFIABLE" admission={null} />));
    expect(c?.getAttribute('aria-label')).toBe('UNVERIFIABLE, admission not recorded');
  });
});
