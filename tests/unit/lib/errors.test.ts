import { describe, expect, it } from 'vitest'

import {
  ANSWER_TURN_PROBLEM_CODES,
  buildAnswerTurnProblem,
  buildProblem,
  defaultTitle,
  kindForStatus,
  operationResultToProblem,
  parseAnswerTurnProblem,
  parseAnswerTurnProblemStrict,
  redactAnswerTurnProblem,
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

describe('answer turn problems', () => {
  it('has the complete literal answer code set', () => {
    expect(ANSWER_TURN_PROBLEM_CODES).toContain('missing_turn_key')
    expect(ANSWER_TURN_PROBLEM_CODES).toContain('answer_turn_idempotency_conflict')
    expect(ANSWER_TURN_PROBLEM_CODES).toContain('answer_turn_in_progress')
    expect(ANSWER_TURN_PROBLEM_CODES).toHaveLength(25)
  })

  it('maps known codes through static RFC fields', () => {
    expect(buildAnswerTurnProblem('rate_limited')).toEqual({
      type: 'about:blank',
      title: 'Resource exhausted',
      status: 429,
      kind: 'RESOURCE_EXHAUSTED',
      code: 'rate_limited',
      detail: 'Too many answer requests. Try again shortly.',
      retryable: true,
    })
  })

  it('redacts private fields and provider detail while preserving the stable code', () => {
    const parsed = parseAnswerTurnProblem({
      type: 'urn:private',
      title: 'provider leaked',
      status: 500,
      kind: 'INTERNAL',
      code: 'grounding_failed',
      detail: 'secret provider response',
      reason: 'raw stack',
      copyId: 'private-copy-id',
      instance: '/private/trace',
    })
    expect(parsed).toEqual(buildAnswerTurnProblem('grounding_failed'))
    expect(parsed).not.toHaveProperty('copyId')
    expect(parsed).not.toHaveProperty('reason')
    expect(parsed).not.toHaveProperty('instance')
  })

  it('fails closed for unknown and malformed problem payloads', () => {
    expect(redactAnswerTurnProblem({ code: 'private_agent_code', detail: 'secret' }))
      .toEqual(buildAnswerTurnProblem('answer_turn_failed'))
    expect(parseAnswerTurnProblem({ detail: 'missing code' })).toBeUndefined()
    expect(parseAnswerTurnProblem({ code: 42 })).toBeUndefined()
  })

  it('accepts canonical wire problems and rejects unknown/private fields', () => {
    const canonical = buildAnswerTurnProblem('answer_turn_failed')
    expect(parseAnswerTurnProblemStrict(canonical)).toEqual(canonical)
    expect(parseAnswerTurnProblemStrict({ ...canonical, copyId: 'private-copy-id' })).toBeUndefined()
    expect(parseAnswerTurnProblemStrict({ ...canonical, code: 'private_agent_code' })).toBeUndefined()
  })
})

describe('operationResultToProblem', () => {
  it('returns null for ok', () => {
    expect(operationResultToProblem({
      kind: 'ok',
      operationRef: 'operation:v1:abc',
      capabilityId: 'c',
      name: 'n',
      output: {},
      evidenceHash: 'h',
    })).toBeNull()
  })

  it('maps refused operation_not_found to NOT_FOUND', () => {
    expect(operationResultToProblem({ kind: 'refused', operationRef: 'r', reason: 'operation_not_found' }))
      .toMatchObject({ kind: 'NOT_FOUND', code: 'operation_not_found' })
  })
  it('maps refused input_invalid to INVALID_ARGUMENT', () => {
    expect(operationResultToProblem({ kind: 'refused', operationRef: 'r', reason: 'input_invalid' }))
      .toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'input_invalid' })
  })
  it('maps other refusals to FAILED_PRECONDITION with the reason as code', () => {
    expect(operationResultToProblem({ kind: 'refused', operationRef: 'r', reason: 'operation_not_keyless' }))
      .toMatchObject({ kind: 'FAILED_PRECONDITION', code: 'operation_not_keyless' })
    expect(operationResultToProblem({ kind: 'refused', operationRef: 'r', reason: 'endpoint_invalid' }))
      .toMatchObject({ kind: 'FAILED_PRECONDITION', code: 'endpoint_invalid' })
    expect(operationResultToProblem({ kind: 'refused', operationRef: 'r', reason: 'operation_not_executable' }))
      .toMatchObject({ kind: 'FAILED_PRECONDITION', code: 'operation_not_executable' })
  })

  it('maps retryable provider/fetch errors to UNAVAILABLE retryable true', () => {
    expect(operationResultToProblem({ kind: 'error', operationRef: 'r', code: 'provider_error', retryable: true, reason: 'upstream 503' }))
      .toMatchObject({ kind: 'UNAVAILABLE', code: 'provider_error', retryable: true, detail: 'upstream 503' })
    expect(operationResultToProblem({ kind: 'error', operationRef: 'r', code: 'fetch_failed', retryable: true, reason: 'dns' }))
      .toMatchObject({ kind: 'UNAVAILABLE', code: 'fetch_failed', retryable: true })
  })
  it('maps non-retryable response_invalid to INTERNAL', () => {
    expect(operationResultToProblem({ kind: 'error', operationRef: 'r', code: 'response_invalid', retryable: false, reason: 'schema mismatch' }))
      .toMatchObject({ kind: 'INTERNAL', code: 'response_invalid', retryable: false })
  })
  it('respects result.retryable instead of the code heuristic', () => {
    // provider_error with retryable:false must NOT map to UNAVAILABLE.
    expect(operationResultToProblem({ kind: 'error', operationRef: 'r', code: 'provider_error', retryable: false, reason: 'declined' }))
      .toMatchObject({ kind: 'INTERNAL', code: 'provider_error', retryable: false })
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
