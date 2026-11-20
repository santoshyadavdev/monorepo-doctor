import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTotal } from './index.js';

test('formats a total rounded to cents', () => {
  assert.equal(formatTotal(1.005), '$1.01');
  assert.equal(formatTotal(10.075), '$10.08');
  assert.equal(formatTotal(12.345), '$12.35');
  assert.equal(formatTotal(-10.075), '$-10.07');
  assert.equal(formatTotal(undefined), '$NaN');
  assert.equal(formatTotal(Infinity), '$Infinity');
});
