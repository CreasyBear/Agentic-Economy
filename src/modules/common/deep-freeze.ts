/**
 * Freezes before recursing so a cyclic object graph terminates. The copies this
 * replaced were split between freeze-first and recurse-first; recurse-first
 * never returns on a cycle, so freeze-first is the canonical order.
 */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
