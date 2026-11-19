import type { CatalogItem } from '@sample/data';
import { formatPrice } from '@sample/utils';

export interface CardView {
  title: string;
  price: string;
  badge: string | null;
}

export function toCardView(item: CatalogItem): CardView {
  const badge = item.stock === 0 ? 'Sold out' : item.stock < 5 ? `Only ${item.stock} left` : null;
  return { title: item.name, price: formatPrice(item.priceCents), badge };
}
