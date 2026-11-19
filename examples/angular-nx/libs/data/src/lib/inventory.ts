import { products } from './catalog';

/** Internal warehouse counts. Not part of the public API. */
export const inventory: Readonly<Record<string, number>> = { mug: 12, tote: 3, cap: 0 };

export function stockFor(id: string): number {
  return inventory[id] ?? 0;
}

export function lowStockIds(threshold = 5): string[] {
  return products.filter((product) => stockFor(product.id) < threshold).map((product) => product.id);
}
