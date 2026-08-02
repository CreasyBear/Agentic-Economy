import { randomUUID } from 'node:crypto'

import { isRecord } from '../../src/modules/common/is-record'

import {
  WORK_TREE_PARITY_EVIDENCE_CLASS,
  type WorkTreeParityEvidenceMetadata,
} from './work-tree-parity-evidence'

export const WORK_TREE_SETUP_DEFAULT_PATH = '/api/v1/work-tree/setup' as const
export const WORK_TREE_SETUP_COHORT = 'bas-development' as const
export type WorkTreeSetupReadback = Readonly<{
  kind: 'accepted' | 'replayed'
  cohort: typeof WORK_TREE_SETUP_COHORT
  evidenceClass: 'development-mock' | typeof WORK_TREE_PARITY_EVIDENCE_CLASS
  ownerSubject: string
  projectId: string
  wrongPrincipalProjectId: string
  createIdempotencyKey: string
  charterText: string
  sharedPrincipalRef: string
  setupRef?: string
  releaseIdentity?: Readonly<{
    sourceRevision: string
    vercelDeploymentId: string
    convexDeploymentId: string
    convexUrl: string
  }>
}>

export type WorkTreeSetupRequest = Readonly<{
  cohort: typeof WORK_TREE_SETUP_COHORT
  evidenceClass: typeof WORK_TREE_PARITY_EVIDENCE_CLASS
  ownerSubject: string
  operationKey: string
  createIdempotencyKey: string
  charterText: string
  sourceRevision: string
  vercelDeploymentId: string
  convexDeploymentId: string
  convexUrl: string
}>

export type WorkTreeSetupConfig = Readonly<{
  baseUrl: URL
  setupPath: string
  setupToken: string
  ownerSubject: string
  metadata: WorkTreeParityEvidenceMetadata
  charterText: string
  operationKey?: string
  createIdempotencyKey?: string
  convexUrl?: URL | string
  fetchImpl?: typeof globalThis.fetch
  bypassSecret?: string
}>

export async function seedHostedWorkTreeCohort(input: WorkTreeSetupConfig): Promise<WorkTreeSetupReadback> {
  if (input.setupToken.trim().length === 0) throw new Error('AE_WORK_TREE_SETUP_TOKEN_required')
  const ownerSubject = input.ownerSubject.trim()
  if (ownerSubject.length === 0) throw new Error('work_tree_setup_owner_subject_required')
  const path = validateSetupPath(input.setupPath)
  const operationKey = input.operationKey?.trim() || `t51:setup:${randomUUID()}`
  const createIdempotencyKey = input.createIdempotencyKey?.trim() || `t51:create:${randomUUID()}`
  const charterText = input.charterText.trim()
  if (charterText.length === 0) throw new Error('work_tree_setup_charter_required')
  const convexUrl = resolveConvexSetupUrl(input)
  const body: WorkTreeSetupRequest = {
    cohort: WORK_TREE_SETUP_COHORT,
    evidenceClass: WORK_TREE_PARITY_EVIDENCE_CLASS,
    ownerSubject,
    operationKey,
    createIdempotencyKey,
    charterText,
    sourceRevision: input.metadata.sourceRevision,
    vercelDeploymentId: input.metadata.vercelDeploymentId,
    convexDeploymentId: input.metadata.convexDeploymentId,
    convexUrl,
  }
  const headers = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${input.setupToken}`,
  })
  if (input.bypassSecret?.trim()) headers.set('x-vercel-protection-bypass', input.bypassSecret.trim())
  const response = await (input.fetchImpl ?? globalThis.fetch)(new URL(path, input.baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    redirect: 'error',
  })
  const payload = await readJson(response)
  if (response.status === 404 || response.status === 405 || response.status === 501 || isMissingSeamPayload(payload)) {
    throw new Error('work_tree_setup_seam_missing')
  }
  if (!response.ok) {
    const reason = readString(payload, 'reason') ?? readString(payload, 'code') ?? `http_${response.status}`
    throw new Error(`work_tree_setup_failed:${reason}`)
  }
  return parseSetupReadback(payload, ownerSubject, {
    sourceRevision: input.metadata.sourceRevision,
    vercelDeploymentId: input.metadata.vercelDeploymentId,
    convexDeploymentId: input.metadata.convexDeploymentId,
    convexUrl,
  }, input.metadata.convexUrl !== undefined)
}

export function validateSetupPath(value: string): string {
  const path = value.trim()
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('?') || path.includes('#')) {
    throw new Error('AE_WORK_TREE_SETUP_PATH_invalid')
  }
  return path
}

function parseSetupReadback(
  value: unknown,
  expectedOwnerSubject: string,
  expectedIdentity?: Readonly<{
    sourceRevision: string
    vercelDeploymentId: string
    convexDeploymentId: string
    convexUrl: string
  }>,
  requireIdentity = false,
): WorkTreeSetupReadback {
  if (!isRecord(value)) throw new Error('work_tree_setup_readback_invalid')
  const kind = value.kind
  if (kind !== 'accepted' && kind !== 'replayed') throw new Error('work_tree_setup_readback_invalid')
  if (value.cohort !== WORK_TREE_SETUP_COHORT) throw new Error('work_tree_setup_cohort_invalid')
  if (value.evidenceClass !== 'development-mock' && value.evidenceClass !== WORK_TREE_PARITY_EVIDENCE_CLASS) {
    throw new Error('work_tree_setup_evidence_class_invalid')
  }
  const ownerSubject = readString(value, 'ownerSubject')
  if (ownerSubject !== expectedOwnerSubject) throw new Error('work_tree_setup_owner_mismatch')
  const projectId = readRequiredString(value, 'projectId')
  const wrongPrincipalProjectId = readRequiredString(value, 'wrongPrincipalProjectId')
  const createIdempotencyKey = readRequiredString(value, 'createIdempotencyKey')
  const charterText = readRequiredString(value, 'charterText')
  const sharedPrincipalRef = readRequiredString(value, 'sharedPrincipalRef')
  const setupRef = readOptionalString(value, 'setupRef')
  const releaseIdentity = readReleaseIdentity(value)
  if (requireIdentity && releaseIdentity === undefined) throw new Error('work_tree_setup_release_identity_missing')
  if (expectedIdentity !== undefined && releaseIdentity !== undefined && (
    releaseIdentity.sourceRevision !== expectedIdentity.sourceRevision
    || releaseIdentity.vercelDeploymentId !== expectedIdentity.vercelDeploymentId
    || releaseIdentity.convexDeploymentId !== expectedIdentity.convexDeploymentId
    || new URL(releaseIdentity.convexUrl).href !== new URL(expectedIdentity.convexUrl).href
  )) throw new Error('work_tree_setup_release_identity_mismatch')
  return {
    kind,
    cohort: WORK_TREE_SETUP_COHORT,
    evidenceClass: value.evidenceClass,
    ownerSubject,
    projectId,
    wrongPrincipalProjectId,
    createIdempotencyKey,
    charterText,
    sharedPrincipalRef,
    ...(setupRef === undefined ? {} : { setupRef }),
    ...(releaseIdentity === undefined ? {} : { releaseIdentity }),
  }
}

function readReleaseIdentity(value: Record<string, unknown>): WorkTreeSetupReadback['releaseIdentity'] {
  const candidate = value.releaseIdentity
  if (candidate === undefined) return undefined
  if (!isRecord(candidate)) throw new Error('work_tree_setup_release_identity_invalid')
  const sourceRevision = readRequiredString(candidate, 'sourceRevision')
  const vercelDeploymentId = readRequiredString(candidate, 'vercelDeploymentId')
  const convexDeploymentId = readRequiredString(candidate, 'convexDeploymentId')
  const convexUrl = readRequiredString(candidate, 'convexUrl')
  try {
    if (new URL(convexUrl).protocol !== 'https:') throw new Error('invalid_protocol')
  } catch {
    throw new Error('work_tree_setup_release_identity_invalid')
  }
  return { sourceRevision, vercelDeploymentId, convexDeploymentId, convexUrl }
}

function resolveConvexSetupUrl(input: WorkTreeSetupConfig): string {
  const candidate = input.convexUrl?.toString().trim() ?? input.metadata.convexUrl
    ?? `https://${input.metadata.convexDeploymentId}.convex.cloud`
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error('work_tree_setup_convex_url_invalid')
  }
  if (parsed.protocol !== 'https:') throw new Error('work_tree_setup_convex_url_invalid')
  return parsed.href
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.trim().length === 0) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { reason: text.slice(0, 200) }
  }
}

function isMissingSeamPayload(value: unknown): boolean {
  return isRecord(value) && (
    value.code === 'unknown_action'
    || value.code === 'not_found'
    || value.reason === 'work_tree_setup_seam_missing'
  )
}

function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value) || typeof value[key] !== 'string') return undefined
  const result = value[key].trim()
  return result.length === 0 ? undefined : result
}

function readRequiredString(value: Record<string, unknown>, key: string): string {
  const result = readString(value, key)
  if (result === undefined) throw new Error(`work_tree_setup_${key}_missing`)
  return result
}

function readOptionalString(value: Record<string, unknown>, key: string): string | undefined {
  return readString(value, key)
}
