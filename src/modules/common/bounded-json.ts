const MAX_VALIDATED_VALUE_NODES = 10_000
const MAX_VALIDATED_VALUE_DEPTH = 64

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | Readonly<{ [key: string]: JsonValue }>

/** Dependency-free JSON value guard shared by lower layers. */
export function isBoundedJsonValue(value: unknown): value is JsonValue {
  const active = new Set<object>()
  let nodes = 0
  function visit(candidate: unknown, depth: number): boolean {
    nodes += 1
    if (nodes > MAX_VALIDATED_VALUE_NODES || depth > MAX_VALIDATED_VALUE_DEPTH) return false
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') return true
    if (typeof candidate === 'number') return Number.isFinite(candidate)
    if (typeof candidate !== 'object') return false
    if (!Array.isArray(candidate)) {
      const prototype = Object.getPrototypeOf(candidate)
      if (prototype !== Object.prototype && prototype !== null) return false
    }
    if (active.has(candidate)) return false
    active.add(candidate)
    const children = Array.isArray(candidate) ? candidate : Object.values(candidate)
    for (const child of children) if (!visit(child, depth + 1)) return false
    active.delete(candidate)
    return true
  }
  return visit(value, 0)
}

export function parseBoundedJson(value: string): JsonValue | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return isBoundedJsonValue(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}
