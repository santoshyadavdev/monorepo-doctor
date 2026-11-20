import { roundMoney } from '../../../packages/math-core/src/internal/rounding.js';

export function formatTotal(amount) {
  return `$${roundMoney(amount).toFixed(2)}`;
}
