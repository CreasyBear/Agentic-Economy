import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadEnv } from 'vite'

import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import { isRecord } from '../../src/modules/common/is-record'
import {
  gardenerVerbDigest,
  gardenerVerbSchema,
  type GardenerVerb,
} from '../../src/modules/work-tree/convex'
import {
  workTreeApplyResultSchema,
  workTreeCreateResultSchema,
  workTreeDecisionReceiptSchema,
  workTreeInspectResultSchema,
  workTreeReadbackSchema,
  type WorkTree,
} from '../../src/modules/work-tree/work-tree.functions'
import { withTemporaryClerkApiKey } from '../release/customer-request-production-credential'

const DEFAULT_APP_BASE_URL = 'http://127.0.0.1:3024'
const DEFAULT_OUTCOME = 'Get my BAS lodged before the quarter.'
const DEVELOPMENT_DATA_LABEL = 'MOCK/DEVELOPMENT ONLY'
const EVIDENCE_CLASS = 'local development deployment + labelled mock data'
const DEVELOPMENT_EVIDENCE_REF = 'ae:development-mock/work-tree-loop'

export type WorkTreeDevelopmentSmokeConfig = Readonly<{
  baseUrl: string
  convexUrl: string
  convexDeployment: string
  clerkSecretKey: string
  clerkInstanceId: string
  clerkSubject: string
  sourceRevision: string
  outcome: string
  fetch: typeof globalThis.fetch
}>

type WorkTreeOperation = 'create' | 'inspect' | 'apply' | 'decide'
type JsonRecord = Record<string, unknown>
type DevelopmentNodeDraft = Readonly<{
  kind: 'package' | 'decision' | 'task' | 'study'
  title: string
  description?: string
  priority?: number
  evidenceRefs?: readonly string[]
}>
type UnsignedGardenerVerb =
  | Readonly<{
      kind: 'elaborate'
      targetNodeId: string
      expectedGeneration: number
      expectedRevision: number
      children: readonly DevelopmentNodeDraft[]
    }>
  | Readonly<{
      kind: 'study'
      targetNodeId: string
      expectedGeneration: number
      expectedRevision: number
      studyBrief: string
      criteriaFromCharter: readonly string[]
    }>
  | Readonly<{
      kind: 'propose_decision'
      targetNodeId: string
      expectedGeneration: number
      expectedRevision: number
      options: readonly Readonly<{ optionId: string; label: string; summary: string }>[]
      recommendation?: string
    }>

type SmokeStep = Readonly<{
  name: string
  kind: string
  projectId?: string
  nodeId?: string
  revision?: number
  receiptId?: string
}>

export function workTreeDevelopmentSmokeConfig(
  env: Record<string, string | undefined>,
  sourceRevision = env.AE_RELEASE_SOURCE_REVISION ?? currentSourceRevision(),
): WorkTreeDevelopmentSmokeConfig {
  const baseUrl = normalizeLocalAppUrl(
    env.AE_WORK_TREE_BASE_URL ?? env.AE_CUSTOMER_REQUEST_BASE_URL ?? DEFAULT_APP_BASE_URL,
  )
  const convexUrl = normalizeLocalConvexUrl(required(
    env.VITE_CONVEX_URL ?? env.CONVEX_URL,
    'VITE_CONVEX_URL',
  ))
  return {
    baseUrl,
    convexUrl,
    convexDeployment: normalizeLocalConvexDeployment(required(env.CONVEX_DEPLOYMENT, 'CONVEX_DEPLOYMENT')),
    clerkSecretKey: required(env.CLERK_SECRET_KEY, 'CLERK_SECRET_KEY'),
    clerkInstanceId: required(env.AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID, 'AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID'),
    clerkSubject: required(env.AE_CUSTOMER_REQUEST_CLERK_SUBJECT, 'AE_CUSTOMER_REQUEST_CLERK_SUBJECT'),
    sourceRevision: validateSourceRevision(sourceRevision),
    outcome: (env.AE_WORK_TREE_OUTCOME ?? DEFAULT_OUTCOME).trim() || DEFAULT_OUTCOME,
    fetch: globalThis.fetch,
  }
}

export async function runWorkTreeDevelopmentSmoke(config: WorkTreeDevelopmentSmokeConfig) {
  await assertConvexServer(config)
  await assertAppServer(config)
  const runId = randomUUID()
  const steps: SmokeStep[] = []
  let evidence: Readonly<{
    projectId: string
    treeId: string
    receiptId: string
    generation: number
    revision: number
    eventKinds: readonly string[]
    decisionStatus: string
  }> | undefined

  await withTemporaryClerkApiKey({
    clerkSecretKey: config.clerkSecretKey,
    expectedInstanceId: config.clerkInstanceId,
    subject: config.clerkSubject,
    scopes: [
      'customer_requests:create',
      'customer_requests:approve_each',
      'work_trees:create',
      'work_trees:inspect',
      'work_trees:apply',
      'work_trees:decide',
    ],
    fetch: config.fetch,
    keyNamePrefix: 'AE WorkTree development smoke',
    revocationReason: 'WorkTree development smoke completed',
    run: async (agentApiKey) => {
      const create = workTreeCreateResultSchema.parse(await callWorkTree(config, agentApiKey, 'create', {
        idempotencyKey: `work-tree-development-smoke:${runId}`,
        charterText: config.outcome,
        lineage: { kind: 'standalone' },
      }))
      if (create.kind === 'refused') throw seamRefused('workTree.create', create.code)
      const projectId = create.readback.projectId
      const treeId = create.readback.treeId
      steps.push({ name: 'create', kind: create.kind, projectId, revision: create.readback.revision })

      let tree = create.readback.tree
      const root = requireNode(tree, (node) => node.parentId === undefined, 'root')
      const elaboratedRoot = await applyElaborate(config, agentApiKey, projectId, tree, root.nodeId, 'root', [
        {
          kind: 'study',
          title: 'Study labelled development options',
          description: `Compare bounded options using ${DEVELOPMENT_DATA_LABEL}.`,
          priority: 2,
          evidenceRefs: [DEVELOPMENT_EVIDENCE_REF],
        },
        {
          kind: 'decision',
          title: 'Choose the next BAS step',
          description: `A decision proposal backed by ${DEVELOPMENT_DATA_LABEL}; not a provider commitment.`,
          priority: 3,
          evidenceRefs: [DEVELOPMENT_EVIDENCE_REF],
        },
      ], steps)
      tree = elaboratedRoot

      const studyNode = requireNode(tree, (node) => node.kind === 'study' && node.parentId === root.nodeId, 'study')
      const decisionNode = requireNode(tree, (node) => node.kind === 'decision' && node.parentId === root.nodeId, 'decision')
      tree = await applyElaborate(config, agentApiKey, projectId, tree, studyNode.nodeId, 'study', [{
        kind: 'task',
        title: 'Review labelled study output',
        description: `This task contains ${DEVELOPMENT_DATA_LABEL} only.`,
        priority: 1,
        evidenceRefs: [DEVELOPMENT_EVIDENCE_REF],
      }], steps)
      tree = await applyElaborate(config, agentApiKey, projectId, tree, decisionNode.nodeId, 'decision', [{
        kind: 'task',
        title: 'Record the chosen development path',
        description: `No booking, payment, or fulfilment is performed; ${DEVELOPMENT_DATA_LABEL}.`,
        priority: 1,
        evidenceRefs: [DEVELOPMENT_EVIDENCE_REF],
      }], steps)

      const studyVerb = signVerb({
        kind: 'study',
        targetNodeId: studyNode.nodeId,
        expectedGeneration: tree.generation,
        expectedRevision: tree.revision,
        studyBrief: `Study the BAS outcome with ${DEVELOPMENT_DATA_LABEL}.`,
        criteriaFromCharter: ['bounded development evidence', 'next-step clarity'],
      })
      const study = await applyVerb(config, agentApiKey, projectId, tree, studyVerb, 'study', steps)
      tree = study.receipt.tree

      const proposalVerb = signVerb({
        kind: 'propose_decision',
        targetNodeId: decisionNode.nodeId,
        expectedGeneration: tree.generation,
        expectedRevision: tree.revision,
        options: [
          {
            optionId: 'development-review',
            label: 'Review with a labelled development cohort',
            summary: `Development-only next step; ${DEVELOPMENT_DATA_LABEL}.`,
          },
          {
            optionId: 'stop-and-ask',
            label: 'Stop and ask for missing records',
            summary: 'Refuses to infer completion or provider fulfilment.',
          },
        ],
        recommendation: 'development-review',
      })
      const proposal = await applyVerb(config, agentApiKey, projectId, tree, proposalVerb, 'propose', steps)
      tree = proposal.receipt.tree

      const inspectedInbox = await inspectWorkTree(config, agentApiKey, projectId, 'inbox', steps)
      const proposedDecision = requireNode(inspectedInbox.tree, (node) => node.nodeId === decisionNode.nodeId, 'inbox decision')
      if (proposedDecision.status !== 'ready') {
        throw new Error(`workTree.inbox_missing_decision_ready:${proposedDecision.status}`)
      }
      if (!inspectedInbox.events.some((event) => event.kind === 'decision_proposed')) {
        throw new Error('workTree.inbox_missing_decision_proposed_event')
      }

      const decisionProposalDigest = canonicalDigest({
        projectId,
        nodeId: decisionNode.nodeId,
        kind: 'lock',
        expectedGeneration: inspectedInbox.generation,
        expectedRevision: inspectedInbox.revision,
      })
      const locked = workTreeDecisionReceiptSchema.parse(await callWorkTree(config, agentApiKey, 'decide', {
        projectId,
        nodeId: decisionNode.nodeId,
        kind: 'lock',
        expectedGeneration: inspectedInbox.generation,
        expectedRevision: inspectedInbox.revision,
        proposalDigest: decisionProposalDigest,
        idempotencyKey: `work-tree-development-smoke:${runId}:lock`,
      }))
      if (locked.kind === 'refused') {
        throw seamRefused(
          'workTree.decide',
          'refusalCode' in locked ? locked.refusalCode : locked.code,
        )
      }
      if (locked.kind === 'unknown') throw new Error('workTree.decide_unknown_before_reload')
      if (!('receiptId' in locked)) throw new Error('workTree.decide_receipt_missing')
      if (locked.decision !== 'lock' || locked.disposition !== 'locked') {
        throw new Error(`workTree.decide_lock_receipt_invalid:${locked.disposition}`)
      }
      const lockedReceiptId = locked.receiptId
      steps.push({
        name: 'lock',
        kind: locked.kind,
        projectId,
        nodeId: locked.nodeId,
        revision: locked.revision,
        receiptId: lockedReceiptId,
      })
      steps.push({
        name: 'receipt',
        kind: locked.kind,
        projectId,
        nodeId: locked.nodeId,
        revision: locked.revision,
        receiptId: lockedReceiptId,
      })

      const reloaded = await inspectWorkTree(config, agentApiKey, projectId, 'reload', steps)
      const reloadedDecision = requireNode(reloaded.tree, (node) => node.nodeId === decisionNode.nodeId, 'reloaded decision')
      if (reloadedDecision.status !== 'locked') {
        throw new Error(`workTree.reload_lock_missing:${reloadedDecision.status}`)
      }
      const matchingReceipt = reloaded.receipts.find((receipt) => 'receiptId' in receipt && receipt.receiptId === lockedReceiptId)
      if (matchingReceipt === undefined || !('revision' in matchingReceipt)) {
        throw new Error('workTree.reload_receipt_missing')
      }
      if (matchingReceipt.kind !== locked.kind || matchingReceipt.revision !== locked.revision) {
        throw new Error('workTree.reload_receipt_semantics_changed')
      }
      evidence = {
        projectId,
        treeId,
        receiptId: lockedReceiptId,
        generation: reloaded.generation,
        revision: reloaded.revision,
        eventKinds: reloaded.events.map((event) => event.kind),
        decisionStatus: reloadedDecision.status,
      }
    },
  })

  if (evidence === undefined) throw new Error('work_tree_development_evidence_missing')
  const packet = {
    kind: 'work_tree_development_smoke',
    evidenceClass: EVIDENCE_CLASS,
    dataLabel: DEVELOPMENT_DATA_LABEL,
    sourceRevision: config.sourceRevision,
    deployment: {
      convexUrl: config.convexUrl,
      convexDeployment: config.convexDeployment,
      appBaseUrl: config.baseUrl,
    },
    outcomeDigest: canonicalDigest(config.outcome),
    sequence: ['outcome', 'create', 'elaborate', 'study', 'propose', 'inbox', 'lock', 'receipt', 'reload_readback'],
    steps,
    ...evidence,
    secrets: 'omitted',
  } as const
  process.stdout.write(`${JSON.stringify(packet)}\n`)
  return packet
}

async function applyElaborate(
  config: WorkTreeDevelopmentSmokeConfig,
  agentApiKey: string,
  projectId: string,
  tree: WorkTree,
  targetNodeId: string,
  name: string,
  children: readonly DevelopmentNodeDraft[],
  steps: SmokeStep[],
): Promise<WorkTree> {
  const verb = signVerb({
    kind: 'elaborate',
    targetNodeId,
    expectedGeneration: tree.generation,
    expectedRevision: tree.revision,
    children: [...children],
  })
  const applied = await applyVerb(config, agentApiKey, projectId, tree, verb, `elaborate_${name}`, steps)
  return applied.receipt.tree
}

async function applyVerb(
  config: WorkTreeDevelopmentSmokeConfig,
  agentApiKey: string,
  projectId: string,
  tree: WorkTree,
  verb: GardenerVerb,
  name: string,
  steps: SmokeStep[],
) {
  if (verb.expectedGeneration !== tree.generation || verb.expectedRevision !== tree.revision) {
    throw new Error(`workTree.${name}_fence_not_current`)
  }
  const applied = workTreeApplyResultSchema.parse(await callWorkTree(config, agentApiKey, 'apply', {
    projectId,
    operationKey: `work-tree-development-smoke:${projectId}:${name}:${verb.targetNodeId}`,
    correlationId: `work-tree-development-smoke:${projectId}`,
    verb,
  }))
  if (applied.kind === 'refused') throw seamRefused(`workTree.apply:${name}`, applied.reason)
  if (applied.kind === 'unknown') throw new Error(`workTree.apply:${name}_unknown`)
  steps.push({
    name,
    kind: applied.kind,
    projectId,
    nodeId: verb.targetNodeId,
    revision: applied.receipt.tree.revision,
  })
  return applied
}

async function inspectWorkTree(
  config: WorkTreeDevelopmentSmokeConfig,
  agentApiKey: string,
  projectId: string,
  name: string,
  steps: SmokeStep[],
) {
  const inspected = workTreeInspectResultSchema.parse(await callWorkTree(config, agentApiKey, 'inspect', { projectId }))
  if (inspected.kind === 'refused') throw seamRefused(`workTree.inspect:${name}`, inspected.code)
  const readback = workTreeReadbackSchema.parse(inspected.readback)
  steps.push({ name, kind: inspected.kind, projectId, revision: readback.revision })
  return readback
}

async function callWorkTree(
  config: WorkTreeDevelopmentSmokeConfig,
  agentApiKey: string,
  operation: WorkTreeOperation,
  input: JsonRecord,
): Promise<unknown> {
  const response = await config.fetch(`${config.baseUrl}/api/v1/work-tree/${operation}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${agentApiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(input),
  })
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(`workTree.${operation}_invalid_json:${response.status}`)
  }
  if (!response.ok) {
    const refusal = bodyRecord(body)
    const reason = typeof refusal.reason === 'string' ? refusal.reason : typeof refusal.code === 'string' ? refusal.code : 'http_refused'
    throw new Error(`workTree.${operation}_http_${response.status}:${reason}`)
  }
  const record = bodyRecord(body)
  if (record.kind === 'unknown') {
    const reason = typeof record.reason === 'string' ? record.reason : 'unknown'
    throw new Error(`workTree.${operation}_unknown:${reason}`)
  }
  return body
}

async function assertConvexServer(config: WorkTreeDevelopmentSmokeConfig): Promise<void> {
  let response: Response
  try {
    response = await config.fetch(`${config.convexUrl}/`, { headers: { accept: 'application/json' } })
  } catch (error) {
    throw new Error('convex_dev_server_unavailable', { cause: error })
  }
  if (response.status >= 500) throw new Error(`convex_dev_server_unavailable:${response.status}`)
}

async function assertAppServer(config: WorkTreeDevelopmentSmokeConfig): Promise<void> {
  let response: Response
  try {
    // `redirect: manual` because a Clerk-enabled dev server answers a cold
    // browser-like request with its dev-handshake redirect; reachability is
    // any non-5xx answer, not a completed HTML render.
    response = await config.fetch(`${config.baseUrl}/`, { headers: { accept: 'text/html' }, redirect: 'manual' })
  } catch (error) {
    throw new Error('app_dev_server_unavailable', { cause: error })
  }
  if (response.status >= 500) throw new Error(`app_dev_server_unavailable:${response.status}`)
}

function signVerb(unsigned: UnsignedGardenerVerb): GardenerVerb {
  // Parse first so schema defaults (draft status/dependsOn/priority) are part
  // of the digested verb, matching the source-side normalization exactly.
  const normalized = gardenerVerbSchema.parse({ ...unsigned, proposalDigest: 'unsigned' })
  return { ...normalized, proposalDigest: gardenerVerbDigest(normalized) }
}

function requireNode(
  tree: WorkTree,
  predicate: (node: WorkTree['nodes'][number]) => boolean,
  name: string,
) {
  const node = tree.nodes.find(predicate)
  if (node === undefined) throw new Error(`workTree.${name}_node_missing`)
  return node
}

function seamRefused(seam: string, reason: string | undefined): Error {
  return new Error(`${seam}_refused:${reason ?? 'unknown'}`)
}

function bodyRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {}
}

function currentSourceRevision(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

function normalizeLocalAppUrl(value: string): string {
  return normalizeLoopbackOrigin(value, 'AE_WORK_TREE_BASE_URL')
}

function normalizeLocalConvexUrl(value: string): string {
  return normalizeLoopbackOrigin(value, 'VITE_CONVEX_URL', 3210)
}

function normalizeLoopbackOrigin(value: string, name: string, expectedPort?: number): string {
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    throw new Error(`${name} must be the exact local development origin`)
  }
  const validPort = expectedPort === undefined
    ? /^[1-9][0-9]{0,4}$/u.test(parsed.port)
    : parsed.port === String(expectedPort)
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !validPort
    || parsed.username !== '' || parsed.password !== '' || parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
    const expected = expectedPort === undefined ? 'http://127.0.0.1:<port>' : `http://127.0.0.1:${expectedPort}`
    throw new Error(`${name} must be the exact local development origin ${expected}`)
  }
  return parsed.origin
}

function normalizeLocalConvexDeployment(value: string): string {
  const match = /^(?:dev:([a-z0-9-]+)|local:([a-z0-9_-]+))$/u.exec(value.trim())
  const deploymentName = match?.[1] ?? match?.[2]
  if (deploymentName === undefined) throw new Error('CONVEX_DEPLOYMENT must name an exact local development deployment')
  return `convex:${deploymentName}`
}

function validateSourceRevision(value: string): string {
  if (!/^[a-f0-9]{40}$/u.test(value)) throw new Error('development source revision must be an exact Git commit')
  return value
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}

async function main(): Promise<void> {
  const fileEnv = loadEnv('development', process.cwd(), '')
  await runWorkTreeDevelopmentSmoke(workTreeDevelopmentSmokeConfig({ ...fileEnv, ...process.env }))
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? `FAIL ${error.message}` : 'FAIL unexpected_error')
    process.exitCode = 1
  })
}
