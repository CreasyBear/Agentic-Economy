import { describe, expect, it } from 'vitest'

import {
  encodePrivateRecordFragment,
  isTelemetryAllowedForCurrentRoute,
  readPrivateRecordAccessKey,
  sanitizeTelemetryEvent,
  sanitizeTelemetryValue,
  securePrivateRecordLocation,
  type BrowserHistoryLike,
  type BrowserLocationLike,
} from '@/lib/observability/private-route-safety'

describe('private inquiry record telemetry safety', () => {
  it('moves fragment credentials into memory, scrubs the address bar, and blocks telemetry', () => {
    const secret = 'iak1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const location: BrowserLocationLike = {
      pathname: '/t/inquiry_thread%3Aprivate-record',
      search: '?source=notification',
      hash: encodePrivateRecordFragment(secret),
    }
    const replacedUrls: string[] = []
    const history: BrowserHistoryLike = {
      state: { navigation: 'test' },
      replaceState(_data: unknown, _unused: string, url?: string | URL | null) {
        if (url !== undefined && url !== null) replacedUrls.push(String(url))
      },
    }

    expect(sanitizeTelemetryValue({
      $current_url: `https://example.test${location.pathname}?k=${secret}#record`,
      nested: { accessToken: secret, harmless: 'kept' },
    })).toEqual({
      $current_url: '/t/inquiry_thread%3Aprivate-record',
      nested: { accessToken: '[Filtered]', harmless: 'kept' },
    })

    expect(securePrivateRecordLocation(location, history)).toBe(true)
    expect(replacedUrls).toEqual(['/t/inquiry_thread%3Aprivate-record?source=notification#record'])
    expect(replacedUrls[0]).not.toContain(secret)
    expect(readPrivateRecordAccessKey('inquiry_thread:private-record')).toBe(secret)
    expect(isTelemetryAllowedForCurrentRoute()).toBe(false)
    expect(sanitizeTelemetryEvent({ event: 'pageleave', url: location })).toBeNull()
  })
})
