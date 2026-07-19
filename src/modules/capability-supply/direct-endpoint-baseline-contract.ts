import type { StableHashValue } from '@/modules/common/stable-hash'

export const directEndpointBaselineTask = Object.freeze({
  version: 'adr-010-gate-10-direct-endpoint:v2',
  sourceBaseCommit: '43c7151a1f11a3c3db870cc2a275af8fdc019460',
  operation: {
    method: 'GET',
    path: '/x402/v3/cryptocurrency/quotes/latest',
    publicationRef: 'mock:publication:published-api',
    publicationRevision: 7,
    price: { currency: 'USD', amountMinor: 1 },
    payment: {
      network: 'eip155:8453',
      asset: '0xmock-usdc',
      payTo: '0xmock-provider-recipient',
    },
    recipient: 'selected_binding',
    purpose: 'retrieve_quote',
    disclosedFields: ['/symbol', '/convert'],
  },
  startingFacts: { symbol: 'BTC' },
  initialMissingFields: ['convert'],
  answer: { convert: 'USD' },
  correction: { symbol: 'ETH' },
  recoveryCondition: 'provider_released_response_lost',
  cases: ['success', 'material_correction', 'post_release_uncertainty'],
} as const)

export const gate10FrozenPassPolicy = Object.freeze({
  version: 'adr-010-gate-10-per-case-non-regression-overall-gain:v2',
  rationale:
    'ADR-010 Gate 10 evaluates whether the declared human experience reduces effort. Every case must independently preserve correctness, control, privacy, accessibility, provider burden, and operator burden and must not worsen any human-effort component. Across the complete predeclared case set, at least one human-effort component must strictly improve; cross-case offsets are forbidden.',
  perCase: {
    protectedDimensions: ['correctness', 'control', 'privacy', 'accessibility'],
    nonIncreasingDimensions: ['providerBurden', 'operatorBurden'],
    humanEffort: 'componentwise_non_increasing',
  },
  aggregate: {
    humanEffort: 'at_least_one_component_strictly_lower',
    passRequiresEveryCasePass: true,
  },
} as const)

export type DirectEndpointCase = typeof directEndpointBaselineTask.cases[number]

export type DirectEndpointTraceEvent = Readonly<{
  sequence: number
  case: DirectEndpointCase
  source: 'direct_controller' | 'transport_runtime' | 'provider_runtime'
  kind:
    | 'command'
    | 'prompt'
    | 'answer'
    | 'prepared'
    | 'authority_decision'
    | 'authority_invalidated'
    | 'authority_refused'
    | 'transport_request'
    | 'payment_signature_requested'
    | 'payment_signature_created'
    | 'provider_release'
    | 'provider_response'
    | 'provider_response_lost'
    | 'provider_reconciliation'
    | 'observation'
    | 'continuation'
  detail: Readonly<Record<string, StableHashValue>>
}>

export type DirectEndpointBaselineRun = Readonly<{
  format: 'adr-010-direct-endpoint-baseline-run:v2'
  environment: 'MOCK/DEVELOPMENT ONLY'
  task: typeof directEndpointBaselineTask
  policy: typeof gate10FrozenPassPolicy
  cases: readonly Readonly<{
    case: DirectEndpointCase
    trace: readonly DirectEndpointTraceEvent[]
    final: Readonly<{
      state: 'completed' | 'reconciled_released'
      outputDigest: string | null
      releaseStarted: boolean
      providerCalls: number
      paymentAttempts: number
    }>
  }>[]
  executableDigest: string
}>
