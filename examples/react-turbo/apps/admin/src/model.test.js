import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProduct } from '@sample/test-utils';
import { catalogValue } from './model.js';

test('admin totals prices in integer cents', () => {
  assert.equal(catalogValue([makeProduct({ price: 1099 }), makeProduct({ price: 501 })]), 1600);
  assert.equal(catalogValue([]), 0);
});
