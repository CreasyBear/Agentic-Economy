import { describe, expect, it } from 'vitest'

import {
  encodePrivateRecordFragment,
  isTelemetryAllowedForCurrentRoute,
  readPrivateRecordAccessKey,
  safeTelemetryPath,
  sanitizeTelemetryError,
  sanitizeTelemetryEvent,
  sanitizeTelemetryValue,
  securePrivateRecordLocation,
  type BrowserHistoryLike,
  type BrowserLocationLike,
} from '@/lib/observability/private-route-safety'

describe('private inquiry record telemetry safety', () => {
  it('redacts secret assignments, headers, URLs, PEM bodies, and nested error fields before capture', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nprivate-key-body\n-----END PRIVATE KEY-----'
    const providerError = new Error(
      'OPENROUTER_API_KEY=sk_live_real Authorization: Bearer bearer-real',
    )
    providerError.name = 'ProviderError'
    providerError.stack = [
      providerError.message,
      'at fetchQuote (https://agent:password-real@example.test/quote?access_token=url-token)',
    ].join('\n')
    const errorRecord = providerError as Error & Record<string, unknown>
    errorRecord.category = 'provider_error'
    errorRecord.request = {
      method: 'GET',
      url: 'https://agent:password-real@example.test/quote?api_key=url-api-key',
    }
    errorRecord.correlationId = 'corr_123'

    const sanitized = sanitizeTelemetryValue({
      assignment: 'OPENROUTER_API_KEY=sk_live_real',
      bearer: 'Authorization: Bearer bearer-real',
      basic: 'Authorization: Basic basic-real',
      url: 'https://agent:password-real@example.test/quote?access_token=url-token&keep=ok',
      cookie: 'Cookie: session=cookie-secret; theme=dark',
      setCookie: 'Set-Cookie: session=set-cookie-secret; Path=/',
      pem,
      nested: { OPENROUTER_API_KEY: 'sk_live_real', benign: 'benign text' },
    })
    const safeError = sanitizeTelemetryError(providerError)
    const safeErrorRecord = safeError as Error & Record<string, unknown>
    const serialized = JSON.stringify({
      sanitized,
      safeError: {
        name: safeError.name,
        message: safeError.message,
        stack: safeError.stack,
        category: safeErrorRecord.category,
        correlationId: safeErrorRecord.correlationId,
      },
    })

    for (const secret of [
      'sk_live_real',
      'bearer-real',
      'basic-real',
      'password-real',
      'url-token',
      'url-api-key',
      'cookie-secret',
      'set-cookie-secret',
      'private-key-body',
    ]) {
      expect(serialized).not.toContain(secret)
    }
    expect(sanitized).toMatchObject({ nested: { benign: 'benign text' } })
    expect(safeError).not.toBe(providerError)
    expect(safeError.name).toBe('ProviderError')
    expect((safeError as Error & Record<string, unknown>).category).toBe('provider_error')
    expect((safeError as Error & Record<string, unknown>).correlationId).toBe('corr_123')
  })

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
