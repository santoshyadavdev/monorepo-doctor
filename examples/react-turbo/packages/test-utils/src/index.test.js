import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProduct } from './index.js';

test('product fixtures can be customized without sharing mutable state', () => {
  const first = makeProduct({ price: 0 });
  first.name = 'Changed';
  assert.equal(first.price, 0);
  assert.equal(makeProduct().name, 'Sample product');
});
