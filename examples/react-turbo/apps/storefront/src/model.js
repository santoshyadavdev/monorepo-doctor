export function availableProducts(products, inventory) {
  return products.filter((product) => inventory[product.id] > 0);
}
