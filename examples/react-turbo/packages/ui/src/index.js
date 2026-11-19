import { createElement } from 'react';
import { formatPrice } from '@sample/utils';

export function ProductCard({ product }) {
  return createElement('article', null,
    createElement('h2', null, product.name),
    createElement('p', null, formatPrice(product.price)),
  );
}
