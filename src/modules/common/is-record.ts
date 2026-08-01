/**
 * The one plain-object guard. Arrays are excluded deliberately: every call site
 * that adopted this guard was distinguishing an object payload from a JSON array.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
