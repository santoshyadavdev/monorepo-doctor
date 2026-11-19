import type { Product } from '@sample/data';

let nextId = 1;

/** Builds a valid product for tests; override only the fields a test cares about. */
export function makeProduct(overrides: Partial<Product> = {}): Product {
  const id = overrides.id ?? `test-${nextId++}`;
  return { id, name: `Test product ${id}`, priceCents: 1000, ...overrides };
}
