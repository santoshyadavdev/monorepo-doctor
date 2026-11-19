import { expect, it } from 'vitest';
import { makeProduct } from './index';

it('creates unique products with overrides', () => {
  const a = makeProduct();
  const b = makeProduct({ priceCents: 99 });
  expect(a.id).not.toBe(b.id);
  expect(b.priceCents).toBe(99);
});
