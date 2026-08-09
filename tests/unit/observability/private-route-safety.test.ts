import { describe, expect, it } from 'vitest'

import {
  encodePrivateRecordFragment,
  isTelemetryAllowedForCurrentRoute,
  readPrivateRecordAccessKey,
  safeTelemetryPath,
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
  it('blocks telemetry and redacts share credentials from safe paths', () => {
    const shareToken = 'a'.repeat(64)
    const sharePath = `/s/${shareToken}`
    const location: BrowserLocationLike = { pathname: sharePath, search: '', hash: '' }

    expect(securePrivateRecordLocation(location, {
      state: undefined,
      replaceState: () => {},
    })).toBe(true)
    expect(safeTelemetryPath(location)).toBe('/s/[Filtered]')
    expect(sanitizeTelemetryValue({
      $current_url: `https://example.test${sharePath}`,
      path: sharePath,
    })).toEqual({
      $current_url: '/s/[Filtered]',
      path: '/s/[Filtered]',
    })
    expect(JSON.stringify(sanitizeTelemetryValue({ sharePath }))).not.toContain(shareToken)
    expect(isTelemetryAllowedForCurrentRoute()).toBe(false)
  })
})
