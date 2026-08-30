import { describe, expect, it } from 'vitest'

import {
  buildProblem,
  defaultTitle,
  gatewayFailureToProblem,
  kindForStatus,
  operationInvokeResultToProblem,
  DEFAULT_STATUS,
} from '@/lib/errors'
import type { ProblemKind } from '@/lib/errors'

describe('kindForStatus', () => {
  const cases: Readonly<Record<number, ProblemKind>> = {
    400: 'INVALID_ARGUMENT',
    401: 'UNAUTHENTICATED',
    403: 'PERMISSION_DENIED',
    404: 'NOT_FOUND',
    405: 'METHOD_NOT_ALLOWED',
    409: 'ALREADY_EXISTS',
    413: 'PAYLOAD_TOO_LARGE',
    415: 'UNSUPPORTED_MEDIA_TYPE',
    422: 'FAILED_PRECONDITION',
    429: 'RESOURCE_EXHAUSTED',
    500: 'INTERNAL',
    503: 'UNAVAILABLE',
  }
  for (const [status, kind] of Object.entries(cases)) {
    it(`maps status ${status} to ${kind}`, () => {
      expect(kindForStatus(Number(status))).toBe(kind)
    })
  }
  it('falls back to UNKNOWN for unheard-of statuses', () => {
    expect(kindForStatus(599)).toBe('UNKNOWN')
  })
})

describe('buildProblem', () => {
  it('emits RFC 9457 shape with about:blank type and defaulted status/title', () => {
    const problem = buildProblem({ kind: 'NOT_FOUND', code: 'discovery_manifest_not_found' })
    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Not found',
      status: 404,
      kind: 'NOT_FOUND',
      code: 'discovery_manifest_not_found',
    })
    expect(problem).not.toHaveProperty('detail')
  })

  it('defaults no_data status to 200', () => {
    expect(buildProblem({ kind: 'no_data', code: 'no_match' }).status).toBe(200)
  })

  it('lets explicit status and extras set non-reserved fields', () => {
    const problem = buildProblem({
      kind: 'FAILED_PRECONDITION',
      code: 'unsupported_query_parameter',
      status: 400,
      detail: 'Bad param',
      extras: { unsupported: ['mode'] },
    })
    expect(problem.status).toBe(400)
    expect(problem.detail).toBe('Bad param')
    expect(problem.unsupported).toEqual(['mode'])
  })

  it('never lets extras overwrite reserved canonical members', () => {
    const problem = buildProblem({
      kind: 'NOT_FOUND',
      code: 'x',
      extras: { kind: 'INTERNAL', status: 999, code: 'evil', type: 'urn:evil' },
    })
    expect(problem.kind).toBe('NOT_FOUND')
    expect(problem.status).toBe(404)
    expect(problem.code).toBe('x')
    expect(problem.type).toBe('about:blank')
  })

  it('omits optional members when absent and keeps retryable/reason when present', () => {
    const bare = buildProblem({ kind: 'RESOURCE_EXHAUSTED', code: 'rate_limited' })
    expect(bare).not.toHaveProperty('retryable')
    expect(bare).not.toHaveProperty('reason')
    const rich = buildProblem({ kind: 'UNAVAILABLE', code: 'provider_error', retryable: true, reason: 'upstream 503' })
    expect(rich.retryable).toBe(true)
    expect(rich.reason).toBe('upstream 503')
  })

  it('has a title for every kind', () => {
    const kinds: ProblemKind[] = [
      'INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'UNAUTHENTICATED', 'PERMISSION_DENIED',
      'NOT_FOUND', 'ALREADY_EXISTS', 'METHOD_NOT_ALLOWED', 'PAYLOAD_TOO_LARGE',
      'UNSUPPORTED_MEDIA_TYPE', 'RESOURCE_EXHAUSTED', 'UNAVAILABLE', 'INTERNAL', 'UNKNOWN', 'no_data',
    ]
    for (const kind of kinds) {
      expect(defaultTitle(kind).length).toBeGreaterThan(0)
    }
  })
})

describe('gateway failure projection', () => {
  it('maps auth, budget, provider, and unknown failures through canonical kinds', () => {
    expect(gatewayFailureToProblem({ code: 'authentication_required', kind: 'refused' }))
      .toEqual({ kind: 'UNAUTHENTICATED', code: 'authentication_required' })
    expect(gatewayFailureToProblem({ code: 'provider_unavailable', kind: 'error', retryable: true }))
      .toEqual({ kind: 'UNAVAILABLE', code: 'provider_unavailable', retryable: true })
    expect(gatewayFailureToProblem({ code: 'private provider response', kind: 'error' }))
      .toEqual({ kind: 'INTERNAL', code: 'operation_invoke_failed' })
  })
  it('maps grant, idempotency, rate, and reconciliation refusals by cause', () => {
    expect(gatewayFailureToProblem({ code: 'grant_revoked', kind: 'refused' }))
      .toEqual({ kind: 'PERMISSION_DENIED', code: 'grant_revoked' })
    expect(gatewayFailureToProblem({ code: 'authority_denied', kind: 'refused' }))
      .toEqual({ kind: 'PERMISSION_DENIED', code: 'authority_denied' })
    expect(gatewayFailureToProblem({ code: 'idempotency_conflict', kind: 'refused' }))
      .toEqual({ kind: 'ALREADY_EXISTS', code: 'idempotency_conflict' })
    expect(gatewayFailureToProblem({ code: 'concurrency_limited', kind: 'refused', retryable: true }))
      .toEqual({ kind: 'RESOURCE_EXHAUSTED', code: 'concurrency_limited', retryable: true })
    expect(gatewayFailureToProblem({ code: 'source_unavailable', kind: 'error', retryable: true }))
      .toEqual({ kind: 'UNAVAILABLE', code: 'source_unavailable', retryable: true })
    expect(gatewayFailureToProblem({ code: 'result_invalid', kind: 'error', retryable: false }))
      .toEqual({ kind: 'INTERNAL', code: 'result_invalid', retryable: false })
  })

  it('keeps domain outcomes typed while projecting only refusal/error variants', () => {
    expect(operationInvokeResultToProblem({
      kind: 'completed',
      invocationRef: 'invocation:1',
      operationRef: 'operation:1',
      output: {},
    })).toBeNull()
    expect(operationInvokeResultToProblem({
      kind: 'pending',
      invocationRef: 'invocation:1',
      operationRef: 'operation:1',
      retryAfterMs: 100,
    })).toBeNull()
    expect(operationInvokeResultToProblem({ kind: 'refused', code: 'rate_limited', retryable: true }))
      .toEqual({ kind: 'RESOURCE_EXHAUSTED', code: 'rate_limited', retryable: true })
    expect(operationInvokeResultToProblem({ kind: 'error', code: 'provider_unavailable', retryable: true, reason: 'secret upstream body' }))
      .toEqual({ kind: 'UNAVAILABLE', code: 'provider_unavailable', retryable: true })
  })
})

describe('DEFAULT_STATUS', () => {
  it('is exhaustive over every kind', () => {
    const kinds = Object.keys(DEFAULT_STATUS)
    expect(kinds).toHaveLength(14)
    expect(kinds).toContain('no_data')
    expect(DEFAULT_STATUS.no_data).toBe(200)
  })
})
