import { describe, expect, it } from 'vitest'

import { computeCapabilityTrustState } from '@/modules/capabilities/internal/capability-model'
import type { CapabilityCheckFacetResults } from '@/modules/capabilities/internal/check-standard'
import type { CapabilityTrustState } from '@/modules/capabilities/public'

type FixtureCaseId =
  | 'private-ipv4'
  | 'loopback-host'
  | 'link-local-metadata'
  | 'dns-rebind'
  | 'unsafe-redirect'
  | 'oversize-body'
  | 'bad-content-type'
  | 'schema-mismatch'
  | 'stale-freshness'
  | 'contradicted-facts'
  | 'unreachable-timeout'
  | 'unsupported-action-kind'
  | 'valid-checked-endpoint'

type RefusalReason =
  | 'private_network'
  | 'loopback_host'
  | 'link_local_or_metadata'
  | 'dns_rebind'
  | 'unsafe_redirect_target'
  | 'body_too_large'
  | 'bad_content_type'
  | 'schema_mismatch'
  | 'timeout_or_unreachable'
  | 'unsupported_action_kind'

type EndpointThreatFixture = Readonly<{
  id: FixtureCaseId
  input: Readonly<Record<string, unknown>>
  previousState: CapabilityTrustState
  facets: CapabilityCheckFacetResults
  expected: Readonly<{
    trustState: CapabilityTrustState
    consequence: 'no_fetch' | 'bounded_read' | 'attempt_record_only' | 'checked_readback_only'
    dispatch: 'none'
    scope4PostAuthorized: false
    refusal?: Readonly<{
      reason: RefusalReason
      shape: 'refused_unsupported' | 'refused_contradicted' | 'degraded_stale'
    }>
    wording: readonly ('checked' | 'last checked' | 'needs confirmation' | 'business-supplied')[]
  }>
}>

const fresh = { facet: 'freshness', outcome: 'pass', code: 'fresh', windowMs: 3_600_000 } as const
const notContradicted = { facet: 'contradiction', outcome: 'pass', code: 'not_contradicted' } as const
const reachable = { facet: 'reachability', outcome: 'pass', code: 'reachable' } as const
const schemaConformant = { facet: 'schema', outcome: 'pass', code: 'schema_conformant' } as const

const unreachable = (reason: 'non_https' | 'timeout' | 'http_status', exhausted = true) =>
  ({
    facet: 'reachability',
    outcome: 'fail',
    code: 'unreachable',
    reason,
    retryable: reason !== 'non_https',
    exhausted,
  }) as const

const schemaInvalid = (reason: 'parse_failed' | 'forbidden_claim', exhausted = true, forbiddenClaims: readonly string[] = []) =>
  reason === 'forbidden_claim'
    ? ({
        facet: 'schema',
        outcome: 'fail',
        code: 'schema_invalid',
        reason,
        forbiddenClaims,
        retryable: false,
        exhausted,
      } as const)
    : ({
        facet: 'schema',
        outcome: 'fail',
        code: 'schema_invalid',
        reason,
        retryable: false,
        exhausted,
      } as const)

const rejectedReachabilityFacets = (reachability: CapabilityCheckFacetResults['reachability']): CapabilityCheckFacetResults => ({
  reachability,
  schema: schemaConformant,
  freshness: fresh,
  contradiction: notContradicted,
})

const rejectedSchemaFacets = (schema: CapabilityCheckFacetResults['schema']): CapabilityCheckFacetResults => ({
  reachability: reachable,
  schema,
  freshness: fresh,
  contradiction: notContradicted,
})

const endpointThreatFixtures = [
  {
    id: 'private-ipv4',
    input: {
      urls: ['http://10.0.0.1/ae-check.json', 'http://172.16.0.10/ae-check.json', 'http://192.168.0.20/ae-check.json'],
      networkClassification: 'private_ipv4',
    },
    previousState: 'business_supplied',
    facets: rejectedReachabilityFacets(unreachable('non_https')),
    expected: {
      trustState: 'unsupported',
      consequence: 'no_fetch',
      dispatch: 'none',
      scope4PostAuthorized: false,
      refusal: { reason: 'private_network', shape: 'refused_unsupported' },
      wording: ['needs confirmation'],
    },
  },
  {
    id: 'loopback-host',
    input: {
      urls: ['http://127.0.0.1/ae-check.json', 'http://localhost/ae-check.json', 'http://[::1]/ae-check.json'],
      networkClassification: 'loopback',
    },
    previousState: 'business_supplied',
    facets: rejectedReachabilityFacets(unreachable('non_https')),
    expected: {
      trustState: 'unsupported',
      consequence: 'no_fetch',
      dispatch: 'none',
      scope4PostAuthorized: false,
      refusal: { reason: 'loopback_host', shape: 'refused_unsupported' },
      wording: ['needs confirmation'],
    },
  },
  {
    id: 'link-local-metadata',
    input: {
      urls: ['http://169.254.169.254/latest/meta-data', 'http://[fe80::1]/ae-check.json'],
      networkClassification: 'link_local_or_metadata',
    },
    previousState: 'business_supplied',
    facets: rejectedReachabilityFacets(unreachable('non_https')),
    expected: {
      trustState: 'unsupported',
      consequence: 'no_fetch',
      dispatch: 'none',
      scope4PostAuthorized: false,
      refusal: { reason: 'link_local_or_metadata', shape: 'refused_unsupported' },
      wording: ['needs confirmation'],
    },
  },
  {
    id: 'dns-rebind',
    input: {
      url: 'https://checks.example.test/ae-check.json',
      firstResolution: '203.0.113.24',
      secondResolution: '10.0.0.24',
      resolutionPolicy: 'pin_and_revalidate',
    },
    previousState: 'checked',
    facets: {
      reachability: unreachable('http_status'),
      schema: schemaConformant,
      freshness: fresh,
      contradiction: { facet: 'contradiction', outcome: 'contradicted', code: 'ae_held_fact_conflict', fields: ['resolvedAddress'] },
    },
    expected: {
      trustState: 'contradicted',
      consequence: 'no_fetch',
      dispatch: 'none',
      scope4PostAuthorized: false,
      refusal: { reason: 'dns_rebind', shape: 'refused_contradicted' },
      wording: ['needs confirmation'],
    },
  },
  {
    id: 'unsafe-redirect',
    input: {
      url: 'https://checks.example.test/ae-check.json',
      statusCode: 302,
      redirectLocation: 'http://10.0.0.2/ae-check.json',
      redirectPolicy: 'revalidate_target_before_body_read',
    },
    previousState: 'business_supplied',
    facets: rejectedReachabilityFacets(unreachable('http_status')),
    expected: {
      trustState: 'unsupported',
      consequence: 'no_fetch',
      dispatch: 'none',
      scope4PostAuthorized: false,
      refusal: { reason: 'unsafe_redirect_target', shape: 'refused_unsupported' },
      wording: ['needs confirmation'],
    },
  },
  {
    id: 'oversize-body',
    input: {
      url: 'https://checks.example.test/ae-check.json',
      contentLengthBytes: 1_048_577,
      bodyCapBytes: 1_048_576,
      bodyPolicy: 'cap_before_parse',
    },
    previousState: 'business_supplied',
    facets: rejectedSchemaFacets(schemaInvalid('parse_failed')),
    expected: {
      trustState: 'unsupported',
      consequence: 'bounded_read',
      dispatch: 'none',
      scope4PostAuthorized: false,
      refusal: { reason: 'body_too_large', shape: 'refused_unsupported' },
      wording: ['needs confirmation'],
    },
  },
  {
    id: 'bad-content-type',
    input: {
      url: 'https://checks.example.test/ae-check.html',
      contentType: 'text/html',
      expectedContentType: 'application/json',
    },
    previousState: 'business_supplied',
    facets: rejectedSchemaFacets(schemaInvalid('parse_failed')),
    expected: {
      trustState: 'unsupported',
      consequence: 'bounded_read',
      dispatch: 'none',
      scope4PostAuthorized: false,
      refusal: { reason: 'bad_content_type', shape: 'refused_unsupported' },
      wording: ['needs confirmation'],
    },
  },
  {
    id: 'schema-mismatch',
    input: {
      url: 'https://checks.example.test/ae-check.json',
      schemaRef: 'ae-ucp:v1',
      strictParse: false,
      missingFields: ['standardVersion', 'generatedAt'],
    },
    previousState: 'business_supplied',
    facets: rejectedSchemaFacets(schemaInvalid('parse_failed')),
    expected: {
      trustState: 'unsupported',
      consequence: 'bounded_read',
      dispatch: 'none',
      scope4PostAuthorized: false,
      refusal: { reason: 'schema_mismatch', shape: 'refused_unsupported' },
      wording: ['needs confirmation'],
    },
  },
  {
    id: 'stale-freshness',
    input: {
      url: 'https://checks.example.test/ae-check.json',
      generatedAt: '2026-07-01T00:00:00.000Z',
      now: '2026-07-04T00:00:01.000Z',
      freshnessWindowMs: 3_600_000,
    },
    previousState: 'checked',
    facets: {
      reachability: reachable,
      schema: schemaConformant,
      freshness: { facet: 'freshness', outcome: 'stale', code: 'window_exceeded', windowMs: 3_600_000 },
      contradiction: notContradicted,
    },
    expected: {
      trustState: 'stale',
      consequence: 'attempt_record_only',
      dispatch: 'none',
      scope4PostAuthorized: false,
      refusal: { reason: 'timeout_or_unreachable', shape: 'degraded_stale' },
      wording: ['last checked', 'needs confirmation'],
    },
  },
  {
    id: 'contradicted-facts',
    input: {
      url: 'https://checks.example.test/ae-check.json',
      suppliedOrigin: 'https://checks.example.test',
      aeHeldOrigin: 'https://business.example.test',
      precedence: 'ae_held_public_fact_wins',
    },
    previousState: 'checked',
    facets: {
      reachability: reachable,
      schema: schemaConformant,
      freshness: fresh,
      contradiction: { facet: 'contradiction', outcome: 'contradicted', code: 'ae_held_fact_conflict', fields: ['originUrl'] },
    },
    expected: {
      trustState: 'contradicted',
      consequence: 'attempt_record_only',
      dispatch: 'none',
      scope4PostAuthorized: false,
      wording: ['needs confirmation'],
    },
  },
  {
    id: 'unreachable-timeout',
    input: {
      url: 'https://checks.example.test/ae-check.json',
      outcome: 'timeout',
      attemptRecord: 'fail_loud_no_dispatch',
    },
    previousState: 'stale',
    facets: rejectedReachabilityFacets(unreachable('timeout', false)),
    expected: {
      trustState: 'stale',
      consequence: 'attempt_record_only',
      dispatch: 'none',
      scope4PostAuthorized: false,
      refusal: { reason: 'timeout_or_unreachable', shape: 'degraded_stale' },
      wording: ['last checked', 'needs confirmation'],
    },
  },
  {
    id: 'unsupported-action-kind',
    input: {
      url: 'https://checks.example.test/ae-check.json',
      advertisedOperations: ['write:payment', 'write:dispatch'],
      supportedOperations: ['read:business-facts'],
    },
    previousState: 'business_supplied',
    facets: rejectedSchemaFacets(schemaInvalid('forbidden_claim', true, ['write:payment', 'write:dispatch'])),
    expected: {
      trustState: 'unsupported',
      consequence: 'bounded_read',
      dispatch: 'none',
      scope4PostAuthorized: false,
      refusal: { reason: 'unsupported_action_kind', shape: 'refused_unsupported' },
      wording: ['needs confirmation'],
    },
  },
  {
    id: 'valid-checked-endpoint',
    input: {
      url: 'https://business.example.test/.well-known/ae-check.json',
      domainControl: 'same_origin_or_recorded_control',
      schemaRef: 'ae-ucp:v1',
      generatedAt: '2026-07-04T00:00:00.000Z',
    },
    previousState: 'business_supplied',
    facets: {
      reachability: reachable,
      schema: schemaConformant,
      freshness: fresh,
      contradiction: notContradicted,
    },
    expected: {
      trustState: 'checked',
      consequence: 'checked_readback_only',
      dispatch: 'none',
      scope4PostAuthorized: false,
      wording: ['checked', 'last checked'],
    },
  },
] as const satisfies readonly EndpointThreatFixture[]

const requiredCases = [
  'private-ipv4',
  'loopback-host',
  'link-local-metadata',
  'dns-rebind',
  'unsafe-redirect',
  'oversize-body',
  'bad-content-type',
  'schema-mismatch',
  'stale-freshness',
  'contradicted-facts',
  'unreachable-timeout',
  'unsupported-action-kind',
  'valid-checked-endpoint',
] as const satisfies readonly FixtureCaseId[]

const forbiddenPublicWords = [wordPattern('veri', 'fied'), wordPattern('call', 'able'), wordPattern('agent', '-native')]
const forbiddenServiceShapedFields = [/\bserviceArea\b/, /\bjobSuburb\b/, /\bsuburb\b/, /\bhours\b/, /\burgency\b/, /\bemergency\b/i]

describe('S2-G2 endpoint-check threat fixture pack', () => {
  it('covers every required source-local threat case exactly once', () => {
    expect(endpointThreatFixtures.map((fixture) => fixture.id)).toEqual(requiredCases)
    expect(
      endpointThreatFixtures.every(
        (fixture, index) => endpointThreatFixtures.findIndex((candidate) => candidate.id === fixture.id) === index,
      ),
    ).toBe(true)
  })

  it('keeps dangerous network fixtures in a no-fetch/no-dispatch refusal shape', () => {
    const noFetchCaseIds = ['private-ipv4', 'loopback-host', 'link-local-metadata', 'dns-rebind', 'unsafe-redirect'] as const

    for (const id of noFetchCaseIds) {
      const fixture = fixtureById(id)
      expect(fixture.expected.consequence).toBe('no_fetch')
      expect(fixture.expected.dispatch).toBe('none')
      expect(fixture.expected.scope4PostAuthorized).toBe(false)
      expect(fixture.expected.refusal).toBeDefined()
    }
  })

  it('maps fixture facets to checked, stale, contradicted, or unsupported outcomes without inventing an endpoint engine', () => {
    for (const fixture of endpointThreatFixtures) {
      expect(
        computeCapabilityTrustState({
          kind: 'checked',
          previousState: fixture.previousState,
          facets: fixture.facets,
        }),
      ).toBe(fixture.expected.trustState)
    }
  })

  it('documents bounded parse refusals without partial acceptance or dispatch', () => {
    const boundedCaseIds = ['oversize-body', 'bad-content-type', 'schema-mismatch', 'unsupported-action-kind'] as const

    for (const id of boundedCaseIds) {
      const fixture = fixtureById(id)
      expect(fixture.expected.consequence).toBe('bounded_read')
      expect(fixture.expected.trustState).toBe('unsupported')
      expect(fixture.expected.dispatch).toBe('none')
      expect(fixture.expected.scope4PostAuthorized).toBe(false)
      expect(fixture.expected.refusal?.shape).toBe('refused_unsupported')
    }
  })

  it('keeps public-safe wording and wedge-agnostic fields inside source-local fixtures', () => {
    const serialized = JSON.stringify(endpointThreatFixtures)

    for (const pattern of forbiddenPublicWords) {
      expect(serialized).not.toMatch(pattern)
    }

    for (const pattern of forbiddenServiceShapedFields) {
      expect(serialized).not.toMatch(pattern)
    }

    for (const fixture of endpointThreatFixtures) {
      expect(fixture.expected.wording.length).toBeGreaterThan(0)
      expect(fixture.expected.wording).toEqual(
        expect.arrayContaining(
          fixture.expected.wording.map((wording) => expect.stringMatching(/^(checked|last checked|needs confirmation|business-supplied)$/)),
        ),
      )
    }
  })
})

function wordPattern(prefix: string, suffix: string): RegExp {
  return new RegExp(`\\b${prefix}${suffix}\\b`, 'i')
}

function fixtureById<TId extends FixtureCaseId>(id: TId): Extract<(typeof endpointThreatFixtures)[number], { id: TId }> {
  const fixture = endpointThreatFixtures.find((candidate) => candidate.id === id)
  if (fixture === undefined) {
    throw new Error(`Missing endpoint-check threat fixture: ${id}`)
  }
  return fixture as Extract<(typeof endpointThreatFixtures)[number], { id: TId }>
}
