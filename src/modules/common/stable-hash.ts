export type StableHashValue =
  | null
  | string
  | number
  | boolean
  | readonly StableHashValue[]
  | { readonly [key: string]: StableHashValue }

export function stableStringify(value: StableHashValue): string {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (isStableValueArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }

  const record = value

  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key] ?? null)}`)
    .join(',')}}`
}
function isStableValueArray(value: StableHashValue): value is readonly StableHashValue[] {
  return Array.isArray(value)
}
