import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as ResendRoute } from '@/routes/api.resend.webhook'
import { Route as UnsubscribeRoute } from '@/routes/api.unsubscribe'

type Handler = (context: { request: Request }) => Response | Promise<Response>
const resend = ResendRoute.options.server?.handlers as { POST: Handler }
const unsubscribe = UnsubscribeRoute.options.server?.handlers as { GET: Handler; POST: Handler }
const fetchMock = vi.fn<typeof fetch>()

// Requires: an HTTPS Convex origin, with or without a region label.
// Ensures: raw webhook signatures/body and unsubscribe tokens reach that origin unchanged.
// Invariant: no credentials, paths, ports or unrelated hosts are accepted.
// On violation: existing 503/404 responses are returned without an upstream request.
describe('email proxy Convex origins', () => {
  beforeEach(() => {
    vi.stubEnv('CONVEX_SITE_URL', undefined)
    vi.stubEnv('CONVEX_URL', undefined)
    vi.stubEnv('VITE_CONVEX_URL', undefined)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  const origins = [
    ['CONVEX_SITE_URL', 'https://happy-animal-123.convex.site', 'https://happy-animal-123.convex.site'],
    ['CONVEX_SITE_URL', 'https://happy-animal-123.ap-southeast-2.convex.site', 'https://happy-animal-123.ap-southeast-2.convex.site'],
    ['CONVEX_URL', 'https://happy-animal-123.ap-southeast-2.convex.cloud', 'https://happy-animal-123.ap-southeast-2.convex.site'],
    ['VITE_CONVEX_URL', 'https://happy-animal-123.ap-southeast-2.convex.cloud', 'https://happy-animal-123.ap-southeast-2.convex.site'],
  ] as const

  it.each(origins)('forwards a signed webhook using %s=%s', async (name, value, origin) => {
    vi.stubEnv(name, value)
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }))
    const body = '{ "type": "email.sent" }'
    const headers = { 'svix-id': 'event-1', 'svix-timestamp': '123', 'svix-signature': 'test-signature' }
    const response = await resend.POST({ request: new Request('https://ae.test/api/resend/webhook', { method: 'POST', body, headers }) })

    expect(response.status).toBe(400)
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${origin}/resend/webhook`, {
      method: 'POST', body, redirect: 'manual', headers: expect.any(Headers),
    })
    const forwardedHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    for (const [name, value] of Object.entries(headers)) expect(forwardedHeaders.get(name)).toBe(value)
  })

  it.each(origins)('forwards unsubscribe confirmation using %s=%s', async (name, value, origin) => {
    vi.stubEnv(name, value)
    const token = 'v1.a+b/c=d'
    const target = `${origin}/notifications/unsubscribe?t=${encodeURIComponent(token)}`
    const url = `https://ae.test/api/unsubscribe?t=${encodeURIComponent(token)}`

    const get = await unsubscribe.GET({ request: new Request(url) })
    expect(get.status).toBe(302)
    expect(get.headers.get('location')).toBe(target)
    expect(fetchMock).not.toHaveBeenCalled()

    fetchMock.mockResolvedValueOnce(new Response('confirmed', { status: 200 }))
    const post = await unsubscribe.POST({ request: new Request(url, { method: 'POST' }) })
    expect(post.status).toBe(200)
    await expect(post.text()).resolves.toBe('confirmed')
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(target, { method: 'POST', redirect: 'manual' })
  })

  it.each([
    undefined,
    'http://happy-animal-123.convex.site',
    'https://happy-animal-123.convex.site.attacker.test',
    'https://attacker.test',
    'https://user:password@happy-animal-123.convex.site',
    'https://happy-animal-123.convex.site:8443',
    'https://happy-animal-123.convex.site/path',
    'https://happy-animal-123.convex.site?redirect=attacker.test',
  ])('rejects invalid configured origin %s before forwarding', async (origin) => {
    vi.stubEnv('CONVEX_SITE_URL', origin)
    const webhook = await resend.POST({ request: new Request('https://ae.test/api/resend/webhook', { method: 'POST', body: '{}' }) })
    const optOut = await unsubscribe.POST({ request: new Request('https://ae.test/api/unsubscribe?t=token', { method: 'POST' }) })
    expect(webhook.status).toBe(503)
    expect(optOut.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
