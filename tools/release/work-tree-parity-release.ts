import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

import { parseCustomerRequestReleaseReadback, verifyCustomerRequestHostedRevision, type CustomerRequestReleaseReadback } from '../../src/modules/customer-request/release-readback'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import { gardenerVerbDigest, gardenerVerbSchema, type GardenerVerb } from '../../src/modules/work-tree/convex'

import {
  WORK_TREE_PARITY_EVIDENCE_CLASS,
  assertMetadata,
  type WorkTreeParityEvidenceMetadata,
} from './work-tree-parity-evidence'

export const WORK_TREE_AGENT_PATH = '/api/v1/work-tree' as const
export const WORK_TREE_PARITY_DEFAULT_CHARTER = 'My BAS is overdue and my books are a mess' as const
export const WORK_TREE_PARITY_DEFAULT_TIMEOUT_MS = 180_000

export type WorkTreeParityReleaseConfig = Readonly<{
  baseUrl: URL
  convexUrl: URL
  sourceRevision: string
  vercelDeploymentId: string
  convexDeploymentId: string
  clerkSecretKey?: string
  clerkInstanceId?: string
  charterText: string
  selectionSeed: string
  evidenceDirectory: string
  timeoutMs: number
  releaseMode: boolean
  vercelBypassSecret?: string
}>

export type WorkTreeAgentOperation = 'create' | 'inspect' | 'apply' | 'decide'

export type WorkTreeAgentHttpResult = Readonly<{
  operation: WorkTreeAgentOperation
  status: number
  ok: boolean
  body: unknown
}>

export type WorkTreeAgentClient = Readonly<{
  request(operation: WorkTreeAgentOperation, input: Record<string, unknown>): Promise<WorkTreeAgentHttpResult>
  create(input: Record<string, unknown>): Promise<WorkTreeAgentHttpResult>
  inspect(input: Record<string, unknown>): Promise<WorkTreeAgentHttpResult>
  apply(input: Record<string, unknown>): Promise<WorkTreeAgentHttpResult>
  decide(input: Record<string, unknown>): Promise<WorkTreeAgentHttpResult>
}>

export const BAS_DEVELOPMENT_CHILDREN = [
  {
    kind: 'decision' as const,
    title: 'Choose how your BAS gets brought up to date',
    description: 'Three ways to clear the overdue lodgement. Development mock — not a provider quote or fulfilment.',
    priority: 3,
    evidenceRefs: ['ae:development-mock/bas-v1'],
  },
  {
    kind: 'task' as const,
    title: 'Gather the last four quarters of records',
    description: 'Bank statements, invoices and receipts for the overdue period. Development mock — not a provider quote or fulfilment.',
    priority: 2,
    effort: { humanMinutes: 90 },
    evidenceRefs: ['ae:development-mock/bas-v1'],
  },
  {
    kind: 'task' as const,
    title: 'Reconcile the books before lodgement',
    description: 'Match the records against the ledger so the lodgement is defensible. Development mock — not a provider quote or fulfilment.',
    priority: 1,
    evidenceRefs: ['ae:development-mock/bas-v1'],
  },
] as const

export const BAS_DEVELOPMENT_DECISION_CHILDREN = [
  {
    kind: 'task' as const,
    title: 'Brief whoever does the work on the option you pick',
    description: 'Hand over the reconciled records and the chosen path. Development mock — not a provider quote or fulfilment.',
    priority: 2,
    evidenceRefs: ['ae:development-mock/bas-v1'],
  },
] as const

export const BAS_DEVELOPMENT_OPTIONS = [
  {
    optionId: 'bookkeeper-catch-up',
    label: 'Bookkeeper catch-up, then lodge',
    summary: 'A bookkeeper reconciles the overdue quarters and a registered agent lodges. Development mock — not a provider quote or fulfilment.',
  },
  {
    optionId: 'accountant-full-review',
    label: 'Accountant reviews the whole year',
    summary: 'Slower and dearer, but the prior quarters get corrected too. Development mock — not a provider quote or fulfilment.',
  },
  {
    optionId: 'self-lodge-with-extension',
    label: 'Request an extension and self-lodge',
    summary: 'Cheapest, and the reconciliation work stays with you. Development mock — not a provider quote or fulfilment.',
  },
] as const

export function workTreeParityConfigFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): WorkTreeParityReleaseConfig {
  const baseUrl = parseDeployedUrl('DEPLOY_BASE_URL', required(env, 'DEPLOY_BASE_URL'))
  const convexUrl = parseDeployedUrl('DEPLOY_CONVEX_URL', required(env, 'DEPLOY_CONVEX_URL'))
  const sourceRevision = requiredAny(env, ['AE_RELEASE_SOURCE_REVISION', 'VERCEL_GIT_COMMIT_SHA', 'GITHUB_SHA'])
  if (!/^[0-9a-f]{40}$/iu.test(sourceRevision)) throw new Error('AE_RELEASE_SOURCE_REVISION_invalid')
  const vercelDeploymentId = requiredAny(env, ['AE_RELEASE_DEPLOYMENT_ID', 'VERCEL_DEPLOYMENT_ID'])
  const convexDeploymentId = validateHostedConvexDeploymentId(requiredAny(env, ['AE_RELEASE_CONVEX_DEPLOYMENT_ID', 'CONVEX_DEPLOYMENT_ID', 'CONVEX_DEPLOYMENT']))
  assertMetadata({ sourceRevision, vercelDeploymentId, convexDeploymentId })
  const releaseMode = isT51ReleaseMode(env)
  const clerkSecretKey = optional(env, 'CLERK_SECRET_KEY')
  const clerkInstanceId = optional(env, 'AE_WORK_TREE_CLERK_INSTANCE_ID')
    ?? optional(env, 'AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID')
  if (releaseMode) {
    if (clerkSecretKey === undefined) throw new Error('CLERK_SECRET_KEY_required')
    if (clerkInstanceId === undefined) throw new Error('AE_WORK_TREE_CLERK_INSTANCE_ID_required')
  }
  const charterText = optional(env, 'AE_WORK_TREE_CHARTER') ?? WORK_TREE_PARITY_DEFAULT_CHARTER
  if (charterText.length === 0 || charterText.length > 4_000) throw new Error('AE_WORK_TREE_CHARTER_invalid')
  const selectionSeed = optional(env, 'AE_T51_SELECTION_SEED')
    ?? canonicalDigest({ sourceRevision, charterText, surface: 't51-work-tree' })
  const evidenceDirectory = resolve(optional(env, 'AE_WORK_TREE_EVIDENCE_DIR') ?? 'output/release/work-tree-parity')
  const timeoutMs = parseTimeout(optional(env, 'AE_WORK_TREE_TIMEOUT_MS'))
  const bypassSecret = resolveVercelProtectionBypassSecret(env)
  return {
    baseUrl,
    convexUrl,
    sourceRevision,
    vercelDeploymentId,
    convexDeploymentId,
    ...(clerkSecretKey === undefined ? {} : { clerkSecretKey }),
    ...(clerkInstanceId === undefined ? {} : { clerkInstanceId }),
    charterText,
    selectionSeed,
    evidenceDirectory,
    timeoutMs,
    releaseMode,
    ...(bypassSecret === undefined ? {} : { vercelBypassSecret: bypassSecret }),
  }
}

/** Only an explicitly named release invocation may require hosted secrets. */
export function isT51ReleaseMode(env: Record<string, string | undefined> = process.env): boolean {
  const mode = optional(env, 'AE_T51_RELEASE_MODE')?.toLowerCase()
  return mode === 'release' || mode === 'true' || mode === '1'
}

export function resolveVercelProtectionBypassSecret(
  env: Record<string, string | undefined>,
): string | undefined {
  return optional(env, 'VERCEL_AUTOMATION_BYPASS_SECRET')
    ?? optional(env, 'AE_CUSTOMER_REQUEST_VERCEL_BYPASS_SECRET')
}

export function metadataFromWorkTreeParityConfig(config: WorkTreeParityReleaseConfig): WorkTreeParityEvidenceMetadata {
  return {
    sourceRevision: config.sourceRevision,
    vercelDeploymentId: config.vercelDeploymentId,
    convexDeploymentId: config.convexDeploymentId,
    convexUrl: config.convexUrl.href,
    evidenceClass: WORK_TREE_PARITY_EVIDENCE_CLASS,
  }
}
export async function readAndVerifyWorkTreeParityRelease(input: Readonly<{
  baseUrl: URL
  agentApiKey: string
  expectedRevision: string
  expectedVercelDeploymentId: string
  expectedConvexDeploymentId: string
  expectedConvexUrl: URL | string
  fetchImpl?: typeof globalThis.fetch
  bypassSecret?: string
}>): Promise<Readonly<{
  kind: 'verified'
  revision: string
  deploymentId: string
  convexDeploymentId: string
  convexUrl: string
  readback: CustomerRequestReleaseReadback
}>> {
  const headers = new Headers({
    Accept: 'application/json',
    Authorization: `Bearer ${input.agentApiKey}`,
  })
  if (input.bypassSecret?.trim()) headers.set('x-vercel-protection-bypass', input.bypassSecret.trim())
  const response = await (input.fetchImpl ?? globalThis.fetch)(new URL('/api/v1/release', input.baseUrl), {
    method: 'GET',
    headers,
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`hosted_release_readback_failed:${response.status}`)
  const readback = parseCustomerRequestReleaseReadback(await response.json())
  const verified = verifyCustomerRequestHostedRevision({
    expectedRevision: input.expectedRevision,
    expectedDeploymentId: input.expectedVercelDeploymentId,
    expectedConvexDeploymentId: input.expectedConvexDeploymentId,
    expectedConvexUrl: String(input.expectedConvexUrl),
    readback,
  })
  const convex = readback.deployment.convex
  if (convex === undefined) throw new Error('hosted_release_convex_identity_missing')
  return {
    ...verified,
    convexDeploymentId: convex.id,
    convexUrl: convex.url,
    readback,
  }
}

export function createWorkTreeAgentClient(input: Readonly<{
  baseUrl: URL
  agentApiKey: string
  fetchImpl?: typeof globalThis.fetch
  bypassSecret?: string
}>): WorkTreeAgentClient {
  if (input.agentApiKey.trim().length === 0) throw new Error('work_tree_agent_api_key_required')
  const request = async (operation: WorkTreeAgentOperation, body: Record<string, unknown>): Promise<WorkTreeAgentHttpResult> => {
    const headers = new Headers({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.agentApiKey}`,
    })
    if (input.bypassSecret?.trim()) headers.set('x-vercel-protection-bypass', input.bypassSecret.trim())
    const response = await (input.fetchImpl ?? globalThis.fetch)(new URL(`${WORK_TREE_AGENT_PATH}/${operation}`, input.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'error',
    })
    const payload = await readJson(response)
    if (response.status === 404 || response.status === 405) throw new Error(`work_tree_${operation}_seam_missing`)
    return { operation, status: response.status, ok: response.ok, body: payload }
  }
  return {
    request,
    create: (body) => request('create', body),
    inspect: (body) => request('inspect', body),
    apply: (body) => request('apply', body),
    decide: (body) => request('decide', body),
  }
}

export function signGardenerVerb<T extends Record<string, unknown>>(unsigned: T): GardenerVerb {
  const normalized = gardenerVerbSchema.parse({ ...unsigned, proposalDigest: 'unsigned' })
  return { ...normalized, proposalDigest: gardenerVerbDigest(normalized) }
}

export function decisionCommand(input: Readonly<{
  projectId: string
  nodeId: string
  kind: 'lock' | 'adjust' | 'park'
  expectedGeneration: number
  expectedRevision: number
  idempotencyKey?: string
  stepUp?: Record<string, unknown>
}>): Record<string, unknown> {
  const proposal = {
    projectId: input.projectId,
    nodeId: input.nodeId,
    kind: input.kind,
    expectedGeneration: input.expectedGeneration,
    expectedRevision: input.expectedRevision,
  }
  return {
    ...proposal,
    proposalDigest: canonicalDigest(proposal),
    idempotencyKey: input.idempotencyKey ?? `t51:decision:${randomUUID()}`,
    ...(input.stepUp === undefined ? {} : { stepUp: input.stepUp }),
  }
}

export function parseTimeout(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) return WORK_TREE_PARITY_DEFAULT_TIMEOUT_MS
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 5_000 || parsed > 900_000) throw new Error('AE_WORK_TREE_TIMEOUT_MS_invalid')
  return parsed
}

function parseDeployedUrl(name: string, value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name}_invalid`)
  }
  if (url.protocol !== 'https:' || /^(?:localhost|127\.0\.0\.1|::1)$/iu.test(url.hostname) || url.hostname.endsWith('.local')) {
    throw new Error(`${name}_deployed_https_required`)
  }
  return url
}

function required(env: Record<string, string | undefined>, key: string): string {
  const value = optional(env, key)
  if (value === undefined) throw new Error(`${key}_required`)
  return value
}

function requiredAny(env: Record<string, string | undefined>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = optional(env, key)
    if (value !== undefined) return value
  }
  throw new Error(`${keys[0]}_required`)
}

function validateHostedConvexDeploymentId(value: string): string {
  const normalized = value.toLowerCase()
  if (
    normalized === 'unavailable_not_deployed'
    || normalized === 'local'
    || normalized.startsWith('local:')
    || normalized === 'anonymous'
    || normalized.startsWith('anonymous:')
    || normalized.startsWith('convex:')
    || normalized.includes('://')
  ) {
    throw new Error('AE_RELEASE_CONVEX_DEPLOYMENT_ID_invalid')
  }
  return value
}

function optional(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key]?.trim()
  return value === undefined || value.length === 0 ? undefined : value
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.trim().length === 0) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { kind: 'unknown', reason: text.slice(0, 200) }
  }
}
