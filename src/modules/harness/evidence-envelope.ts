import { canonicalDigest } from '@/modules/common/canonical-digest'
import { roundNonNegative2 } from '@/modules/common/round-nonnegative-2'

import type {
  HarnessToolResult,
  HarnessToolStatus,
} from './harness.schema'
import {
  classifyHarnessEvidenceSensitivity,
  isProtectedAeToolResult,
  type HarnessEvidenceSensitivity,
  type HarnessProtectedEvidenceKind,
} from './protected-evidence'

export type HarnessPrivateToolEvidence = {
  schemaVersion: 1
  kind: 'toolResult'
  sensitivity: Exclude<HarnessEvidenceSensitivity, 'public'>
  evidenceHash: string
  protectedKinds: readonly HarnessProtectedEvidenceKind[]
  result: HarnessToolResult<unknown>
}

export type HarnessPublicToolEvidenceProjection = {
  schemaVersion: 1
  kind: 'toolEvidencePublicProjection'
  toolRuns: number
  catalogSearches: number
  listingsRead: number
  listedBusinesses: number
  checksPassed: number
  checksFailed: number
  elapsedMs: number
}

export type HarnessReplayToolEvidenceProjection = {
  schemaVersion: 1
  kind: 'toolEvidenceReplayProjection'
  toolCallId: string
  toolId: string
  status: HarnessToolStatus
  inputJson: string
  summaryJson: string
  resultHash: string
  durationMs: number
  createdAt: number
  sensitivity: HarnessPrivateToolEvidence['sensitivity']
  protectedKinds: readonly HarnessProtectedEvidenceKind[]
  errorCode?: string
  outputJson?: string
  output?: unknown
}

export type HarnessCompactionEvidenceProjection =
  | {
    schemaVersion: 1
    kind: 'protectedToolEvidence'
    evidence: HarnessPrivateToolEvidence
  }
  | {
    schemaVersion: 1
    kind: 'publicToolEvidenceSummary'
    publicProjection: HarnessPublicToolEvidenceProjection
  }

export type HarnessPublicProjectionMetadata = {
  sourceEvidenceHash: string
  publicProjectionHash: string
}

export type HarnessStalePublicProjectionResult = {
  stale: boolean
  currentEvidenceHash: string
  projectedFromEvidenceHash?: string
}

export function createPrivateToolEvidence(
  result: HarnessToolResult<unknown>,
  options: {
    sensitivity?: Exclude<HarnessEvidenceSensitivity, 'public'>
    protectedKinds?: readonly HarnessProtectedEvidenceKind[]
  } = {},
): HarnessPrivateToolEvidence {
  const protectedKinds = options.protectedKinds ?? (
    isProtectedAeToolResult(result) ? (['rawToolMessage'] as const) : []
  )
  const sensitivity = options.sensitivity ?? classifyHarnessEvidenceSensitivity({
    toolId: result.toolId,
    protected: protectedKinds.length > 0,
  })

  return {
    schemaVersion: 1,
    kind: 'toolResult',
    sensitivity: sensitivity === 'public' ? 'private' : sensitivity,
    evidenceHash: buildToolEvidenceHash(result),
    protectedKinds,
    result: { ...result },
  }
}

export function projectPrivateToolEvidenceForPublic(
  evidence: HarnessPrivateToolEvidence | readonly HarnessPrivateToolEvidence[],
): HarnessPublicToolEvidenceProjection {
  const evidenceList = Array.isArray(evidence) ? evidence : [evidence]
  const projection: HarnessPublicToolEvidenceProjection = {
    schemaVersion: 1,
    kind: 'toolEvidencePublicProjection',
    toolRuns: evidenceList.length,
    catalogSearches: 0,
    listingsRead: 0,
    listedBusinesses: 0,
    checksPassed: 0,
    checksFailed: 0,
    elapsedMs: 0,
  }

  for (const item of evidenceList) {
    const { result } = item
    if (result.toolId === 'registry.search') {
      projection.catalogSearches += 1
      projection.listedBusinesses += readSummaryCount(result.summaryJson)
    } else if (result.toolId === 'registry.detail') {
      projection.listingsRead += 1
    }

    if (isPassingStatus(result.status)) {
      projection.checksPassed += 1
    } else if (isFailingStatus(result.status)) {
      projection.checksFailed += 1
    }
    projection.elapsedMs = roundNonNegative2(projection.elapsedMs + result.durationMs)
  }

  return projection
}

export function projectPrivateToolEvidenceForReplay(
  evidence: HarnessPrivateToolEvidence | readonly HarnessPrivateToolEvidence[],
  options: { replayToolCallIdPrefix?: string } = {},
): readonly HarnessReplayToolEvidenceProjection[] {
  const prefix = options.replayToolCallIdPrefix ?? 'replay-tool'
  const evidenceList = Array.isArray(evidence) ? evidence : [evidence]
  return evidenceList.map((item, index) => {
    const { result } = item
    return {
      schemaVersion: 1,
      kind: 'toolEvidenceReplayProjection',
      toolCallId: `${prefix}-${index + 1}`,
      toolId: result.toolId,
      status: result.status,
      inputJson: result.inputJson,
      summaryJson: result.summaryJson,
      resultHash: result.resultHash,
      durationMs: result.durationMs,
      createdAt: result.createdAt,
      sensitivity: item.sensitivity,
      protectedKinds: item.protectedKinds,
      ...(result.errorCode === undefined ? {} : { errorCode: result.errorCode }),
      ...(result.outputJson === undefined ? {} : { outputJson: result.outputJson }),
      ...(result.output === undefined ? {} : { output: result.output }),
    }
  })
}

export function projectPrivateToolEvidenceForCompaction(
  evidence: HarnessPrivateToolEvidence,
): HarnessCompactionEvidenceProjection {
  if (evidence.sensitivity === 'protectedPrivate') {
    return {
      schemaVersion: 1,
      kind: 'protectedToolEvidence',
      evidence,
    }
  }

  return {
    schemaVersion: 1,
    kind: 'publicToolEvidenceSummary',
    publicProjection: projectPrivateToolEvidenceForPublic(evidence),
  }
}

export function createPublicProjectionMetadata(input: {
  evidence: HarnessPrivateToolEvidence | readonly HarnessPrivateToolEvidence[]
  publicProjection: HarnessPublicToolEvidenceProjection
}): HarnessPublicProjectionMetadata {
  return {
    sourceEvidenceHash: buildPrivateEvidenceHash(input.evidence),
    publicProjectionHash: canonicalDigest({
      schemaVersion: input.publicProjection.schemaVersion,
      kind: input.publicProjection.kind,
      toolRuns: input.publicProjection.toolRuns,
      catalogSearches: input.publicProjection.catalogSearches,
      listingsRead: input.publicProjection.listingsRead,
      listedBusinesses: input.publicProjection.listedBusinesses,
      checksPassed: input.publicProjection.checksPassed,
      checksFailed: input.publicProjection.checksFailed,
      elapsedMs: input.publicProjection.elapsedMs,
    }).toString(),
  }
}

export function detectStalePublicProjection(input: {
  evidence: HarnessPrivateToolEvidence | readonly HarnessPrivateToolEvidence[]
  projectedFromEvidenceHash?: string
}): HarnessStalePublicProjectionResult {
  const currentEvidenceHash = buildPrivateEvidenceHash(input.evidence)
  return {
    stale: input.projectedFromEvidenceHash !== currentEvidenceHash,
    currentEvidenceHash,
    ...(input.projectedFromEvidenceHash === undefined
      ? {}
      : { projectedFromEvidenceHash: input.projectedFromEvidenceHash }),
  }
}

export function buildPrivateEvidenceHash(
  evidence: HarnessPrivateToolEvidence | readonly HarnessPrivateToolEvidence[],
): string {
  const evidenceList = Array.isArray(evidence) ? evidence : [evidence]
  return canonicalDigest({
    schemaVersion: 1,
    kind: 'privateToolEvidenceSet',
    evidenceHashes: evidenceList.map((item) => item.evidenceHash),
  }).toString()
}

function buildToolEvidenceHash(result: HarnessToolResult<unknown>): string {
  return canonicalDigest({
    schemaVersion: 1,
    kind: 'toolResult',
    toolCallId: result.toolCallId,
    toolId: result.toolId,
    status: result.status,
    inputJson: result.inputJson,
    summaryJson: result.summaryJson,
    resultHash: result.resultHash,
    durationMs: result.durationMs,
    createdAt: result.createdAt,
    errorCode: result.errorCode ?? null,
    outputJson: result.outputJson ?? null,
  }).toString()
}

function readSummaryCount(summaryJson: string): number {
  try {
    const parsed = JSON.parse(summaryJson) as { count?: unknown; total?: unknown }
    const value = typeof parsed.count === 'number' ? parsed.count : parsed.total
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.round(value))
      : 0
  } catch {
    return 0
  }
}

function isPassingStatus(status: HarnessToolStatus): boolean {
  return status === 'ok'
}

function isFailingStatus(status: HarnessToolStatus): boolean {
  return status === 'error' ||
    status === 'refused' ||
    status === 'blocked' ||
    status === 'timeout' ||
    status === 'aborted'
}

