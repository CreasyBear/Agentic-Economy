const privateAccessParameterNames: Readonly<Record<string, true>> = Object.freeze({
  k: true,
  access: true,
  accesskey: true,
  accesstoken: true,
  token: true,
  secret: true,
  password: true,
  email: true,
  phone: true,
})

const accessKeysByThreadId = new Map<string, string>()
const privateRecordAccessStoragePrefix = 'ae.privateRecordAccess.'
let privateRecordTelemetryBlocked = false

export type BrowserLocationLike = Pick<Location, 'pathname' | 'search' | 'hash'>
export type BrowserHistoryLike = Pick<History, 'state' | 'replaceState'>
export type BrowserSessionStorageLike = Pick<Storage, 'getItem' | 'setItem'>

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
    if (privateAccessParameterNames[key.toLowerCase()] === true) search.delete(key)
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
  return !privateRecordTelemetryBlocked
}

export function safeTelemetryPath(location: Pick<Location, 'pathname'>): string {
  const pathname = location.pathname.trim()
  return pathname.startsWith('/') ? pathname : '/'
}

export function sanitizeTelemetryValue(value: unknown, key?: string): unknown {
  if (key !== undefined && privateAccessParameterNames[key.toLowerCase()] === true) return '[Filtered]'
  if (typeof value === 'string') return sanitizeTelemetryString(value)
  if (Array.isArray(value)) return value.map((item) => sanitizeTelemetryValue(item))
  if (value === null || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeTelemetryValue(entryValue, entryKey),
    ]),
  )
}

export function sanitizeTelemetryEvent<T>(event: T): T | null {
  if (!isTelemetryAllowedForCurrentRoute()) return null
  return sanitizeTelemetryValue(event) as T
}

function firstPrivateAccessValue(parameters: URLSearchParams): string | undefined {
  for (const [key, value] of parameters.entries()) {
    if (privateAccessParameterNames[key.toLowerCase()] === true && value.trim().length > 0) return value.trim()
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
  if (typeof window === 'undefined') return undefined
  try {
    return window.sessionStorage
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

function sanitizeTelemetryString(value: string): string {
  const redacted = value.replace(
    /([?&#]|\b)(k|access|accessKey|accessToken|token|secret|password|email|phone)=([^&#\s]*)/gi,
    (_match, prefix: string, name: string) => `${prefix}${name}=[Filtered]`,
  )
  if (!/^https?:\/\//i.test(redacted)) return redacted

  try {
    return new URL(redacted).pathname
  } catch {
    return '[Filtered URL]'
  }
}
