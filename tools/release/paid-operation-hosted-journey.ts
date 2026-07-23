import type { Browser, Page } from '@playwright/test'
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
export type PaidOperationHostedJourneyCommand = Readonly<{
  command: 'inspect' | 'authorize' | 'execute' | 'reconcile'
  commandIdRequired: boolean
  expectedInvocationVersion: number
  requiredInput: readonly [] | readonly ['accept']
  relation: Readonly<{ method: 'GET' | 'POST'; href: string }>
}>

export type PaidOperationHostedHumanSurfaceProof = Readonly<{
  semanticDigest: string
  expectedInvocationVersion: number
  visibleAssertions: readonly string[]
}>

export type PaidOperationHostedJourneyCheckpoint = Readonly<{
  stage: 'ready_for_permission' | 'payment_prepared'
  expectedInvocationVersion: 1 | 2
  human: PaidOperationHostedHumanSurfaceProof | null
  agent: Readonly<{
    projection: Projection
    command: PaidOperationHostedJourneyCommand
  }>
}>

export type PaidOperationHostedJourneyScenario = Readonly<{
  scenario: (typeof EXPECTED_SCENARIO_ORDER)[number]
  actorClass: 'human' | 'agent' | 'agent_goblin'
  invocationRef: string
  providerId: 'provider:a' | 'provider:b'
  operationKey: 'btc-usd-a' | 'btc-usd-b'
  operationRevision: string
  lifecycleOrigin: string
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
  followedCommands: readonly PaidOperationHostedJourneyCommand[]
  humanProof: Readonly<{
    warm: PaidOperationHostedHumanSurfaceProof
    cold: PaidOperationHostedHumanSurfaceProof
  }> | null
  agentProof: Readonly<{
    warm: Projection
    cold: Projection
    terminalCommand: PaidOperationHostedJourneyCommand
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
    immutableUrl: string
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
      actorClass: 'human',
      scenario: EXPECTED_SCENARIO_ORDER[0],
      invocationRef: human.invocationRef,
      captureCheckpoint: async (version) =>
        await captureHumanCheckpoint(input, page, human.invocationRef, version),
      captureTerminal: async () =>
        await captureHumanTerminalProof(input, page, human.invocationRef, 5, 'valid'),
      authorize: async () => {
        assertHumanPageBoundToImmutableDeployment(input, page)
        await page.getByRole('button', { name: 'Authorize up to $0.01' }).click()
        assertHumanPageBoundToImmutableDeployment(input, page)
        await waitForHumanCardVersion(page, 2)
        assertHumanPageBoundToImmutableDeployment(input, page)
      },
      execute: async () => {
        assertHumanPageBoundToImmutableDeployment(input, page)
        await page.getByRole('button', { name: 'Continue operation' }).click()
        assertHumanPageBoundToImmutableDeployment(input, page)
        await waitForHumanCardVersion(page, 5)
        assertHumanPageBoundToImmutableDeployment(input, page)
      },
      commandIds: {
        authorize: 'phase3c-human-a-authorize',
        execute: 'phase3c-human-a-execute',
      },
      followedCommands: [],
    })

    const agentA = await createAgentOperation(input, 'A')
    const agentAScenario = await runAgentGoldenScenario(input, agentA)

    const goblin = await createAgentOperation(input, 'B')
    const goblinScenario = await runGoblinScenario(input, goblin)

    return { scenarios: [humanScenario, agentAScenario, goblinScenario] }
  } finally {
    await context.close()
  }
}

async function runAgentGoldenScenario(
  input: PaidOperationHostedJourneyInput,
  operation: Awaited<ReturnType<typeof createAgentOperation>>,
): Promise<PaidOperationHostedJourneyScenario> {
  const readySnapshot = await readAgentSnapshotAtRelation(input, operation.inspectHref)
  const ready = checkpointFromAgentSnapshot(readySnapshot, operation.invocationRef, 1)
  const authorizeCommandId = 'phase3c-agent-a-authorize'
  const preparedSnapshot = normalizeAgentSnapshot(await runAgentCommand(
    input,
    operation.invocationRef,
    ready.agent.command,
    { commandId: authorizeCommandId, accept: true },
  ))
  const prepared = checkpointFromAgentSnapshot(
    preparedSnapshot,
    operation.invocationRef,
    2,
  )
  const executeCommandId = 'phase3c-agent-a-execute'
  const terminalWarm = normalizeAgentSnapshot(await runAgentCommand(
    input,
    operation.invocationRef,
    prepared.agent.command,
    { commandId: executeCommandId },
  ))
  assertTerminalProjection(terminalWarm.projection, 5, 'valid')
  const terminalCommand = requireSingleCommand(
    terminalWarm.commands,
    'inspect',
    operation.invocationRef,
  )
  const terminalCold = await readAgentSnapshotAtRelation(
    input,
    terminalCommand.relation.href,
  )
  assertTerminalProjection(terminalCold.projection, 5, 'valid')
  if (terminalWarm.projection.semanticDigest !== terminalCold.projection.semanticDigest) {
    throw new Error('journey_terminal_warm_cold_mismatch')
  }
  const identity = operationFromProjection(terminalWarm.projection)
  if (identity.providerId !== 'provider:a' || identity.operationKey !== 'btc-usd-a') {
    throw new Error('journey_provider_a_identity_mismatch')
  }
  return {
    scenario: EXPECTED_SCENARIO_ORDER[1],
    actorClass: 'agent',
    invocationRef: operation.invocationRef,
    lifecycleOrigin: exactLifecycleOrigin(input),
    ...identity,
    checkpoints: [ready, prepared],
    observedStages: [
      { stage: 'created', invocationVersion: 1, continuations: ['authorize'] },
      { stage: 'authorized', invocationVersion: 2, continuations: ['execute'] },
      { stage: 'completed', invocationVersion: 5, continuations: ['inspect'] },
    ],
    commandIds: { authorize: authorizeCommandId, execute: executeCommandId },
    followedCommands: [ready.agent.command, prepared.agent.command],
    humanProof: null,
    agentProof: {
      warm: terminalWarm.projection,
      cold: terminalCold.projection,
      terminalCommand,
    },
  }
}

async function runGoldenScenario(input: Readonly<{
  input: PaidOperationHostedJourneyInput
  actorClass: 'human' | 'agent'
  scenario: typeof EXPECTED_SCENARIO_ORDER[0] | typeof EXPECTED_SCENARIO_ORDER[1]
  invocationRef: string
  captureCheckpoint: (version: 1 | 2) => Promise<PaidOperationHostedJourneyCheckpoint>
  captureTerminal: () => Promise<Pick<
    PaidOperationHostedJourneyScenario,
    'humanProof' | 'agentProof'
  >>
  authorize: (checkpoint: PaidOperationHostedJourneyCheckpoint) => Promise<void>
  execute: (checkpoint: PaidOperationHostedJourneyCheckpoint) => Promise<void>
  commandIds: Readonly<{ authorize: string; execute: string }>
  followedCommands:
    | readonly PaidOperationHostedJourneyCommand[]
    | ((
        ready: PaidOperationHostedJourneyCheckpoint,
        prepared: PaidOperationHostedJourneyCheckpoint,
      ) => readonly PaidOperationHostedJourneyCommand[])
}>): Promise<PaidOperationHostedJourneyScenario> {
  const ready = await input.captureCheckpoint(1)
  await input.authorize(ready)
  const prepared = await input.captureCheckpoint(2)
  await input.execute(prepared)
  const terminal = await input.captureTerminal()
  const operation = operationFromProjection(terminal.agentProof.warm)
  if (operation.providerId !== 'provider:a' || operation.operationKey !== 'btc-usd-a') {
    throw new Error('journey_provider_a_identity_mismatch')
  }
  return {
    scenario: input.scenario,
    actorClass: input.actorClass,
    invocationRef: input.invocationRef,
    lifecycleOrigin: exactLifecycleOrigin(input.input),
    ...operation,
    checkpoints: [ready, prepared],
    observedStages: [
      { stage: 'created', invocationVersion: 1, continuations: ['authorize'] },
      { stage: 'authorized', invocationVersion: 2, continuations: ['execute'] },
      { stage: 'completed', invocationVersion: 5, continuations: ['inspect'] },
    ],
    commandIds: input.commandIds,
    followedCommands: typeof input.followedCommands === 'function'
      ? input.followedCommands(ready, prepared)
      : input.followedCommands,
    ...terminal,
  }
}

async function runGoblinScenario(
  input: PaidOperationHostedJourneyInput,
  operation: Awaited<ReturnType<typeof createAgentOperation>>,
): Promise<PaidOperationHostedJourneyScenario> {
  const { invocationRef } = operation
  const ready = checkpointFromAgentSnapshot(
    await readAgentSnapshotAtRelation(input, operation.inspectHref),
    invocationRef,
    1,
  )
  const authorizeCommandId = 'phase3c-goblin-b-authorize'
  const preparedSnapshot = normalizeAgentSnapshot(await runAgentCommand(
    input,
    invocationRef,
    ready.agent.command,
    {
    commandId: authorizeCommandId,
    accept: true,
    },
  ))
  const prepared = checkpointFromAgentSnapshot(preparedSnapshot, invocationRef, 2)
  const executeCommandId = 'phase3c-goblin-b-execute'
  const responseLost = await runAgentCommand(input, invocationRef, prepared.agent.command, {
    commandId: executeCommandId,
  })
  const responseLostSnapshot = normalizeAgentSnapshot(responseLost)
  const responseLostProjection = responseLostSnapshot.projection
  assertProjectionState(responseLostProjection, {
    version: 5,
    paymentAuthorization: 'created',
    paymentSubmission: 'possibly_submitted',
    settlement: 'unknown',
    resultDelivery: 'not_delivered',
    continuations: ['reconcile'],
  })
  const reconcileDescriptor = requireSingleCommand(
    responseLostSnapshot.commands,
    'reconcile',
    invocationRef,
  )
  const reconciliationCommandId = 'phase3c-goblin-b-reconcile'
  const terminalWarm = normalizeAgentSnapshot(await runAgentCommand(
    input,
    invocationRef,
    reconcileDescriptor,
    {
    commandId: reconciliationCommandId,
    },
  ))
  assertTerminalProjection(terminalWarm.projection, 6, 'not_delivered')
  const terminalCommand = requireSingleCommand(
    terminalWarm.commands,
    'inspect',
    invocationRef,
  )
  const terminalCold = await readAgentSnapshotAtRelation(
    input,
    terminalCommand.relation.href,
  )
  assertTerminalProjection(terminalCold.projection, 6, 'not_delivered')
  if (terminalWarm.projection.semanticDigest !== terminalCold.projection.semanticDigest) {
    throw new Error('journey_terminal_warm_cold_mismatch')
  }
  const identity = operationFromProjection(terminalWarm.projection)
  if (identity.providerId !== 'provider:b' || identity.operationKey !== 'btc-usd-b') {
    throw new Error('journey_provider_b_identity_mismatch')
  }
  return {
    scenario: EXPECTED_SCENARIO_ORDER[2],
    actorClass: 'agent_goblin',
    invocationRef,
    lifecycleOrigin: exactLifecycleOrigin(input),
    ...identity,
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
    followedCommands: [
      ready.agent.command,
      prepared.agent.command,
      reconcileDescriptor,
    ],
    humanProof: null,
    agentProof: {
      warm: terminalWarm.projection,
      cold: terminalCold.projection,
      terminalCommand,
    },
  }
}

async function captureHumanCheckpoint(
  input: PaidOperationHostedJourneyInput,
  page: Page,
  invocationRef: string,
  version: 1 | 2,
): Promise<PaidOperationHostedJourneyCheckpoint> {
  await navigateToDetail(input, page, invocationRef, version)
  const human = await readHumanSurfaceProof(page)
  const agent = await readAgentSnapshot(input, invocationRef, version)
  assertCheckpointProjection(agent.projection, version)

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
    || semanticDigest !== human.semanticDigest
    || human.expectedInvocationVersion !== version
    || human.semanticDigest !== agent.projection.semanticDigest
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
    expectedInvocationVersion: version,
    human: {
      ...human,
      visibleAssertions: required,
    },
    agent: {
      projection: agent.projection,
      command: requireSingleCommand(agent.commands, nextCommand, invocationRef),
    },
  }
}

function checkpointFromAgentSnapshot(
  agent: ReturnType<typeof normalizeAgentSnapshot>,
  invocationRef: string,
  version: 1 | 2,
): PaidOperationHostedJourneyCheckpoint {
  assertCheckpointProjection(agent.projection, version)
  const command = version === 1 ? 'authorize' : 'execute'
  return {
    stage: version === 1 ? 'ready_for_permission' : 'payment_prepared',
    expectedInvocationVersion: version,
    human: null,
    agent: {
      projection: agent.projection,
      command: requireSingleCommand(agent.commands, command, invocationRef),
    },
  }
}

function assertCheckpointProjection(projection: Projection, version: 1 | 2): void {
  assertProjectionState(projection, version === 1
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
}

async function captureHumanTerminalProof(
  input: PaidOperationHostedJourneyInput,
  page: Page,
  invocationRef: string,
  version: 5 | 6,
  result: ResultState,
): Promise<Pick<PaidOperationHostedJourneyScenario, 'humanProof' | 'agentProof'>> {
  await navigateToDetail(input, page, invocationRef, version)
  const humanWarm = await readHumanSurfaceProof(page)
  const agentWarm = await readAgentSnapshot(input, invocationRef, version)
  assertTerminalProjection(agentWarm.projection, version, result)
  const warmAssertions = await assertTerminalDom(page, humanWarm, version, result)
  assertHumanAgentParity(humanWarm, agentWarm.projection)

  const humanCold = await restoreHumanInNewAuthenticatedContext(
    input,
    invocationRef,
    version,
    result,
  )
  const agentCold = await readAgentSnapshot(input, invocationRef, version)
  assertTerminalProjection(agentCold.projection, version, result)
  assertHumanAgentParity(humanCold, agentCold.projection)
  if (humanWarm.semanticDigest !== humanCold.semanticDigest
    || agentWarm.projection.semanticDigest !== agentCold.projection.semanticDigest) {
    throw new Error('journey_terminal_warm_cold_mismatch')
  }
  return {
    humanProof: {
      warm: { ...humanWarm, visibleAssertions: warmAssertions },
      cold: humanCold,
    },
    agentProof: {
      warm: agentWarm.projection,
      cold: agentCold.projection,
      terminalCommand: requireSingleCommand(
        agentCold.commands,
        'inspect',
        invocationRef,
      ),
    },
  }
}

async function restoreHumanInNewAuthenticatedContext(
  input: PaidOperationHostedJourneyInput,
  invocationRef: string,
  version: 5 | 6,
  result: ResultState,
): Promise<PaidOperationHostedHumanSurfaceProof> {
  const context = await input.browser.newContext({
    extraHTTPHeaders: humanHeaders(input),
    serviceWorkers: 'block',
  })
  try {
    const page = await context.newPage()
    await navigateToDetail(input, page, invocationRef, version)
    const proof = await readHumanSurfaceProof(page)
    const visibleAssertions = await assertTerminalDom(page, proof, version, result)
    return { ...proof, visibleAssertions }
  } finally {
    await context.close()
  }
}

async function assertTerminalDom(
  page: Page,
  proof: PaidOperationHostedHumanSurfaceProof,
  version: 5 | 6,
  result: ResultState,
): Promise<readonly string[]> {
  const card = semanticCard(page)
  const body = await card.innerText()
  const visibleAssertions = [
    'Observed by provider',
    '$0.01 settled in recorded sandbox evidence',
    result === 'valid' ? 'Validated' : 'Not received',
  ]
  if (Number(await card.getAttribute('data-invocation-version')) !== version
    || await card.getAttribute('data-semantic-digest') !== proof.semanticDigest
    || await card.getAttribute('data-evidence-class') !== 'hosted_labelled_mock_candidate'
    || visibleAssertions.some((label) => !body.includes(label))) {
    throw new Error('journey_terminal_human_readback_mismatch')
  }
  return visibleAssertions
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
  assertServedDeploymentBindingBeforeFirstLifecyclePost(input, page, response)
  await page.getByRole('radio', {
    name: providerKey === 'A' ? 'Sandbox provider A' : 'Sandbox provider B',
  }).check()
  assertHumanPageBoundToImmutableDeployment(input, page)
  await page.getByRole('button', { name: 'Create sandbox operation' }).click()
  assertHumanPageBoundToImmutableDeployment(input, page)
  const url = new URL(page.url())
  const prefix = '/actions/paid/'
  if (!url.pathname.startsWith(prefix)) throw new Error('journey_human_creation_route_mismatch')
  const invocationRef = decodeURIComponent(url.pathname.slice(prefix.length))
  if (invocationRef.trim() === '') throw new Error('journey_human_creation_reference_missing')
  return { invocationRef }
}

function assertServedDeploymentBindingBeforeFirstLifecyclePost(
  input: PaidOperationHostedJourneyInput,
  page: Page,
  response: Awaited<ReturnType<Page['goto']>>,
): void {
  const baseUrl = new URL(input.baseUrl)
  assertHumanNavigationBoundToImmutableDeployment(
    input,
    page,
    response,
    '/actions/paid/new',
  )
  if (!/^dpl_[A-Za-z0-9]+$/u.test(input.servedBinding.deploymentId)
    || !/^[0-9a-f]{40}$/u.test(input.servedBinding.sourceRevision)
    || baseUrl.hostname !== input.servedBinding.immutableUrl
    || input.servedBinding.immutableUrl === input.servedBinding.productionUrl
    || !response?.headers()['x-vercel-id']?.trim()) {
    throw new Error('served_revision_deployment_binding_mismatch')
  }
}

async function createAgentOperation(
  input: PaidOperationHostedJourneyInput,
  providerKey: ProviderKey,
): Promise<Readonly<{ invocationRef: string; inspectHref: string }>> {
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
    || value.expectedInvocationVersion !== 1
    || !isRecord(value.relation)
    || typeof value.relation.inspect !== 'string') {
    throw new Error('journey_agent_creation_response_invalid')
  }
  assertExactLifecycleUrl(input, value.relation.inspect)
  return { invocationRef: value.invocationRef, inspectHref: value.relation.inspect }
}

async function runAgentCommand(
  input: PaidOperationHostedJourneyInput,
  invocationRef: string,
  descriptor: PaidOperationHostedJourneyCommand,
  declaredInput: Readonly<{ commandId: string; accept?: true }>,
): Promise<unknown> {
  validateCommandDescriptor(input, descriptor, invocationRef)
  if (descriptor.command === 'inspect'
    || descriptor.relation.method !== 'POST'
    || !descriptor.commandIdRequired
    || (descriptor.requiredInput.length === 1) !== (declaredInput.accept === true)) {
    throw new Error('journey_agent_command_descriptor_invalid')
  }
  const response = await input.fetch(resolveLifecycleUrl(input, descriptor.relation.href), {
    method: descriptor.relation.method,
    headers: agentHeaders(input),
    body: JSON.stringify({
      command: descriptor.command,
      commandId: declaredInput.commandId,
      expectedInvocationVersion: descriptor.expectedInvocationVersion,
      ...(declaredInput.accept === true ? { accept: true } : {}),
    }),
    redirect: 'error',
  })
  const value: unknown = await response.json()
  if (!response.ok) throw new Error(`journey_agent_command_not_confirmed:${response.status}`)
  return value
}

async function readHumanSurfaceProof(
  page: Page,
): Promise<PaidOperationHostedHumanSurfaceProof> {
  const embedded = page.locator('script[data-paid-operation-human-projection]')
  if (await embedded.count() !== 1) {
    throw new Error('journey_human_projection_missing')
  }
  const serialized = await embedded.textContent()
  if (serialized === null) throw new Error('journey_human_projection_missing')
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('journey_human_projection_invalid')
  }
  if (!isRecord(value)
    || Object.keys(value).sort().join(',')
      !== 'expectedInvocationVersion,semanticDigest'
    || typeof value.semanticDigest !== 'string'
    || !/^sha256:[0-9a-f]{64}$/u.test(value.semanticDigest)
    || typeof value.expectedInvocationVersion !== 'number'
    || !Number.isSafeInteger(value.expectedInvocationVersion)
    || value.expectedInvocationVersion < 1) {
    throw new Error('journey_human_projection_invalid')
  }
  return {
    semanticDigest: value.semanticDigest,
    expectedInvocationVersion: value.expectedInvocationVersion,
    visibleAssertions: [],
  }
}

async function readAgentSnapshot(
  input: PaidOperationHostedJourneyInput,
  invocationRef: string,
  version: number,
): Promise<ReturnType<typeof normalizeAgentSnapshot>> {
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
  return normalizeAgentSnapshot(await response.json())
}

async function readAgentSnapshotAtRelation(
  input: PaidOperationHostedJourneyInput,
  href: string,
): Promise<ReturnType<typeof normalizeAgentSnapshot>> {
  const url = resolveLifecycleUrl(input, href)
  const response = await input.fetch(url, {
    method: 'GET',
    headers: agentHeaders(input),
    redirect: 'error',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`journey_agent_inspect_failed:${response.status}`)
  return normalizeAgentSnapshot(await response.json())
}

async function waitForHumanCardVersion(page: Page, version: 2 | 5): Promise<void> {
  await page.locator(`[data-invocation-version="${version}"]`).waitFor({
    state: 'visible',
    timeout: 15_000,
  })
}

export function normalizeAgentProjection(value: unknown): Projection {
  return normalizeAgentSnapshot(value).projection
}

export function normalizeAgentSnapshot(value: unknown): Readonly<{
  projection: Projection
  commands: readonly PaidOperationHostedJourneyCommand[]
}> {
  if (!isRecord(value)
    || value.kind !== 'accepted'
    || value.schema !== 'agentic-paid-operation:v1'
    || !isRecord(value.projection)
    || !isRecord(value.environment)
    || !Array.isArray(value.commands)) {
    throw new Error('journey_agent_projection_invalid')
  }
  const semantics = value.projection.semantics
  const semanticDigest = value.projection.semanticDigest
  if (typeof semanticDigest !== 'string'
    || semanticDigest !== canonicalProofDigest(semantics)) {
    throw new Error('journey_agent_projection_digest_invalid')
  }
  const projection = projectionSchema.parse({
    schema: value.schema,
    semantics,
    semanticDigest,
    observedVersion: value.expectedInvocationVersion,
    evidenceClass: value.environment.evidenceClass,
  })
  const commands = value.commands.map((descriptor) =>
    parseCommandDescriptor(descriptor))
  return { projection, commands }
}

function parseCommandDescriptor(value: unknown): PaidOperationHostedJourneyCommand {
  if (!isRecord(value)
    || !['inspect', 'authorize', 'execute', 'reconcile'].includes(String(value.command))
    || typeof value.commandIdRequired !== 'boolean'
    || !Number.isSafeInteger(value.expectedInvocationVersion)
    || Number(value.expectedInvocationVersion) < 1
    || !Array.isArray(value.requiredInput)
    || !isRecord(value.relation)
    || !['GET', 'POST'].includes(String(value.relation.method))
    || typeof value.relation.href !== 'string') {
    throw new Error('journey_agent_command_descriptor_invalid')
  }
  const requiredInput = value.requiredInput
  if (!(requiredInput.length === 0
    || (requiredInput.length === 1 && requiredInput[0] === 'accept'))) {
    throw new Error('journey_agent_command_descriptor_invalid')
  }
  return {
    command: value.command as PaidOperationHostedJourneyCommand['command'],
    commandIdRequired: value.commandIdRequired,
    expectedInvocationVersion: Number(value.expectedInvocationVersion),
    requiredInput: requiredInput as [] | ['accept'],
    relation: {
      method: value.relation.method as 'GET' | 'POST',
      href: value.relation.href,
    },
  }
}

function requireSingleCommand(
  commands: readonly PaidOperationHostedJourneyCommand[],
  command: PaidOperationHostedJourneyCommand['command'],
  invocationRef: string,
): PaidOperationHostedJourneyCommand {
  const matches = commands.filter((descriptor) => descriptor.command === command)
  if (commands.length !== 1 || matches.length !== 1) {
    throw new Error('journey_agent_command_descriptor_invalid')
  }
  const descriptor = matches[0]!
  const expectedMethod = command === 'inspect' ? 'GET' : 'POST'
  const expectedInput = command === 'authorize' ? ['accept'] : []
  const relation = new URL(descriptor.relation.href, 'https://descriptor.invalid')
  const expectedPath = command === 'inspect'
    ? `/api/v1/paid-operations/${encodeURIComponent(invocationRef)}`
    : `/api/v1/paid-operations/${encodeURIComponent(invocationRef)}/commands`
  const expectedSearch = command === 'inspect'
    ? `?expectedInvocationVersion=${descriptor.expectedInvocationVersion}`
    : ''
  if (descriptor.relation.method !== expectedMethod
    || descriptor.commandIdRequired !== (command !== 'inspect')
    || JSON.stringify(descriptor.requiredInput) !== JSON.stringify(expectedInput)
    || relation.pathname !== expectedPath
    || relation.search !== expectedSearch
    || relation.hash !== ''
    || relation.username !== ''
    || relation.password !== '') {
    throw new Error('journey_agent_command_descriptor_invalid')
  }
  return descriptor
}

function validateCommandDescriptor(
  input: PaidOperationHostedJourneyInput,
  descriptor: PaidOperationHostedJourneyCommand,
  invocationRef: string,
): void {
  const exact = requireSingleCommand([descriptor], descriptor.command, invocationRef)
  resolveLifecycleUrl(input, exact.relation.href)
}

function assertHumanAgentParity(
  human: PaidOperationHostedHumanSurfaceProof,
  agent: Projection,
): void {
  if (human.semanticDigest !== agent.semanticDigest
    || human.expectedInvocationVersion !== agent.observedVersion) {
    throw new Error('journey_human_agent_semantic_mismatch')
  }
}

function exactLifecycleOrigin(input: PaidOperationHostedJourneyInput): string {
  const origin = new URL(input.baseUrl).origin
  if (new URL(input.baseUrl).hostname !== input.servedBinding.immutableUrl
    || input.servedBinding.immutableUrl === input.servedBinding.productionUrl) {
    throw new Error('served_revision_deployment_binding_mismatch')
  }
  return origin
}

function resolveLifecycleUrl(
  input: PaidOperationHostedJourneyInput,
  href: string,
): URL {
  const url = new URL(href, input.baseUrl)
  assertExactLifecycleUrl(input, url.href)
  return url
}

function assertExactLifecycleUrl(
  input: PaidOperationHostedJourneyInput,
  href: string,
): void {
  const url = new URL(href, input.baseUrl)
  if (url.origin !== exactLifecycleOrigin(input)
    || url.hostname === input.servedBinding.productionUrl) {
    throw new Error('journey_mutable_host_forbidden')
  }
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
  assertHumanNavigationBoundToImmutableDeployment(
    input,
    page,
    response,
    `/actions/paid/${encodeURIComponent(invocationRef)}`,
  )
}

function assertHumanNavigationBoundToImmutableDeployment(
  input: PaidOperationHostedJourneyInput,
  page: Page,
  response: Awaited<ReturnType<Page['goto']>>,
  expectedPathname: string,
): void {
  if (response === null || !response.ok()) {
    throw new Error('journey_human_readback_unavailable')
  }
  assertExactLifecycleUrl(input, response.url())
  assertHumanPageBoundToImmutableDeployment(input, page)
  if (new URL(response.url()).pathname !== expectedPathname
    || new URL(page.url()).pathname !== expectedPathname) {
    throw new Error('journey_mutable_host_forbidden')
  }
}

function assertHumanPageBoundToImmutableDeployment(
  input: PaidOperationHostedJourneyInput,
  page: Page,
): void {
  assertExactLifecycleUrl(input, page.url())
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
