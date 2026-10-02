import type { Page } from '@playwright/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyVercelProtectionBypassToPage, vercelProtectionBypassCookie } from '../../deploy-smoke/vercel-bypass'

const fetch = vi.fn<typeof globalThis.fetch>()

beforeEach(() => {
  vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'test-bypass-value')
  vi.stubEnv('AE_CUSTOMER_REQUEST_VERCEL_BYPASS_SECRET', '')
  vi.stubGlobal('fetch', fetch)
  fetch.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('protected staging access', () => {
  it('exchanges the secret only at the selected origin and scopes browser access to that host', async () => {
    fetch.mockResolvedValue(new Response(null, {
      status: 307,
      headers: { 'set-cookie': '_vercel_jwt=opaque-cookie; Path=/; Secure; HttpOnly', location: 'https://elsewhere.example' },
    }))
    const addCookies = vi.fn()
    const page = { context: () => ({ addCookies }) } as unknown as Page

    await applyVercelProtectionBypassToPage(page, new URL('https://staging.example'))

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(new URL('https://staging.example/'), {
      redirect: 'manual',
      signal: expect.any(AbortSignal),
      headers: {
        'x-vercel-protection-bypass': 'test-bypass-value',
        'x-vercel-set-bypass-cookie': 'true',
      },
    })
    expect(addCookies).toHaveBeenCalledWith([{
      name: '_vercel_jwt', value: 'opaque-cookie', domain: 'staging.example', path: '/',
      expires: -1, httpOnly: true, secure: true, sameSite: 'Lax',
    }])
  })

  it('makes no bypass request when no secret is configured', async () => {
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', '')
    await expect(vercelProtectionBypassCookie(new URL('http://127.0.0.1:3021'))).resolves.toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['http://staging.example', 'https://user:password@staging.example'])('refuses an unsafe secret destination before making a request: %s', async (target) => {
    await expect(vercelProtectionBypassCookie(new URL(target))).rejects.toThrow('HTTPS origin without URL credentials')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stops when the exchange returns no cookie without exposing its response body', async () => {
    fetch.mockResolvedValue(new Response('private provider diagnostic', { status: 401 }))
    await expect(vercelProtectionBypassCookie(new URL('https://staging.example')))
      .rejects.toThrow('Vercel protection bypass did not return a bypass cookie.')
  })

  it('does not mistake an unrelated application cookie for deployment access', async () => {
    fetch.mockResolvedValue(new Response(null, { headers: { 'set-cookie': 'session=private-session; Path=/' } }))
    await expect(vercelProtectionBypassCookie(new URL('https://staging.example')))
      .rejects.toThrow('Vercel protection bypass did not return a bypass cookie.')
  })
})
