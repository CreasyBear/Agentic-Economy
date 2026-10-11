import type { ErrorEvent } from '@sentry/core'
import { describe, expect, it, vi } from 'vitest'

import { routeExpectedEvent } from '@/lib/observability/expected-events'

const ev = (message: string, tags?: Record<string, string>): ErrorEvent =>
  ({ type: undefined, message, exception: { values: [{ type: 'Error', value: message }] }, ...(tags ? { tags } : {}) }) as ErrorEvent

describe('routeExpectedEvent', () => {
  it.each([
    ['unauth', ev('unauthenticated'), undefined],
    ['busy', ev('ConvexError thread_busy'), undefined],
    ['validation', ev('ArgumentValidationError: bad'), undefined],
    ['missing fn', ev('Could not find public function for x'), undefined],
    ['cursor', ev('InvalidCursor'), undefined],
    ['degraded', ev('x', { degraded: 'site' }), undefined],
    ['4xx', ev('boom'), Object.assign(new Error('boom'), { status: 404 })],
  ])('drops %s to a breadcrumb', (_n, event, original) => {
    const crumb = vi.fn()
    expect(routeExpectedEvent(event, { originalException: original }, crumb)).toBeNull()
    expect(crumb).toHaveBeenCalledOnce()
  })

  it('keeps a real TypeError with a cause fingerprint', () => {
    const crumb = vi.fn()
    const err = Object.assign(new TypeError('x is undefined'), { code: 'bad_shape' })
    const out = routeExpectedEvent(ev('x is undefined'), { originalException: err }, crumb)
    expect(out?.fingerprint).toEqual(['{{ default }}', 'bad_shape'])
    expect(crumb).not.toHaveBeenCalled()
  })
})
