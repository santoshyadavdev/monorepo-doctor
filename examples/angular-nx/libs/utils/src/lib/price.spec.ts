import { describe, expect, it } from 'vitest';
import { formatName, formatPrice } from '../index';

describe('utils', () => {
  it('formats cents as dollars', () => {
    expect(formatPrice(1250)).toBe('$12.50');
  });

  it('rejects fractional cents', () => {
    expect(() => formatPrice(1.5)).toThrow(TypeError);
  });

  it('normalizes product names', () => {
    expect(formatName('  ceramic   MUG ')).toBe('Ceramic Mug');
  });
});
