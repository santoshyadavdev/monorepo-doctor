import { describe, expect, it } from 'vitest';
import { makeProduct } from '@sample/test-utils';
import { toCardView } from './product-card.model';

describe('toCardView', () => {
  it('formats price and flags low stock', () => {
    expect(toCardView({ ...makeProduct({ name: 'Mug', priceCents: 1250 }), stock: 3 })).toEqual({
      title: 'Mug',
      price: '$12.50',
      badge: 'Only 3 left',
    });
  });

  it('marks sold-out items', () => {
    expect(toCardView({ ...makeProduct(), stock: 0 }).badge).toBe('Sold out');
  });
});
