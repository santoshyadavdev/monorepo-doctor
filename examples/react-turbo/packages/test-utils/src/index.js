export function makeProduct(overrides = {}) {
  return { id: 'sample', name: 'Sample product', price: 1000, ...overrides };
}
