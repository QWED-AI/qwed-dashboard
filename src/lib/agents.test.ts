import { describe, expect, it } from 'vitest';
import { cost } from './agents';

describe('cost', () => {
  it('keeps two decimals, and every further one the server stored', () => {
    expect(cost(0)).toBe('0.00');
    expect(cost(1.5)).toBe('1.50');
    expect(cost(20)).toBe('20.00');
    expect(cost(0.001)).toBe('0.001');
    expect(cost(0.125)).toBe('0.125');
  });

  it('writes no grouping and no exponent', () => {
    expect(cost(1234.5)).toBe('1234.50');
    expect(cost(1e-7)).toBe('0.0000001');
  });
});
