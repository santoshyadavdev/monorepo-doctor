export function catalogValue(products) {
  return products.reduce((total, product) => total + product.price, 0);
}
