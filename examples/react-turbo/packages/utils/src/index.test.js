import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice, labelProduct } from './index.js';

test('formats cents without losing the fractional part', () => {
  assert.equal(formatPrice(1250), '$12.50');
  assert.equal(formatPrice(0), '$0.00');
});

test('normalizes product names and supplies a label for empty names', () => {
  assert.equal(labelProduct('  coffee   beans '), 'Coffee Beans');
  assert.equal(labelProduct('  '), 'Unnamed Product');
});
