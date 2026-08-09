import { z } from 'zod'
import { exactAmountSchema } from '@/modules/money/public'

import type { CustomerRequestView } from '../agent-contract'

export type ReleaseVerification = Readonly<{ kind: 'verified'; revision: string; deploymentId: string }>
export type JourneyDiscovery = Readonly<{
  state: 'verified'
  paths: readonly string[]
  requestOperation: Readonly<{ method: 'POST'; path: string }>
}>
export type JourneyDiscoveryMeasurement =
  | (JourneyDiscovery & Readonly<{ anonymousRefusal: 'authentication_required' }>)
  | Readonly<{ state: 'not_proven'; reason: 'verification_override' }>

export type HostedCustomerRequestJourneyInput = Readonly<{
  environment?: 'production' | 'development'
  baseUrl: string
  trustedDevelopmentOrigin?: string
  agentApiKey: string
  expectedRevision: string
  expectedDeploymentId: string
  agent: Readonly<{ name: string; version: string }>
  scenario: Readonly<{
    request: string
    facts: Readonly<Record<string, unknown>>
    messages: readonly string[]
    finish?: 'cancel' | 'cancel_after_current' | 'adapter_cancel_accepted' | 'adapter_cancel_rejected'
      | 'adapter_cancel_unknown' | 'complete' | 'outcome_unknown' | 'invalid_output'
      | 'provider_denied' | 'partial_result'
    expiryRecovery?: Readonly<{ waitMs: number }>
    unsupportedRecovery?: Readonly<{ message: string }>
    expectedRoute?: Readonly<{
      stepCount: number
      businesses: readonly string[]
      recipients?: readonly Readonly<{ name: string; purposes: readonly string[] }>[]
    }>
    repeatPermission?: Readonly<{
      delegatedCredentialId: string
      occurrences: number
    }>
  }>
  sandbox: true
  deploymentProtectionBypass?: string
  fetch?: typeof globalThis.fetch
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
  verifyRelease: () => Promise<ReleaseVerification>
  verifyDiscovery?: () => Promise<JourneyDiscovery | void>
  verifyAnonymousRefusal?: () => Promise<void>
}>

export type JourneyMetrics = {
  startedAt: number
  requestCalls: number
  clarifications: number
  executionStartReplay: 'not_proven' | 'same_request_monotonic_progress'
  discovery: JourneyDiscoveryMeasurement
  interruptionRecovery?: Readonly<{
    state: 'verified'
    requestRef: string
    revision: number
    completedSteps: number
  }>
  mutations: Array<Readonly<{ path: string; source: MutationSource }>>
  staleOptionRecovery?: Readonly<{
    state: 'verified'
    expiredGenerationRef: string
    expiredRouteRef: string
    refreshedGenerationRef: string
    refreshedRouteRef: string
    staleConfirmationCreated: false
    staleExecutionStarted: false
    restoredReason: 'choice_expired'
    workRestarted: false
  }>
  unsupportedRecovery?: Readonly<{
    state: 'verified'
    unsupportedRevision: number
    recoveredRevision: number
    authorityCreatedBeforeRecovery: false
    executionStartedBeforeRecovery: false
  }>
  downstreamCancellation?: Readonly<{
    state: 'verified'
    releasedStep: number
    completedSteps: number
    unreleasedStep: number
    downstreamStarted: false
    cancellationReplaySafe: true
  }>
  repeatPermission?: Readonly<{
    permissionRef: string
    routeRef: string
    delegatedCredentialId: string
    allowReplaySafe: boolean
    inspectMatched: boolean
    useReplaySafe: boolean
    withdrawn: boolean
    withdrawnUseRefused: boolean
  }>
}

export type MutationSource = 'declared_request' | 'observed_navigation' | 'automatic_replay'

export type HostedCustomerRequestJourneyRuntimeInput = HostedCustomerRequestJourneyInput & Readonly<{
  metrics: JourneyMetrics
  requestEntrypointPath: string
}>

export const journeyReleaseSchema = z.discriminatedUnion('environment', [
  z.strictObject({
    revision: z.string().regex(/^[a-f0-9]{40}$/u), deploymentId: z.string().startsWith('dpl_'),
    environment: z.literal('production'), baseUrl: z.url().startsWith('https://'),
  }),
  z.strictObject({
    revision: z.string().regex(/^[a-f0-9]{40}$/u), deploymentId: z.string().startsWith('convex:'),
    environment: z.literal('development'), baseUrl: z.url(),
    verification: z.literal('local_checkout_and_named_dev_deployment'),
  }),
])

export const hostedCustomerRequestJourneyProofSchema = z.strictObject({
  kind: z.literal('cold_external_agent_journey'),
  agent: z.strictObject({ name: z.string(), version: z.string() }).strict(),
  release: journeyReleaseSchema,
  observedAt: z.iso.datetime(),
  input: z.strictObject({
    request: z.string(),
    availableFacts: z.array(z.strictObject({ requirementKey: z.string(), valueDigest: z.string() })),
    facts: z.array(z.strictObject({ requirementKey: z.string(), valueDigest: z.string() })),
    messages: z.array(z.strictObject({ index: z.number().int().nonnegative(), valueDigest: z.string() })),
  }).strict(),
  observedStates: z.array(z.enum([
    'needs_information', 'ready_to_compare', 'routes_ready', 'route_confirmed', 'in_progress',
    'preparing_options', 'options_ready', 'no_options', 'needs_authorization', 'unsupported',
    'needs_attention', 'outcome_unknown', 'completed', 'failed', 'cancelled',
  ])),
  authorityStops: z.array(z.literal('route_confirmation')),
  final: z.strictObject({
    requestRef: z.string(), revision: z.number().int().nonnegative(),
    state: z.enum(['in_progress', 'cancelled', 'completed', 'failed', 'outcome_unknown']), selectedBusiness: z.string(),
    selectedBusinesses: z.array(z.string()).min(1), stepCount: z.number().int().positive(),
    runState: z.enum(['in_progress', 'completed', 'failed', 'cancelled', 'outcome_unknown']),
    evidenceState: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'outcome_unknown']),
    problemState: z.enum(['received', 'not_reported']),
    resumedState: z.enum(['in_progress', 'cancelled', 'completed', 'failed', 'outcome_unknown']),
    completedSteps: z.number().int().nonnegative().optional(),
    automaticRetry: z.boolean().optional(),
    resultDigest: z.string().optional(),
    failureClass: z.enum(['outcome_unknown', 'invalid_output']).optional(),
    dependencies: z.strictObject({
      completedBusinesses: z.array(z.string()),
      blockedBusinesses: z.array(z.string()),
    }).optional(),
    cancellation: z.discriminatedUnion('state', [
      z.strictObject({ state: z.literal('stopped'), stoppedAt: z.number().nonnegative() }),
      z.strictObject({
        state: z.literal('unknown'), requestedAt: z.number().nonnegative(),
        observedAt: z.number().nonnegative(), nextCheckAt: z.number().nonnegative(),
      }),
      z.strictObject({
        state: z.literal('rejected'), requestedAt: z.number().nonnegative(),
        observedAt: z.number().nonnegative(), reason: z.string(),
      }),
    ]).optional(),
  }).strict(),
  measurements: z.strictObject({
    integrationBurden: z.strictObject({
      requestCalls: z.number().int().nonnegative(), clarifications: z.number().int().nonnegative(),
    }),
    turns: z.strictObject({ total: z.number().int().nonnegative() }),
    elapsedMs: z.number().int().nonnegative(),
    hardConstraintAccuracy: z.strictObject({
      state: z.enum(['satisfied', 'not_evaluated']),
    }),
    totalCostAccuracy: z.union([
      z.strictObject({ state: z.literal('exact'), total: exactAmountSchema }),
      z.strictObject({ state: z.literal('unavailable') }),
    ]),
    recovery: z.strictObject({
      state: z.literal('durable'), resumed: z.boolean(),
      postures: z.array(z.enum(['retry_safe', 'reconcile_required'])),
    }),
    interruptionRecovery: z.strictObject({
      state: z.literal('verified'),
      requestRef: z.string(),
      revision: z.number().int().nonnegative(),
      completedSteps: z.number().int().nonnegative(),
    }).optional(),
    resultUsability: z.strictObject({ state: z.enum(['usable', 'unusable']) }),
    replaySafety: z.strictObject({
      executionStart: z.enum(['not_proven', 'same_request_monotonic_progress']),
    }),
    discovery: z.discriminatedUnion('state', [
      z.strictObject({
        state: z.literal('verified'),
        paths: z.array(z.string().startsWith('/')).min(3),
        requestOperation: z.strictObject({
          method: z.literal('POST'),
          path: z.string().startsWith('/api/v1/requests'),
        }),
        anonymousRefusal: z.literal('authentication_required'),
      }),
      z.strictObject({
        state: z.literal('not_proven'),
        reason: z.literal('verification_override'),
      }),
    ]),
    staleOptionRecovery: z.strictObject({
      state: z.literal('verified'),
      expiredGenerationRef: z.string(),
      expiredRouteRef: z.string(),
      refreshedGenerationRef: z.string(),
      refreshedRouteRef: z.string(),
      staleConfirmationCreated: z.literal(false),
      staleExecutionStarted: z.literal(false),
      restoredReason: z.literal('choice_expired'),
      workRestarted: z.literal(false),
    }).optional(),
    unsupportedRecovery: z.strictObject({
      state: z.literal('verified'),
      unsupportedRevision: z.number().int().nonnegative(),
      recoveredRevision: z.number().int().positive(),
      authorityCreatedBeforeRecovery: z.literal(false),
      executionStartedBeforeRecovery: z.literal(false),
    }).optional(),
    downstreamCancellation: z.strictObject({
      state: z.literal('verified'),
      releasedStep: z.number().int().positive(),
      completedSteps: z.number().int().positive(),
      unreleasedStep: z.number().int().positive(),
      downstreamStarted: z.literal(false),
      cancellationReplaySafe: z.literal(true),
    }).optional(),
    repeatPermission: z.strictObject({
      permissionRef: z.string().startsWith('repeat-permission:'),
      routeRef: z.string().min(1),
      delegatedCredentialId: z.string().min(1),
      allowReplaySafe: z.literal(true),
      inspectMatched: z.literal(true),
      useReplaySafe: z.literal(true),
      withdrawn: z.literal(true),
      withdrawnUseRefused: z.literal(true),
    }).optional(),
    disclosureIntegrity: z.strictObject({
      state: z.literal('verified'),
      recipients: z.array(z.string()),
      purposes: z.array(z.string()),
      effects: z.array(z.string()),
      providerFields: z.array(z.strictObject({
        business: z.string(),
        fields: z.array(z.string()),
      })),
    }),
    evidenceIntegrity: z.discriminatedUnion('state', [
      z.strictObject({
        state: z.literal('verified'),
        resultDigest: z.string().startsWith('sha256:'),
        steps: z.array(z.strictObject({
          step: z.number().int().positive(),
          business: z.string(),
          providerOrigin: z.url(),
          outputDigest: z.string().startsWith('sha256:'),
          receiptRefs: z.array(z.string()),
        })),
      }),
      z.strictObject({
        state: z.literal('not_proven'),
        reason: z.literal('step_execution_identity_unavailable'),
      }),
      z.strictObject({ state: z.literal('not_applicable') }),
    ]),
    resultIntegrity: z.discriminatedUnion('state', [
      z.strictObject({ state: z.literal('verified'), digest: z.string().startsWith('sha256:') }),
      z.strictObject({ state: z.literal('not_applicable') }),
    ]),
    controlIntegrity: z.strictObject({
      state: z.literal('verified'),
      operatorInterventions: z.literal(0),
      mutations: z.array(z.strictObject({
        path: z.string().startsWith('/api/v1/requests'),
        source: z.enum(['declared_request', 'observed_navigation', 'automatic_replay']),
      })).min(2),
    }),
  }),
  sandbox: z.literal(true),
  claimBoundary: z.literal('contract_and_hosted_journey_only_not_real_supply_or_customer_value'),
})

export type HostedCustomerRequestJourneyProof = Readonly<z.infer<typeof hostedCustomerRequestJourneyProofSchema>>

export const HOSTED_JOURNEY_CLAIM_BOUNDARY =
  'contract_and_hosted_journey_only_not_real_supply_or_customer_value' as const

export type ObservedNavigationAction = Readonly<{ method: 'GET' | 'POST'; path: string; input?: unknown }>
export type AgentNavigationRelation = NonNullable<CustomerRequestView['navigation']>['actions'][number]['relation']

export type ScenarioFinishBase = Readonly<{
  input: HostedCustomerRequestJourneyRuntimeInput
  release: ReleaseVerification
  requestRef: string
  route: NonNullable<NonNullable<CustomerRequestView['decision']>['routes']>[number]
  selectedBusiness: string
  selectedBusinesses: readonly string[]
  states: CustomerRequestView['state'][]
  authorityStops: Array<'route_confirmation'>
  consumedFacts: Array<{ requirementKey: string; valueDigest: string }>
  consumedMessages: Array<{ index: number; valueDigest: string }>
  progressPath: string
  evidencePath: string
  started: CustomerRequestView
}>
