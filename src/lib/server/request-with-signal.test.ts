import { describe, expect, it } from 'vitest'

import { withSignal } from './request-with-signal'

describe('withSignal', () => {
  it('rebinds a srvx-style request that has Request.prototype but no undici state', () => {
    const real = new Request('https://example.test/market?q=a', { headers: { 'x-a': '1' } })
    const nodeRequest = Object.create(Request.prototype, {
      url: { value: real.url }, method: { value: 'GET' }, headers: { value: real.headers },
    }) as Request
    expect(() => new Request(nodeRequest, { signal: AbortSignal.timeout(1000) })).toThrow()
    const controller = new AbortController()
    const bound = withSignal(nodeRequest, controller.signal)
    expect(bound.url).toBe(real.url)
    expect(bound.headers.get('x-a')).toBe('1')
    controller.abort()
    expect(bound.signal.aborted).toBe(true)
  })
})
