import { brandNonEmpty } from '@/modules/common/ids'
import type { SourceHash } from '@/modules/common/ids'

export type StableHashValue =
  | null
  | string
  | number
  | boolean
  | readonly StableHashValue[]
  | { readonly [key: string]: StableHashValue }

export function stableHash(value: StableHashValue): SourceHash {
  return brandNonEmpty(`hash:${hashString(stableStringify(value))}`, 'SourceHash')
}

export function stableStringify(value: StableHashValue): string {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (isStableHashArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }

  const record = value

  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key] ?? null)}`)
    .join(',')}}`
}

function isStableHashArray(value: StableHashValue): value is readonly StableHashValue[] {
  return Array.isArray(value)
}

function hashString(value: string): string {
  let hash = 2_166_136_261
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}
