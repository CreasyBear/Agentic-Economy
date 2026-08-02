import { getCookie, getRequest, setCookie } from '@tanstack/react-start/server'

import {
  BROWSER_GUEST_COOKIE_NAME,
  BROWSER_GUEST_LIFETIME_SECONDS,
  browserGuestPrincipalId,
  mintBrowserGuestAssertion,
  readBrowserGuestSigningKey,
  verifyBrowserGuestAssertion,
} from './browser-guest-assertion'

/**
 * Cookie transport for the signed browser-guest assertion.
 *
 * The signing, verification and principal derivation all live in
 * `browser-guest-assertion.ts` so the Convex source can verify the same token
 * without pulling a request-scoped framework import. This module only reads and
 * writes the http-only cookie that carries it.
 *
 * The Customer Request host keeps its own `/api/requests`-scoped cookie for now
 * (`src/lib/server/customer-request-browser-api.ts`); it uses the same key and
 * token format and should be rewired onto this primitive rather than a third
 * copy being written.
 */

export type BrowserGuestSession = Readonly<{
  sessionId: string
  issuedAt: number
  /** Opaque signed token. The source verifies it; nothing else may be trusted. */
  assertion: string
  principalId: string
}>

export type BrowserGuestSessionOptions = Readonly<{
  env?: Record<string, string | undefined>
  now?: () => number
  randomUUID?: () => string
  readCookie?: (name: string) => string | undefined
  writeCookie?: (name: string, value: string, maxAgeSeconds: number) => void
  secureCookie?: boolean
}>

/**
 * Returns the caller's verified guest session, minting and setting one when the
 * request carries none or carries one that no longer verifies. Returns
 * `undefined` only when no signing key is configured, in which case the caller
 * MUST fail closed rather than proceed with an unattributed write.
 */
export async function resolveBrowserGuestSession(
  options: BrowserGuestSessionOptions = {},
): Promise<BrowserGuestSession | undefined> {
  const keyOptions = {
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.now === undefined ? {} : { now: options.now }),
  }
  const key = readBrowserGuestSigningKey(keyOptions)
  if (key === undefined) return undefined

  const read = options.readCookie ?? ((name: string) => getCookie(name))
  const token = read(BROWSER_GUEST_COOKIE_NAME)
  const existing = token === undefined ? undefined : await verifyBrowserGuestAssertion(key, token, keyOptions)
  if (existing !== undefined && token !== undefined) {
    return { sessionId: existing.sessionId, issuedAt: existing.issuedAt, assertion: token, principalId: existing.principalId }
  }
  const sessionId = options.randomUUID?.() ?? crypto.randomUUID()
  const issuedAt = (options.now ?? Date.now)()

  const assertion = await mintBrowserGuestAssertion(key, { sessionId, issuedAt })
  const write = options.writeCookie ?? ((name: string, value: string, maxAge: number) => (
    defaultWriteCookie(name, value, maxAge, options)
  ))
  write(BROWSER_GUEST_COOKIE_NAME, assertion, BROWSER_GUEST_LIFETIME_SECONDS)
  return { sessionId, issuedAt, assertion, principalId: browserGuestPrincipalId(sessionId) }
}

/** Reads an existing signed guest cookie without minting a replacement. */
export async function readBrowserGuestSession(
  options: BrowserGuestSessionOptions = {},
): Promise<BrowserGuestSession | undefined> {
  const keyOptions = {
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.now === undefined ? {} : { now: options.now }),
  }
  const key = readBrowserGuestSigningKey(keyOptions)
  if (key === undefined) return undefined
  const read = options.readCookie ?? ((name: string) => getCookie(name))
  const token = read(BROWSER_GUEST_COOKIE_NAME)
  if (token === undefined) return undefined
  const existing = await verifyBrowserGuestAssertion(key, token, keyOptions)
  if (existing === undefined) return undefined
  return { sessionId: existing.sessionId, issuedAt: existing.issuedAt, assertion: token, principalId: existing.principalId }
}

/** Revokes the browser guest transport after a project is claimed. */
export function clearBrowserGuestSession(options: BrowserGuestSessionOptions = {}): void {
  const write = options.writeCookie ?? ((name: string, value: string, maxAge: number) => (
    defaultWriteCookie(name, value, maxAge, options)
  ))
  write(BROWSER_GUEST_COOKIE_NAME, '', 0)
}


function defaultWriteCookie(
  name: string,
  value: string,
  maxAge: number,
  options: BrowserGuestSessionOptions = {},
): void {
  setCookie(name, value, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge,
    secure: options.secureCookie ?? isSecureRequest(options.env ?? process.env),
  })
}

function isSecureRequest(env: Record<string, string | undefined>): boolean {
  const configured = env.AE_COOKIE_SECURE?.trim().toLowerCase()
  if (configured === 'true') return true
  if (configured === 'false') return false

  try {
    const request = getRequest()
    const forwarded = request.headers.get('x-forwarded-proto')
    if (forwarded !== null) return forwarded.split(',')[0]?.trim().toLowerCase() === 'https'
    return new URL(request.url).protocol === 'https:'
  } catch {
    return env.NODE_ENV === 'production'
  }
}
