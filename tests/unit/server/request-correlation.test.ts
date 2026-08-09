import { describe, expect, it } from 'vitest'

import {
  currentRequestCorrelationId,
  readRequestCorrelationId,
  runWithRequestCorrelation,
  withRequestCorrelationHeader,
} from '@/lib/server/request-correlation'

describe('request correlation', () => {
  it('accepts a bounded safe incoming id and propagates it through the response', async () => {
    const request = new Request('https://ae.example/api/health', {
      headers: { 'x-ae-request-id': 'corr_7f3e' },
    })
    const response = await runWithRequestCorrelation(request, ({ correlationId }) => {
      expect(correlationId).toBe('corr_7f3e')
      expect(currentRequestCorrelationId()).toBe('corr_7f3e')
      return withRequestCorrelationHeader(new Response('ok'))
    })

    expect(response.headers.get('X-AE-Request-Id')).toBe('corr_7f3e')
  })

  it('replaces unsafe incoming values with a newly generated opaque id', () => {
    const request = new Request('https://ae.example/api/health', {
      headers: { 'x-ae-request-id': 'secret%3Ftoken=do-not-echo' },
    })
    const correlationId = readRequestCorrelationId(request)

    expect(correlationId).not.toBe('secret%3Ftoken=do-not-echo')
    expect(correlationId).toMatch(/^[0-9a-f-]{36}$/u)
  })
})
