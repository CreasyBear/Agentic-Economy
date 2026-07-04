import { describe, expect, it } from 'vitest'

import { AeEndpointCheckStandardVersion } from '@/modules/capabilities/public'
import {
  AeEndpointCheckAllowedMethods,
  AeEndpointCheckFreshnessWindowMsByKind,
  evaluateContradictionFacet,
  evaluateFreshnessFacet,
  evaluateReachabilityFacet,
  evaluateSchemaFacet,
} from '@/modules/capabilities/internal/check-standard'

describe('ae-endpoint-check:v1 facet evaluator', () => {
  it('publishes the exact standard version, allowed methods, and per-kind freshness windows', () => {
    expect(AeEndpointCheckStandardVersion).toBe('ae-endpoint-check:v1')
    expect(AeEndpointCheckAllowedMethods).toEqual(['GET', 'HEAD'])
    expect(AeEndpointCheckFreshnessWindowMsByKind).toEqual({
      informational_page: 86_400_000,
      inquiry_intake: 86_400_000,
      business_endpoint: 3_600_000,
      action_card: null,
    })
  })

  it('returns typed reachability facet results for success and expected fetch failures', () => {
    expect(
      evaluateReachabilityFacet({
        method: 'HEAD',
        url: 'https://origin.example/.well-known/ucp',
        statusCode: 204,
        tlsValid: true,
        timedOut: false,
        exhausted: false,
      }),
    ).toEqual({ facet: 'reachability', outcome: 'pass', code: 'reachable' })

    const failures = [
      {
        name: 'rejects non-HTTPS origins',
        input: {
          method: 'GET',
          url: 'http://origin.example/.well-known/ucp',
          statusCode: 200,
          tlsValid: true,
          timedOut: false,
          exhausted: false,
        },
        expected: { reason: 'non_https', retryable: false, exhausted: false },
      },
      {
        name: 'rejects unsupported methods',
        input: {
          method: 'POST',
          url: 'https://origin.example/.well-known/ucp',
          statusCode: 200,
          tlsValid: true,
          timedOut: false,
          exhausted: false,
        },
        expected: { reason: 'unsupported_method', retryable: false, exhausted: false },
      },
      {
        name: 'reports invalid TLS',
        input: {
          method: 'GET',
          url: 'https://origin.example/.well-known/ucp',
          statusCode: 200,
          tlsValid: false,
          timedOut: false,
          exhausted: true,
        },
        expected: { reason: 'tls_invalid', retryable: false, exhausted: true },
      },
      {
        name: 'reports non-2xx responses as retryable until exhausted',
        input: {
          method: 'GET',
          url: 'https://origin.example/.well-known/ucp',
          statusCode: 503,
          tlsValid: true,
          timedOut: false,
          exhausted: false,
        },
        expected: { reason: 'http_status', retryable: true, exhausted: false },
      },
      {
        name: 'reports timeouts as retryable until exhausted',
        input: {
          method: 'GET',
          url: 'https://origin.example/.well-known/ucp',
          statusCode: 200,
          tlsValid: true,
          timedOut: true,
          exhausted: true,
        },
        expected: { reason: 'timeout', retryable: true, exhausted: true },
      },
    ]

    for (const { expected, input, name } of failures) {
      expect(evaluateReachabilityFacet(input), name).toEqual({
        facet: 'reachability',
        outcome: 'fail',
        code: 'unreachable',
        ...expected,
      })
    }
  })

  it('returns typed schema facet results for strict parse success and forbidden claim failures', () => {
    expect(
      evaluateSchemaFacet({ schemaRef: 'ae-ucp:v1', strictParse: true, forbiddenClaims: [], exhausted: false }),
    ).toEqual({ facet: 'schema', outcome: 'pass', code: 'schema_conformant' })

    expect(
      evaluateSchemaFacet({ schemaRef: 'ae-ucp:v1', strictParse: false, forbiddenClaims: [], exhausted: false }),
    ).toEqual({
      facet: 'schema',
      outcome: 'fail',
      code: 'schema_invalid',
      reason: 'parse_failed',
      retryable: false,
      exhausted: false,
    })

    expect(
      evaluateSchemaFacet({
        schemaRef: 'ae-ucp:v1',
        strictParse: true,
        forbiddenClaims: ['callable', 'paymentRequired', 'price', 'verified'],
        exhausted: true,
      }),
    ).toEqual({
      facet: 'schema',
      outcome: 'fail',
      code: 'schema_invalid',
      reason: 'forbidden_claim',
      forbiddenClaims: ['callable', 'paymentRequired', 'price', 'verified'],
      retryable: false,
      exhausted: true,
    })
  })

  it('returns typed freshness facet results for fresh, stale, and source-hash drift cases', () => {
    expect(
      evaluateFreshnessFacet({
        kind: 'business_endpoint',
        now: 3_599_999,
        generatedAt: 0,
        sourceHash: 'sha256:same',
        previousSourceHash: 'sha256:same',
      }),
    ).toEqual({ facet: 'freshness', outcome: 'pass', code: 'fresh', windowMs: 3_600_000 })

    expect(
      evaluateFreshnessFacet({
        kind: 'business_endpoint',
        now: 3_600_001,
        generatedAt: 0,
        sourceHash: 'sha256:same',
        previousSourceHash: 'sha256:same',
      }),
    ).toEqual({ facet: 'freshness', outcome: 'stale', code: 'window_exceeded', windowMs: 3_600_000 })

    expect(
      evaluateFreshnessFacet({
        kind: 'inquiry_intake',
        now: 60_000,
        generatedAt: 0,
        sourceHash: 'sha256:new',
        previousSourceHash: 'sha256:old',
      }),
    ).toEqual({ facet: 'freshness', outcome: 'stale', code: 'source_hash_changed', windowMs: 86_400_000 })
  })

  it('returns typed contradiction facet results instead of throwing on AE-held fact conflicts', () => {
    expect(evaluateContradictionFacet({ contradictions: [] })).toEqual({
      facet: 'contradiction',
      outcome: 'pass',
      code: 'not_contradicted',
    })

    expect(evaluateContradictionFacet({ contradictions: ['name', 'service'] })).toEqual({
      facet: 'contradiction',
      outcome: 'contradicted',
      code: 'ae_held_fact_conflict',
      fields: ['name', 'service'],
    })
  })
})
