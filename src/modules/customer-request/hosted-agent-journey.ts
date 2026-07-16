import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  CUSTOMER_REQUEST_AGENT_SCOPE,
  customerRequestAgentResultSchema,
  customerRequestEvidenceResultSchema,
  customerRequestJsonValueSchema,
  customerRequestProblemResultSchema,
  customerRequestSubmitInputSchema,
  type CustomerRequestView,
} from './agent-contract'

type ReleaseVerification = Readonly<{ kind: 'verified'; revision: string; deploymentId: string }>

export type HostedCustomerRequestJourneyInput = Readonly<{
  environment?: 'production' | 'development'
  baseUrl: string
  agentApiKey: string
  expectedRevision: string
  expectedDeploymentId: string
  agent: Readonly<{ name: string; version: string }>
  scenario: Readonly<{
    request: string
    facts: Readonly<Record<string, unknown>>
    messages: readonly string[]
    finish?: 'cancel' | 'complete' | 'outcome_unknown'
    expiryRecovery?: Readonly<{ waitMs: number }>
    unsupportedRecovery?: Readonly<{ message: string }>
    expectedRoute?: Readonly<{
      stepCount: number
      businesses: readonly string[]
      recipients?: readonly Readonly<{ name: string; purposes: readonly string[] }>[]
    }>
  }>
  sandbox: true
  deploymentProtectionBypass?: string
  fetch?: typeof globalThis.fetch
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
  verifyRelease: () => Promise<ReleaseVerification>
  verifyDiscovery?: () => Promise<void>
  verifyAnonymousRefusal?: () => Promise<void>
}>

type JourneyMetrics = {
  startedAt: number
  requestCalls: number
  clarifications: number
  executionStartReplay: 'not_proven' | 'same_request_monotonic_progress'
  mutations: Array<Readonly<{ path: string; source: MutationSource }>>
  staleOptionRecovery?: Readonly<{
    state: 'verified'
    expiredGenerationRef: string
    expiredRouteRef: string
    refreshedGenerationRef: string
    refreshedRouteRef: string
    staleConfirmationCreated: false
    staleExecutionStarted: false
  }>
  unsupportedRecovery?: Readonly<{
    state: 'verified'
    unsupportedRevision: number
    recoveredRevision: number
    authorityCreatedBeforeRecovery: false
    executionStartedBeforeRecovery: false
  }>
}

type MutationSource = 'declared_request' | 'observed_navigation' | 'automatic_replay'

type HostedCustomerRequestJourneyRuntimeInput = HostedCustomerRequestJourneyInput & Readonly<{
  metrics: JourneyMetrics
}>

const journeyReleaseSchema = z.discriminatedUnion('environment', [
  z.strictObject({
    revision: z.string().regex(/^[a-f0-9]{40}$/u), deploymentId: z.string().startsWith('dpl_'),
    environment: z.literal('production'), baseUrl: z.url().startsWith('https://'),
  }),
  z.strictObject({
    revision: z.string().regex(/^[a-f0-9]{40}$/u), deploymentId: z.string().startsWith('convex:'),
    environment: z.literal('development'), baseUrl: z.url().startsWith('http://'),
    verification: z.literal('local_checkout_and_named_dev_deployment'),
  }),
])

export const hostedCustomerRequestJourneyProofSchema = z.strictObject({
  kind: z.literal('cold_external_agent_journey'),
  agent: z.object({ name: z.string(), version: z.string() }).strict(),
  release: journeyReleaseSchema,
  observedAt: z.iso.datetime(),
  input: z.object({
    request: z.string(),
    facts: z.array(z.strictObject({ requirementKey: z.string(), valueDigest: z.string() })),
    messages: z.array(z.strictObject({ index: z.number().int().nonnegative(), valueDigest: z.string() })),
  }).strict(),
  observedStates: z.array(z.enum([
    'needs_information', 'ready_to_compare', 'routes_ready', 'route_confirmed', 'in_progress',
    'preparing_options', 'options_ready', 'no_options', 'needs_authorization', 'unsupported',
    'needs_attention', 'outcome_unknown', 'completed', 'failed', 'cancelled',
  ])),
  authorityStops: z.array(z.literal('route_confirmation')),
  final: z.object({
    requestRef: z.string(), revision: z.number().int().nonnegative(),
    state: z.enum(['cancelled', 'completed', 'outcome_unknown']), selectedBusiness: z.string(),
    selectedBusinesses: z.array(z.string()).min(1), stepCount: z.number().int().positive(),
    runState: z.enum(['in_progress', 'completed', 'cancelled', 'outcome_unknown']),
    evidenceState: z.enum(['queued', 'running', 'completed', 'cancelled', 'outcome_unknown']),
    problemState: z.enum(['received', 'not_reported']),
    resumedState: z.enum(['cancelled', 'completed', 'outcome_unknown']),
    completedSteps: z.number().int().nonnegative().optional(),
    automaticRetry: z.boolean().optional(),
    resultDigest: z.string().optional(),
  }).strict(),
  measurements: z.strictObject({
    integrationBurden: z.strictObject({
      requestCalls: z.number().int().nonnegative(), clarifications: z.number().int().nonnegative(),
    }),
    turns: z.strictObject({ total: z.number().int().nonnegative() }),
    elapsedMs: z.number().int().nonnegative(),
    hardConstraintAccuracy: z.strictObject({ state: z.literal('satisfied') }),
    totalCostAccuracy: z.union([
      z.strictObject({ state: z.literal('exact'), total: z.strictObject({ currency: z.string(), amountMinor: z.number().int().nonnegative() }) }),
      z.strictObject({ state: z.literal('unavailable') }),
    ]),
    recovery: z.strictObject({
      state: z.literal('durable'), resumed: z.boolean(),
      postures: z.array(z.enum(['retry_safe', 'reconcile_required'])),
    }),
    resultUsability: z.strictObject({ state: z.enum(['usable', 'unusable']) }),
    replaySafety: z.strictObject({
      executionStart: z.enum(['not_proven', 'same_request_monotonic_progress']),
    }),
    staleOptionRecovery: z.strictObject({
      state: z.literal('verified'),
      expiredGenerationRef: z.string(),
      expiredRouteRef: z.string(),
      refreshedGenerationRef: z.string(),
      refreshedRouteRef: z.string(),
      staleConfirmationCreated: z.literal(false),
      staleExecutionStarted: z.literal(false),
    }).optional(),
    unsupportedRecovery: z.strictObject({
      state: z.literal('verified'),
      unsupportedRevision: z.number().int().nonnegative(),
      recoveredRevision: z.number().int().positive(),
      authorityCreatedBeforeRecovery: z.literal(false),
      executionStartedBeforeRecovery: z.literal(false),
    }).optional(),
    disclosureIntegrity: z.strictObject({
      state: z.literal('verified'),
      recipients: z.array(z.string()),
      purposes: z.array(z.string()),
    }),
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

export async function runHostedCustomerRequestJourney(
  input: HostedCustomerRequestJourneyInput,
): Promise<HostedCustomerRequestJourneyProof> {
  assertJourneyBaseUrl(input.baseUrl, journeyEnvironment(input))
  const metrics: JourneyMetrics = {
    startedAt: (input.now ?? Date.now)(), requestCalls: 0, clarifications: 0,
    executionStartReplay: 'not_proven', mutations: [],
  }
  const runtimeInput: HostedCustomerRequestJourneyRuntimeInput = { ...input, metrics }
  const release = await input.verifyRelease()
  if (release.revision !== input.expectedRevision || release.deploymentId !== input.expectedDeploymentId) {
    throw new Error('hosted_journey_release_mismatch')
  }
  await Promise.all([
    (input.verifyDiscovery ?? (() => proveDiscovery(input)))(),
    (input.verifyAnonymousRefusal ?? (() => proveAnonymousRefusal(input)))(),
  ])

  const nonce = randomUUID()
  const requestRef = `acceptance:${nonce}`
  const states: CustomerRequestView['state'][] = []
  const authorityStops: Array<'route_confirmation'> = []
  const consumedFacts: Array<{ requirementKey: string; valueDigest: string }> = []
  const consumedMessages: Array<{ index: number; valueDigest: string }> = []
  const submit = customerRequestSubmitInputSchema.parse({
    idempotencyKey: `acceptance:submit:${nonce}`, requestRef,
    agentRef: `${input.agent.name}:${input.agent.version}`, request: input.scenario.request,
  })
  let view = await submitWithInterpreterRecovery(runtimeInput, submit)
  const replay = await callAgent(
    runtimeInput, '/api/v1/requests', 'POST', submit, [200], 'automatic_replay',
  )
  if (JSON.stringify(view) !== JSON.stringify(replay)) throw new Error('hosted_journey_submit_replay_changed')
  observe(states, view)

  let messageIndex = 0
  let transitions = 0
  let expiredChoice: Readonly<{ generationRef: string; routeRef: string }> | undefined
  let unsupportedRevision: number | undefined
  while (transitions < 24) {
    transitions += 1
    if (view.state === 'needs_information') {
      metrics.clarifications += 1
      const clarification = view.clarification
      if (clarification === undefined) throw new Error('hosted_journey_clarification_missing')
      if (clarification.kind === 'intent_direction') {
        const message = input.scenario.messages[messageIndex]
        if (message === undefined) throw new Error(`hosted_journey_message_missing:${clarification.prompt}`)
        view = await callObservedAgent(runtimeInput, view, 'answer_clarification', {
          '<unique string>': `acceptance:message:${nonce}:${messageIndex}`,
          '<natural-language answer>': message,
        })
        consumedMessages.push({ index: messageIndex, valueDigest: canonicalDigest(message) })
        messageIndex += 1
      } else {
        const fact = clarification.requirementKey in input.scenario.facts
          ? input.scenario.facts[clarification.requirementKey]
          : input.scenario.facts['*']
        if (fact === undefined) {
          throw new Error(`hosted_journey_fact_missing:${clarification.requirementKey}`)
        }
        view = await callObservedAgent(runtimeInput, view, 'answer_clarification', {
          '<unique string>': `acceptance:fact:${nonce}:${clarification.requirementKey}`,
          '<typed value>': customerRequestJsonValueSchema.parse(fact),
        })
        consumedFacts.push({
          requirementKey: clarification.requirementKey,
          valueDigest: digestInput(fact),
        })
      }
      observe(states, view)
      continue
    }

    if (view.state === 'ready_to_compare') {
      view = await callObservedAgent(runtimeInput, view, 'prepare_options', {
        '<unique string>': `acceptance:prepare:${nonce}:${view.revision}`,
      }, [200, 202])
      observe(states, view)
      continue
    }

    if (view.state === 'routes_ready') {
      const route = view.decision?.routes[0]
      const selectedBusinesses = route?.businesses.map(({ name }) => name) ?? []
      const selectedBusiness = selectedBusinesses[0]
      if (route === undefined || selectedBusiness === undefined) throw new Error('hosted_journey_route_missing')
      assertExpectedRoute(input.scenario.expectedRoute, route)
      if (unsupportedRevision !== undefined && runtimeInput.metrics.unsupportedRecovery === undefined) {
        if (view.revision <= unsupportedRevision) throw new Error('hosted_journey_unsupported_revision_not_advanced')
        runtimeInput.metrics.unsupportedRecovery = {
          state: 'verified',
          unsupportedRevision,
          recoveredRevision: view.revision,
          authorityCreatedBeforeRecovery: false,
          executionStartedBeforeRecovery: false,
        }
      }
      if (expiredChoice !== undefined) {
        if (view.routeGenerationRef === expiredChoice.generationRef || route.routeRef === expiredChoice.routeRef) {
          throw new Error('hosted_journey_expired_choice_not_refreshed')
        }
        runtimeInput.metrics.staleOptionRecovery = {
          state: 'verified',
          expiredGenerationRef: expiredChoice.generationRef,
          expiredRouteRef: expiredChoice.routeRef,
          refreshedGenerationRef: requiredRouteGenerationRef(view),
          refreshedRouteRef: route.routeRef,
          staleConfirmationCreated: false,
          staleExecutionStarted: false,
        }
      }
      if (!authorityStops.includes('route_confirmation')) authorityStops.push('route_confirmation')
      if (input.scenario.expiryRecovery !== undefined && expiredChoice === undefined) {
        if (!Number.isSafeInteger(input.scenario.expiryRecovery.waitMs)
          || input.scenario.expiryRecovery.waitMs <= 0) {
          throw new Error('hosted_journey_expiry_wait_invalid')
        }
        await (input.sleep ?? defaultSleep)(input.scenario.expiryRecovery.waitMs)
        const expired = await callObservedAgent(
          runtimeInput, view, 'confirm_option',
          {
            '<unique string>': `acceptance:confirm-expired:${nonce}:${view.revision}`,
            '<routeRef from decision.routes>': route.routeRef,
          },
        )
        observe(states, expired)
        if (expired.state !== 'needs_attention'
          || expired.decision?.outcome.kind !== 'routes_expired'
          || expired.confirmation !== undefined
          || expired.navigation?.actions.some(({ relation }) => relation === 'start_confirmed_option')) {
          throw new Error(`hosted_journey_expired_confirmation_not_rejected:${expired.state}`)
        }
        expiredChoice = {
          generationRef: requiredRouteGenerationRef(view),
          routeRef: route.routeRef,
        }
        view = await callObservedAgent(runtimeInput, expired, 'prepare_options', {
          '<unique string>': `acceptance:refresh-expired:${nonce}:${view.revision}`,
        }, [200, 202])
        observe(states, view)
        continue
      }
      view = await callObservedAgent(
        runtimeInput, view, 'confirm_option',
        {
          '<unique string>': `acceptance:confirm:${nonce}:${view.revision}`,
          '<routeRef from decision.routes>': route.routeRef,
        },
      )
      observe(states, view)
      if (view.state !== 'route_confirmed') throw new Error(`hosted_journey_confirmation_failed:${view.state}`)
      const startAction = observedNavigationAction(runtimeInput, view, 'start_confirmed_option')
      if (startAction.method !== 'POST') throw new Error('hosted_journey_navigation_method:start_confirmed_option')
      const startCommand = materializeObservedInput(view, startAction, {
        '<unique string>': `acceptance:run:${nonce}`,
      })
      view = await callAgent(
        runtimeInput, startAction.path, startAction.method, startCommand, [200], 'observed_navigation',
      )
      observe(states, view)
      if (view.state !== 'in_progress') throw new Error(`hosted_journey_run_failed:${view.state}`)
      const startReplay = await callAgent(
        runtimeInput, startAction.path, startAction.method, startCommand, [200], 'automatic_replay',
      )
      assertExecutionStartReplay(view, startReplay)
      runtimeInput.metrics.executionStartReplay = 'same_request_monotonic_progress'
      const progressPath = observedNavigationPath(input, view, 'inspect_progress', 'GET')
      const evidencePath = observedNavigationPath(input, view, 'inspect_evidence', 'GET')
      if (input.scenario.finish === 'complete') {
        return await completeHostedJourney({
          input: runtimeInput, release, requestRef, route, selectedBusiness, selectedBusinesses,
          states, authorityStops, consumedFacts, consumedMessages, progressPath, evidencePath,
        })
      }
      const problemAction = observedNavigationAction(input, view, 'report_problem')
      if (problemAction.method !== 'POST') throw new Error('hosted_journey_navigation_method:report_problem')
      if (input.scenario.finish === 'outcome_unknown') {
        return await outcomeUnknownHostedJourney({
          input: runtimeInput, release, requestRef, route, selectedBusiness, selectedBusinesses,
          states, authorityStops, consumedFacts, consumedMessages, progressPath, evidencePath,
          problemAction, started: view, nonce,
        })
      }
      const cancelled = await callObservedAgent(
        runtimeInput, view, 'cancel',
        { '<unique string>': `acceptance:cancel:${nonce}` },
      )
      observe(states, cancelled)
      if (cancelled.state !== 'cancelled') throw new Error(`hosted_journey_cancellation_failed:${cancelled.state}`)
      const evidence = await callAgentEvidence(runtimeInput, evidencePath)
      if (evidence.state !== 'queued' && evidence.state !== 'running' && evidence.state !== 'cancelled') {
        throw new Error(`hosted_journey_evidence_state:${evidence.state}`)
      }
      const problem = await callAgentProblem(runtimeInput, problemAction.path, materializeObservedInput(view, problemAction, {
        '<unique string>': `acceptance:problem:${nonce}`,
        '<incorrect_result | unexpected_cost | privacy_concern | could_not_stop | other>': 'other',
        '<problem summary>': 'Labelled sandbox recovery verification.',
      }))
      const resumed = await callAgent(runtimeInput, progressPath, 'GET')
      observe(states, resumed)
      if (resumed.state !== 'cancelled') throw new Error(`hosted_journey_cancel_resume_failed:${resumed.state}`)
      return hostedCustomerRequestJourneyProofSchema.parse({
        kind: 'cold_external_agent_journey', agent: input.agent,
        release: journeyReleaseProjection(input, release),
        observedAt: new Date((input.now ?? Date.now)()).toISOString(),
        input: { request: input.scenario.request, facts: consumedFacts, messages: consumedMessages },
        observedStates: states, authorityStops,
        final: {
          requestRef, revision: resumed.revision, state: resumed.state, selectedBusiness, selectedBusinesses,
          stepCount: route.stepCount, runState: 'cancelled',
          evidenceState: evidence.state, problemState: problem.state, resumedState: resumed.state,
        },
        measurements: journeyMeasurements(runtimeInput, route, false, true),
        sandbox: true,
        claimBoundary: 'contract_and_hosted_journey_only_not_real_supply_or_customer_value',
      })
    }

    if (view.state === 'preparing_options') {
      await (input.sleep ?? defaultSleep)(1_000)
      view = await callObservedAgent(runtimeInput, view, 'inspect_progress', undefined, [200, 202])
      observe(states, view)
      continue
    }

    if (view.state === 'unsupported' && input.scenario.unsupportedRecovery !== undefined
      && unsupportedRevision === undefined) {
      const recoveryMessage = input.scenario.unsupportedRecovery.message.trim()
      if (recoveryMessage.length === 0) throw new Error('hosted_journey_unsupported_recovery_message_missing')
      if (view.confirmation !== undefined || view.decision !== undefined
        || view.navigation?.actions.some(({ relation }) =>
          relation === 'confirm_option' || relation === 'start_confirmed_option')) {
        throw new Error('hosted_journey_unsupported_created_authority')
      }
      unsupportedRevision = view.revision
      const recoveryAction = observedNavigationAction(runtimeInput, view, 'change_request')
      if (recoveryAction.method !== 'POST') {
        throw new Error('hosted_journey_navigation_method:change_request')
      }
      const recoveryCommand = materializeObservedInput(view, recoveryAction, {
        '<unique string>': `acceptance:unsupported-recovery:${nonce}:${view.revision}`,
        '<natural-language change>': recoveryMessage,
      })
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        view = await callAgent(
          runtimeInput, recoveryAction.path, recoveryAction.method, recoveryCommand, [200],
          attempt === 1 ? 'observed_navigation' : 'automatic_replay',
        )
        observe(states, view)
        if (view.state !== 'needs_attention' || view.nextAction !== 'retry'
          || view.revision !== unsupportedRevision) break
        if (attempt === 3) throw new Error('hosted_journey_unsupported_recovery_exhausted')
        await (input.sleep ?? defaultSleep)(1_000)
      }
      consumedMessages.push({ index: messageIndex, valueDigest: canonicalDigest(recoveryMessage) })
      messageIndex += 1
      continue
    }

    if (view.state === 'needs_attention' && view.nextAction === 'retry'
      && expiredChoice !== undefined && runtimeInput.metrics.staleOptionRecovery === undefined) {
      await (input.sleep ?? defaultSleep)(1_000)
      view = await callObservedAgent(runtimeInput, view, 'prepare_options', {
        '<unique string>': `acceptance:retry-expired:${nonce}:${transitions}`,
      }, [200, 202])
      observe(states, view)
      continue
    }

    if (view.state === 'unsupported' || view.state === 'no_options' || view.state === 'needs_attention'
      || view.state === 'outcome_unknown' || view.state === 'completed' || view.state === 'failed'
      || view.state === 'options_ready' || view.state === 'needs_authorization'
      || view.state === 'route_confirmed' || view.state === 'in_progress' || view.state === 'cancelled') {
      throw new Error(
        `hosted_journey_stopped:${view.state}:revision=${view.revision}:transition=${transitions}`
        + `:states=${states.join('>')}:${view.summary}`,
      )
    }
  }
  throw new Error('hosted_journey_transition_limit_exceeded')
}

async function outcomeUnknownHostedJourney(input: Readonly<{
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
  problemAction: ObservedNavigationAction
  started: CustomerRequestView
  nonce: string
}>): Promise<HostedCustomerRequestJourneyProof> {
  let uncertain: CustomerRequestView | undefined
  for (let attempt = 0; attempt < 24; attempt += 1) {
    uncertain = await callAgent(input.input, input.progressPath, 'GET', undefined, [200, 202])
    observe(input.states, uncertain)
    if (uncertain.state === 'outcome_unknown') break
    if (uncertain.state !== 'in_progress') throw new Error(`hosted_journey_unknown_stopped:${uncertain.state}`)
    await (input.input.sleep ?? defaultSleep)(1_000)
  }
  if (uncertain?.state !== 'outcome_unknown' || uncertain.action?.state !== 'unknown'
    || uncertain.action.automaticRetry !== false || uncertain.progress?.completed !== input.route.stepCount - 1) {
    throw new Error('hosted_journey_unknown_timeout')
  }
  if (uncertain.navigation?.actions.some(({ relation }) => relation === 'start_confirmed_option')) {
    throw new Error('hosted_journey_unknown_replay_available')
  }
  const evidence = await callAgentEvidence(input.input, input.evidencePath)
  if (evidence.state !== 'outcome_unknown' || evidence.steps.length !== input.route.stepCount
    || evidence.steps.filter(({ state }) => state === 'completed').length !== input.route.stepCount - 1
    || evidence.steps.at(-1)?.state !== 'outcome_unknown') {
    throw new Error('hosted_journey_unknown_evidence_missing')
  }
  const problem = await callAgentProblem(input.input, input.problemAction.path, materializeObservedInput(
    input.started, input.problemAction, {
      '<unique string>': `acceptance:problem:${input.nonce}`,
      '<incorrect_result | unexpected_cost | privacy_concern | could_not_stop | other>': 'other',
      '<problem summary>': 'The labelled sandbox provider outcome is unknown after release.',
    },
  ))
  const resumed = await callAgent(input.input, input.progressPath, 'GET')
  observe(input.states, resumed)
  if (resumed.state !== 'outcome_unknown' || resumed.action?.automaticRetry !== false
    || resumed.progress?.completed !== uncertain.progress.completed) {
    throw new Error(`hosted_journey_unknown_resume_failed:${resumed.state}`)
  }
  return hostedCustomerRequestJourneyProofSchema.parse({
    kind: 'cold_external_agent_journey', agent: input.input.agent,
    release: journeyReleaseProjection(input.input, input.release),
    observedAt: new Date((input.input.now ?? Date.now)()).toISOString(),
    input: { request: input.input.scenario.request, facts: input.consumedFacts, messages: input.consumedMessages },
    observedStates: input.states, authorityStops: input.authorityStops,
    final: {
      requestRef: input.requestRef, revision: resumed.revision,
      state: resumed.state, selectedBusiness: input.selectedBusiness,
      selectedBusinesses: input.selectedBusinesses, stepCount: input.route.stepCount,
      runState: 'outcome_unknown', evidenceState: evidence.state, problemState: problem.state,
      resumedState: resumed.state, completedSteps: resumed.progress.completed, automaticRetry: false,
    },
    measurements: journeyMeasurements(input.input, input.route, false, true),
    sandbox: true,
    claimBoundary: 'contract_and_hosted_journey_only_not_real_supply_or_customer_value',
  })
}

async function completeHostedJourney(input: Readonly<{
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
}>): Promise<HostedCustomerRequestJourneyProof> {
  let resumed: CustomerRequestView | undefined
  for (let attempt = 0; attempt < 24; attempt += 1) {
    resumed = await callAgent(input.input, input.progressPath, 'GET', undefined, [200, 202])
    observe(input.states, resumed)
    if (resumed.state === 'completed') break
    if (resumed.state !== 'in_progress') {
      throw new Error(`hosted_journey_completion_stopped:${resumed.state}`)
    }
    await (input.input.sleep ?? defaultSleep)(1_000)
  }
  if (resumed?.state !== 'completed' || resumed.action?.state !== 'completed'
    || resumed.action.result === undefined) throw new Error('hosted_journey_completion_timeout')
  if (JSON.stringify(resumed.businesses?.map(({ name }) => name))
    !== JSON.stringify(input.selectedBusinesses)) {
    throw new Error('hosted_journey_terminal_businesses_changed')
  }
  const evidence = await callAgentEvidence(input.input, input.evidencePath)
  if (evidence.state !== 'completed' || evidence.result === undefined
    || evidence.steps.length !== input.route.stepCount
    || evidence.steps.some((step) => step.state !== 'completed')) {
    throw new Error('hosted_journey_completed_evidence_missing')
  }
  const actionResultDigest = digestInput(resumed.action.result)
  const evidenceResultDigest = digestInput(evidence.result)
  if (actionResultDigest !== evidenceResultDigest) throw new Error('hosted_journey_result_mismatch')
  return hostedCustomerRequestJourneyProofSchema.parse({
    kind: 'cold_external_agent_journey', agent: input.input.agent,
    release: journeyReleaseProjection(input.input, input.release),
    observedAt: new Date((input.input.now ?? Date.now)()).toISOString(),
    input: {
      request: input.input.scenario.request,
      facts: input.consumedFacts,
      messages: input.consumedMessages,
    },
    observedStates: input.states, authorityStops: input.authorityStops,
    final: {
      requestRef: input.requestRef, revision: resumed.revision,
      state: resumed.state, selectedBusiness: input.selectedBusiness,
      selectedBusinesses: input.selectedBusinesses, stepCount: input.route.stepCount,
      runState: 'completed', evidenceState: evidence.state,
      problemState: 'not_reported', resumedState: resumed.state,
      resultDigest: evidenceResultDigest,
    },
    measurements: journeyMeasurements(input.input, input.route, true, true, evidenceResultDigest),
    sandbox: true,
    claimBoundary: 'contract_and_hosted_journey_only_not_real_supply_or_customer_value',
  })
}

function assertExpectedRoute(
  expected: HostedCustomerRequestJourneyInput['scenario']['expectedRoute'],
  route: NonNullable<NonNullable<CustomerRequestView['decision']>['routes']>[number],
): void {
  assertRouteDisclosureIntegrity(route)
  if (expected === undefined) return
  const businesses = route.businesses.map(({ name }) => name)
  if (route.stepCount !== expected.stepCount) throw new Error(`hosted_journey_step_count:${route.stepCount}`)
  if (JSON.stringify(businesses) !== JSON.stringify(expected.businesses)) {
    throw new Error(`hosted_journey_businesses:${businesses.join('|')}`)
  }
  if (expected.recipients !== undefined) {
    const actual = route.dataUse.recipients
      .map(({ name, purposes }) => ({ name, purposes: [...purposes].sort() }))
      .sort((left, right) => left.name.localeCompare(right.name))
    const declared = expected.recipients
      .map(({ name, purposes }) => ({ name, purposes: [...purposes].sort() }))
      .sort((left, right) => left.name.localeCompare(right.name))
    if (JSON.stringify(actual) !== JSON.stringify(declared)) {
      throw new Error('hosted_journey_disclosure_recipients_changed')
    }
  }
}

function assertRouteDisclosureIntegrity(
  route: NonNullable<NonNullable<CustomerRequestView['decision']>['routes']>[number],
): void {
  const recipients = route.dataUse.recipients
  if (route.dataUse.recipientCount !== recipients.length) {
    throw new Error('hosted_journey_disclosure_recipient_count')
  }
  const recipientRefs = new Set<string>()
  const recipientNames = new Set<string>()
  const purposes = new Set<string>()
  for (const recipient of recipients) {
    if (recipientRefs.has(recipient.recipientRef) || recipientNames.has(recipient.name)) {
      throw new Error('hosted_journey_disclosure_recipient_duplicate')
    }
    if (recipient.recipientRef.trim().length === 0 || recipient.name.trim().length === 0
      || recipient.purposes.length === 0 || recipient.fields.length === 0
      || recipient.purposes.some((purpose) => purpose.trim().length === 0)
      || recipient.fields.some(({ fieldRef, label }) => (
        fieldRef.trim().length === 0 || label.trim().length === 0
      ))) {
      throw new Error('hosted_journey_disclosure_recipient_incomplete')
    }
    recipientRefs.add(recipient.recipientRef)
    recipientNames.add(recipient.name)
    recipient.purposes.forEach((purpose) => purposes.add(purpose))
  }
  const aggregate = [...route.dataUse.purposes].sort()
  if (JSON.stringify(aggregate) !== JSON.stringify([...purposes].sort())) {
    throw new Error('hosted_journey_disclosure_purpose_mismatch')
  }
}

export async function verifyHostedCustomerRequestFrontDoor(input: Readonly<{
  baseUrl: string
  deploymentProtectionBypass?: string
  fetch?: typeof globalThis.fetch
}>): Promise<void> {
  assertProductionBaseUrl(input.baseUrl)
  const shared = {
    ...input,
    agentApiKey: '', expectedRevision: '', expectedDeploymentId: '',
    agent: { name: '', version: '' }, scenario: { request: '', facts: {}, messages: [] },
    sandbox: true as const,
    verifyRelease: async () => ({ kind: 'verified' as const, revision: '', deploymentId: '' }),
  }
  await proveDiscovery(shared)
  await proveAnonymousRefusal(shared)
}

async function callAgent(
  input: HostedCustomerRequestJourneyRuntimeInput,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
  acceptedStatuses: readonly number[] = [200],
  mutationSource?: MutationSource,
): Promise<CustomerRequestView> {
  recordMutation(input, method, path, mutationSource)
  input.metrics.requestCalls += 1
  const response = await (input.fetch ?? fetch)(`${normalizedBaseUrl(input.baseUrl)}${path}`, {
    method, headers: headers(input, input.agentApiKey),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const value: unknown = await response.json()
  if (!acceptedStatuses.includes(response.status)) throw responseError(method, path, response.status, value)
  const result = customerRequestAgentResultSchema.parse(value)
  if (result.kind !== 'request') throw new Error(`hosted_journey_agent_result:${result.kind}`)
  return result
}

type AgentNavigationRelation = NonNullable<CustomerRequestView['navigation']>['actions'][number]['relation']

async function callObservedAgent(
  input: HostedCustomerRequestJourneyRuntimeInput,
  view: CustomerRequestView,
  relation: AgentNavigationRelation,
  replacements: Readonly<Record<string, unknown>> = {},
  acceptedStatuses: readonly number[] = [200],
): Promise<CustomerRequestView> {
  const action = observedNavigationAction(input, view, relation)
  const body = action.method === 'POST' ? materializeObservedInput(view, action, replacements) : undefined
  return await callAgent(
    input, action.path, action.method, body, acceptedStatuses,
    action.method === 'POST' ? 'observed_navigation' : undefined,
  )
}

function observedNavigationPath(
  input: HostedCustomerRequestJourneyInput,
  view: CustomerRequestView,
  relation: AgentNavigationRelation,
  expectedMethod: 'GET' | 'POST',
): string {
  const action = observedNavigationAction(input, view, relation)
  if (action.method !== expectedMethod) throw new Error(`hosted_journey_navigation_method:${relation}`)
  return action.path
}

function observedNavigationAction(
  input: HostedCustomerRequestJourneyInput,
  view: CustomerRequestView,
  relation: AgentNavigationRelation,
): ObservedNavigationAction {
  const matches = view.navigation?.actions.filter((action) => action.relation === relation) ?? []
  if (matches.length !== 1) throw new Error(`hosted_journey_navigation_missing:${relation}`)
  const action = matches[0]
  if (action === undefined) throw new Error(`hosted_journey_navigation_missing:${relation}`)
  const base = new URL(normalizedBaseUrl(input.baseUrl))
  let current: URL
  let target: URL
  try {
    current = new URL(view.navigation?.current ?? '', base)
    target = new URL(action.href, base)
  } catch { throw new Error(`hosted_journey_navigation_invalid:${relation}`) }
  if (target.origin !== base.origin || target.username !== '' || target.password !== '' || target.hash !== ''
    || current.origin !== base.origin || current.username !== '' || current.password !== '' || current.hash !== ''
    || !current.pathname.startsWith('/api/v1/requests/')
    || (target.pathname !== current.pathname && !target.pathname.startsWith(`${current.pathname}/`))) {
    throw new Error(`hosted_journey_navigation_unsafe:${relation}`)
  }
  return { method: action.method, path: `${target.pathname}${target.search}`, input: action.input }
}

type ObservedNavigationAction = Readonly<{ method: 'GET' | 'POST'; path: string; input?: unknown }>

function materializeObservedInput(
  view: CustomerRequestView,
  action: ObservedNavigationAction,
  replacements: Readonly<Record<string, unknown>>,
): unknown {
  if (action.input === undefined) throw new Error('hosted_journey_navigation_input_missing')
  const used = new Set<string>()
  const visit = (value: unknown): unknown => {
    if (typeof value === 'string' && Object.hasOwn(replacements, value)) {
      used.add(value)
      return replacements[value]
    }
    if (typeof value === 'string' && /^<[^>]+>$/u.test(value)) {
      throw new Error(`hosted_journey_navigation_input_unresolved:${value}`)
    }
    if (Array.isArray(value)) return value.map(visit)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visit(entry)]))
    }
    return value
  }
  const materialized = customerRequestJsonValueSchema.parse(visit(action.input))
  for (const placeholder of Object.keys(replacements)) {
    if (!used.has(placeholder)) throw new Error(`hosted_journey_navigation_input_placeholder_missing:${placeholder}`)
  }
  if (materialized !== null && typeof materialized === 'object' && !Array.isArray(materialized)) {
    const record = materialized as Record<string, unknown>
    for (const revision of [record.revision, record.expectedRevision]) {
      if (revision !== undefined && revision !== view.revision) {
        throw new Error('hosted_journey_navigation_input_stale_revision')
      }
    }
    if (record.requirementKey !== undefined
      && (view.clarification?.kind !== 'contract_fact'
        || record.requirementKey !== view.clarification.requirementKey)) {
      throw new Error('hosted_journey_navigation_input_wrong_requirement')
    }
  }
  return materialized
}

async function callAgentEvidence(input: HostedCustomerRequestJourneyRuntimeInput, path: string) {
  input.metrics.requestCalls += 1
  const response = await (input.fetch ?? fetch)(`${normalizedBaseUrl(input.baseUrl)}${path}`, {
    method: 'GET', headers: headers(input, input.agentApiKey),
  })
  const value: unknown = await response.json()
  if (!response.ok) throw responseError('GET', path, response.status, value)
  const result = customerRequestEvidenceResultSchema.parse(value)
  if (result.kind !== 'evidence') throw new Error(`hosted_journey_evidence_result:${result.kind}`)
  return result
}

async function callAgentProblem(
  input: HostedCustomerRequestJourneyRuntimeInput,
  path: string,
  body: unknown,
) {
  recordMutation(input, 'POST', path, 'observed_navigation')
  input.metrics.requestCalls += 1
  const response = await (input.fetch ?? fetch)(`${normalizedBaseUrl(input.baseUrl)}${path}`, {
    method: 'POST', headers: headers(input, input.agentApiKey),
    body: JSON.stringify(body),
  })
  const value: unknown = await response.json()
  if (!response.ok) throw responseError('POST', path, response.status, value)
  const result = customerRequestProblemResultSchema.parse(value)
  if (result.kind !== 'problem_reported') throw new Error(`hosted_journey_problem_result:${result.kind}`)
  return result
}

async function proveDiscovery(input: HostedCustomerRequestJourneyInput): Promise<void> {
  const [llms, skill] = await Promise.all(['/llms.txt', '/SKILL.md'].map(async (path) => {
    const response = await (input.fetch ?? fetch)(`${normalizedBaseUrl(input.baseUrl)}${path}`, {
      headers: headers(input),
    })
    if (!response.ok) throw new Error(`hosted_journey_discovery_unavailable:${path}:${response.status}`)
    return await response.text()
  }))
  const discovery = `${llms}\n${skill}`
  for (const marker of [
    '/api/v1/requests', CUSTOMER_REQUEST_AGENT_SCOPE, 'navigation.actions', 'routes_ready', 'route_confirmed',
  ]) {
    if (!discovery.includes(marker)) throw new Error(`hosted_journey_discovery_missing:${marker}`)
  }
}

async function proveAnonymousRefusal(input: HostedCustomerRequestJourneyInput): Promise<void> {
  const response = await (input.fetch ?? fetch)(`${normalizedBaseUrl(input.baseUrl)}/api/v1/requests`, {
    method: 'POST', headers: headers(input), body: '{}',
  })
  const value: unknown = await response.json()
  const result = customerRequestAgentResultSchema.safeParse(value)
  if (response.status !== 401 || !result.success || result.data.kind !== 'refused'
    || result.data.reason !== 'authentication_required') throw new Error('hosted_journey_anonymous_boundary_failed')
}

function headers(input: HostedCustomerRequestJourneyInput, credential?: string): Headers {
  const result = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
  if (credential !== undefined) result.set('Authorization', `Bearer ${credential}`)
  if (input.deploymentProtectionBypass !== undefined) {
    result.set('x-vercel-protection-bypass', input.deploymentProtectionBypass)
  }
  return result
}

function observe(states: CustomerRequestView['state'][], view: CustomerRequestView): void {
  if (states.at(-1) !== view.state) states.push(view.state)
}

function normalizedBaseUrl(value: string): string {
  return value.replace(/\/+$/u, '')
}

function journeyEnvironment(input: HostedCustomerRequestJourneyInput): 'production' | 'development' {
  return input.environment ?? 'production'
}

function journeyReleaseProjection(
  input: HostedCustomerRequestJourneyInput,
  release: ReleaseVerification,
): z.infer<typeof journeyReleaseSchema> {
  const base = {
    revision: release.revision, deploymentId: release.deploymentId,
    baseUrl: normalizedBaseUrl(input.baseUrl),
  }
  return journeyEnvironment(input) === 'development'
    ? { ...base, environment: 'development', verification: 'local_checkout_and_named_dev_deployment' }
    : { ...base, environment: 'production' }
}

function assertJourneyBaseUrl(value: string, environment: 'production' | 'development'): void {
  if (environment === 'production') {
    assertProductionBaseUrl(value)
    return
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('hosted_journey_base_url_invalid')
  }
  if (url.protocol !== 'http:' || (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
    || url.username !== '' || url.password !== '' || url.pathname.replace(/\/+$/u, '') !== ''
    || url.search !== '' || url.hash !== '') {
    throw new Error('hosted_journey_base_url_not_development')
  }
}

function assertProductionBaseUrl(value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('hosted_journey_base_url_invalid')
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== ''
    || url.port !== '' || url.pathname.replace(/\/+$/u, '') !== ''
    || url.search !== '' || url.hash !== ''
    || url.hostname !== 'agentic-economy-phi.vercel.app') {
    throw new Error('hosted_journey_base_url_not_production')
  }
}

function responseError(method: string, path: string, status: number, value: unknown): Error {
  const reason = z.object({ reason: z.string().optional(), error: z.string().optional() }).safeParse(value)
  return new HostedJourneyResponseError(
    method,
    path,
    status,
    reason.success ? reason.data.reason ?? reason.data.error ?? 'unexpected' : 'unexpected',
  )
}

class HostedJourneyResponseError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly reason: string,
  ) {
    super(`${method} ${path} returned ${status}:${reason}`)
  }
}

async function submitWithInterpreterRecovery(
  input: HostedCustomerRequestJourneyRuntimeInput,
  submit: z.infer<typeof customerRequestSubmitInputSchema>,
): Promise<CustomerRequestView> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await callAgent(
        input, '/api/v1/requests', 'POST', submit, [200],
        attempt === 1 ? 'declared_request' : 'automatic_replay',
      )
    } catch (error) {
      const retryable = error instanceof HostedJourneyResponseError
        && error.method === 'POST'
        && error.path === '/api/v1/requests'
        && error.status === 503
        && (error.reason === 'interpreter_unavailable' || error.reason === 'request_unavailable')
      if (!retryable || attempt === 3) throw error
      await (input.sleep ?? defaultSleep)(1_000)
    }
  }
  throw new Error('hosted_journey_interpreter_recovery_exhausted')
}

function journeyMeasurements(
  input: HostedCustomerRequestJourneyRuntimeInput,
  route: NonNullable<NonNullable<CustomerRequestView['decision']>['routes']>[number],
  resultUsable: boolean,
  resumed: boolean,
  resultDigest?: string,
) {
  const totalCostAccuracy = route.maximumTotalCost.kind === 'known'
    ? {
        state: 'exact' as const,
        total: { currency: route.maximumTotalCost.currency, amountMinor: route.maximumTotalCost.amountMinor },
      }
    : { state: 'unavailable' as const }
  return {
    integrationBurden: {
      requestCalls: input.metrics.requestCalls,
      clarifications: input.metrics.clarifications,
    },
    turns: { total: input.metrics.requestCalls },
    elapsedMs: Math.max(0, (input.now ?? Date.now)() - input.metrics.startedAt),
    hardConstraintAccuracy: { state: route.comparison.hardConstraints },
    totalCostAccuracy,
    recovery: {
      state: 'durable' as const, resumed,
      postures: [...new Set(route.recovery.map(({ posture }) => posture))],
    },
    resultUsability: { state: resultUsable ? 'usable' as const : 'unusable' as const },
    replaySafety: { executionStart: input.metrics.executionStartReplay },
    ...(input.metrics.staleOptionRecovery === undefined
      ? {}
      : { staleOptionRecovery: input.metrics.staleOptionRecovery }),
    ...(input.metrics.unsupportedRecovery === undefined
      ? {}
      : { unsupportedRecovery: input.metrics.unsupportedRecovery }),
    disclosureIntegrity: {
      state: 'verified' as const,
      recipients: route.dataUse.recipients.map(({ name }) => name).sort(),
      purposes: [...route.dataUse.purposes].sort(),
    },
    resultIntegrity: resultDigest === undefined
      ? { state: 'not_applicable' as const }
      : { state: 'verified' as const, digest: resultDigest },
    controlIntegrity: {
      state: 'verified' as const,
      operatorInterventions: 0 as const,
      mutations: input.metrics.mutations,
    },
  }
}

function requiredRouteGenerationRef(view: CustomerRequestView): string {
  if (view.routeGenerationRef === undefined) throw new Error('hosted_journey_route_generation_missing')
  return view.routeGenerationRef
}

function recordMutation(
  input: HostedCustomerRequestJourneyRuntimeInput,
  method: 'GET' | 'POST',
  path: string,
  source: MutationSource | undefined,
): void {
  if (method === 'GET') {
    if (source !== undefined) throw new Error('hosted_journey_read_has_mutation_source')
    return
  }
  if (source === undefined) throw new Error('hosted_journey_mutation_source_missing')
  input.metrics.mutations.push({ path, source })
}

function assertExecutionStartReplay(started: CustomerRequestView, replayed: CustomerRequestView): void {
  const startedProgress = started.progress
  const replayedProgress = replayed.progress
  const sameExecutionAuthority = replayed.requestRef === started.requestRef
    && replayed.revision === started.revision
    && replayed.routeGenerationRef === started.routeGenerationRef
    && replayed.confirmation?.confirmationRef === started.confirmation?.confirmationRef
  const monotonicProgress = startedProgress === undefined || replayedProgress === undefined
    ? replayed.state === 'completed'
    : replayedProgress.total === startedProgress.total
      && replayedProgress.completed >= startedProgress.completed
  const replayableAgain = replayed.navigation?.actions.some(
    ({ relation }) => relation === 'start_confirmed_option',
  ) ?? false
  if (!sameExecutionAuthority || !monotonicProgress || replayableAgain
    || (replayed.state !== 'in_progress' && replayed.state !== 'completed')) {
    throw new Error('hosted_journey_execution_start_replay_changed')
  }
}

function digestInput(value: unknown): string {
  return canonicalDigest(customerRequestJsonValueSchema.parse(value) as StableHashValue)
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}
