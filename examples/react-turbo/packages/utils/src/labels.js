import { normalizeName } from './normalize.js';

export const defaultLabel = 'Unnamed product';

export function labelProduct(name) {
  return normalizeName(name).replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
