import { getCatalog } from '@sample/data';
import { formatPrice } from '@sample/utils';

export interface CatalogSummary {
  items: number;
  unitsInStock: number;
  stockValue: string;
}

export function summarizeCatalog(): CatalogSummary {
  const catalog = getCatalog();
  const cents = catalog.reduce((sum, item) => sum + item.priceCents * item.stock, 0);
  return {
    items: catalog.length,
    unitsInStock: catalog.reduce((sum, item) => sum + item.stock, 0),
    stockValue: formatPrice(cents),
  };
}
