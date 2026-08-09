import { describe, expect, it, vi } from 'vitest'

const serverMocks = vi.hoisted(() => ({
  getCookie: vi.fn(),
  getRequest: vi.fn(() => new Request('http://localhost/')),
  setCookie: vi.fn(),
}))

vi.mock('@tanstack/react-start/server', () => serverMocks)

import {
  clearBrowserGuestSession,
  readBrowserGuestSession,
  resolveBrowserGuestSession,
} from '@/lib/server/browser-guest-session'
import {
  BROWSER_GUEST_LIFETIME_SECONDS,
  mintBrowserGuestAssertion,
  verifyBrowserGuestAssertion,
} from '@/lib/server/browser-guest-assertion'

const signingKey = 'browser-guest-session-signing-key-for-unit-tests'
const issuedAt = 1_754_000_000_000
const firstSessionId = '123e4567-e89b-42d3-a456-426614174000'
const secondSessionId = '123e4567-e89b-42d3-a456-426614174001'

function principal(sessionId: string): string {
  return `browser_guest:${sessionId}`
}

type CookieWrite = Readonly<{ name: string; value: string; maxAgeSeconds: number }>

function options(overrides: {
  now?: number
  randomUUID?: string | (() => string)
  readCookie?: (name: string) => string | undefined
  writeCookie?: (name: string, value: string, maxAgeSeconds: number) => void
} = {}) {
  const randomUUID = overrides.randomUUID
  const writeCookie = overrides.writeCookie
  return {
    env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: signingKey },
    now: () => overrides.now ?? issuedAt,
    randomUUID: typeof randomUUID === 'function'
      ? randomUUID
      : () => randomUUID ?? firstSessionId,
    readCookie: overrides.readCookie ?? (() => undefined),
    ...(writeCookie === undefined ? {} : { writeCookie }),
  }
}

describe('browser guest session seam', () => {
  it('mints a signed session, persists it as a cookie, and derives the browser principal', async () => {
    const writes: CookieWrite[] = []

    const session = await resolveBrowserGuestSession(options({
      writeCookie: (name, value, maxAgeSeconds) => writes.push({ name, value, maxAgeSeconds }),
    }))

    expect(session).toMatchObject({
      sessionId: firstSessionId,
      issuedAt,
      principalId: principal(firstSessionId),
    })
    expect(session?.assertion).toMatch(new RegExp(`^v1\\.${firstSessionId}\\.${issuedAt}\\.[A-Za-z0-9_-]{43}$`, 'u'))
    expect(writes).toEqual([{
      name: 'ae_guest_session',
      value: session?.assertion,
      maxAgeSeconds: 86_400,
    }])
  })

  it('verifies an existing session and preserves its principal without reminting', async () => {
    let cookie: string | undefined
    const first = await resolveBrowserGuestSession(options({
      writeCookie: (_name, value) => { cookie = value },
    }))
    const randomUUID = vi.fn(() => secondSessionId)
    const writeCookie = vi.fn()

    const resumed = await resolveBrowserGuestSession(options({
      readCookie: () => cookie,
      randomUUID,
      writeCookie,
    }))

    expect(resumed).toEqual(first)
    expect(randomUUID).not.toHaveBeenCalled()
    expect(writeCookie).not.toHaveBeenCalled()
  })

  it('does not accept a tampered assertion as the existing principal', async () => {
    let cookie: string | undefined
    await resolveBrowserGuestSession(options({
      writeCookie: (_name, value) => { cookie = value },
    }))
    const tampered = `${cookie?.slice(0, -1)}${cookie?.endsWith('0') ? '1' : '0'}`
    const writes: CookieWrite[] = []

    const replacement = await resolveBrowserGuestSession(options({
      randomUUID: secondSessionId,
      readCookie: () => tampered,
      writeCookie: (name, value, maxAgeSeconds) => writes.push({ name, value, maxAgeSeconds }),
    }))

    expect(replacement?.sessionId).toBe(secondSessionId)
    expect(replacement?.principalId).toBe(principal(secondSessionId))
    expect(replacement?.assertion).not.toBe(tampered)
    expect(writes).toHaveLength(1)
  })

  it('does not accept an expired assertion as the existing principal', async () => {
    let cookie: string | undefined
    await resolveBrowserGuestSession(options({
      writeCookie: (_name, value) => { cookie = value },
    }))
    const writes: CookieWrite[] = []
    const replacement = await resolveBrowserGuestSession(options({
      now: issuedAt + 86_400_001,
      randomUUID: secondSessionId,
      readCookie: () => cookie,
      writeCookie: (name, value, maxAgeSeconds) => writes.push({ name, value, maxAgeSeconds }),
    }))

    expect(replacement?.sessionId).toBe(secondSessionId)
    expect(replacement?.principalId).toBe(principal(secondSessionId))
    expect(writes).toHaveLength(1)
  })
  it('reads a claim candidate without minting and clears it after claim', async () => {
    let cookie: string | undefined
    const first = await resolveBrowserGuestSession(options({
      writeCookie: (_name, value) => { cookie = value },
    }))
    const randomUUID = vi.fn(() => secondSessionId)
    const read = await readBrowserGuestSession(options({
      readCookie: () => cookie,
      randomUUID,
    }))

    expect(read).toEqual(first)
    expect(randomUUID).not.toHaveBeenCalled()

    const writes: CookieWrite[] = []
    clearBrowserGuestSession({
      writeCookie: (name, value, maxAgeSeconds) => writes.push({ name, value, maxAgeSeconds }),
    })
    expect(writes).toEqual([{ name: 'ae_guest_session', value: '', maxAgeSeconds: 0 }])
  })
  it('does not mark an HTTP local cookie Secure', async () => {
    serverMocks.setCookie.mockReset()
    await resolveBrowserGuestSession({
      env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: signingKey, NODE_ENV: 'development' },
      now: () => issuedAt,
      randomUUID: () => firstSessionId,
    })
    expect(serverMocks.setCookie).toHaveBeenCalledWith(
      'ae_guest_session',
      expect.any(String),
      expect.objectContaining({ secure: false }),
    )
  })
  it('fails closed when no signing key is configured', async () => {
    const writeCookie = vi.fn()

    await expect(resolveBrowserGuestSession({
      env: {},
      randomUUID: () => firstSessionId,
      writeCookie,
    })).resolves.toBeUndefined()
    expect(writeCookie).not.toHaveBeenCalled()
  })

  it('preserves signed bytes, lifetime/skew boundaries, and the derived principal', async () => {
    const assertion = await mintBrowserGuestAssertion(signingKey, {
      sessionId: firstSessionId,
      issuedAt,
    })
    expect(assertion).toBe(
      'v1.123e4567-e89b-42d3-a456-426614174000.1754000000000.iztw1U5BmyCzy5AyPR_S2UlVOHN7GMYJ1iec0HmczEk',
    )

    const expected = {
      sessionId: firstSessionId,
      issuedAt,
      principalId: principal(firstSessionId),
    }
    await expect(verifyBrowserGuestAssertion(signingKey, assertion, { now: () => issuedAt })).resolves.toEqual(expected)
    await expect(verifyBrowserGuestAssertion(signingKey, assertion, {
      now: () => issuedAt + BROWSER_GUEST_LIFETIME_SECONDS * 1_000,
    })).resolves.toEqual(expected)
    await expect(verifyBrowserGuestAssertion(signingKey, assertion, {
      now: () => issuedAt + BROWSER_GUEST_LIFETIME_SECONDS * 1_000 + 1,
    })).resolves.toBeUndefined()
    await expect(verifyBrowserGuestAssertion(signingKey, assertion, { now: () => issuedAt - 5_000 })).resolves.toEqual(expected)
    await expect(verifyBrowserGuestAssertion(signingKey, assertion, { now: () => issuedAt - 5_001 })).resolves.toBeUndefined()

    const tampered = `${assertion.slice(0, -1)}${assertion.endsWith('A') ? 'B' : 'A'}`
    await expect(verifyBrowserGuestAssertion(signingKey, tampered, { now: () => issuedAt })).resolves.toBeUndefined()
    await expect(verifyBrowserGuestAssertion(signingKey, `${assertion}.extra`, { now: () => issuedAt }))
      .resolves.toBeUndefined()
  })
})
