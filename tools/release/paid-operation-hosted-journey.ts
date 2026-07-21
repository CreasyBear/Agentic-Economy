import type { Browser, BrowserContext, Page } from '@playwright/test'
import type { z } from 'zod'

import {
  canonicalProofDigest,
  EXPECTED_SCENARIO_ORDER,
  isRecord,
  projectionSchema,
} from './paid-operation-hosted-proof-contract'

type Projection = z.infer<typeof projectionSchema>
type ProviderKey = 'A' | 'B'
type ResultState = 'valid' | 'not_delivered'

export type PaidOperationHostedJourneyCheckpoint = Readonly<{
  stage: 'ready_for_permission' | 'payment_prepared'
  observedVersion: 1 | 2
  human: Readonly<{
    semanticDigest: string
    observedVersion: 1 | 2
    evidenceClass: 'hosted_labelled_mock_candidate'
    decisionLabel: 'Ready for permission' | 'Payment prepared'
    paymentSubmissionLabel: 'Not submitted'
    settlementLabel: 'No settlement evidence'
    resultLabel: 'Not received'
    nextCommand: 'authorize' | 'execute'
  }>
  agent: Projection
}>

export type PaidOperationHostedJourneyScenario = Readonly<{
  scenario: (typeof EXPECTED_SCENARIO_ORDER)[number]
  actorClass: 'shared_human_agent' | 'agent' | 'agent_goblin'
  invocationRef: string
  providerId: 'provider:a' | 'provider:b'
  operationKey: 'btc-usd-a' | 'btc-usd-b'
  operationRevision: string
  checkpoints: readonly [
    PaidOperationHostedJourneyCheckpoint,
    PaidOperationHostedJourneyCheckpoint,
  ]
  observedStages: readonly Readonly<{
    stage: 'created' | 'authorized' | 'completed' | 'response_lost' | 'reconciled'
    invocationVersion: 1 | 2 | 5 | 6
    continuations: readonly ('authorize' | 'execute' | 'reconcile' | 'inspect')[]
  }>[]
  commandIds: Readonly<{
    authorize: string
    execute: string
    reconcile?: string
  }>
  projections: Readonly<{
    humanWarm: Projection
    humanCold: Projection
    agentWarm: Projection
    agentCold: Projection
  }>
}>

export type PaidOperationHostedJourneyObservation = Readonly<{
  scenarios: readonly [
    PaidOperationHostedJourneyScenario,
    PaidOperationHostedJourneyScenario,
    PaidOperationHostedJourneyScenario,
  ]
}>

export type PaidOperationHostedJourneyInput = Readonly<{
  baseUrl: string
  servedBinding: Readonly<{
    deploymentId: string
    sourceRevision: string
    productionUrl: string
  }>
  browser: Browser
  humanSessionToken: string
  agentApiKey: string
  fetch: typeof globalThis.fetch
  deploymentProtectionBypass?: string
}>

export async function runPaidOperationHostedJourney(
  input: PaidOperationHostedJourneyInput,
): Promise<PaidOperationHostedJourneyObservation> {
  const context = await input.browser.newContext({
    extraHTTPHeaders: humanHeaders(input),
    serviceWorkers: 'block',
  })
  try {
    const page = await context.newPage()
    const human = await createHumanOperation(input, page, 'A')
    const humanScenario = await runGoldenScenario({
      input,
      page,
      actorClass: 'shared_human_agent',
      scenario: EXPECTED_SCENARIO_ORDER[0],
      invocationRef: human.invocationRef,
      providerKey: 'A',
      authorize: async () => {
        await page.getByRole('button', { name: 'Authorize up to $0.01' }).click()
      },
      execute: async () => {
        await page.getByRole('button', { name: 'Continue operation' }).click()
      },
      commandIds: {
        authorize: 'phase3c-human-a-authorize',
        execute: 'phase3c-human-a-execute',
      },
    })

    const agentA = await createAgentOperation(input, 'A')
    const agentAScenario = await runGoldenScenario({
      input,
      page,
      actorClass: 'agent',
      scenario: EXPECTED_SCENARIO_ORDER[1],
      invocationRef: agentA.invocationRef,
      providerKey: 'A',
      authorize: async () => {
        await runAgentCommand(input, agentA.invocationRef, {
          command: 'authorize',
          commandId: 'phase3c-agent-a-authorize',
          expectedInvocationVersion: 1,
          accept: true,
        })
      },
      execute: async () => {
        await runAgentCommand(input, agentA.invocationRef, {
          command: 'execute',
          commandId: 'phase3c-agent-a-execute',
          expectedInvocationVersion: 2,
        })
      },
      commandIds: {
        authorize: 'phase3c-agent-a-authorize',
        execute: 'phase3c-agent-a-execute',
      },
    })

    const goblin = await createAgentOperation(input, 'B')
    const goblinScenario = await runGoblinScenario(input, page, goblin.invocationRef)

    return { scenarios: [humanScenario, agentAScenario, goblinScenario] }
  } finally {
    await context.close()
  }
}

async function runGoldenScenario(input: Readonly<{
  input: PaidOperationHostedJourneyInput
  page: Page
  actorClass: 'shared_human_agent' | 'agent'
  scenario: typeof EXPECTED_SCENARIO_ORDER[0] | typeof EXPECTED_SCENARIO_ORDER[1]
  invocationRef: string
  providerKey: 'A'
  authorize: () => Promise<void>
  execute: () => Promise<void>
  commandIds: Readonly<{ authorize: string; execute: string }>
}>): Promise<PaidOperationHostedJourneyScenario> {
  const ready = await captureCheckpoint(input.input, input.page, input.invocationRef, 1)
  await input.authorize()
  const prepared = await captureCheckpoint(input.input, input.page, input.invocationRef, 2)
  await input.execute()
  const projections = await captureTerminalProjections(
    input.input,
    input.page,
    input.invocationRef,
    5,
    'valid',
  )
  const operation = operationFromProjection(projections.agentWarm)
  if (operation.providerId !== 'provider:a' || operation.operationKey !== 'btc-usd-a') {
    throw new Error('journey_provider_a_identity_mismatch')
  }
  return {
    scenario: input.scenario,
    actorClass: input.actorClass,
    invocationRef: input.invocationRef,
    ...operation,
    checkpoints: [ready, prepared],
    observedStages: [
      { stage: 'created', invocationVersion: 1, continuations: ['authorize'] },
      { stage: 'authorized', invocationVersion: 2, continuations: ['execute'] },
      { stage: 'completed', invocationVersion: 5, continuations: ['inspect'] },
    ],
    commandIds: input.commandIds,
    projections,
  }
}

async function runGoblinScenario(
  input: PaidOperationHostedJourneyInput,
  page: Page,
  invocationRef: string,
): Promise<PaidOperationHostedJourneyScenario> {
  const ready = await captureCheckpoint(input, page, invocationRef, 1)
  const authorizeCommandId = 'phase3c-goblin-b-authorize'
  await runAgentCommand(input, invocationRef, {
    command: 'authorize',
    commandId: authorizeCommandId,
    expectedInvocationVersion: 1,
    accept: true,
  })
  const prepared = await captureCheckpoint(input, page, invocationRef, 2)
  const executeCommandId = 'phase3c-goblin-b-execute'
  const responseLost = await runAgentCommand(input, invocationRef, {
    command: 'execute',
    commandId: executeCommandId,
    expectedInvocationVersion: 2,
  })
  const responseLostProjection = normalizeAgentProjection(responseLost)
  assertProjectionState(responseLostProjection, {
    version: 5,
    paymentAuthorization: 'created',
    paymentSubmission: 'observed',
    settlement: 'settled',
    resultDelivery: 'not_delivered',
    continuations: ['reconcile'],
  })
  const reconciliationCommandId = 'phase3c-goblin-b-reconcile'
  await runAgentCommand(input, invocationRef, {
    command: 'reconcile',
    commandId: reconciliationCommandId,
    expectedInvocationVersion: 5,
  })
  const projections = await captureTerminalProjections(
    input,
    page,
    invocationRef,
    6,
    'not_delivered',
  )
  const operation = operationFromProjection(projections.agentWarm)
  if (operation.providerId !== 'provider:b' || operation.operationKey !== 'btc-usd-b') {
    throw new Error('journey_provider_b_identity_mismatch')
  }
  return {
    scenario: EXPECTED_SCENARIO_ORDER[2],
    actorClass: 'agent_goblin',
    invocationRef,
    ...operation,
    checkpoints: [ready, prepared],
    observedStages: [
      { stage: 'created', invocationVersion: 1, continuations: ['authorize'] },
      { stage: 'authorized', invocationVersion: 2, continuations: ['execute'] },
      { stage: 'response_lost', invocationVersion: 5, continuations: ['reconcile'] },
      { stage: 'reconciled', invocationVersion: 6, continuations: ['inspect'] },
    ],
    commandIds: {
      authorize: authorizeCommandId,
      execute: executeCommandId,
      reconcile: reconciliationCommandId,
    },
    projections,
  }
}

async function captureCheckpoint(
  input: PaidOperationHostedJourneyInput,
  page: Page,
  invocationRef: string,
  version: 1 | 2,
): Promise<PaidOperationHostedJourneyCheckpoint> {
  await navigateToDetail(input, page, invocationRef, version)
  const agent = await readAgentProjection(input, invocationRef, version)
  assertProjectionState(agent, version === 1
    ? {
        version: 1,
        paymentAuthorization: 'not_created',
        paymentSubmission: 'not_submitted',
        settlement: 'no_evidence',
        resultDelivery: 'not_delivered',
        continuations: ['authorize'],
      }
    : {
        version: 2,
        paymentAuthorization: 'created',
        paymentSubmission: 'not_submitted',
        settlement: 'no_evidence',
        resultDelivery: 'not_delivered',
        continuations: ['execute'],
      })

  const card = semanticCard(page)
  const observedVersion = Number(await card.getAttribute('data-invocation-version'))
  const semanticDigest = await card.getAttribute('data-semantic-digest')
  const evidenceClass = await card.getAttribute('data-evidence-class')
  const body = await card.innerText()
  const decisionLabel = version === 1 ? 'Ready for permission' : 'Payment prepared'
  const nextCommand = version === 1 ? 'authorize' : 'execute'
  const required = [
    decisionLabel,
    'Not submitted',
    'No settlement evidence',
    'Not received',
  ]
  if (observedVersion !== version
    || semanticDigest !== agent.semanticDigest
    || evidenceClass !== 'hosted_labelled_mock_candidate'
    || required.some((label) => !body.includes(label))) {
    throw new Error(`journey_checkpoint_v${version}_mismatch`)
  }
  const commands = page.locator('[data-command]')
  const expectedCommandCount = version === 1 ? 2 : 1
  const observedCommands = await commands.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-command')))
  if (observedCommands.length !== expectedCommandCount
    || observedCommands.some((command) => command !== nextCommand)) {
    throw new Error(`journey_checkpoint_v${version}_command_mismatch`)
  }
  return {
    stage: version === 1 ? 'ready_for_permission' : 'payment_prepared',
    observedVersion: version,
    human: {
      semanticDigest,
      observedVersion: version,
      evidenceClass: 'hosted_labelled_mock_candidate',
      decisionLabel,
      paymentSubmissionLabel: 'Not submitted',
      settlementLabel: 'No settlement evidence',
      resultLabel: 'Not received',
      nextCommand,
    },
    agent,
  }
}

async function captureTerminalProjections(
  input: PaidOperationHostedJourneyInput,
  page: Page,
  invocationRef: string,
  version: 5 | 6,
  result: ResultState,
): Promise<PaidOperationHostedJourneyScenario['projections']> {
  const agentWarm = await readAgentProjection(input, invocationRef, version)
  assertTerminalProjection(agentWarm, version, result)
  await navigateToDetail(input, page, invocationRef, version)
  await assertTerminalDom(page, agentWarm, version, result)

  const agentCold = await readAgentProjection(input, invocationRef, version)
  assertTerminalProjection(agentCold, version, result)
  const humanCold = await restoreInNewAuthenticatedContext(
    input,
    invocationRef,
    version,
    result,
    agentCold,
  )
  if (agentWarm.semanticDigest !== agentCold.semanticDigest
    || agentWarm.semanticDigest !== humanCold.semanticDigest) {
    throw new Error('journey_terminal_warm_cold_mismatch')
  }
  return {
    humanWarm: agentWarm,
    humanCold: agentCold,
    agentWarm,
    agentCold,
  }
}

async function restoreInNewAuthenticatedContext(
  input: PaidOperationHostedJourneyInput,
  invocationRef: string,
  version: 5 | 6,
  result: ResultState,
  projection: Projection,
): Promise<Projection> {
  const context = await input.browser.newContext({
    extraHTTPHeaders: humanHeaders(input),
    serviceWorkers: 'block',
  })
  try {
    const page = await context.newPage()
    await navigateToDetail(input, page, invocationRef, version)
    await assertTerminalDom(page, projection, version, result)
    return projection
  } finally {
    await context.close()
  }
}

async function assertTerminalDom(
  page: Page,
  projection: Projection,
  version: 5 | 6,
  result: ResultState,
): Promise<void> {
  const card = semanticCard(page)
  const body = await card.innerText()
  if (Number(await card.getAttribute('data-invocation-version')) !== version
    || await card.getAttribute('data-semantic-digest') !== projection.semanticDigest
    || await card.getAttribute('data-evidence-class') !== 'hosted_labelled_mock_candidate'
    || !body.includes('Observed by provider')
    || !body.includes('$0.01 settled in recorded sandbox evidence')
    || !body.includes(result === 'valid' ? 'Validated' : 'Not received')) {
    throw new Error('journey_terminal_human_readback_mismatch')
  }
}

function assertTerminalProjection(
  projection: Projection,
  version: 5 | 6,
  result: ResultState,
): void {
  assertProjectionState(projection, {
    version,
    paymentAuthorization: 'created',
    paymentSubmission: 'observed',
    settlement: 'settled',
    resultDelivery: result,
    continuations: ['inspect'],
  })
}

function assertProjectionState(
  projection: Projection,
  expected: Readonly<{
    version: number
    paymentAuthorization: string
    paymentSubmission: string
    settlement: string
    resultDelivery: string
    continuations: readonly string[]
  }>,
): void {
  const semantics = projection.semantics
  const continuations = isRecord(semantics) && Array.isArray(semantics.continuations)
    ? semantics.continuations.map((continuation) =>
        isRecord(continuation) ? continuation.kind : undefined)
    : []
  if (projection.observedVersion !== expected.version
    || stateOf(semantics, 'paymentAuthorization') !== expected.paymentAuthorization
    || stateOf(semantics, 'paymentSubmission') !== expected.paymentSubmission
    || stateOf(semantics, 'settlement') !== expected.settlement
    || stateOf(semantics, 'resultDelivery') !== expected.resultDelivery
    || JSON.stringify(continuations) !== JSON.stringify(expected.continuations)) {
    throw new Error(`journey_projection_v${expected.version}_mismatch`)
  }
}

async function createHumanOperation(
  input: PaidOperationHostedJourneyInput,
  page: Page,
  providerKey: ProviderKey,
): Promise<Readonly<{ invocationRef: string }>> {
  const response = await page.goto(new URL('/actions/paid/new', input.baseUrl).href, {
    waitUntil: 'networkidle',
  })
  assertServedDeploymentBindingBeforeFirstLifecyclePost(input, response)
  await page.getByRole('radio', {
    name: providerKey === 'A' ? 'Sandbox provider A' : 'Sandbox provider B',
  }).check()
  await page.getByRole('button', { name: 'Create sandbox operation' }).click()
  const url = new URL(page.url())
  const prefix = '/actions/paid/'
  if (!url.pathname.startsWith(prefix)) throw new Error('journey_human_creation_route_mismatch')
  const invocationRef = decodeURIComponent(url.pathname.slice(prefix.length))
  if (invocationRef.trim() === '') throw new Error('journey_human_creation_reference_missing')
  return { invocationRef }
}

function assertServedDeploymentBindingBeforeFirstLifecyclePost(
  input: PaidOperationHostedJourneyInput,
  response: Awaited<ReturnType<Page['goto']>>,
): void {
  const baseUrl = new URL(input.baseUrl)
  const responseUrl = response === null ? undefined : new URL(response.url())
  if (response === null
    || !response.ok()
    || !/^dpl_[A-Za-z0-9]+$/u.test(input.servedBinding.deploymentId)
    || !/^[0-9a-f]{40}$/u.test(input.servedBinding.sourceRevision)
    || baseUrl.hostname !== input.servedBinding.productionUrl
    || responseUrl?.hostname !== input.servedBinding.productionUrl
    || responseUrl.pathname !== '/actions/paid/new'
    || !response.headers()['x-vercel-id']?.trim()) {
    throw new Error('served_revision_deployment_binding_mismatch')
  }
}

async function createAgentOperation(
  input: PaidOperationHostedJourneyInput,
  providerKey: ProviderKey,
): Promise<Readonly<{ invocationRef: string }>> {
  const response = await input.fetch(new URL('/api/v1/paid-operations', input.baseUrl), {
    method: 'POST',
    headers: agentHeaders(input),
    body: JSON.stringify({ providerKey }),
    redirect: 'error',
  })
  if (response.status !== 201) throw new Error(`journey_agent_creation_failed:${response.status}`)
  const value: unknown = await response.json()
  if (!isRecord(value)
    || value.kind !== 'created'
    || typeof value.invocationRef !== 'string'
    || value.expectedInvocationVersion !== 1) {
    throw new Error('journey_agent_creation_response_invalid')
  }
  return { invocationRef: value.invocationRef }
}

async function runAgentCommand(
  input: PaidOperationHostedJourneyInput,
  invocationRef: string,
  body: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const response = await input.fetch(
    new URL(
      `/api/v1/paid-operations/${encodeURIComponent(invocationRef)}/commands`,
      input.baseUrl,
    ),
    {
      method: 'POST',
      headers: agentHeaders(input),
      body: JSON.stringify(body),
      redirect: 'error',
    },
  )
  const value: unknown = await response.json()
  if (!response.ok) throw new Error(`journey_agent_command_not_confirmed:${response.status}`)
  return value
}

async function readAgentProjection(
  input: PaidOperationHostedJourneyInput,
  invocationRef: string,
  version: number,
): Promise<Projection> {
  const url = new URL(
    `/api/v1/paid-operations/${encodeURIComponent(invocationRef)}`,
    input.baseUrl,
  )
  url.searchParams.set('expectedInvocationVersion', String(version))
  const response = await input.fetch(url, {
    headers: agentHeaders(input),
    redirect: 'error',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`journey_agent_inspect_failed:${response.status}`)
  return normalizeAgentProjection(await response.json())
}

export function normalizeAgentProjection(value: unknown): Projection {
  if (!isRecord(value)
    || value.kind !== 'accepted'
    || value.schema !== 'agentic-paid-operation:v1'
    || !isRecord(value.projection)
    || !isRecord(value.environment)) {
    throw new Error('journey_agent_projection_invalid')
  }
  const semantics = value.projection.semantics
  const semanticDigest = value.projection.semanticDigest
  if (typeof semanticDigest !== 'string'
    || semanticDigest !== canonicalProofDigest(semantics)) {
    throw new Error('journey_agent_projection_digest_invalid')
  }
  return projectionSchema.parse({
    schema: value.schema,
    semantics,
    semanticDigest,
    observedVersion: value.expectedInvocationVersion,
    evidenceClass: value.environment.evidenceClass,
  })
}

function operationFromProjection(projection: Projection): Readonly<{
  providerId: 'provider:a' | 'provider:b'
  operationKey: 'btc-usd-a' | 'btc-usd-b'
  operationRevision: string
}> {
  const semantics = projection.semantics
  if (!isRecord(semantics) || !isRecord(semantics.operation)
    || (semantics.operation.providerId !== 'provider:a'
      && semantics.operation.providerId !== 'provider:b')
    || (semantics.operation.operationKey !== 'btc-usd-a'
      && semantics.operation.operationKey !== 'btc-usd-b')
    || typeof semantics.operation.operationRevision !== 'string') {
    throw new Error('journey_operation_identity_missing')
  }
  return {
    providerId: semantics.operation.providerId,
    operationKey: semantics.operation.operationKey,
    operationRevision: semantics.operation.operationRevision,
  }
}

async function navigateToDetail(
  input: PaidOperationHostedJourneyInput,
  page: Page,
  invocationRef: string,
  version: number,
): Promise<void> {
  const url = new URL(
    `/actions/paid/${encodeURIComponent(invocationRef)}`,
    input.baseUrl,
  )
  url.searchParams.set('expectedInvocationVersion', String(version))
  const response = await page.goto(url.href, { waitUntil: 'networkidle' })
  if (response === null || !response.ok()) throw new Error('journey_human_readback_unavailable')
}

function semanticCard(page: Page) {
  return page.locator(
    '[data-semantic-digest][data-invocation-version][data-evidence-class]',
  )
}

function stateOf(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined
  const state = value[key]
  return isRecord(state) ? state.state : undefined
}

function humanHeaders(
  input: Pick<PaidOperationHostedJourneyInput, 'humanSessionToken' | 'deploymentProtectionBypass'>,
): Record<string, string> {
  return {
    Authorization: `Bearer ${input.humanSessionToken}`,
    ...protectionHeader(input),
  }
}

function agentHeaders(
  input: Pick<PaidOperationHostedJourneyInput, 'agentApiKey' | 'deploymentProtectionBypass'>,
): Record<string, string> {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${input.agentApiKey}`,
    'Content-Type': 'application/json',
    ...protectionHeader(input),
  }
}

function protectionHeader(
  input: Pick<PaidOperationHostedJourneyInput, 'deploymentProtectionBypass'>,
): Record<string, string> {
  return input.deploymentProtectionBypass === undefined
    ? {}
    : { 'x-vercel-protection-bypass': input.deploymentProtectionBypass }
}
