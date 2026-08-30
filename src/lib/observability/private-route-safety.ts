const shareTokenPathPattern = /^\/s\/[0-9a-f]{64}\/?$/i

const privateAccessParameterNames = new Set([
  'k',
  'access',
  'accesskey',
  'accesstoken',
  'token',
  'secret',
  'password',
  'email',
  'phone',
])

const accessKeysByThreadId = new Map<string, string>()
const privateRecordAccessStoragePrefix = 'ae.privateRecordAccess.'
let privateRecordTelemetryBlocked = false
const filteredTelemetryValue = '[Filtered]'
const maxTelemetryMessageLength = 1_000
const maxTelemetryStackLength = 8_000
const maxTelemetryDepth = 12
const sanitizedErrorMetadataKeys = ['category', 'request', 'requestId', 'correlationId', 'code', 'status'] as const

const privateKeyPemPattern = /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/giu
const authorizationPattern = /(\bAuthorization\b\s*["']?\s*[:=]\s*)(["']?)(Bearer|Basic)\s+([^"'`,;\s]+)\2/giu
const cookieHeaderPattern = /(\b(?:Cookie|Set-Cookie)\b\s*["']?\s*[:=]\s*)[^\r\n]*/giu
const urlUserInfoPattern = /(\bhttps?:\/\/)[^/\s?#@]+(?::[^/\s?#@]*)?@/giu
const secretAssignmentPattern = /(\b(?:[A-Za-z0-9]+[_-])*(?:key|token|secret|password|api[_-]?key|access[_-]?(?:key|token)|client[_-]?secret)\b\s*["']?\s*[:=]\s*)(["']?)([^"'`\s,;&}\]]+)\2/giu
const relativeUrlQueryPattern = /(^|\s)(\/[^\s?#]*)[?#][^\s"'`]*/giu

/**
 * Declared structurally rather than via `Pick<Location, …>`. Convex functions
 * reach this module and their tsconfig has no DOM lib, so depending on ambient
 * browser types breaks `convex dev`/`deploy` for the entire function graph.
 */
export type BrowserLocationLike = Readonly<{ pathname: string; search: string; hash: string }>
export type BrowserHistoryLike = { state: unknown; replaceState: (state: unknown, unused: string, url?: string | null) => void }
export type BrowserSessionStorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function encodePrivateRecordFragment(accessKey: string): string {
  const parameters = new URLSearchParams({ access: accessKey })
  return `#record&${parameters.toString()}`
}

export function decodePrivateRecordFragment(hash: string): string | undefined {
  if (!hash.startsWith('#record&')) return undefined
  return firstPrivateAccessValue(new URLSearchParams(hash.slice('#record&'.length)))
}

export function securePrivateRecordLocation(
  location: BrowserLocationLike,
  history: BrowserHistoryLike,
  sessionStorage: BrowserSessionStorageLike | undefined = browserSessionStorage(),
): boolean {
  if (shareTokenPathPattern.test(location.pathname)) {
    privateRecordTelemetryBlocked = true
    return true
  }

  const threadId = privateRecordThreadId(location.pathname)
  if (threadId === undefined) return false


  const search = new URLSearchParams(location.search)
  const fragmentAccessKey = decodePrivateRecordFragment(location.hash)
  if (fragmentAccessKey !== undefined) {
    cachePrivateRecordAccessKey(threadId, fragmentAccessKey, sessionStorage)
  }

  const accessKey = fragmentAccessKey ?? readPrivateRecordAccessKey(threadId, sessionStorage)
  if (accessKey === undefined) return false

  privateRecordTelemetryBlocked = true
  for (const key of [...search.keys()]) {
    if (privateAccessParameterNames.has(key.toLowerCase())) search.delete(key)
  }
  const safeSearch = search.toString()
  const safeUrl = `${location.pathname}${safeSearch.length === 0 ? '' : `?${safeSearch}`}#record`
  if (location.hash !== '#record' || safeSearch !== new URLSearchParams(location.search).toString()) {
    history.replaceState(history.state, '', safeUrl)
  }
  return true
}

export function readPrivateRecordAccessKey(
  threadId: string,
  sessionStorage: BrowserSessionStorageLike | undefined = browserSessionStorage(),
): string | undefined {
  const inMemory = accessKeysByThreadId.get(threadId)
  if (inMemory !== undefined) return inMemory
  if (sessionStorage === undefined) return undefined
  try {
    const stored = sessionStorage.getItem(privateRecordAccessStorageKey(threadId))?.trim()
    if (stored === undefined || stored.length === 0) return undefined
    accessKeysByThreadId.set(threadId, stored)
    return stored
  } catch {
    return undefined
  }
}

export function blockTelemetryForPrivateRecord(): void {
  privateRecordTelemetryBlocked = true
}

export function isTelemetryAllowedForCurrentRoute(): boolean {
  const host = globalThis as typeof globalThis & {
    location?: BrowserLocationLike
    history?: BrowserHistoryLike
  }
  if (host.location !== undefined && host.history !== undefined) {
    securePrivateRecordLocation(host.location, host.history)
  }
  return !privateRecordTelemetryBlocked
}

export function safeTelemetryPath(location: Readonly<{ pathname: string }>): string {
  const pathname = location.pathname.trim()
  return pathname.startsWith('/') ? redactShareTokenPath(pathname) : '/'
}

function sanitizeTelemetryString(value: string): string {
  let redacted = value
    .replace(privateKeyPemPattern, (_match: string, label: string) =>
      `-----BEGIN ${label}-----${filteredTelemetryValue}-----END ${label}-----`)
    .replace(
      authorizationPattern,
      (_match: string, prefix: string, quote: string, scheme: string) =>
        `${prefix}${quote}${scheme} ${filteredTelemetryValue}${quote}`,
    )
    .replace(cookieHeaderPattern, (_match: string, prefix: string) => `${prefix}${filteredTelemetryValue}`)
    .replace(relativeUrlQueryPattern, (_match: string, prefix: string, pathname: string) => `${prefix}${pathname}`)
    .replace(urlUserInfoPattern, '$1[Filtered]@')
    .replace(
      secretAssignmentPattern,
      (_match: string, prefix: string, quote: string) => `${prefix}${quote}${filteredTelemetryValue}${quote}`,
    )
    .replace(
      /([?&#]|\b)(k|access|accessKey|accessToken|token|secret|password|email|phone)=([^&#\s]*)/gi,
      (_match: string, prefix: string, name: string) => `${prefix}${name}=${filteredTelemetryValue}`,
    )

  redacted = redactShareTokenPath(redacted)
  if (!/^https?:\/\//i.test(redacted)) return redacted

  try {
    return safeTelemetryPath({ pathname: new URL(redacted).pathname })
  } catch {
    return '[Filtered URL]'
  }
}

function redactShareTokenPath(value: string): string {
  return value.replace(/\/s\/[0-9a-f]{64}(?=\/|[?#\s]|$)/gi, '/s/[Filtered]')
}

function isSensitiveTelemetryKey(key: string): boolean {
  const normalizedKey = key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
  return (
    privateAccessParameterNames.has(key.toLowerCase()) ||
    privateAccessParameterNames.has(normalizedKey) ||
    /(?:^|_)(?:key|token|secret|password)$/.test(normalizedKey) ||
    /^(?:api_key|access_token|client_secret|authorization|cookie|set_cookie)$/.test(normalizedKey)
  )
}

export function sanitizeTelemetryValue(value: unknown, key?: string): unknown {
  return sanitizeTelemetryValueRecursively(value, key, new WeakSet<object>(), 0)
}

function sanitizeTelemetryValueRecursively(
  value: unknown,
  key: string | undefined,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (key !== undefined && isSensitiveTelemetryKey(key)) return filteredTelemetryValue
  if (typeof value === 'string') return sanitizeTelemetryString(value)
  if (value === null || typeof value !== 'object') return value
  if (depth >= maxTelemetryDepth) return filteredTelemetryValue
  if (value instanceof Error) return sanitizedTelemetryErrorRecord(buildSanitizedTelemetryError(value, seen))
  if (seen.has(value)) return '[Circular]'

  seen.add(value)
  try {
    const result: Record<string, unknown> = {}
    for (const entryKey of Object.keys(value as Record<string, unknown>)) {
      try {
        result[entryKey] = sanitizeTelemetryValueRecursively(
          (value as Record<string, unknown>)[entryKey],
          entryKey,
          seen,
          depth + 1,
        )
      } catch {
        result[entryKey] = filteredTelemetryValue
      }
    }
    return result
  } catch {
    return filteredTelemetryValue
  } finally {
    seen.delete(value)
  }
}

export function sanitizeTelemetryError(error: unknown): Error {
  return buildSanitizedTelemetryError(error, new WeakSet<object>())
}

function buildSanitizedTelemetryError(error: unknown, seen: WeakSet<object>): Error {
  const sourceObject = error !== null && (typeof error === 'object' || typeof error === 'function')
    ? error
    : undefined
  if (sourceObject !== undefined && seen.has(sourceObject)) return new Error(filteredTelemetryValue)
  if (sourceObject !== undefined) seen.add(sourceObject)

  try {
    const rawMessage = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : readTelemetryProperty(error, 'message')
    const rawName = error instanceof Error ? error.name : readTelemetryProperty(error, 'name')
    const rawStack = error instanceof Error ? error.stack : readTelemetryProperty(error, 'stack')
    const rawMessageText = typeof rawMessage === 'string'
      ? rawMessage
      : typeof rawMessage === 'number' || typeof rawMessage === 'boolean'
        ? String(rawMessage)
        : 'Unknown error'
    const message = boundTelemetryText(
      sanitizeTelemetryString(rawMessageText),
      maxTelemetryMessageLength,
    ) || 'Unknown error'
    const safeError = new Error(message)
    const safeName = boundTelemetryText(
      sanitizeTelemetryString(typeof rawName === 'string' ? rawName : 'Error'),
      160,
    ) || 'Error'
    safeError.name = safeName
    if (typeof rawStack === 'string' && rawStack.length > 0) {
      safeError.stack = boundTelemetryText(sanitizeTelemetryString(rawStack), maxTelemetryStackLength)
    }

    const safeErrorRecord = safeError as Error & Record<string, unknown>
    for (const metadataKey of sanitizedErrorMetadataKeys) {
      const metadata = readTelemetryProperty(error, metadataKey)
      if (metadata !== undefined && metadata !== error) {
        safeErrorRecord[metadataKey] = sanitizeTelemetryValueRecursively(
          metadata,
          metadataKey,
          seen,
          0,
        )
      }
    }
    return safeError
  } finally {
    if (sourceObject !== undefined) seen.delete(sourceObject)
  }
}

function sanitizedTelemetryErrorRecord(error: Error): Record<string, unknown> {
  const record: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  }
  if (error.stack !== undefined) record.stack = error.stack
  const errorRecord = error as Error & Record<string, unknown>
  for (const metadataKey of sanitizedErrorMetadataKeys) {
    if (Object.hasOwn(errorRecord, metadataKey)) {
      record[metadataKey] = errorRecord[metadataKey]
    }
  }
  return record
}

function readTelemetryProperty(value: unknown, key: string): unknown {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined
  try {
    return (value as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

function boundTelemetryText(value: string, maximumLength: number): string {
  return value.length <= maximumLength ? value : `${value.slice(0, maximumLength)}\n[Truncated]`
}

export function sanitizeTelemetryEvent<T>(event: T): T | null {
  if (!isTelemetryAllowedForCurrentRoute()) return null
  return sanitizeTelemetryValue(event) as T
}

function firstPrivateAccessValue(parameters: URLSearchParams): string | undefined {
  for (const [key, value] of parameters.entries()) {
    if (privateAccessParameterNames.has(key.toLowerCase()) && value.trim().length > 0) return value.trim()
  }
  return undefined
}


function cachePrivateRecordAccessKey(
  threadId: string,
  accessKey: string,
  sessionStorage: BrowserSessionStorageLike | undefined,
): void {
  accessKeysByThreadId.set(threadId, accessKey)
  if (sessionStorage === undefined) return
  try {
    sessionStorage.setItem(privateRecordAccessStorageKey(threadId), accessKey)
  } catch {
    // The in-memory copy still supports this page when session storage is unavailable.
  }
}

function privateRecordAccessStorageKey(threadId: string): string {
  return `${privateRecordAccessStoragePrefix}${encodeURIComponent(threadId)}`
}

function browserSessionStorage(): BrowserSessionStorageLike | undefined {
  // `globalThis` keeps this readable in a runtime with no DOM lib, which every
  // Convex function importing this module has.
  const host = globalThis as { sessionStorage?: BrowserSessionStorageLike }
  try {
    return host.sessionStorage
  } catch {
    return undefined
  }
}

function privateRecordThreadId(pathname: string): string | undefined {
  const match = /^\/(?:t|i)\/([^/]+)$/.exec(pathname)
  if (match === null) return undefined
  const encodedThreadId = match[1]
  if (encodedThreadId === undefined) return undefined
  try {
    return decodeURIComponent(encodedThreadId)
  } catch {
    return encodedThreadId
  }
}
