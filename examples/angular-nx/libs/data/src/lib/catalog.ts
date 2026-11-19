import { formatName } from '@sample/utils';
import { stockFor } from './inventory';

export interface Product {
  id: string;
  name: string;
  priceCents: number;
}

export interface CatalogItem extends Product {
  stock: number;
}

export const products: readonly Product[] = [
  { id: 'mug', name: 'ceramic mug', priceCents: 1250 },
  { id: 'tote', name: 'canvas tote', priceCents: 1800 },
  { id: 'cap', name: 'wool cap', priceCents: 2400 },
];

export function getCatalog(): CatalogItem[] {
  return products.map((product) => ({ ...product, name: formatName(product.name), stock: stockFor(product.id) }));
}
