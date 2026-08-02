import { randomUUID } from 'node:crypto'

import { chromium, expect, test, type Page } from '@playwright/test'

import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import {
  customerRequestAgentResultSchema,
  type CustomerRequestAgentNavigation,
  type CustomerRequestView,
} from '../../src/modules/customer-request/agent-contract'
import {
  createWorkTreeAgentClient,
  decisionCommand,
  metadataFromWorkTreeParityConfig,
  readAndVerifyWorkTreeParityRelease,
  type WorkTreeAgentClient,
  type WorkTreeAgentHttpResult,
  type WorkTreeParityReleaseConfig,
  workTreeParityConfigFromEnvironment,
} from '../../tools/release/work-tree-parity-release'
import { WORK_TREE_SCOPES } from '../../tools/release/work-tree-parity-credential'
import { runFreshAgentReadback, type FreshAgentReadback } from '../../tools/release/work-tree-parity-readback'
import {
  WORK_TREE_PARITY_EVIDENCE_CLASS,
  assertWorkTreeParityReadbackUnchanged,
  workTreeParityCredentialSecrets,
  writeWorkTreeParityEvidencePacket,
} from '../../tools/release/work-tree-parity-evidence'
import { withRuntimeSelectedClerkCredentials } from '../../tools/release/customer-request-production-credential'
import { resolvePath } from '../helpers/deployed-smoke'

let config: WorkTreeParityReleaseConfig | undefined

test.describe('T51 hosted WorkTree parity release proof', () => {
  test.use({ trace: 'off', screenshot: 'off' })

  test.beforeAll(() => {
    config = workTreeParityConfigFromEnvironment()
  })

  test('routes a real Customer Request before human create, replays the same WorkTree for an agent, and proves fresh readback', async ({ page }, testInfo) => {
    const smokeConfig = requireConfig()
    test.setTimeout(smokeConfig.timeoutMs)
    if (!smokeConfig.releaseMode) throw new Error('T51 release requires AE_T51_RELEASE_MODE=release')
    const clerkSecretKey = required(smokeConfig.clerkSecretKey, 'CLERK_SECRET_KEY')
    const clerkInstanceId = required(smokeConfig.clerkInstanceId, 'AE_WORK_TREE_CLERK_INSTANCE_ID')
    const metadata = metadataFromWorkTreeParityConfig(smokeConfig)
    const secretInputs: string[] = [clerkSecretKey, ...(smokeConfig.vercelBypassSecret === undefined ? [] : [smokeConfig.vercelBypassSecret])]
    const generatedSecrets: string[] = []
    const refusals: unknown[] = []
    const screenshots: Array<{ label: string; artifact: string }> = []
    const freshReadbacks: unknown[] = []
    let creationContextClosed = false
    let routeProof: CustomerRequestRouteProof | undefined
    let projectId: string | undefined
    let human: Record<string, unknown> = {}
    let agent: Record<string, unknown> = {}
    let cleanup: Record<string, unknown> = { state: 'pending_finally' }

    await withRuntimeSelectedClerkCredentials({
      clerkSecretKey,
      clerkInstanceId,
      selectionSeed: smokeConfig.selectionSeed,
      scopes: WORK_TREE_SCOPES,
      keyNamePrefix: 'AE T51 hosted WorkTree parity',
      fetch: globalThis.fetch,
    }, async ({ selection, creation, readback }) => {
      generatedSecrets.push(
        creation.humanSessionToken,
        creation.agentApiKey,
        readback.humanSessionToken,
        readback.agentApiKey,
      )
      secretInputs.push(...generatedSecrets)
      const creationClient = createWorkTreeAgentClient({
        baseUrl: smokeConfig.baseUrl,
        agentApiKey: creation.agentApiKey,
        ...(smokeConfig.vercelBypassSecret === undefined ? {} : { bypassSecret: smokeConfig.vercelBypassSecret }),
      })
      const readbackClient = createWorkTreeAgentClient({
        baseUrl: smokeConfig.baseUrl,
        agentApiKey: readback.agentApiKey,
        ...(smokeConfig.vercelBypassSecret === undefined ? {} : { bypassSecret: smokeConfig.vercelBypassSecret }),
      })
      const release = await readAndVerifyWorkTreeParityRelease({
        baseUrl: smokeConfig.baseUrl,
        agentApiKey: creation.agentApiKey,
        expectedRevision: smokeConfig.sourceRevision,
        expectedVercelDeploymentId: smokeConfig.vercelDeploymentId,
        expectedConvexDeploymentId: smokeConfig.convexDeploymentId,
        expectedConvexUrl: smokeConfig.convexUrl,
        ...(smokeConfig.vercelBypassSecret === undefined ? {} : { bypassSecret: smokeConfig.vercelBypassSecret }),
      })

      routeProof = await routeCustomerRequestFirst({
        baseUrl: smokeConfig.baseUrl,
        agentApiKey: creation.agentApiKey,
        charterText: smokeConfig.charterText,
        ...(smokeConfig.vercelBypassSecret === undefined ? {} : { bypassSecret: smokeConfig.vercelBypassSecret }),
      })
      const lineage = routeProof.lineage
      const createIdempotencyKey = canonicalDigest({ surface: 'root', charterText: smokeConfig.charterText })
      const createInput = {
        idempotencyKey: createIdempotencyKey,
        charterText: smokeConfig.charterText,
        lineage,
      }

      await page.context().setExtraHTTPHeaders({
        Authorization: `Bearer ${creation.humanSessionToken}`,
        ...(smokeConfig.vercelBypassSecret === undefined ? {} : { 'x-vercel-protection-bypass': smokeConfig.vercelBypassSecret }),
      })
      const humanCreateUrl = new URL('/', smokeConfig.baseUrl)
      humanCreateUrl.search = new URLSearchParams({
        q: smokeConfig.charterText,
        requestRef: lineage.requestRef,
        revision: String(lineage.revision),
        routeGenerationRef: lineage.routeGenerationRef,
        routeRef: lineage.routeRef,
      }).toString()
      await page.goto(humanCreateUrl.href, { waitUntil: 'networkidle' })
      projectId = readProjectIdFromUrl(page.url())
      await proveHumanInbox(page)
      human = {
        host: 'browser-root',
        projectId,
        lineage,
        charterDigest: canonicalDigest(smokeConfig.charterText),
        creation: { state: 'accepted_by_source', projectId },
      }

      const agentCreate = await creationClient.create(createInput)
      assertCreateReplay(agentCreate, projectId, lineage)
      const agentCreateBody = readRecord(agentCreate, 'body')
      agent = {
        release: release.readback,
        selection,
        creation: agentCreateBody,
        credentialId: creation.agentKeyId,
      }
      const agentJourney = await driveAgentToAdjustmentAndLock(readbackClient, projectId)
      agent = { ...agent, ...agentJourney }

      const humanDecision = readRequiredString(agentJourney, 'decision')
      const decision = JSON.parse(humanDecision) as Record<string, unknown>
      if (canonicalDigest(decision) !== canonicalDigest(agentJourney.decisionCommand)) {
        throw new Error('work_tree_human_lock_command_mismatch')
      }
      const adjustedRevision = readNumber(agentJourney.adjustedReadback, 'revision')
      const adjustmentReceipt = readRecord(agentJourney.adjustment, 'receipt')
      const adjustmentReceiptId = readRequiredString(adjustmentReceipt, 'receiptId')
      await page.reload({ waitUntil: 'networkidle' })
      await expect(page.getByRole('status')).toContainText('Adjusted', { timeout: 30_000 })
      await page.getByRole('button', { name: /Lock this in/iu }).click()
      await expect(page.getByRole('status')).toContainText('Locked in', { timeout: 30_000 })
      const receiptRegion = page.getByRole('status').filter({ hasText: /Receipt .+ at revision \d+/u }).last()
      await expect(receiptRegion).toBeVisible()
      const receiptStatus = await receiptRegion.innerText()
      const humanReceiptId = readReceiptId(receiptStatus)
      human = {
        ...human,
        receiptStatus,
        adjustmentReceiptId,
        adjustmentRevision: adjustedRevision,
        decision,
        revision: await readBadgeNumber(page, 'Revision'),
        generation: await readBadgeNumber(page, 'Generation'),
        evidenceClass: WORK_TREE_PARITY_EVIDENCE_CLASS,
      }
      const receiptScreenshot = testInfo.outputPath('work-tree-parity-human-lock.png')
      await receiptRegion.screenshot({ path: receiptScreenshot })
      screenshots.push({ label: 'locator-only human Lock receipt', artifact: receiptScreenshot })

      const replay = await readbackClient.decide(decision)
      assertDecisionKind(replay, 'replayed')
      const replayReceipt = readRecord(replay.body, 'receipt')
      if (readRequiredString(replayReceipt, 'receiptId') !== humanReceiptId) {
        throw new Error('work_tree_human_agent_replay_receipt_mismatch')
      }

      const baselineInspect = await readbackClient.inspect({ projectId })
      const baselineReadback = assertInspectAccepted(baselineInspect)
      const stale = await readbackClient.decide({
        ...decision,
        expectedRevision: Math.max(1, readNumber(baselineReadback, 'revision') - 1),
        idempotencyKey: `${createIdempotencyKey}:stale`,
      })
      assertDecisionRefusal(stale, 'stale_fence')
      refusals.push({ case: 'stale revision', response: stale.body, noChange: true })

      const conflictingReplay = await readbackClient.decide({
        ...decision,
        kind: 'park',
        idempotencyKey: readRequiredString(decision, 'idempotencyKey'),
      })
      assertDecisionRefusal(conflictingReplay, 'digest_mismatch')
      refusals.push({ case: 'changed idempotency charter', response: conflictingReplay.body, noChange: true })

      const routeMismatch = await creationClient.create({
        ...createInput,
        lineage: { ...lineage, routeRef: `${lineage.routeRef}:mismatch` },
      })
      assertCreateRefusal(routeMismatch, ['lineage_conflict', 'lineage_revision_conflict', 'idempotency_conflict'])
      refusals.push({ case: 'route mismatch', response: routeMismatch.body, noChange: true })

      const wrongOwnerProbe = await readbackClient.inspect({ projectId: `${projectId}:wrong-owner` })
      assertInspectRefusal(wrongOwnerProbe, ['forbidden', 'not_found'])
      refusals.push({ case: 'wrong owner project probe', response: wrongOwnerProbe.body, noChange: true })

      const finalInspect = await readbackClient.inspect({ projectId })
      const finalReadback = assertInspectAccepted(finalInspect)
      assertWorkTreeParityReadbackUnchanged(
        { revision: readNumber(finalReadback, 'revision'), tree: readRecord(finalReadback, 'tree') },
        { revision: readNumber(baselineReadback, 'revision'), tree: readRecord(baselineReadback, 'tree') },
      )
      agent = { ...agent, replay: replay.body, finalReadback, stateUnchangedAfterRefusals: true }

      await page.context().close()
      creationContextClosed = true
      const freshBrowser = await chromium.launch({ headless: true })
      try {
        const freshContext = await freshBrowser.newContext({
          extraHTTPHeaders: {
            Authorization: `Bearer ${readback.humanSessionToken}`,
            ...(smokeConfig.vercelBypassSecret === undefined ? {} : { 'x-vercel-protection-bypass': smokeConfig.vercelBypassSecret }),
          },
        })
        try {
          const freshPage = await freshContext.newPage()
          await freshPage.goto(resolvePath(`/?project=${encodeURIComponent(projectId)}`, smokeConfig.baseUrl), { waitUntil: 'networkidle' })
          await expect(freshPage.getByRole('heading', { name: 'The decisions that matter' })).toBeVisible()
          await expect(freshPage.getByText(new RegExp(`Revision ${readNumber(finalReadback, 'revision')}`, 'u'))).toBeVisible()
          const freshStatus = freshPage.getByRole('status').filter({ hasText: /Receipt .+ at revision \d+/u }).last()
          await expect(freshStatus).toBeVisible()
          const freshScreenshot = testInfo.outputPath('work-tree-parity-fresh-human-readback.png')
          await freshStatus.screenshot({ path: freshScreenshot })
          screenshots.push({ label: 'locator-only fresh browser readback', artifact: freshScreenshot })
          freshReadbacks.push({
            classification: { process: 'fresh-browser-process', client: 'fresh-human-session', context: 'new-browser-context' },
            readback: { projectId, revision: readNumber(finalReadback, 'revision'), status: await freshStatus.innerText() },
          })
        } finally {
          await freshContext.close()
        }
      } finally {
        await freshBrowser.close()
      }

      const childReadback = await runFreshAgentReadback({
        baseUrl: smokeConfig.baseUrl,
        projectId,
        agentApiKey: readback.agentApiKey,
        ...(smokeConfig.vercelBypassSecret === undefined ? {} : { bypassSecret: smokeConfig.vercelBypassSecret }),
        timeoutMs: smokeConfig.timeoutMs,
      })
      assertFreshAgentReadback(childReadback, projectId, finalReadback)
      freshReadbacks.push(childReadback)

      cleanup = {
        state: 'revoked_in_finally',
        creationAgentKeyId: creation.agentKeyId,
        readbackAgentKeyId: readback.agentKeyId,
        creationSessionClosed: true,
        readbackSessionClosed: true,
        creationContextClosed,
      }
      await writeWorkTreeParityEvidencePacket({
        directory: smokeConfig.evidenceDirectory,
        metadata,
        route: routeProof,
        account: { ownerAccountDigest: selection.selectedSubjectDigest },
        selection,
        creation: {
          idempotencyKey: createIdempotencyKey,
          charterDigest: canonicalDigest(smokeConfig.charterText),
          human: { projectId, state: 'accepted_by_browser_root' },
          agent: agentCreate.body,
          decisions: { adjustment: agentJourney.adjustment, lock: replay.body },
        },
        freshReadbacks,
        cleanup,
        human,
        agent,
        refusals,
        screenshots,
        secrets: workTreeParityCredentialSecrets(secretInputs),
      }).then((packetPath) => testInfo.attach('hosted + development-mock sanitized evidence packet', { path: packetPath, contentType: 'application/json' }))
    })
  })
})

type CustomerRequestLineage = Readonly<{
  kind: 'customer_request'
  requestRef: string
  revision: number
  routeGenerationRef: string
  routeRef: string
}>

type CustomerRequestRouteProof = Readonly<{
  lineage: CustomerRequestLineage
  route: Record<string, unknown>
  readback: Record<string, unknown>
  requestStates: readonly string[]
}>

async function routeCustomerRequestFirst(input: Readonly<{
  baseUrl: URL
  agentApiKey: string
  charterText: string
  bypassSecret?: string
}>): Promise<CustomerRequestRouteProof> {
  const requestRef = `t51:request:${randomUUID()}`
  const states: string[] = []
  let view = await requestCustomerView(input, '/api/v1/requests', 'POST', {
    idempotencyKey: `t51:request:${requestRef}`,
    requestRef,
    agentRef: 't51-hosted-cold-agent',
    request: input.charterText,
  })
  for (let step = 0; step < 12; step += 1) {
    if (states.at(-1) !== view.state) states.push(view.state)
    if (view.state === 'routes_ready') {
      const route = view.decision?.routes[0]
      const routeGenerationRef = view.routeGenerationRef ?? view.decision?.generationRef
      if (route === undefined || routeGenerationRef === undefined) throw new Error('t51_customer_request_route_lineage_missing')
      return {
        lineage: {
          kind: 'customer_request', requestRef: view.requestRef, revision: view.revision,
          routeGenerationRef, routeRef: route.routeRef,
        },
        route: route as unknown as Record<string, unknown>,
        readback: view as unknown as Record<string, unknown>,
        requestStates: states,
      }
    }
    const navigation = view.navigation
    if (navigation === undefined) throw new Error(`t51_customer_request_navigation_missing:${view.state}`)
    const action = view.state === 'needs_information'
      ? findNavigationAction(navigation, 'answer_clarification')
      : view.state === 'ready_to_compare'
        ? findNavigationAction(navigation, 'prepare_options')
        : findNavigationAction(navigation, 'inspect_progress')
    if (action === undefined) throw new Error(`t51_customer_request_navigation_action_missing:${view.state}`)
    const replacements: Record<string, unknown> = {
      '<unique string>': `t51:${requestRef}:${step}`,
      '<natural-language answer>': input.charterText,
      '<typed value>': true,
    }
    view = await requestCustomerView(input, action.href, action.method, materializeNavigationInput(action.input, replacements))
  }
  throw new Error('t51_customer_request_route_transition_limit')
}

async function requestCustomerView(
  input: Readonly<{ baseUrl: URL; agentApiKey: string; bypassSecret?: string }>,
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<CustomerRequestView> {
  const headers = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${input.agentApiKey}` })
  if (input.bypassSecret !== undefined) headers.set('x-vercel-protection-bypass', input.bypassSecret)
  const response = await fetch(new URL(path, input.baseUrl), {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error',
  })
  const value: unknown = await response.json()
  if (!response.ok) throw new Error(`t51_customer_request_route_failed:${response.status}`)
  const result = customerRequestAgentResultSchema.parse(value)
  if (result.kind !== 'request') throw new Error(`t51_customer_request_route_result:${result.kind}`)
  return result
}

function findNavigationAction(navigation: CustomerRequestAgentNavigation, relation: CustomerRequestAgentNavigation['actions'][number]['relation']) {
  return navigation.actions.find((action) => action.relation === relation)
}

function materializeNavigationInput(value: Record<string, unknown> | undefined, replacements: Record<string, unknown>): Record<string, unknown> | undefined {
  if (value === undefined) return undefined
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, materializeValue(entry, replacements)]))
}

function materializeValue(value: unknown, replacements: Record<string, unknown>): unknown {
  if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(replacements, value)) return replacements[value]
  if (Array.isArray(value)) return value.map((entry) => materializeValue(entry, replacements))
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, materializeValue(entry, replacements)]))
  return value
}

async function driveAgentToAdjustmentAndLock(client: WorkTreeAgentClient, projectId: string): Promise<Record<string, unknown>> {
  const inspected = await client.inspect({ projectId })
  const readback = assertInspectAccepted(inspected)
  const decisionNode = findDecisionNode(readback)
  if (decisionNode === undefined) throw new Error('work_tree_agent_decision_node_missing')
  const adjustmentCommand = decisionCommand({
    projectId, nodeId: readRequiredString(decisionNode, 'nodeId'), kind: 'adjust',
    expectedGeneration: readNumber(readback, 'generation'), expectedRevision: readNumber(readback, 'revision'),
    idempotencyKey: `${projectId}:t51:agent-adjust`,
  })
  const adjustment = await client.decide(adjustmentCommand)
  assertDecisionKind(adjustment, 'accepted')
  const adjustedInspect = await client.inspect({ projectId })
  const adjustedReadback = assertInspectAccepted(adjustedInspect)
  const adjustedDecision = findDecisionNode(adjustedReadback)
  if (adjustedDecision === undefined) throw new Error('work_tree_agent_adjusted_decision_missing')
  const decisionCommandValue = decisionCommand({
    projectId, nodeId: readRequiredString(adjustedDecision, 'nodeId'), kind: 'lock',
    expectedGeneration: readNumber(adjustedReadback, 'generation'), expectedRevision: readNumber(adjustedReadback, 'revision'),
    idempotencyKey: canonicalDigest({ projectId, nodeId: readRequiredString(adjustedDecision, 'nodeId'), kind: 'lock', expectedGeneration: readNumber(adjustedReadback, 'generation'), expectedRevision: readNumber(adjustedReadback, 'revision'), surface: 'root' }),
  })
  return {
    inspect: inspected.body, adjustment: adjustment.body, adjustedReadback,
    decisionCommand: decisionCommandValue,
    decision: JSON.stringify(decisionCommandValue),
  }
}

function assertCreateReplay(result: WorkTreeAgentHttpResult, projectId: string, lineage: CustomerRequestLineage): void {
  if (!isRecord(result.body) || (result.body.kind !== 'accepted' && result.body.kind !== 'replayed')) {
    throw new Error(`work_tree_create_replay_missing:${readReason(result.body)}`)
  }
  const readback = readRecord(result.body, 'readback')
  if (readRequiredString(readback, 'projectId') !== projectId) throw new Error('work_tree_shared_project_missing')
  const observedLineage = readRecord(readback, 'lineage')
  for (const key of ['requestRef', 'revision', 'routeGenerationRef', 'routeRef'] as const) {
    if (observedLineage[key] !== lineage[key]) throw new Error(`work_tree_lineage_${key}_mismatch`)
  }
}

function assertCreateRefusal(result: WorkTreeAgentHttpResult, expected: readonly string[]): void {
  if (!isRecord(result.body) || result.body.kind !== 'refused' || typeof result.body.code !== 'string' || !expected.includes(result.body.code)) {
    throw new Error(`work_tree_create_refusal_missing:${readReason(result.body)}`)
  }
}

function assertInspectAccepted(result: WorkTreeAgentHttpResult): Record<string, unknown> {
  if (!isRecord(result.body) || result.body.kind !== 'accepted' || !isRecord(result.body.readback)) {
    throw new Error(`work_tree_agent_inspect_refused:${readReason(result.body)}`)
  }
  return result.body.readback
}

function assertInspectRefusal(result: WorkTreeAgentHttpResult, expected: readonly string[]): void {
  if (!isRecord(result.body) || result.body.kind !== 'refused' || typeof result.body.code !== 'string' || !expected.includes(result.body.code)) {
    throw new Error(`work_tree_inspect_refusal_missing:${readReason(result.body)}`)
  }
}

function assertDecisionKind(result: WorkTreeAgentHttpResult, expected: 'accepted' | 'replayed'): void {
  if (!isRecord(result.body) || result.body.kind !== expected) throw new Error(`work_tree_decide_${expected}_missing:${readReason(result.body)}`)
}

function assertDecisionRefusal(result: WorkTreeAgentHttpResult, expectedCode: string): void {
  if (!isRecord(result.body) || result.body.kind !== 'refused' || result.body.refusalCode !== expectedCode) {
    throw new Error(`work_tree_decision_refusal_missing:${expectedCode}:${readReason(result.body)}`)
  }
}

function assertFreshAgentReadback(result: FreshAgentReadback, projectId: string, baseline: Record<string, unknown>): void {
  if (result.classification.process !== 'fresh-child-process' || result.classification.client !== 'fresh-agent-key') {
    throw new Error('work_tree_fresh_agent_classification_missing')
  }
  if (!isRecord(result.body) || result.body.kind !== 'accepted' || result.body.projectId !== projectId) {
    throw new Error('work_tree_fresh_agent_readback_missing')
  }
  if (readNumber(result.body, 'revision') !== readNumber(baseline, 'revision')) throw new Error('work_tree_fresh_agent_revision_mismatch')
}

function findDecisionNode(readback: Record<string, unknown>): Record<string, unknown> | undefined {
  return readRecords(readRecord(readback, 'tree'), 'nodes').find((node) => node.kind === 'decision' && node.status === 'ready')
}

async function proveHumanInbox(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'The decisions that matter' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Decisions waiting' })).toBeVisible()
  await expect(page.getByText(/^Revision \d+$/u)).toBeVisible()
  await expect(page.getByText(/^Generation \d+$/u)).toBeVisible()
}

async function readBadgeNumber(page: Page, label: string): Promise<number> {
  const text = await page.getByText(new RegExp(`^${label} \\d+$`, 'u')).first().innerText()
  const match = text.match(/(\d+)$/u)
  if (match === null) throw new Error(`work_tree_${label.toLowerCase()}_badge_invalid`)
  return Number(match[1])
}

function readProjectIdFromUrl(value: string): string {
  const projectId = new URL(value).searchParams.get('project')?.trim()
  if (projectId === undefined || projectId.length === 0) throw new Error('work_tree_browser_project_missing')
  return projectId
}

function readReceiptId(status: string): string {
  const match = /Receipt\s+(\S+)\s+at revision\s+\d+/u.exec(status)
  if (match?.[1] === undefined) throw new Error('work_tree_receipt_status_invalid')
  return match[1]
}

function readRecord(value: unknown, key: string): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value[key])) throw new Error(`work_tree_${key}_missing`)
  return value[key]
}

function readRecords(value: unknown, key: string): readonly Record<string, unknown>[] {
  if (!isRecord(value) || !Array.isArray(value[key])) throw new Error(`work_tree_${key}_missing`)
  return value[key].filter(isRecord)
}

function readNumber(value: unknown, key: string): number {
  if (!isRecord(value) || typeof value[key] !== 'number') throw new Error(`work_tree_${key}_missing`)
  return value[key]
}

function readRequiredString(value: unknown, key: string): string {
  if (!isRecord(value) || typeof value[key] !== 'string' || value[key].trim().length === 0) throw new Error(`work_tree_${key}_missing`)
  return value[key]
}

function readReason(value: unknown): string {
  if (!isRecord(value)) return 'unknown'
  return typeof value.reason === 'string' ? value.reason : typeof value.code === 'string' ? value.code : 'unknown'
}

function requireConfig(): WorkTreeParityReleaseConfig {
  if (config === undefined) throw new Error('WorkTree parity smoke config was not loaded.')
  return config
}

function required(value: string | undefined, key: string): string {
  if (value === undefined || value.trim().length === 0) throw new Error(`${key}_required`)
  return value
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
