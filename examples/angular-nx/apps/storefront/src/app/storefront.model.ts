import { getCatalog, type CatalogItem } from '@sample/data';
// Seeded boundary problem: reaches into data's internals instead of its public entry point.
import { inventory } from '../../../../libs/data/src/lib/inventory';

export function availableProducts(): CatalogItem[] {
  return getCatalog().filter((item) => (inventory[item.id] ?? 0) > 0);
}
