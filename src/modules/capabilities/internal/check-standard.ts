import type { BusinessCapabilityKind } from '@/modules/capabilities/public'

export const AeEndpointCheckAllowedMethods = ['GET', 'HEAD'] as const
export const AeEndpointCheckTimeoutMs = 5_000
export const AeEndpointCheckMaxBodyBytes = 256 * 1024
export const AeEndpointCheckBackoffMs = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000] as const

export type AeEndpointCheckAllowedMethod = (typeof AeEndpointCheckAllowedMethods)[number]

export const AeEndpointCheckFreshnessWindowMsByKind = {
  informational_page: 86_400_000,
  inquiry_intake: 86_400_000,
  business_endpoint: 3_600_000,
  action_card: null,
} satisfies Record<BusinessCapabilityKind, number | null>

export type ReachabilityFailureReason =
  | 'non_https'
  | 'unsupported_method'
  | 'tls_invalid'
  | 'http_status'
  | 'timeout'
  | 'host_not_allowed'
  | 'private_network'
  | 'unsafe_redirect'
  | 'body_too_large'

export type ReachabilityFacetResult =
  | Readonly<{ facet: 'reachability'; outcome: 'pass'; code: 'reachable' }>
  | Readonly<{
      facet: 'reachability'
      outcome: 'fail'
      code: 'unreachable'
      reason: ReachabilityFailureReason
      retryable: boolean
      exhausted: boolean
    }>

export type SchemaFacetResult =
  | Readonly<{ facet: 'schema'; outcome: 'pass'; code: 'schema_conformant' }>
  | Readonly<{
      facet: 'schema'
      outcome: 'fail'
      code: 'schema_invalid'
      reason: 'parse_failed'
      retryable: false
      exhausted: boolean
    }>
  | Readonly<{
      facet: 'schema'
      outcome: 'fail'
      code: 'schema_invalid'
      reason: 'forbidden_claim'
      forbiddenClaims: readonly string[]
      retryable: false
      exhausted: boolean
    }>

export type FreshnessFacetResult =
  | Readonly<{ facet: 'freshness'; outcome: 'pass'; code: 'fresh'; windowMs: number | null }>
  | Readonly<{
      facet: 'freshness'
      outcome: 'stale'
      code: 'window_exceeded' | 'source_hash_changed'
      windowMs: number | null
    }>

export type ContradictionFacetResult =
  | Readonly<{ facet: 'contradiction'; outcome: 'pass'; code: 'not_contradicted' }>
  | Readonly<{
      facet: 'contradiction'
      outcome: 'contradicted'
      code: 'ae_held_fact_conflict'
      fields: readonly string[]
    }>

export type CapabilityCheckFacetResults = Readonly<{
  reachability: ReachabilityFacetResult
  schema: SchemaFacetResult
  freshness: FreshnessFacetResult
  contradiction: ContradictionFacetResult
}>

export type ReachabilityFacetInput = Readonly<{
  method: string
  url: string
  statusCode: number
  tlsValid: boolean
  timedOut: boolean
  exhausted: boolean
}>

export function evaluateReachabilityFacet(input: ReachabilityFacetInput): ReachabilityFacetResult {
  if (!input.url.startsWith('https://')) {
    return unreachable('non_https', false, input.exhausted)
  }

  if (!isAllowedMethod(input.method)) {
    return unreachable('unsupported_method', false, input.exhausted)
  }

  if (input.timedOut) {
    return unreachable('timeout', true, input.exhausted)
  }

  if (!input.tlsValid) {
    return unreachable('tls_invalid', false, input.exhausted)
  }

  if (input.statusCode < 200 || input.statusCode > 299) {
    return unreachable('http_status', true, input.exhausted)
  }

  return { facet: 'reachability', outcome: 'pass', code: 'reachable' }
}

export type SchemaFacetInput = Readonly<{
  schemaRef: string
  strictParse: boolean
  forbiddenClaims: readonly string[]
  exhausted: boolean
}>

export function evaluateSchemaFacet(input: SchemaFacetInput): SchemaFacetResult {
  if (!input.strictParse || input.schemaRef !== 'ae-ucp:v1') {
    return {
      facet: 'schema',
      outcome: 'fail',
      code: 'schema_invalid',
      reason: 'parse_failed',
      retryable: false,
      exhausted: input.exhausted,
    }
  }

  if (input.forbiddenClaims.length > 0) {
    return {
      facet: 'schema',
      outcome: 'fail',
      code: 'schema_invalid',
      reason: 'forbidden_claim',
      forbiddenClaims: input.forbiddenClaims,
      retryable: false,
      exhausted: input.exhausted,
    }
  }

  return { facet: 'schema', outcome: 'pass', code: 'schema_conformant' }
}

export type FreshnessFacetInput = Readonly<{
  kind: BusinessCapabilityKind
  now: number
  generatedAt: number
  sourceHash: string
  previousSourceHash: string
}>

export function evaluateFreshnessFacet(input: FreshnessFacetInput): FreshnessFacetResult {
  const windowMs = AeEndpointCheckFreshnessWindowMsByKind[input.kind]

  if (input.sourceHash !== input.previousSourceHash) {
    return { facet: 'freshness', outcome: 'stale', code: 'source_hash_changed', windowMs }
  }

  if (windowMs !== null && input.now - input.generatedAt > windowMs) {
    return { facet: 'freshness', outcome: 'stale', code: 'window_exceeded', windowMs }
  }

  return { facet: 'freshness', outcome: 'pass', code: 'fresh', windowMs }
}

export type ContradictionFacetInput = Readonly<{
  contradictions: readonly string[]
}>

export function evaluateContradictionFacet(input: ContradictionFacetInput): ContradictionFacetResult {
  if (input.contradictions.length === 0) {
    return { facet: 'contradiction', outcome: 'pass', code: 'not_contradicted' }
  }

  return {
    facet: 'contradiction',
    outcome: 'contradicted',
    code: 'ae_held_fact_conflict',
    fields: input.contradictions,
  }
}

function unreachable(
  reason: ReachabilityFailureReason,
  retryable: boolean,
  exhausted: boolean
): ReachabilityFacetResult {
  return {
    facet: 'reachability',
    outcome: 'fail',
    code: 'unreachable',
    reason,
    retryable,
    exhausted,
  }
}

function isAllowedMethod(method: string): method is AeEndpointCheckAllowedMethod {
  return method === 'GET' || method === 'HEAD'
}
