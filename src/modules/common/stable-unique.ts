/**
 * The shared order-preserving deduper. Every caller needs first-occurrence order
 * and the original string subtype, so Set is the canonical implementation.
 */
export function stableUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)]
}
