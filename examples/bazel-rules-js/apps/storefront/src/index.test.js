import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTotal } from './index.js';

test('formats a total rounded to cents', () => {
  assert.equal(formatTotal(12.345), '$12.35');
});
