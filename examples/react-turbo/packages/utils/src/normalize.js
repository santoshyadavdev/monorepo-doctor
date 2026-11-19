import { defaultLabel } from './labels.js';

// The deferred read keeps this intentional file cycle safe at module initialization.
export function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ') || defaultLabel;
}
