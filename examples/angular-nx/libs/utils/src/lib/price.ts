const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Formats integer cents, e.g. 1250 -> "$12.50". */
export function formatPrice(cents: number): string {
  if (!Number.isInteger(cents)) throw new TypeError(`Expected integer cents, got ${cents}`);
  return currency.format(cents / 100);
}
