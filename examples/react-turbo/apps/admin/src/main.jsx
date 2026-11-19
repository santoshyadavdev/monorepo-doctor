import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProductCard } from '@sample/ui';
import { products } from '@sample/data';
import { formatPrice } from '@sample/utils';
import { catalogValue } from './model.js';

function Admin() {
  return (
    <main>
      <h1>Sample catalog admin</h1>
      <p>Catalog value: {formatPrice(catalogValue(products))}</p>
      {products.map((product) => <ProductCard key={product.id} product={product} />)}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Admin />);
