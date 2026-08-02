/**
 * The signed browser-guest assertion: mint and verify, with no transport,
 * cookie, or framework dependency, so both the root host and the Convex source
 * can use the same verifier.
 *
 * The browser never states who it is. The server mints a random session id and
 * signs `v1.sessionId.issuedAtMs` with a server-only key; a caller can neither
 * choose nor forge a principal, only present a token this server issued.
 *
 * Key and token format match the anonymous Customer Request submit already in
 * production (`src/lib/server/customer-request-browser-api.ts`,
 * `AE_CONVEX_SERVER_FUNCTION_TOKEN` + HMAC-SHA-256).
 */

import { constantTimeStringEqual } from '@/lib/server/constant-time'
import { base64Codec } from '@/modules/common/base64-codec'

export const BROWSER_GUEST_COOKIE_NAME = 'ae_guest_session'
export const BROWSER_GUEST_LIFETIME_SECONDS = 24 * 60 * 60

const SESSION_VERSION = 'v1'
const LIFETIME_MS = BROWSER_GUEST_LIFETIME_SECONDS * 1_000
const CLOCK_SKEW_MS = 5_000

export type BrowserGuestPrincipal = Readonly<{
  sessionId: string
  issuedAt: number
  principalId: string
}>

export type BrowserGuestKeyOptions = Readonly<{
  env?: Record<string, string | undefined>
  now?: () => number
}>

/** `browser_guest:` keeps a guest impossible to confuse with a Clerk user or an agent key. */
export function browserGuestPrincipalId(sessionId: string): string {
  return `browser_guest:${sessionId}`
}

/** The shared signing key, or `undefined` when the deployment has none configured. */
export function readBrowserGuestSigningKey(options: BrowserGuestKeyOptions = {}): string | undefined {
  const key = (options.env ?? process.env).AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  return key !== undefined && key.length >= 32 ? key : undefined
}

export async function mintBrowserGuestAssertion(
  key: string,
  input: Readonly<{ sessionId: string; issuedAt: number }>,
): Promise<string> {
  const material = `${SESSION_VERSION}.${input.sessionId}.${input.issuedAt}`
  return `${material}.${await sign(key, material)}`
}

/**
 * Verifies signature, format and freshness. Returns the derived principal, or
 * `undefined` for every failure — callers fail closed and never see a reason
 * they could probe.
 */
export async function verifyBrowserGuestAssertion(
  key: string,
  token: string,
  options: BrowserGuestKeyOptions = {},
): Promise<BrowserGuestPrincipal | undefined> {
  const [version, sessionId, rawIssuedAt, signature, ...rest] = token.split('.')
  if (rest.length > 0 || version !== SESSION_VERSION || !isSessionId(sessionId) || signature === undefined) return undefined

  const issuedAt = Number(rawIssuedAt)
  const now = (options.now ?? Date.now)()
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now + CLOCK_SKEW_MS || now - issuedAt > LIFETIME_MS) return undefined
  if (!await verify(key, `${version}.${sessionId}.${issuedAt}`, signature)) return undefined

  return { sessionId, issuedAt, principalId: browserGuestPrincipalId(sessionId) }
}

function isSessionId(value: string | undefined): value is string {
  return value !== undefined && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
}

async function sign(key: string, material: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await importKey(key), new TextEncoder().encode(material))
  return base64Codec.toBase64Url(new Uint8Array(signature))
}

async function verify(key: string, material: string, signature: string): Promise<boolean> {
  const expected = await sign(key, material)
  return constantTimeStringEqual(expected, signature)
}

function importKey(key: string) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}
