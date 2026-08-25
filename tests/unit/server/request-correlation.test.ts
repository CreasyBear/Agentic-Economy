import { describe, expect, it } from 'vitest'
import { isRedirect, redirect } from '@tanstack/react-router'

import { problem } from '@/lib/server/problem'
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
      expect(currentRequestCorrelationId()).toBeUndefined()
      return withRequestCorrelationHeader(new Response('ok'), correlationId)
    })

    expect(response.headers.get('X-AE-Request-Id')).toBe('corr_7f3e')
  })
  it('adds the correlation to RFC 9457 responses', async () => {
    const response = await runWithRequestCorrelation(
      new Request('https://ae.example/api/v1/operations/call', {
        headers: { 'x-ae-request-id': 'corr_problem_1' },
      }),
      ({ correlationId }) => withRequestCorrelationHeader(
        problem({ status: 503, kind: 'UNAVAILABLE', code: 'provider_unavailable', retryable: true }),
        correlationId,
      ),
    )

    expect(response.headers.get('x-ae-request-id')).toBe('corr_problem_1')
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    await expect(response.json()).resolves.toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'provider_unavailable',
    })
  })
  it('preserves TanStack redirect metadata while adding the correlation header', () => {
    const response = redirect({ to: '/sign-in/$' })
    const correlated = withRequestCorrelationHeader(response, 'corr_redirect_1')

    expect(correlated).toBe(response)
    expect(isRedirect(correlated)).toBe(true)
    expect(response.options).toMatchObject({ to: '/sign-in/$' })
    expect(correlated.headers.get('x-ae-request-id')).toBe('corr_redirect_1')
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
