import { expect, test, type Page } from '@playwright/test'

import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import {
  BAS_DEVELOPMENT_CHILDREN,
  BAS_DEVELOPMENT_DECISION_CHILDREN,
  BAS_DEVELOPMENT_OPTIONS,
  createWorkTreeAgentClient,
  decisionCommand,
  metadataFromWorkTreeParityConfig,
  readAndVerifyWorkTreeParityRelease,
  signGardenerVerb,
  type WorkTreeAgentClient,
  type WorkTreeAgentHttpResult,
  type WorkTreeParityReleaseConfig,
  workTreeParityConfigFromEnvironment,
} from '../../tools/release/work-tree-parity-release'
import {
  WORK_TREE_PARITY_EVIDENCE_CLASS,
  assertWorkTreeParityReadbackUnchanged,
  workTreeParityCredentialSecrets,
  writeWorkTreeParityEvidencePacket,
} from '../../tools/release/work-tree-parity-evidence'
import {
  seedHostedWorkTreeCohort,
  type WorkTreeSetupReadback,
} from '../../tools/release/work-tree-parity-seed'
import { withTemporaryWorkTreeCredential } from '../../tools/release/work-tree-parity-credential'
import { applyVercelProtectionBypassToPage } from './vercel-bypass'
import { resolvePath } from '../helpers/deployed-smoke'

let config: WorkTreeParityReleaseConfig | undefined

test.describe('T51 hosted WorkTree parity release proof', () => {
  test.use({ trace: 'off', screenshot: 'off' })
  test.beforeAll(() => {
    config = workTreeParityConfigFromEnvironment()
  })
  test('cold human and authenticated agent share one source-owned WorkTree with receipts and refusal readback', async ({ page }, testInfo) => {
    const smokeConfig = requireConfig()
    test.setTimeout(smokeConfig.timeoutMs)

    const metadata = metadataFromWorkTreeParityConfig(smokeConfig)
    const credentialSecretInputs: string[] = [
      smokeConfig.setupToken,
      smokeConfig.clerkSecretKey,
      ...(smokeConfig.vercelBypassSecret === undefined ? [] : [smokeConfig.vercelBypassSecret]),
    ]
    const generatedCredentialSecrets: string[] = []
    let setup: WorkTreeSetupReadback | undefined
    let browserProjectId: string | undefined
    let human: Record<string, unknown> = {}
    let agent: Record<string, unknown> = {}
    const refusals: unknown[] = []
    const screenshotPaths: Array<{ label: string; artifact: string }> = []
    let releaseVerified = false
      await withTemporaryWorkTreeCredential({
        clerkSecretKey: smokeConfig.clerkSecretKey,
        expectedInstanceId: smokeConfig.clerkInstanceId,
        subject: smokeConfig.clerkSubject,
        fetch: globalThis.fetch,
        run: async ({ agentApiKey, credentialId, scopes, issueCustomerSessionToken }) => {
          await applyVercelProtectionBypassToPage(page, smokeConfig.baseUrl)
          generatedCredentialSecrets.push(agentApiKey)
          const humanSessionToken = await issueCustomerSessionToken()
          generatedCredentialSecrets.push(humanSessionToken)
          await page.context().setExtraHTTPHeaders({ Authorization: `Bearer ${humanSessionToken}` })

          const release = await readAndVerifyWorkTreeParityRelease({
            baseUrl: smokeConfig.baseUrl,
            agentApiKey,
            expectedRevision: smokeConfig.sourceRevision,
            expectedVercelDeploymentId: smokeConfig.vercelDeploymentId,
            expectedConvexDeploymentId: smokeConfig.convexDeploymentId,
            expectedConvexUrl: smokeConfig.convexUrl,
            ...(smokeConfig.vercelBypassSecret === undefined ? {} : { bypassSecret: smokeConfig.vercelBypassSecret }),
          })
          releaseVerified = true
          agent = { release: release.readback }
          const createIdempotencyKey = canonicalDigest({ surface: 'root', charterText: smokeConfig.charterText })
          setup = await seedHostedWorkTreeCohort({
            baseUrl: smokeConfig.baseUrl,
            setupPath: smokeConfig.setupPath,
            setupToken: smokeConfig.setupToken,
            ownerSubject: smokeConfig.clerkSubject,
            metadata,
            charterText: smokeConfig.charterText,
            createIdempotencyKey,
            ...(smokeConfig.vercelBypassSecret === undefined ? {} : { bypassSecret: smokeConfig.vercelBypassSecret }),
          })
          if (setup === undefined) throw new Error('work_tree_setup_readback_missing')
          const client = createWorkTreeAgentClient({
            baseUrl: smokeConfig.baseUrl,
            agentApiKey,
            ...(smokeConfig.vercelBypassSecret === undefined ? {} : { bypassSecret: smokeConfig.vercelBypassSecret }),
          })
          browserProjectId = await driveColdHumanToInbox(page, smokeConfig, setup)
          if (browserProjectId !== setup.projectId) throw new Error('work_tree_shared_principal_seam_missing')
          const agentResult = await driveAgentToDecision(client, setup)
          agent = { ...agent, credentialId, scopes, ...agentResult }
          await page.reload({ waitUntil: 'networkidle' })
          await proveHumanInbox(page)
          const decision = agentResult.decision as Record<string, unknown>
          const adjustedReadback = readRecord(agentResult, 'adjustedReadback')
          const adjustment = readRecord(agentResult, 'adjustment')
          const adjustmentReceipt = readRecord(adjustment, 'receipt')
          const adjustedRevision = readNumber(adjustedReadback, 'revision')
          const adjustmentReceiptId = readRequiredString(adjustmentReceipt, 'receiptId')
          const expectedDecision = decisionCommand({
            projectId: setup.projectId,
            nodeId: readRequiredString(decision, 'nodeId'),
            kind: 'lock',
            expectedGeneration: readNumber(adjustedReadback, 'generation'),
            expectedRevision: adjustedRevision,
            idempotencyKey: canonicalDigest({
              projectId: setup.projectId,
              nodeId: readRequiredString(decision, 'nodeId'),
              kind: 'lock',
              expectedGeneration: readNumber(adjustedReadback, 'generation'),
              expectedRevision: adjustedRevision,
              surface: 'root',
            }),
          })
          if (canonicalDigest(expectedDecision) !== canonicalDigest(decision)) {
            throw new Error('work_tree_human_lock_command_mismatch')
          }
          await expect(page.getByRole('status')).toContainText('Adjusted — adjusted.')
          const adjustmentReceiptRegion = page.getByRole('status').filter({ hasText: /Receipt .+ at revision \d+/u }).last()
          await expect(adjustmentReceiptRegion).toBeVisible()
          const adjustmentReceiptStatus = await adjustmentReceiptRegion.innerText()
          await page.getByRole('button', { name: 'Lock this in' }).click()
          await expect(page.getByRole('status')).toContainText('Locked in — locked.', { timeout: 30_000 })
          await expect(page.getByRole('status')).toContainText(/Receipt .+ at revision \d+/u)
          const receiptRegion = page.getByRole('status').filter({ hasText: /Receipt .+ at revision \d+/u }).last()
          await expect(receiptRegion).toBeVisible()
          const receiptStatus = await receiptRegion.innerText()
          const humanReceiptId = readReceiptId(receiptStatus)
          human = {
            projectId: browserProjectId,
            receiptStatus,
            adjustmentReceiptStatus,
            adjustmentReceiptId,
            adjustmentRevision: adjustedRevision,
            decision,
            revision: await readBadgeNumber(page, 'Revision'),
            generation: await readBadgeNumber(page, 'Generation'),
            evidenceClass: WORK_TREE_PARITY_EVIDENCE_CLASS,
          }
          const receiptScreenshot = testInfo.outputPath('work-tree-parity-human-lock.png')
          await receiptRegion.screenshot({ path: receiptScreenshot })
          screenshotPaths.push({ label: 'hosted + development-mock human Lock receipt', artifact: receiptScreenshot })

          const replay = await client.decide(decision)
          assertDecisionKind(replay, 'replayed')
          const replayReceipt = readRecord(replay.body, 'receipt')
          if (readRequiredString(replayReceipt, 'receiptId') !== humanReceiptId) {
            throw new Error('work_tree_human_agent_replay_receipt_mismatch')
          }
          const baselineInspect = await client.inspect({ projectId: setup.projectId })
          const baselineReadback = assertInspectAccepted(baselineInspect)
          const baselineRevision = readNumber(baselineReadback, 'revision')
          const baselineTreeDigest = canonicalDigest(readRecord(baselineReadback, 'tree'))
          const stale = await client.decide({
            ...decision,
            idempotencyKey: `t51:stale:${Date.now()}`,
          })
          assertDecisionRefusal(stale, 'stale_fence')
          refusals.push({ case: 'stale revision', response: stale.body })

          const conflictingReplay = await client.decide({
            ...decision,
            kind: 'park',
            idempotencyKey: readRequiredString(decision, 'idempotencyKey'),
          })
          assertDecisionRefusal(conflictingReplay, 'digest_mismatch')
          refusals.push({ case: 'conflicting replay', response: conflictingReplay.body })

          const foreignProjectId = readRequiredString(setup, 'wrongPrincipalProjectId')
          const wrongPrincipal = await client.inspect({ projectId: foreignProjectId })
          assertInspectRefusal(wrongPrincipal, 'forbidden')
          refusals.push({ case: 'wrong principal', response: wrongPrincipal.body })

          const finalReadbackResult = await client.inspect({ projectId: browserProjectId })
          const finalReadback = assertInspectAccepted(finalReadbackResult)
          assertWorkTreeParityReadbackUnchanged(
            { revision: readNumber(finalReadback, 'revision'), tree: readRecord(finalReadback, 'tree') },
            { revision: readNumber(baselineReadback, 'revision'), tree: readRecord(baselineReadback, 'tree') },
          )
          agent = {
            ...agent,
            replay: replay.body,
            baselineRevision,
            baselineTreeDigest,
            finalReadback,
            stateUnchangedAfterRefusals: true,
          }
          if (browserProjectId === undefined || setup === undefined) throw new Error('work_tree_shared_principal_seam_missing')
          await page.goto(resolvePath(`/?project=${encodeURIComponent(browserProjectId)}`, smokeConfig.baseUrl), { waitUntil: 'networkidle' })
          await expect(page.getByRole('heading', { name: 'The decisions that matter' })).toBeVisible()
          await expect(page.getByText(/Receipt .+ at revision \d+/u)).toBeVisible()
          await expect(page.getByText(`Revision ${String(human.revision)}`, { exact: true })).toBeVisible()
          const reloadReceiptRegion = page.getByRole('status').filter({ hasText: /Receipt .+ at revision \d+/u }).last()
          await expect(reloadReceiptRegion).toBeVisible()
          const reloadScreenshot = testInfo.outputPath('work-tree-parity-human-reload.png')
          await reloadReceiptRegion.screenshot({ path: reloadScreenshot })
          screenshotPaths.push({ label: 'hosted + development-mock cold reload readback', artifact: reloadScreenshot })
          if (releaseVerified) {
            const packetPath = await writeWorkTreeParityEvidencePacket({
              directory: smokeConfig.evidenceDirectory,
              metadata,
              setup,
              human,
              agent,
              refusals,
              screenshots: screenshotPaths,
              secrets: workTreeParityCredentialSecrets([...credentialSecretInputs, ...generatedCredentialSecrets]),
            })
            await testInfo.attach('hosted + development-mock evidence packet', { path: packetPath, contentType: 'application/json' })
            for (const screenshot of screenshotPaths) {
              await testInfo.attach(screenshot.label, { path: screenshot.artifact, contentType: 'image/png' })
            }
          }
        },
      })

  })
})

async function driveColdHumanToInbox(page: Page, smokeConfig: WorkTreeParityReleaseConfig, setup: WorkTreeSetupReadback): Promise<string> {
  const projectId = setup.projectId
  await page.goto(resolvePath(`/?project=${encodeURIComponent(projectId)}`, smokeConfig.baseUrl), { waitUntil: 'networkidle' })
  await proveHumanInbox(page)
  return projectId
}

async function proveHumanInbox(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'The decisions that matter' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Decisions waiting' })).toBeVisible()
  await expect(page.getByText('Choose how your BAS gets brought up to date', { exact: true })).toBeVisible()
  await expect(page.getByText(/Development mock — not a provider quote or fulfilment\./u)).toBeVisible()
  await expect(page.getByText(/^Revision \d+$/u)).toBeVisible()
  await expect(page.getByText(/^Generation \d+$/u)).toBeVisible()
}

async function driveAgentToDecision(client: WorkTreeAgentClient, setup: WorkTreeSetupReadback): Promise<Record<string, unknown>> {
  let inspected = await client.inspect({ projectId: setup.projectId })
  const initialReadback = assertInspectAccepted(inspected)
  const decisionNode = findDecisionNode(initialReadback)
  if (decisionNode === undefined) throw new Error('work_tree_agent_decision_node_missing')

  const proposalEvent = readRecords(initialReadback, 'events').find((event) => readString(event, 'kind') === 'decision_proposed')
  let proposal: WorkTreeAgentHttpResult
  if (proposalEvent !== undefined) {
    proposal = inspected
  } else {
    const root = readRecords(readRecord(initialReadback, 'tree'), 'nodes').find((node) => readString(node, 'parentId') === undefined)
    if (root === undefined) throw new Error('work_tree_agent_root_node_missing')
    const first = await client.apply({
      projectId: setup.projectId,
      operationKey: `${setup.projectId}:development-mock:elaborate-root`,
      correlationId: `${setup.projectId}:development-mock`,
      verb: signGardenerVerb({
        kind: 'elaborate',
        targetNodeId: readRequiredString(root, 'nodeId'),
        expectedGeneration: readNumber(initialReadback, 'generation'),
        expectedRevision: readNumber(initialReadback, 'revision'),
        children: BAS_DEVELOPMENT_CHILDREN,
      }),
    })
    assertApplyAcceptedOrReplayed(first, setup.projectId)
    inspected = await client.inspect({ projectId: setup.projectId })
    const firstReadback = assertInspectAccepted(inspected)
    const nextDecision = findDecisionNode(firstReadback)
    if (nextDecision === undefined) throw new Error('work_tree_agent_decision_node_missing_after_first_apply')
    const second = await client.apply({
      projectId: setup.projectId,
      operationKey: `${setup.projectId}:development-mock:elaborate-decision`,
      correlationId: `${setup.projectId}:development-mock`,
      verb: signGardenerVerb({
        kind: 'elaborate',
        targetNodeId: readRequiredString(nextDecision, 'nodeId'),
        expectedGeneration: readNumber(firstReadback, 'generation'),
        expectedRevision: readNumber(firstReadback, 'revision'),
        children: BAS_DEVELOPMENT_DECISION_CHILDREN,
      }),
    })
    assertApplyAcceptedOrReplayed(second, setup.projectId)
    inspected = await client.inspect({ projectId: setup.projectId })
    const secondReadback = assertInspectAccepted(inspected)
    proposal = await client.apply({
      projectId: setup.projectId,
      operationKey: `${setup.projectId}:development-mock:propose-decision`,
      correlationId: `${setup.projectId}:development-mock`,
      verb: signGardenerVerb({
        kind: 'propose_decision',
        targetNodeId: readRequiredString(nextDecision, 'nodeId'),
        expectedGeneration: readNumber(secondReadback, 'generation'),
        expectedRevision: readNumber(secondReadback, 'revision'),
        options: BAS_DEVELOPMENT_OPTIONS,
        recommendation: 'bookkeeper-catch-up',
      }),
    })
    assertApplyAcceptedOrReplayed(proposal, setup.projectId)
    inspected = await client.inspect({ projectId: setup.projectId })
  }

  const readback = assertInspectAccepted(inspected)
  const readyDecision = findDecisionNode(readback)
  if (readyDecision === undefined) throw new Error('work_tree_agent_ready_decision_missing')
  const adjustment = decisionCommand({
    projectId: setup.projectId,
    nodeId: readRequiredString(readyDecision, 'nodeId'),
    kind: 'adjust',
    expectedGeneration: readNumber(readback, 'generation'),
    expectedRevision: readNumber(readback, 'revision'),
    idempotencyKey: `${setup.projectId}:t51:agent-adjust`,
  })
  const adjusted = await client.decide(adjustment)
  assertDecisionKind(adjusted, 'accepted')
  const adjustedInspect = await client.inspect({ projectId: setup.projectId })
  const adjustedReadback = assertInspectAccepted(adjustedInspect)
  const adjustedDecision = findDecisionNode(adjustedReadback)
  if (adjustedDecision === undefined) throw new Error('work_tree_agent_adjusted_decision_missing')
  const decision = decisionCommand({
    projectId: setup.projectId,
    nodeId: readRequiredString(adjustedDecision, 'nodeId'),
    kind: 'lock',
    expectedGeneration: readNumber(adjustedReadback, 'generation'),
    expectedRevision: readNumber(adjustedReadback, 'revision'),
    idempotencyKey: canonicalDigest({
      projectId: setup.projectId,
      nodeId: readRequiredString(adjustedDecision, 'nodeId'),
      kind: 'lock',
      expectedGeneration: readNumber(adjustedReadback, 'generation'),
      expectedRevision: readNumber(adjustedReadback, 'revision'),
      surface: 'root',
    }),
  })
  return {
    inspect: inspected.body,
    proposal: proposal.body,
    adjustment: adjusted.body,
    decision,
    readback,
    adjustedReadback,
  }
}


function assertInspectAccepted(result: WorkTreeAgentHttpResult): Record<string, unknown> {
  if (result.status === 404) throw new Error('work_tree_inspect_seam_missing')
  if (!isRecord(result.body) || result.body.kind !== 'accepted' || !isRecord(result.body.readback)) {
    throw new Error(`work_tree_agent_inspect_refused:${readReason(result.body)}`)
  }
  return result.body.readback
}

function assertInspectRefusal(result: WorkTreeAgentHttpResult, code: string): void {
  if (!isRecord(result.body) || result.body.kind !== 'refused' || readString(result.body, 'code') !== code) {
    throw new Error(`work_tree_wrong_principal_refusal_missing:${readReason(result.body)}`)
  }
}

function assertApplyAcceptedOrReplayed(result: WorkTreeAgentHttpResult, projectId: string): void {
  if (!isRecord(result.body) || (result.body.kind !== 'accepted' && result.body.kind !== 'replayed')) {
    throw new Error(`work_tree_agent_apply_refused:${readReason(result.body)}`)
  }
  const receipt = result.body.receipt
  if (!isRecord(receipt) || receipt.projectId !== projectId) throw new Error('work_tree_agent_apply_receipt_invalid')
}

function assertApplyReadback(result: WorkTreeAgentHttpResult): Record<string, unknown> {
  if (!isRecord(result.body) || !isRecord(result.body.readback)) throw new Error('work_tree_agent_apply_readback_invalid')
  return result.body.readback
}

function assertDecisionKind(result: WorkTreeAgentHttpResult, expected: 'accepted' | 'replayed'): void {
  if (!isRecord(result.body) || result.body.kind !== expected) throw new Error(`work_tree_agent_decide_${expected}_missing:${readReason(result.body)}`)
}

function assertDecisionRefusal(result: WorkTreeAgentHttpResult, expectedCode: string): void {
  if (!isRecord(result.body) || result.body.kind !== 'refused' || result.body.refusalCode !== expectedCode) {
    throw new Error(`work_tree_decision_refusal_missing:${expectedCode}:${readReason(result.body)}`)
  }
}

function findDecisionNode(readback: Record<string, unknown>): Record<string, unknown> | undefined {
  const tree = readRecord(readback, 'tree')
  return readRecords(tree, 'nodes').find((node) => (
    node.kind === 'decision' && node.status === 'ready'
  ))
}

async function readBadgeNumber(page: Page, label: string): Promise<number> {
  const text = await page.getByText(new RegExp(`^${label} \\d+$`, 'u')).first().innerText()
  const match = text.match(/(\d+)$/u)
  if (match === null) throw new Error(`work_tree_${label.toLowerCase()}_badge_invalid`)
  return Number(match[1])
}
function readReceiptId(status: string): string {
  const match = /Receipt\s+(\S+)\s+at revision\s+\d+/u.exec(status)
  const receiptId = match?.[1]
  if (receiptId === undefined) throw new Error('work_tree_receipt_status_invalid')
  return receiptId
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

function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value) || typeof value[key] !== 'string') return undefined
  return value[key]
}

function readRequiredString(value: unknown, key: string): string {
  const result = readString(value, key)
  if (result === undefined || result.trim().length === 0) throw new Error(`work_tree_${key}_missing`)
  return result
}

function readReason(value: unknown): string {
  return readString(value, 'reason') ?? readString(value, 'code') ?? 'unknown'
}

function requireConfig(): WorkTreeParityReleaseConfig {
  if (config === undefined) throw new Error('WorkTree parity smoke config was not loaded.')
  return config
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
