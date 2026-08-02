import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { canonicalDigest } from '../../src/modules/common/canonical-digest'

export const WORK_TREE_PARITY_EVIDENCE_CLASS = 'hosted + development-mock' as const
export const WORK_TREE_PARITY_EVIDENCE_FORMAT = 'work-tree-parity-evidence:v1' as const

export type WorkTreeParityEvidenceMetadata = Readonly<{
  sourceRevision: string
  vercelDeploymentId: string
  convexDeploymentId: string
  convexUrl?: string
  evidenceClass?: typeof WORK_TREE_PARITY_EVIDENCE_CLASS
}>
export type WorkTreeParityEvidencePacket = Readonly<{
  format: typeof WORK_TREE_PARITY_EVIDENCE_FORMAT
  evidenceClass: typeof WORK_TREE_PARITY_EVIDENCE_CLASS
  capturedAt: string
  sourceRevision: string
  vercelDeploymentId: string
  convexDeploymentId: string
  convexUrl?: string
  /** Public Customer Request route readback used as WorkTree lineage. */
  route?: unknown
  /** Redacted Clerk account binding and owner digest evidence. */
  account?: unknown
  /** Safe runtime candidate selection proof (never raw subject/email). */
  selection?: unknown
  /** Human/agent create and decision receipts plus revision/digest proof. */
  creation?: unknown
  /** Fresh browser and child-process readbacks. */
  freshReadbacks?: readonly unknown[]
  /** Cleanup/revocation proof for all temporary credentials. */
  cleanup?: unknown
  /** Legacy setup payload is accepted only for old local packets. */
  setup?: unknown
  human: unknown
  agent: unknown
  refusals: readonly unknown[]
  screenshots?: readonly Readonly<{ label: string; artifact: string }>[]
}>

const SECRET_KEY = /authorization|api[-_]?key|access[-_]?token|assertion|cookie|credential|jwt|password|secret|session[-_]?token|token|signature/iu
const SECRET_VALUE = /(?:bearer|basic)\s+[a-z0-9._~+/=-]+|(?:ak|sk|pk|key|tok|jwt|sess|cred)[-_][a-z0-9._-]+/iu
const MAX_EVIDENCE_JSON_BYTES = 256 * 1024
const MAX_EVIDENCE_DEPTH = 64
const MAX_EVIDENCE_NODES = 10_000
const encoder = new TextEncoder()

type SanitizeBudget = { nodes: number }

/**
 * The packet deliberately keeps source receipts and deployment coordinates, never
 * transport credentials or signed browser/session material.
 */
export function sanitizeWorkTreeParityEvidence(value: unknown, secrets: readonly string[] = []): unknown {
  const secretValues = workTreeParityCredentialSecrets(secrets)
  return sanitize(value, secretValues, { nodes: 0 }, 0)
}

export function workTreeParityCredentialSecrets(values: readonly (string | undefined)[]): readonly string[] {
  return values.filter((value): value is string => value !== undefined && value.trim().length > 0)
}

export function assertWorkTreeParityReadbackUnchanged(
  actual: Readonly<{ revision: number; tree: unknown }>,
  baseline: Readonly<{ revision: number; tree: unknown }>,
): void {
  if (actual.revision !== baseline.revision || canonicalDigest(actual.tree) !== canonicalDigest(baseline.tree)) {
    throw new Error('work_tree_refusal_mutated_state')
  }
}

export async function writeWorkTreeParityEvidencePacket(input: Readonly<{
  directory: string
  metadata: WorkTreeParityEvidenceMetadata
  route?: unknown
  account?: unknown
  selection?: unknown
  creation?: unknown
  freshReadbacks?: readonly unknown[]
  cleanup?: unknown
  setup?: unknown
  human: unknown
  agent: unknown
  refusals: readonly unknown[]
  trace?: Readonly<{ label: string; artifact: string }>
  screenshots?: readonly Readonly<{ label: string; artifact: string }>[]
  secrets?: readonly string[]
  now?: Date
  writeFileImpl?: typeof writeFile
}>): Promise<string> {
  assertMetadata(input.metadata)
  const secretValues = workTreeParityCredentialSecrets(input.secrets ?? [])
  const budget: SanitizeBudget = { nodes: 0 }
  const convexUrl = input.metadata.convexUrl === undefined ? undefined : new URL(input.metadata.convexUrl).href
  const packet: WorkTreeParityEvidencePacket = {
    format: WORK_TREE_PARITY_EVIDENCE_FORMAT,
    evidenceClass: WORK_TREE_PARITY_EVIDENCE_CLASS,
    capturedAt: (input.now ?? new Date()).toISOString(),
    sourceRevision: input.metadata.sourceRevision,
    vercelDeploymentId: input.metadata.vercelDeploymentId,
    convexDeploymentId: input.metadata.convexDeploymentId,
    ...(convexUrl === undefined ? {} : { convexUrl }),
    ...(input.route === undefined ? {} : { route: sanitize(input.route, secretValues, budget, 0) }),
    ...(input.account === undefined ? {} : { account: sanitize(input.account, secretValues, budget, 0) }),
    ...(input.selection === undefined ? {} : { selection: sanitize(input.selection, secretValues, budget, 0) }),
    ...(input.creation === undefined ? {} : { creation: sanitize(input.creation, secretValues, budget, 0) }),
    ...(input.freshReadbacks === undefined ? {} : { freshReadbacks: sanitize(input.freshReadbacks, secretValues, budget, 0) as readonly unknown[] }),
    ...(input.cleanup === undefined ? {} : { cleanup: sanitize(input.cleanup, secretValues, budget, 0) }),
    ...(input.setup === undefined ? {} : { setup: sanitize(input.setup, secretValues, budget, 0) }),
    human: sanitize(input.human, secretValues, budget, 0),
    agent: sanitize(input.agent, secretValues, budget, 0),
    refusals: sanitize(input.refusals, secretValues, budget, 0) as readonly unknown[],
    ...(input.screenshots === undefined ? {} : { screenshots: sanitize(input.screenshots, secretValues, budget, 0) as NonNullable<WorkTreeParityEvidencePacket['screenshots']> }),
  }
  const serialized = `${JSON.stringify(packet, null, 2)}\n`
  if (encoder.encode(serialized).byteLength > MAX_EVIDENCE_JSON_BYTES) {
    throw new Error('work_tree_parity_evidence_too_large')
  }
  const path = resolve(input.directory, 'work-tree-parity-evidence.json')
  const write = input.writeFileImpl ?? writeFile
  await mkdir(dirname(path), { recursive: true })
  await write(path, serialized, 'utf8')
  return path
}


export function assertMetadata(metadata: WorkTreeParityEvidenceMetadata): void {
  if (!/^[0-9a-f]{40}$/iu.test(metadata.sourceRevision)) {
    throw new Error('work_tree_parity_source_revision_invalid')
  }
  if (metadata.vercelDeploymentId.trim().length === 0) {
    throw new Error('work_tree_parity_vercel_deployment_id_required')
  }
  if (metadata.convexDeploymentId.trim().length === 0) {
    throw new Error('work_tree_parity_convex_deployment_id_required')
  }
  if (metadata.convexUrl !== undefined) {
    let convexUrl: URL
    try {
      convexUrl = new URL(metadata.convexUrl)
    } catch {
      throw new Error('work_tree_parity_convex_url_invalid')
    }
    if (
      convexUrl.protocol !== 'https:'
      || convexUrl.hostname.length === 0
      || /^(?:localhost|127\.0\.0\.1|::1)$/iu.test(convexUrl.hostname)
      || convexUrl.hostname.endsWith('.local')
      || convexUrl.pathname !== '/'
      || convexUrl.username.length > 0
      || convexUrl.password.length > 0
      || convexUrl.search.length > 0
      || convexUrl.hash.length > 0
    ) {
      throw new Error('work_tree_parity_convex_url_invalid')
    }
  }
  if (metadata.evidenceClass !== undefined && metadata.evidenceClass !== WORK_TREE_PARITY_EVIDENCE_CLASS) {
    throw new Error('work_tree_parity_evidence_class_invalid')
  }
}

function sanitize(value: unknown, secrets: readonly string[], budget: SanitizeBudget, depth: number): unknown {
  if (depth > MAX_EVIDENCE_DEPTH || budget.nodes >= MAX_EVIDENCE_NODES) {
    throw new Error('work_tree_parity_evidence_limit_exceeded')
  }
  budget.nodes += 1
  if (typeof value === 'string') {
    if (secrets.some((secret) => value.includes(secret))) return '[REDACTED]'
    if (SECRET_VALUE.test(value)) return '[REDACTED]'
    return value
  }
  if (Array.isArray(value)) {
    const result: unknown[] = []
    for (const entry of value) {
      if (budget.nodes >= MAX_EVIDENCE_NODES) {
        throw new Error('work_tree_parity_evidence_limit_exceeded')
      }
      result.push(sanitize(entry, secrets, budget, depth + 1))
    }
    return result
  }
  if (value === null || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (budget.nodes >= MAX_EVIDENCE_NODES) {
      throw new Error('work_tree_parity_evidence_limit_exceeded')
    }
    result[key] = SECRET_KEY.test(key) ? '[REDACTED]' : sanitize(entry, secrets, budget, depth + 1)
  }
  return result
}
