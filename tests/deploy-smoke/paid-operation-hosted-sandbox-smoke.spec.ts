import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test'

import { collectAndAdmitLivePaidOperationHostedEvidence } from '../../tools/release/verify-paid-operation-hosted-release'

const SCENARIOS = [
  'shared_human_agent_provider_a_golden',
  'agent_provider_a_golden',
  'provider_b_response_lost_uncertainty_goblin',
] as const

const liveConfig = readLiveConfig(process.env)
test.skip(liveConfig === undefined
  && process.env.AE_PAID_OPERATION_REQUIRE_LIVE !== '1',
'Exact live inputs are absent; this source-only cut is inert.')

test('admits one exact-revision three-operation hosted paid sandbox packet', async ({
  browser,
  page,
}, testInfo) => {
  const config = requireLiveConfig(liveConfig)
  test.setTimeout(120_000)

  await assertServedRevisionBeforeFirstLifecyclePost(config, page)

  const human = await createPaidOperation({
    kind: 'human',
    config,
    page,
    providerKey: 'A',
  })
  await assertVersionOneReadyForPermission(page)
  await page.getByRole('button', { name: 'Authorize up to $0.01' }).click()
  await assertVersionTwoPaymentPrepared(page)
  await page.getByRole('button', { name: 'Continue operation' }).click()
  await assertSeparatePaymentSettlementAndResultTruth(page, 5, 'valid')
  const humanDigest = await cardDigest(page)
  await page.reload({ waitUntil: 'networkidle' })
  expect(await cardDigest(page)).toBe(humanDigest)
  await restoreInNewAuthenticatedContext(browser, config, human.invocationRef, 5, humanDigest)
  await assertAgentFinalReadback(config, human.invocationRef, 5, 'valid')

  const agentA = await createPaidOperation({
    kind: 'agent',
    config,
    providerKey: 'A',
  })
  await runAgentAuthorize(config, agentA.invocationRef, 'agent-a-authorize')
  await assertAgentVersionTwoPaymentPrepared(config, agentA.invocationRef)
  const agentAGolden = await runAgentCommand(config, agentA.invocationRef, {
    command: 'execute',
    commandId: 'phase3c-agent-a-execute',
    expectedInvocationVersion: 2,
  })
  assertAcceptedVersion(agentAGolden, 5)
  assertSemanticTruth(agentAGolden, 'valid')

  const goblin = await createPaidOperation({
    kind: 'agent',
    config,
    providerKey: 'B',
  })
  await runAgentAuthorize(config, goblin.invocationRef, 'goblin-b-authorize')
  await assertAgentVersionTwoPaymentPrepared(config, goblin.invocationRef)
  const responseLost = await runAgentCommand(config, goblin.invocationRef, {
    command: 'execute',
    commandId: 'phase3c-goblin-b-execute',
    expectedInvocationVersion: 2,
  })
  assertAcceptedVersion(responseLost, 5)
  expect(continuationKinds(responseLost)).toEqual(['reconcile'])
  const reconciliationCommandId = 'phase3c-goblin-b-reconcile'
  const reconciled = await runAgentCommand(config, goblin.invocationRef, {
    command: 'reconcile',
    commandId: reconciliationCommandId,
    expectedInvocationVersion: 5,
  })
  assertAcceptedVersion(reconciled, 6)
  assertSemanticTruth(reconciled, 'not_delivered')
  expect(continuationKinds(reconciled)).toEqual(['inspect'])

  const admitted = await collectAndAdmitLivePaidOperationHostedEvidence({
    source: {
      expectedRevision: config.expectedRevision,
      expectedTree: config.expectedTree,
    },
    deployment: {
      id: config.deploymentId,
      productionUrl: config.productionUrl,
    },
    scenarios: [
      {
        scenario: SCENARIOS[0],
        invocationRef: human.invocationRef,
        finalVersion: 5,
      },
      {
        scenario: SCENARIOS[1],
        invocationRef: agentA.invocationRef,
        finalVersion: 5,
      },
      {
        scenario: SCENARIOS[2],
        invocationRef: goblin.invocationRef,
        finalVersion: 6,
        reconciliationCommandId,
      },
    ],
    automatedInstrumentDigest: config.automatedInstrumentDigest,
    residualReviewDate: config.residualReviewDate,
  }, liveAdmissionContext(config))
  expect(admitted.kind).toBe('admitted')
  if (admitted.kind !== 'admitted') throw new Error(`live_admission_refused:${admitted.code}`)

  await attachSanitizedPacket(testInfo, admitted.packet)
  console.log(JSON.stringify({
    kind: admitted.kind,
    evidenceClass: admitted.evidenceClass,
    packetDigest: admitted.packet.checksum.digest,
    invocationRefs: admitted.packet.scenarios.map((scenario) => scenario.invocationRef),
    effectCount: admitted.packet.sourceObservation.invocations.reduce(
      (count, invocation) => count + invocation.counts.effects,
      0,
    ),
    activeReservations: admitted.packet.sourceObservation.counters.activeReservations,
  }))
})

type LiveConfig = Readonly<{
  baseUrl: string
  expectedRevision: string
  expectedTree: string
  deploymentId: string
  productionUrl: string
  vercelApiToken: string
  vercelTeamId?: string
  deploymentProtectionBypass?: string
  humanSessionToken: string
  agentApiKey: string
  agentCredentialId: string
  agentSubject: string
  convexDeploymentIdentity: string
  convexAdminKey: string
  automatedInstrumentDigest: string
  residualReviewDate: string
}>

type CreatedOperation = Readonly<{
  invocationRef: string
  expectedInvocationVersion: number
}>

type CreateInput =
  | Readonly<{
      kind: 'human'
      config: LiveConfig
      page: Page
      providerKey: 'A' | 'B'
    }>
  | Readonly<{
      kind: 'agent'
      config: LiveConfig
      providerKey: 'A' | 'B'
    }>

async function createPaidOperation(input: CreateInput): Promise<CreatedOperation> {
  if (input.kind === 'human') {
    await input.page.goto(new URL('/actions/paid/new', input.config.baseUrl).href, {
      waitUntil: 'networkidle',
    })
    await input.page.getByRole('radio', {
      name: input.providerKey === 'A' ? 'Sandbox provider A' : 'Sandbox provider B',
    }).check()
    await input.page.getByRole('button', { name: 'Create sandbox operation' }).click()
    await expect(input.page).toHaveURL(/\/actions\/paid\/[^?]+\?expectedInvocationVersion=1$/u)
    const url = new URL(input.page.url())
    const invocationRef = decodeURIComponent(url.pathname.slice('/actions/paid/'.length))
    if (invocationRef.trim() === '') throw new Error('human_creation_reference_missing')
    return { invocationRef, expectedInvocationVersion: 1 }
  }
  const response = await fetch(new URL('/api/v1/paid-operations', input.config.baseUrl), {
    method: 'POST',
    headers: agentHeaders(input.config),
    body: JSON.stringify({ providerKey: input.providerKey }),
    redirect: 'error',
  })
  if (response.status !== 201) throw new Error(`agent_creation_failed:${response.status}`)
  return parseCreated(await response.json())
}

async function assertServedRevisionBeforeFirstLifecyclePost(
  config: LiveConfig,
  page: Page,
): Promise<void> {
  const baseUrl = new URL(config.baseUrl)
  const productionUrl = new URL(`https://${config.productionUrl}`)
  if (baseUrl.protocol !== 'https:'
    || baseUrl.origin !== productionUrl.origin
    || !/^\/?$/u.test(baseUrl.pathname)
    || baseUrl.search !== ''
    || baseUrl.hash !== '') {
    throw new Error('base_url_alias_mismatch')
  }
  const endpoint = new URL(
    `/v13/deployments/${encodeURIComponent(config.deploymentId)}`,
    'https://api.vercel.com',
  )
  if (config.vercelTeamId !== undefined) endpoint.searchParams.set('teamId', config.vercelTeamId)
  const controlPlane = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${config.vercelApiToken}` },
    redirect: 'error',
    cache: 'no-store',
  })
  if (!controlPlane.ok) throw new Error(`vercel_binding_failed:${controlPlane.status}`)
  const deployment = await controlPlane.json()
  if (!isRecord(deployment)
    || deployment.id !== config.deploymentId
    || deployment.readyState !== 'READY'
    || deployment.target !== 'production'
    || !Array.isArray(deployment.alias)
    || !deployment.alias.includes(config.productionUrl)
    || !isRecord(deployment.meta)
    || deployment.meta.githubCommitSha !== config.expectedRevision
    || deployment.meta.githubCommitRef !== 'codex/phase3c-execution'
    || `${deployment.meta.githubCommitOrg}/${deployment.meta.githubCommitRepo}`
      !== 'renoz/agentic-economy') {
    throw new Error('vercel_binding_mismatch')
  }
  await page.context().setExtraHTTPHeaders(humanHeaders(config))
  const served = await page.goto(new URL('/actions/paid/new', config.baseUrl).href, {
    waitUntil: 'networkidle',
  })
  if (served === null || !served.ok()) throw new Error('bound_alias_not_served')
  await expect(page.getByRole('heading', { name: 'Sandbox setup' })).toBeVisible()
}

async function assertVersionOneReadyForPermission(page: Page): Promise<void> {
  await expect(card(page)).toHaveAttribute('data-invocation-version', '1')
  await expect(page.getByText('Ready for permission', { exact: true })).toBeVisible()
  await expect(page.getByText('Not submitted', { exact: true })).toBeVisible()
  await expect(page.getByText('No settlement evidence', { exact: true })).toBeVisible()
  await expect(page.getByText('Not received', { exact: true })).toBeVisible()
}

async function assertVersionTwoPaymentPrepared(page: Page): Promise<void> {
  await expect(card(page)).toHaveAttribute('data-invocation-version', '2')
  await expect(page.getByText('Payment prepared', { exact: true })).toBeVisible()
  await expect(page.getByText('Not submitted', { exact: true })).toBeVisible()
  await expect(page.getByText('No settlement evidence', { exact: true })).toBeVisible()
  await expect(page.getByText('Not received', { exact: true })).toBeVisible()
  await expect(page.locator('[data-command]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Continue operation' })).toBeVisible()
}

async function assertSeparatePaymentSettlementAndResultTruth(
  page: Page,
  version: number,
  result: 'valid' | 'not_delivered',
): Promise<void> {
  await expect(card(page)).toHaveAttribute('data-invocation-version', String(version))
  await expect(page.getByText('Observed by provider', { exact: true })).toBeVisible()
  await expect(page.getByText('$0.01 settled in recorded sandbox evidence', {
    exact: true,
  })).toBeVisible()
  await expect(page.getByText(
    result === 'valid' ? 'Validated' : 'Not received',
    { exact: true },
  )).toBeVisible()
}

async function restoreInNewAuthenticatedContext(
  browser: Browser,
  config: LiveConfig,
  invocationRef: string,
  version: number,
  expectedDigest: string,
): Promise<void> {
  const context = await browser.newContext({
    extraHTTPHeaders: humanHeaders(config),
    serviceWorkers: 'block',
  })
  try {
    const page = await context.newPage()
    await page.goto(detailUrl(config, invocationRef, version), { waitUntil: 'networkidle' })
    await assertSeparatePaymentSettlementAndResultTruth(page, version, 'valid')
    expect(await cardDigest(page)).toBe(expectedDigest)
  } finally {
    await context.close()
  }
}

async function assertAgentVersionTwoPaymentPrepared(
  config: LiveConfig,
  invocationRef: string,
): Promise<void> {
  const value = await agentInspect(config, invocationRef, 2)
  assertAcceptedVersion(value, 2)
  const semantics = acceptedSemantics(value)
  expect(readState(semantics, 'paymentAuthorization')).toBe('created')
  expect(readState(semantics, 'paymentSubmission')).toBe('not_submitted')
  expect(readState(semantics, 'settlement')).toBe('no_evidence')
  expect(readState(semantics, 'resultDelivery')).toBe('not_delivered')
  expect(continuationKinds(value)).toEqual(['execute'])
}

async function assertAgentFinalReadback(
  config: LiveConfig,
  invocationRef: string,
  version: number,
  result: 'valid' | 'not_delivered',
): Promise<void> {
  const warm = await agentInspect(config, invocationRef, version)
  const cold = await agentInspect(config, invocationRef, version)
  assertAcceptedVersion(warm, version)
  assertAcceptedVersion(cold, version)
  assertSemanticTruth(warm, result)
  expect(acceptedSemanticDigest(warm)).toBe(acceptedSemanticDigest(cold))
}

async function runAgentAuthorize(
  config: LiveConfig,
  invocationRef: string,
  commandId: string,
): Promise<void> {
  const value = await runAgentCommand(config, invocationRef, {
    command: 'authorize',
    commandId,
    expectedInvocationVersion: 1,
    accept: true,
  })
  assertAcceptedVersion(value, 2)
}

async function runAgentCommand(
  config: LiveConfig,
  invocationRef: string,
  body: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const response = await fetch(
    new URL(
      `/api/v1/paid-operations/${encodeURIComponent(invocationRef)}/commands`,
      config.baseUrl,
    ),
    {
      method: 'POST',
      headers: agentHeaders(config),
      body: JSON.stringify(body),
      redirect: 'error',
    },
  )
  const value = await response.json()
  if (!response.ok) throw new Error(`agent_command_not_confirmed:${response.status}`)
  return value
}

async function agentInspect(
  config: LiveConfig,
  invocationRef: string,
  version: number,
): Promise<unknown> {
  const url = new URL(
    `/api/v1/paid-operations/${encodeURIComponent(invocationRef)}`,
    config.baseUrl,
  )
  url.searchParams.set('expectedInvocationVersion', String(version))
  const response = await fetch(url, {
    headers: agentHeaders(config),
    redirect: 'error',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`agent_inspect_failed:${response.status}`)
  return await response.json()
}

function assertAcceptedVersion(value: unknown, version: number): void {
  if (!isRecord(value)
    || value.kind !== 'accepted'
    || value.expectedInvocationVersion !== version) {
    throw new Error(`accepted_version_${version}_missing`)
  }
}

function assertSemanticTruth(
  value: unknown,
  result: 'valid' | 'not_delivered',
): void {
  const semantics = acceptedSemantics(value)
  expect(readState(semantics, 'queryRelease')).toBe('released')
  expect(readState(semantics, 'paymentAuthorization')).toBe('created')
  expect(readState(semantics, 'paymentSubmission')).toBe('observed')
  expect(readState(semantics, 'settlement')).toBe('settled')
  expect(readState(semantics, 'resultDelivery')).toBe(result)
}

function continuationKinds(value: unknown): unknown[] {
  const semantics = acceptedSemantics(value)
  const continuations = semantics.continuations
  if (!Array.isArray(continuations)) throw new Error('continuations_missing')
  return continuations.map((continuation) =>
    isRecord(continuation) ? continuation.kind : undefined)
}

function acceptedSemantics(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.projection) || !isRecord(value.projection.semantics)) {
    throw new Error('accepted_semantics_missing')
  }
  return value.projection.semantics
}

function acceptedSemanticDigest(value: unknown): string {
  if (!isRecord(value)
    || !isRecord(value.projection)
    || typeof value.projection.semanticDigest !== 'string') {
    throw new Error('accepted_semantic_digest_missing')
  }
  return value.projection.semanticDigest
}

function readState(semantics: Record<string, unknown>, key: string): unknown {
  const value = semantics[key]
  return isRecord(value) ? value.state : undefined
}

function parseCreated(value: unknown): CreatedOperation {
  if (!isRecord(value)
    || value.kind !== 'created'
    || typeof value.invocationRef !== 'string'
    || value.expectedInvocationVersion !== 1) {
    throw new Error('agent_creation_response_invalid')
  }
  return {
    invocationRef: value.invocationRef,
    expectedInvocationVersion: 1,
  }
}

function card(page: Page) {
  return page.locator(
    '[data-semantic-digest][data-invocation-version][data-evidence-class]',
  )
}

async function cardDigest(page: Page): Promise<string> {
  const digest = await card(page).getAttribute('data-semantic-digest')
  if (digest === null) throw new Error('human_semantic_digest_missing')
  return digest
}

function detailUrl(
  config: LiveConfig,
  invocationRef: string,
  version: number,
): string {
  const url = new URL(
    `/actions/paid/${encodeURIComponent(invocationRef)}`,
    config.baseUrl,
  )
  url.searchParams.set('expectedInvocationVersion', String(version))
  return url.href
}

function humanHeaders(config: LiveConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.humanSessionToken}`,
    ...protectionHeader(config),
  }
}

function agentHeaders(config: LiveConfig): Record<string, string> {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${config.agentApiKey}`,
    'Content-Type': 'application/json',
    ...protectionHeader(config),
  }
}

function protectionHeader(config: LiveConfig): Record<string, string> {
  return config.deploymentProtectionBypass === undefined
    ? {}
    : { 'x-vercel-protection-bypass': config.deploymentProtectionBypass }
}

function liveAdmissionContext(config: LiveConfig) {
  return {
    repositoryRoot: process.cwd(),
    baseUrl: config.baseUrl,
    ...(config.deploymentProtectionBypass === undefined
      ? {}
      : { deploymentProtectionBypass: config.deploymentProtectionBypass }),
    vercel: {
      apiToken: config.vercelApiToken,
      ...(config.vercelTeamId === undefined ? {} : { teamId: config.vercelTeamId }),
      deploymentId: config.deploymentId,
    },
    human: { sessionToken: config.humanSessionToken },
    agent: {
      apiKey: config.agentApiKey,
      credentialId: config.agentCredentialId,
      subject: config.agentSubject,
    },
    convex: {
      deploymentIdentity: config.convexDeploymentIdentity,
      adminKey: config.convexAdminKey,
    },
  }
}

async function attachSanitizedPacket(
  testInfo: TestInfo,
  packet: unknown,
): Promise<void> {
  await testInfo.attach('agentic-paid-operation-hosted-proof-v1', {
    body: Buffer.from(JSON.stringify(packet, null, 2)),
    contentType: 'application/json',
  })
}

function readLiveConfig(env: NodeJS.ProcessEnv): LiveConfig | undefined {
  const required = {
    baseUrl: env.AE_PAID_OPERATION_BASE_URL,
    expectedRevision: env.AE_RELEASE_SOURCE_REVISION,
    expectedTree: env.AE_RELEASE_SOURCE_TREE,
    deploymentId: env.AE_RELEASE_DEPLOYMENT_ID,
    productionUrl: env.AE_RELEASE_PRODUCTION_URL,
    vercelApiToken: env.AE_VERCEL_API_TOKEN,
    humanSessionToken: env.AE_PAID_OPERATION_HUMAN_SESSION_TOKEN,
    agentApiKey: env.AE_PAID_OPERATION_AGENT_API_KEY,
    agentCredentialId: env.AE_PAID_OPERATION_AGENT_CREDENTIAL_ID,
    agentSubject: env.AE_PAID_OPERATION_CLERK_SUBJECT,
    convexDeploymentIdentity: env.AE_PAID_OPERATION_CONVEX_DEPLOYMENT_URL,
    convexAdminKey: env.AE_PAID_OPERATION_CONVEX_ADMIN_KEY,
    automatedInstrumentDigest: env.AE_PHASE3C_COMPREHENSION_INSTRUMENT_DIGEST,
    residualReviewDate: env.AE_PHASE3C_RESIDUAL_REVIEW_DATE,
  }
  if (Object.values(required).some((value) => value?.trim() === undefined
    || value.trim() === '')) {
    return undefined
  }
  return {
    ...Object.fromEntries(
      Object.entries(required).map(([key, value]) => [key, value!.trim()]),
    ) as Omit<LiveConfig, 'vercelTeamId' | 'deploymentProtectionBypass'>,
    ...(env.AE_VERCEL_TEAM_ID?.trim()
      ? { vercelTeamId: env.AE_VERCEL_TEAM_ID.trim() }
      : {}),
    ...(env.AE_VERCEL_PROTECTION_BYPASS?.trim()
      ? { deploymentProtectionBypass: env.AE_VERCEL_PROTECTION_BYPASS.trim() }
      : {}),
  }
}

function requireLiveConfig(value: LiveConfig | undefined): LiveConfig {
  if (value === undefined) throw new Error('paid_operation_live_environment_required')
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
