import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProduct } from '@sample/test-utils';
import { availableProducts } from './model.js';

test('storefront hides unavailable products', () => {
  const products = [makeProduct({ id: 'available' }), makeProduct({ id: 'sold-out' })];
  assert.deepEqual(availableProducts(products, { available: 2, 'sold-out': 0 }), [products[0]]);
  assert.deepEqual(availableProducts(products, {}), []);
});
