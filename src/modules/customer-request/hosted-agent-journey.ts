import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  CUSTOMER_REQUEST_AGENT_SCOPE,
  customerRequestAgentResultSchema,
  customerRequestApprovalResultSchema,
  customerRequestAuthorizationInputSchema,
  customerRequestFactInputSchema,
  customerRequestJsonValueSchema,
  customerRequestMessageInputSchema,
  customerRequestOptionsInputSchema,
  customerRequestSubmitInputSchema,
  customerRequestViewSchema,
  type CustomerRequestView,
} from './agent-contract'

type ReleaseVerification = Readonly<{ kind: 'verified'; revision: string; deploymentId: string }>

export type HostedCustomerRequestJourneyInput = Readonly<{
  baseUrl: string
  agentApiKey: string
  customerSessionToken: string
  expectedRevision: string
  expectedDeploymentId: string
  agent: Readonly<{ name: string; version: string }>
  scenario: Readonly<{
    request: string
    facts: Readonly<Record<string, unknown>>
    messages: readonly string[]
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

export const hostedCustomerRequestJourneyProofSchema = z.object({
  kind: z.literal('cold_external_agent_journey'),
  agent: z.object({ name: z.string(), version: z.string() }).strict(),
  release: z.object({
    revision: z.string().regex(/^[a-f0-9]{40}$/u), deploymentId: z.string().startsWith('dpl_'),
    environment: z.literal('production'), baseUrl: z.url().startsWith('https://'),
  }).strict(),
  observedAt: z.iso.datetime(),
  input: z.object({
    request: z.string(),
    facts: z.array(z.object({ requirementKey: z.string(), valueDigest: z.string() }).strict()).min(1),
    messages: z.array(z.object({ index: z.number().int().nonnegative(), valueDigest: z.string() }).strict()),
  }).strict(),
  observedStates: z.array(z.enum([
    'needs_information', 'ready_to_compare', 'preparing_options', 'options_ready', 'no_options',
    'needs_authorization', 'unsupported', 'needs_attention', 'outcome_unknown', 'completed', 'failed',
  ])),
  authorityStops: z.array(z.enum(['preparation_disclosure', 'prepared_action_approval'])),
  final: z.object({
    requestRef: z.string(), state: z.literal('options_ready'), businessName: z.string(),
    approval: z.object({
      state: z.literal('recorded'), currency: z.string(), maximumSpendMinor: z.number().int().nonnegative(),
      expiresAt: z.number().int().positive(), recordedAt: z.number().int().nonnegative(),
    }).strict(),
  }).strict(),
  sandbox: z.literal(true),
  claimBoundary: z.literal('contract_and_hosted_journey_only_not_real_supply_or_customer_value'),
}).strict()

export type HostedCustomerRequestJourneyProof = Readonly<z.infer<typeof hostedCustomerRequestJourneyProofSchema>>

export async function runHostedCustomerRequestJourney(
  input: HostedCustomerRequestJourneyInput,
): Promise<HostedCustomerRequestJourneyProof> {
  assertProductionBaseUrl(input.baseUrl)
  const release = await input.verifyRelease()
  if (release.revision !== input.expectedRevision || release.deploymentId !== input.expectedDeploymentId) {
    throw new Error('hosted_journey_release_mismatch')
  }
  await (input.verifyDiscovery ?? (() => proveDiscovery(input)))()
  await (input.verifyAnonymousRefusal ?? (() => proveAnonymousRefusal(input)))()

  const nonce = randomUUID()
  const requestRef = `acceptance:${nonce}`
  const states: CustomerRequestView['state'][] = []
  const authorityStops: Array<'preparation_disclosure' | 'prepared_action_approval'> = []
  const consumedFacts: Array<{ requirementKey: string; valueDigest: string }> = []
  const consumedMessages: Array<{ index: number; valueDigest: string }> = []
  const submit = customerRequestSubmitInputSchema.parse({
    idempotencyKey: `acceptance:submit:${nonce}`, requestRef,
    agentRef: `${input.agent.name}:${input.agent.version}`, request: input.scenario.request,
  })
  let view = await callAgent(input, '/api/v1/requests', 'POST', submit)
  const replay = await callAgent(input, '/api/v1/requests', 'POST', submit)
  if (JSON.stringify(view) !== JSON.stringify(replay)) throw new Error('hosted_journey_submit_replay_changed')
  observe(states, view)

  let messageIndex = 0
  let transitions = 0
  while (transitions < 24) {
    transitions += 1
    if (view.state === 'needs_information') {
      const clarification = view.clarification
      if (clarification === undefined) throw new Error('hosted_journey_clarification_missing')
      if (clarification.kind === 'intent_direction') {
        const message = input.scenario.messages[messageIndex]
        if (message === undefined) throw new Error(`hosted_journey_message_missing:${clarification.prompt}`)
        view = await callAgent(input, requestPath(requestRef, 'messages'), 'POST', customerRequestMessageInputSchema.parse({
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
        view = await callAgent(input, requestPath(requestRef, 'facts'), 'POST', customerRequestFactInputSchema.parse({
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

    if (view.state === 'ready_to_compare' || (view.state === 'needs_authorization' && view.preparationRef === undefined)) {
      view = await callAgent(input, requestPath(requestRef, 'options'), 'POST', customerRequestOptionsInputSchema.parse({
        revision: view.revision, idempotencyKey: `acceptance:prepare:${nonce}:${view.revision}`,
      }), [200, 202])
      observe(states, view)
      continue
    }

    if (view.state === 'needs_authorization') {
      if (view.preparationRef === undefined) throw new Error('hosted_journey_preparation_ref_missing')
      authorityStops.push('preparation_disclosure')
      const authorized = await callCustomerView(
        input, `/api/requests/${encodeURIComponent(requestRef)}/authorization`,
        customerRequestAuthorizationInputSchema.parse({
          revision: view.revision, preparationRef: view.preparationRef,
          idempotencyKey: `acceptance:authorize:${nonce}:${view.revision}`,
        }),
      )
      observe(states, authorized)
      view = await callAgent(input, requestPath(requestRef), 'GET')
      observe(states, view)
      continue
    }

    if (view.state === 'preparing_options') {
      await (input.sleep ?? defaultSleep)(1_000)
      view = await callAgent(input, requestPath(requestRef), 'GET', undefined, [200, 202])
      observe(states, view)
      continue
    }

    if (view.state === 'options_ready') {
      if (consumedFacts.length < 1) throw new Error('hosted_journey_typed_fact_not_submitted')
      const prepared = view.preparedAction
      if (prepared === undefined) throw new Error('hosted_journey_prepared_decision_missing')
      authorityStops.push('prepared_action_approval')
      const approval = await callCustomerApproval(input, requestRef, {
        revision: view.revision, preparedActionRef: prepared.actionRef,
        maximumSpendMinor: prepared.price.maximumAmountMinor,
        expiresAt: prepared.validUntil,
        idempotencyKey: `acceptance:approve:${nonce}:${view.revision}`,
      })
      const resumed = await callAgent(input, requestPath(requestRef), 'GET')
      observe(states, resumed)
      const recordedApproval = resumed.preparedAction?.approval
      if (resumed.state !== 'options_ready' || resumed.preparedAction?.businessName !== prepared.businessName
        || recordedApproval?.state !== 'recorded'
        || recordedApproval.currency !== approval.spend.currency
        || recordedApproval.maximumSpendMinor !== approval.spend.maximumAmountMinor
        || recordedApproval.expiresAt !== approval.expiresAt) {
        throw new Error('hosted_journey_post_approval_resume_changed')
      }
      return hostedCustomerRequestJourneyProofSchema.parse({
        kind: 'cold_external_agent_journey', agent: input.agent,
        release: {
          revision: release.revision, deploymentId: release.deploymentId,
          environment: 'production', baseUrl: normalizedBaseUrl(input.baseUrl),
        },
        observedAt: new Date((input.now ?? Date.now)()).toISOString(),
        input: {
          request: input.scenario.request,
          facts: consumedFacts,
          messages: consumedMessages,
        },
        observedStates: states, authorityStops,
        final: {
          requestRef: resumed.requestRef, state: resumed.state,
          businessName: resumed.preparedAction.businessName,
          approval: recordedApproval,
        },
        sandbox: true,
        claimBoundary: 'contract_and_hosted_journey_only_not_real_supply_or_customer_value',
      })
    }

    if (view.state === 'unsupported' || view.state === 'no_options' || view.state === 'needs_attention'
      || view.state === 'outcome_unknown' || view.state === 'completed' || view.state === 'failed') {
      throw new Error(
        `hosted_journey_stopped:${view.state}:revision=${view.revision}:transition=${transitions}`
        + `:states=${states.join('>')}:${view.summary}`,
      )
    }
  }
  throw new Error('hosted_journey_transition_limit_exceeded')
}

export async function verifyHostedCustomerRequestFrontDoor(input: Readonly<{
  baseUrl: string
  deploymentProtectionBypass?: string
  fetch?: typeof globalThis.fetch
}>): Promise<void> {
  assertProductionBaseUrl(input.baseUrl)
  const shared = {
    ...input,
    agentApiKey: '', customerSessionToken: '', expectedRevision: '', expectedDeploymentId: '',
    agent: { name: '', version: '' }, scenario: { request: '', facts: {}, messages: [] },
    sandbox: true as const,
    verifyRelease: async () => ({ kind: 'verified' as const, revision: '', deploymentId: '' }),
  }
  await proveDiscovery(shared)
  await proveAnonymousRefusal(shared)
}

async function callAgent(
  input: HostedCustomerRequestJourneyInput,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
  acceptedStatuses: readonly number[] = [200],
): Promise<CustomerRequestView> {
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

async function callCustomerView(
  input: HostedCustomerRequestJourneyInput, path: string, body: unknown,
): Promise<CustomerRequestView> {
  const response = await (input.fetch ?? fetch)(`${normalizedBaseUrl(input.baseUrl)}${path}`, {
    method: 'POST', headers: headers(input, input.customerSessionToken), body: JSON.stringify(body),
  })
  const value: unknown = await response.json()
  if (!response.ok) throw responseError('POST', path, response.status, value)
  return customerRequestViewSchema.parse(value)
}

async function callCustomerApproval(
  input: HostedCustomerRequestJourneyInput,
  requestRef: string,
  body: unknown,
): Promise<Extract<z.infer<typeof customerRequestApprovalResultSchema>, { kind: 'approved' }>> {
  const response = await (input.fetch ?? fetch)(
    `${normalizedBaseUrl(input.baseUrl)}/api/requests/${encodeURIComponent(requestRef)}/approval`,
    { method: 'POST', headers: headers(input, input.customerSessionToken), body: JSON.stringify(body) },
  )
  const value: unknown = await response.json()
  if (!response.ok) throw responseError('POST', 'approval', response.status, value)
  const result = customerRequestApprovalResultSchema.parse(value)
  if (result.kind !== 'approved') throw new Error(`hosted_journey_approval_result:${result.kind}`)
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
  for (const marker of ['/api/v1/requests', '/messages', CUSTOMER_REQUEST_AGENT_SCOPE, 'needs_authorization', 'options_ready']) {
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

function requestPath(requestRef: string, suffix?: 'facts' | 'messages' | 'options'): string {
  const base = `/api/v1/requests/${encodeURIComponent(requestRef)}`
  return suffix === undefined ? base : `${base}/${suffix}`
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
  return new Error(`${method} ${path} returned ${status}:${reason.success ? reason.data.reason ?? reason.data.error ?? 'unexpected' : 'unexpected'}`)
}

function digestInput(value: unknown): string {
  return canonicalDigest(customerRequestJsonValueSchema.parse(value) as StableHashValue)
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}
