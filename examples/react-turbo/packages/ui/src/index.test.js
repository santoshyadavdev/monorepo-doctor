import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { makeProduct } from '@sample/test-utils';
import { ProductCard } from './index.js';

test('product cards escape names and render formatted prices', () => {
  const html = renderToStaticMarkup(createElement(ProductCard, {
    product: makeProduct({ name: '<Coffee>', price: 1250 }),
  }));
  assert.match(html, /&lt;Coffee&gt;/);
  assert.match(html, /\$12\.50/);
});
