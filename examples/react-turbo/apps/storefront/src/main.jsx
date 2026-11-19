import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProductCard } from '@sample/ui';
import { products } from '@sample/data';
import { inventory } from '@sample/data/src/inventory.js';
import { availableProducts } from './model.js';

function Storefront() {
  return (
    <main>
      <h1>Sample storefront</h1>
      <p>Shared React components, catalog data, and price formatting.</p>
      {availableProducts(products, inventory).map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Storefront />);
