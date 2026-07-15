import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  CUSTOMER_REQUEST_AGENT_SCOPE,
  customerRequestAgentResultSchema,
  customerRequestEvidenceResultSchema,
  customerRequestFactInputSchema,
  customerRequestJsonValueSchema,
  customerRequestMessageInputSchema,
  customerRequestOptionsInputSchema,
  customerRequestProblemInputSchema,
  customerRequestProblemResultSchema,
  customerRequestRouteActionInputSchema,
  customerRequestRouteConfirmationInputSchema,
  customerRequestSubmitInputSchema,
  type CustomerRequestView,
} from './agent-contract'

type ReleaseVerification = Readonly<{ kind: 'verified'; revision: string; deploymentId: string }>

export type HostedCustomerRequestJourneyInput = Readonly<{
  baseUrl: string
  agentApiKey: string
  expectedRevision: string
  expectedDeploymentId: string
  agent: Readonly<{ name: string; version: string }>
  scenario: Readonly<{
    request: string
    facts: Readonly<Record<string, unknown>>
    messages: readonly string[]
    finish?: 'cancel' | 'complete'
    expectedRoute?: Readonly<{ stepCount: number; businesses: readonly string[] }>
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
}

type HostedCustomerRequestJourneyRuntimeInput = HostedCustomerRequestJourneyInput & Readonly<{
  metrics: JourneyMetrics
}>

export const hostedCustomerRequestJourneyProofSchema = z.strictObject({
  kind: z.literal('cold_external_agent_journey'),
  agent: z.object({ name: z.string(), version: z.string() }).strict(),
  release: z.object({
    revision: z.string().regex(/^[a-f0-9]{40}$/u), deploymentId: z.string().startsWith('dpl_'),
    environment: z.literal('production'), baseUrl: z.url().startsWith('https://'),
  }).strict(),
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
    requestRef: z.string(), state: z.enum(['cancelled', 'completed']), selectedBusiness: z.string(),
    selectedBusinesses: z.array(z.string()).min(1), stepCount: z.number().int().positive(),
    runState: z.enum(['in_progress', 'completed']),
    evidenceState: z.enum(['queued', 'completed']),
    problemState: z.enum(['received', 'not_reported']),
    resumedState: z.enum(['cancelled', 'completed']),
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
  }),
  sandbox: z.literal(true),
  claimBoundary: z.literal('contract_and_hosted_journey_only_not_real_supply_or_customer_value'),
})

export type HostedCustomerRequestJourneyProof = Readonly<z.infer<typeof hostedCustomerRequestJourneyProofSchema>>

export async function runHostedCustomerRequestJourney(
  input: HostedCustomerRequestJourneyInput,
): Promise<HostedCustomerRequestJourneyProof> {
  assertProductionBaseUrl(input.baseUrl)
  const metrics: JourneyMetrics = {
    startedAt: (input.now ?? Date.now)(), requestCalls: 0, clarifications: 0,
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
  const replay = await callAgent(runtimeInput, '/api/v1/requests', 'POST', submit)
  if (JSON.stringify(view) !== JSON.stringify(replay)) throw new Error('hosted_journey_submit_replay_changed')
  observe(states, view)

  let messageIndex = 0
  let transitions = 0
  while (transitions < 24) {
    transitions += 1
    if (view.state === 'needs_information') {
      metrics.clarifications += 1
      const clarification = view.clarification
      if (clarification === undefined) throw new Error('hosted_journey_clarification_missing')
      if (clarification.kind === 'intent_direction') {
        const message = input.scenario.messages[messageIndex]
        if (message === undefined) throw new Error(`hosted_journey_message_missing:${clarification.prompt}`)
        view = await callObservedAgent(runtimeInput, view, 'answer_clarification', customerRequestMessageInputSchema.parse({
          idempotencyKey: `acceptance:message:${nonce}:${messageIndex}`,
          expectedRevision: view.revision, message,
        }))
        consumedMessages.push({ index: messageIndex, valueDigest: canonicalDigest(message) })
        messageIndex += 1
      } else {
        const fact = clarification.requirementKey in input.scenario.facts
          ? input.scenario.facts[clarification.requirementKey]
          : input.scenario.facts['*']
        if (fact === undefined) {
          throw new Error(`hosted_journey_fact_missing:${clarification.requirementKey}`)
        }
        view = await callObservedAgent(runtimeInput, view, 'answer_clarification', customerRequestFactInputSchema.parse({
          idempotencyKey: `acceptance:fact:${nonce}:${clarification.requirementKey}`,
          expectedRevision: view.revision, requirementKey: clarification.requirementKey,
          value: fact,
        }))
        consumedFacts.push({
          requirementKey: clarification.requirementKey,
          valueDigest: digestInput(fact),
        })
      }
      observe(states, view)
      continue
    }

    if (view.state === 'ready_to_compare') {
      view = await callObservedAgent(runtimeInput, view, 'prepare_options', customerRequestOptionsInputSchema.parse({
        revision: view.revision, idempotencyKey: `acceptance:prepare:${nonce}:${view.revision}`,
      }), [200, 202])
      observe(states, view)
      continue
    }

    if (view.state === 'routes_ready') {
      const route = view.decision?.routes[0]
      const selectedBusinesses = route?.businesses.map(({ name }) => name) ?? []
      const selectedBusiness = selectedBusinesses[0]
      if (route === undefined || selectedBusiness === undefined) throw new Error('hosted_journey_route_missing')
      assertExpectedRoute(input.scenario.expectedRoute, route.stepCount, selectedBusinesses)
      authorityStops.push('route_confirmation')
      view = await callObservedAgent(
        runtimeInput, view, 'confirm_option',
        customerRequestRouteConfirmationInputSchema.parse({
          revision: view.revision, routeRef: route.routeRef,
          idempotencyKey: `acceptance:confirm:${nonce}:${view.revision}`,
        }),
      )
      observe(states, view)
      if (view.state !== 'route_confirmed') throw new Error(`hosted_journey_confirmation_failed:${view.state}`)
      view = await callObservedAgent(
        runtimeInput, view, 'start_confirmed_option',
        customerRequestRouteActionInputSchema.parse({ idempotencyKey: `acceptance:run:${nonce}` }),
      )
      observe(states, view)
      if (view.state !== 'in_progress') throw new Error(`hosted_journey_run_failed:${view.state}`)
      const progressPath = observedNavigationPath(input, view, 'inspect_progress', 'GET')
      const evidencePath = observedNavigationPath(input, view, 'inspect_evidence', 'GET')
      if (input.scenario.finish === 'complete') {
        return await completeHostedJourney({
          input: runtimeInput, release, requestRef, route, selectedBusiness, selectedBusinesses,
          states, authorityStops, consumedFacts, consumedMessages, progressPath, evidencePath,
        })
      }
      const evidence = await callAgentEvidence(runtimeInput, evidencePath)
      if (evidence.state !== 'queued') throw new Error(`hosted_journey_evidence_state:${evidence.state}`)
      const problem = await callAgentProblem(runtimeInput, observedNavigationPath(input, view, 'report_problem', 'POST'), {
        idempotencyKey: `acceptance:problem:${nonce}`, category: 'other',
        summary: 'Labelled sandbox recovery verification.',
      })
      const cancelled = await callObservedAgent(
        runtimeInput, view, 'cancel',
        customerRequestRouteActionInputSchema.parse({ idempotencyKey: `acceptance:cancel:${nonce}` }),
      )
      observe(states, cancelled)
      if (cancelled.state !== 'cancelled') throw new Error(`hosted_journey_cancellation_failed:${cancelled.state}`)
      const resumed = await callAgent(runtimeInput, progressPath, 'GET')
      observe(states, resumed)
      if (resumed.state !== 'cancelled') throw new Error(`hosted_journey_cancel_resume_failed:${resumed.state}`)
      return hostedCustomerRequestJourneyProofSchema.parse({
        kind: 'cold_external_agent_journey', agent: input.agent,
        release: {
          revision: release.revision, deploymentId: release.deploymentId,
          environment: 'production', baseUrl: normalizedBaseUrl(input.baseUrl),
        },
        observedAt: new Date((input.now ?? Date.now)()).toISOString(),
        input: { request: input.scenario.request, facts: consumedFacts, messages: consumedMessages },
        observedStates: states, authorityStops,
        final: {
          requestRef, state: resumed.state, selectedBusiness, selectedBusinesses,
          stepCount: route.stepCount, runState: 'in_progress',
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
  const evidence = await callAgentEvidence(input.input, input.evidencePath)
  if (evidence.state !== 'completed' || evidence.result === undefined
    || evidence.steps.length !== input.route.stepCount
    || evidence.steps.some((step) => step.state !== 'completed')) {
    throw new Error('hosted_journey_completed_evidence_missing')
  }
  return hostedCustomerRequestJourneyProofSchema.parse({
    kind: 'cold_external_agent_journey', agent: input.input.agent,
    release: {
      revision: input.release.revision, deploymentId: input.release.deploymentId,
      environment: 'production', baseUrl: normalizedBaseUrl(input.input.baseUrl),
    },
    observedAt: new Date((input.input.now ?? Date.now)()).toISOString(),
    input: {
      request: input.input.scenario.request,
      facts: input.consumedFacts,
      messages: input.consumedMessages,
    },
    observedStates: input.states, authorityStops: input.authorityStops,
    final: {
      requestRef: input.requestRef, state: resumed.state, selectedBusiness: input.selectedBusiness,
      selectedBusinesses: input.selectedBusinesses, stepCount: input.route.stepCount,
      runState: 'completed', evidenceState: evidence.state,
      problemState: 'not_reported', resumedState: resumed.state,
      resultDigest: digestInput(evidence.result),
    },
    measurements: journeyMeasurements(input.input, input.route, true, true),
    sandbox: true,
    claimBoundary: 'contract_and_hosted_journey_only_not_real_supply_or_customer_value',
  })
}

function assertExpectedRoute(
  expected: HostedCustomerRequestJourneyInput['scenario']['expectedRoute'],
  stepCount: number,
  businesses: readonly string[],
): void {
  if (expected === undefined) return
  if (stepCount !== expected.stepCount) throw new Error(`hosted_journey_step_count:${stepCount}`)
  if (JSON.stringify(businesses) !== JSON.stringify(expected.businesses)) {
    throw new Error(`hosted_journey_businesses:${businesses.join('|')}`)
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
): Promise<CustomerRequestView> {
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
  body?: unknown,
  acceptedStatuses: readonly number[] = [200],
): Promise<CustomerRequestView> {
  const action = observedNavigationAction(input, view, relation)
  return await callAgent(input, action.path, action.method, body, acceptedStatuses)
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
): Readonly<{ method: 'GET' | 'POST'; path: string }> {
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
  return { method: action.method, path: `${target.pathname}${target.search}` }
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
  input.metrics.requestCalls += 1
  const response = await (input.fetch ?? fetch)(`${normalizedBaseUrl(input.baseUrl)}${path}`, {
    method: 'POST', headers: headers(input, input.agentApiKey),
    body: JSON.stringify(customerRequestProblemInputSchema.parse(body)),
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
      return await callAgent(input, '/api/v1/requests', 'POST', submit)
    } catch (error) {
      const retryable = error instanceof HostedJourneyResponseError
        && error.method === 'POST'
        && error.path === '/api/v1/requests'
        && error.status === 503
        && error.reason === 'interpreter_unavailable'
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
  }
}

function digestInput(value: unknown): string {
  return canonicalDigest(customerRequestJsonValueSchema.parse(value) as StableHashValue)
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}
