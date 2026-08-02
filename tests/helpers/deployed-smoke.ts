import { isRecord } from '@/modules/common/is-record'

export function parseHttpsUrl(name: string, rawValue: string, errorContext: string): URL {
  let parsed: URL

  try {
    parsed = new URL(rawValue)
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${name} must use https:// for ${errorContext}.`)
  }

  if (/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname) || parsed.hostname.endsWith('.local')) {
    throw new Error(`${name} must point at a deployed environment, not localhost.`)
  }

  return parsed
}

export function resolvePath(path: string, baseUrl: URL): string {
  return new URL(path, baseUrl).toString()
}

export function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown
    if (isRecord(parsed)) {
      return parsed
    }
  } catch {
    // Handled below.
  }

  throw new Error(`Expected JSON object response, received: ${value.slice(0, 200)}`)
}

export function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected response field ${key} to be a non-empty string.`)
  }

  return value
}
