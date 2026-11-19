import { expect, it } from 'vitest';
import { summarizeCatalog } from './admin.model';

it('summarizes stock value in dollars', () => {
  expect(summarizeCatalog()).toEqual({ items: 3, unitsInStock: 15, stockValue: '$204.00' });
});
