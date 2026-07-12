const safePrefixPattern = /[^a-zA-Z0-9_-]/g

export function createRuntimeId(prefix: string): string {
  const safePrefix = normalizeRuntimeIdPrefix(prefix)
  const randomUUID = globalThis.crypto?.randomUUID

  if (randomUUID === undefined) {
    throw new Error('crypto_random_uuid_unavailable')
  }

  return `${safePrefix}-${randomUUID.call(globalThis.crypto)}`
}

export function createRuntimeIdPrefix(...parts: readonly string[]): string {
  return parts.map(normalizeRuntimeIdPrefix).join('-')
}

function normalizeRuntimeIdPrefix(prefix: string): string {
  const normalized = prefix.trim().replaceAll(safePrefixPattern, '-').replace(/^-+|-+$/g, '')
  return normalized.length === 0 ? 'id' : normalized
}
