import { test } from 'node:test';
import assert from 'node:assert/strict';
import { products } from './index.js';

test('catalog has unique product ids and nonnegative integer prices', () => {
  assert.equal(new Set(products.map((product) => product.id)).size, products.length);
  assert.ok(products.every((product) => Number.isInteger(product.price) && product.price >= 0));
});
