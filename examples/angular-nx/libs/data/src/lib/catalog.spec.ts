import { describe, expect, it } from 'vitest';
import { getCatalog } from '../index';
import { lowStockIds } from './inventory';

describe('catalog', () => {
  it('joins products with formatted names and stock', () => {
    expect(getCatalog()[0]).toEqual({ id: 'mug', name: 'Ceramic Mug', priceCents: 1250, stock: 12 });
  });

  it('lists low-stock products', () => {
    expect(lowStockIds()).toEqual(['tote', 'cap']);
  });
});
