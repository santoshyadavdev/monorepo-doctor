import { expect, it } from 'vitest';
import { availableProducts } from './storefront.model';

it('hides sold-out products', () => {
  expect(availableProducts().map((item) => item.id)).toEqual(['mug', 'tote']);
});
