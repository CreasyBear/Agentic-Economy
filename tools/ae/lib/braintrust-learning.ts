import { isRecord } from '@/modules/common/is-record'

export const MAX_BRAINTRUST_TURNS = 25
export const MAX_REVIEWED_EXPECTED_BYTES = 64 * 1024

const CANONICAL_OPERATION_REF = /^operation:v1:[0-9a-f]{64}$/u

export type LearningTurnRow = {
  turnId: string
  threadId: string
  seq: number
  query: string
  intent: string
  evidenceJson: string
  snapshotHash: string
  proseJson: string
  status: string
  createdAt: number
}

export type LearningToolCall = {
  toolId: string
  status: 'complete' | 'error' | 'refused'
  resultHash: string
  operationRef?: string
}

export type LearningContractRef = {
  capabilityId: string
  version: number
}

export type LearningPublicationRef = {
  publicationRef: string
  revision: number
}

export type BraintrustLearningPacket = {
  turnId: string
  input: {
    query: string
    intent: string
  }
  metadata: {
    status: 'complete' | 'error'
    turnSeq: number
    snapshotHash: string
    finalizedAt: number
    finalizationHash: string
    observedAnswer: {
      oneLine: string
      summary: string
      nextStep: string
    }
    toolCalls: readonly LearningToolCall[]
    harness: {
      runId: string
      status: string
      durationMs: number
      phases: readonly string[]
      toolIds: readonly string[]
      modelCount: number
      errorCodes: readonly string[]
    }
    operationRefs: readonly string[]
    contractRefs: readonly LearningContractRef[]
    publicationRefs: readonly LearningPublicationRef[]
    evidenceHashes: readonly string[]
  }
  tags: readonly string[]
}

export type LearningPacketResult =
  | { kind: 'ok'; packet: BraintrustLearningPacket }
  | { kind: 'refused'; reason: LearningPacketRefusalReason }

export type LearningPacketRefusalReason =
  | 'turn_not_finalized'
  | 'evidence_invalid'
  | 'prose_invalid'
  | 'harness_missing'
  | 'harness_ref_missing'
  | 'tool_evidence_invalid'
  | 'operation_ref_invalid'
  | 'reviewed_target_invalid'

export type LearningSelection = {
  turnIds: readonly string[]
  expectedByTurnId: Readonly<Record<string, unknown>>
}

export type LearningSelectionResult =
  | { kind: 'ok'; selection: LearningSelection }
  | { kind: 'refused'; reason: 'manifest_invalid' | 'selection_empty' | 'selection_too_large' | 'duplicate_turn_id' }

export function buildBraintrustLearningPacket(
  row: LearningTurnRow,
  correctedExpected?: unknown,
): LearningPacketResult {
  if (correctedExpected !== undefined && !isBoundedReviewedExpected(correctedExpected)) {
    return { kind: 'refused', reason: 'reviewed_target_invalid' }
  }
  if ((row.status !== 'complete' && row.status !== 'error') || !nonEmpty(row.turnId) || !Number.isSafeInteger(row.seq)) {
    return { kind: 'refused', reason: 'turn_not_finalized' }
  }

  const evidence = parseRecord(row.evidenceJson)
  const prose = parseRecord(row.proseJson)
  if (evidence === undefined) return { kind: 'refused', reason: 'evidence_invalid' }
  if (prose === undefined) return { kind: 'refused', reason: 'prose_invalid' }

  const finalization = readFinalization(evidence.harnessFinalization)
  if (finalization === undefined) return { kind: 'refused', reason: 'turn_not_finalized' }
  if (evidence.harnessRunRef !== row.turnId) return { kind: 'refused', reason: 'harness_ref_missing' }

  const harness = readHarness(evidence.harnessRun)
  if (harness === undefined) return { kind: 'refused', reason: 'harness_missing' }

  const toolCalls = readToolCalls(evidence.toolCalls)
  if (toolCalls.kind === 'refused') return toolCalls

  const observedAnswer = {
    oneLine: redactText(readString(prose.oneLine) ?? ''),
    summary: redactText(readString(prose.summary) ?? ''),
    nextStep: redactText(readString(prose.nextStep) ?? ''),
  }
  const operationRefs = [...new Set(toolCalls.calls.flatMap((call) => call.operationRef === undefined ? [] : [call.operationRef]))]
  const contractRefs = readContractRefs(evidence.toolCalls)
  const publicationRefs = readPublicationRefs(evidence.toolCalls)
  const evidenceHashes = [
    row.snapshotHash,
    finalization.finalizationHash,
    ...toolCalls.calls.map((call) => call.resultHash),
  ].filter(nonEmpty)

  const packet: BraintrustLearningPacket = {
    turnId: row.turnId,
    input: {
      query: redactText(row.query),
      intent: redactText(row.intent),
    },
    metadata: {
      status: row.status,
      turnSeq: row.seq,
      snapshotHash: row.snapshotHash,
      finalizedAt: finalization.finalizedAt,
      finalizationHash: finalization.finalizationHash,
      observedAnswer,
      toolCalls: toolCalls.calls,
      harness,
      operationRefs,
      contractRefs,
      publicationRefs,
      evidenceHashes,
    },
    tags: [
      'ae',
      'answer',
      `status:${row.status}`,
      ...(operationRefs.length === 0 ? [] : ['capability-execution']),
      ...(correctedExpected === undefined ? [] : ['reviewed-target']),
    ],
  }
  return { kind: 'ok', packet }
}

export function toBraintrustDatasetRecord(
  packet: BraintrustLearningPacket,
  correctedExpected?: unknown,
): {
  id: string
  input: BraintrustLearningPacket['input']
  metadata: BraintrustLearningPacket['metadata']
  tags: string[]
  expected?: unknown
} {
  return {
    id: packet.turnId,
    input: packet.input,
    metadata: packet.metadata,
    tags: [...packet.tags],
    ...(correctedExpected === undefined ? {} : { expected: correctedExpected }),
  }
}

export function parseLearningSelection(value: unknown): LearningSelectionResult {
  if (!isRecord(value)) return { kind: 'refused', reason: 'manifest_invalid' }
  const rawIds = value.turnIds
  if (!Array.isArray(rawIds) || rawIds.some((id) => typeof id !== 'string')) {
    return { kind: 'refused', reason: 'manifest_invalid' }
  }
  const turnIds = rawIds.map((id) => id.trim())
  if (turnIds.some((id) => id.length === 0)) return { kind: 'refused', reason: 'manifest_invalid' }
  if (turnIds.length === 0) return { kind: 'refused', reason: 'selection_empty' }
  if (turnIds.length > MAX_BRAINTRUST_TURNS) return { kind: 'refused', reason: 'selection_too_large' }
  if (new Set(turnIds).size !== turnIds.length) return { kind: 'refused', reason: 'duplicate_turn_id' }

  const rawExpected = value.expectedByTurnId
  if (rawExpected !== undefined && !isRecord(rawExpected)) {
    return { kind: 'refused', reason: 'manifest_invalid' }
  }
  const expectedByTurnId: Record<string, unknown> = {}
  if (isRecord(rawExpected)) {
    for (const [turnId, expected] of Object.entries(rawExpected)) {
      if (!turnIds.includes(turnId) || !isBoundedReviewedExpected(expected)) {
        return { kind: 'refused', reason: 'manifest_invalid' }
      }
      expectedByTurnId[turnId] = expected
    }
  }
  return { kind: 'ok', selection: { turnIds, expectedByTurnId } }
}

export function isBoundedReviewedExpected(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || (value.status !== 'complete' && value.status !== 'error')) return false
  if (!Array.isArray(value.slugs) || value.slugs.some((slug) => typeof slug !== 'string')) return false
  try {
    const serialized = JSON.stringify(value)
    return serialized !== undefined && serialized.length <= MAX_REVIEWED_EXPECTED_BYTES
  } catch {
    return false
  }
}

function readFinalization(value: unknown): { finalizationHash: string; finalizedAt: number } | undefined {
  if (!isRecord(value)) return undefined
  const status = value.status
  const finalizationHash = readString(value.finalizationHash)
  const finalizedAt = readFiniteNumber(value.finalizedAt)
  if ((status !== 'accepted' && status !== 'replayed') || finalizationHash === undefined || finalizedAt === undefined) return undefined
  return { finalizationHash, finalizedAt }
}

function readHarness(value: unknown): BraintrustLearningPacket['metadata']['harness'] | undefined {
  if (!isRecord(value)) return undefined
  const summary = isRecord(value.summary) ? value.summary : undefined
  const coverage = isRecord(value.coverage) ? value.coverage : undefined
  const run = summary !== undefined && isRecord(summary.run) ? summary.run : undefined
  const phases = coverage?.phases
  const toolIds = coverage?.toolsInvoked
  const errorCodes = summary !== undefined && isRecord(summary.errors) ? summary.errors.codes : undefined
  const runId = run === undefined ? undefined : readString(run.runId)
  const status = run === undefined ? undefined : readString(run.status)
  const durationMs = run === undefined ? undefined : readFiniteNumber(run.durationMs)
  const modelCount = summary !== undefined && isRecord(summary.models) ? readFiniteNumber(summary.models.total) : 0
  if (runId === undefined || status === undefined || durationMs === undefined || !Array.isArray(phases) || phases.some((phase) => typeof phase !== 'string') || !Array.isArray(toolIds) || toolIds.some((toolId) => typeof toolId !== 'string') || !Array.isArray(errorCodes) || errorCodes.some((code) => typeof code !== 'string')) {
    return undefined
  }
  return {
    runId,
    status,
    durationMs,
    phases: phases.map((phase) => redactText(phase)),
    toolIds: toolIds.map((toolId) => redactText(toolId)),
    modelCount: modelCount ?? 0,
    errorCodes: errorCodes.map((code) => redactText(code)),
  }
}

function readToolCalls(value: unknown): { kind: 'ok'; calls: LearningToolCall[] } | { kind: 'refused'; reason: LearningPacketRefusalReason } {
  if (!Array.isArray(value)) return { kind: 'refused', reason: 'tool_evidence_invalid' }
  const calls: LearningToolCall[] = []
  for (const rawCall of value) {
    if (!isRecord(rawCall)) return { kind: 'refused', reason: 'tool_evidence_invalid' }
    const toolId = readString(rawCall.toolId)
    const status = rawCall.status
    const resultHash = readString(rawCall.resultHash)
    if (toolId === undefined || (status !== 'complete' && status !== 'error' && status !== 'refused') || resultHash === undefined) {
      return { kind: 'refused', reason: 'tool_evidence_invalid' }
    }
    let operationRef: string | undefined
    if (toolId === 'operation.execute') {
      operationRef = readOperationRefFromJson(rawCall.inputJson)
      const resultRef = readOperationRefFromJson(rawCall.resultJson)
      if (operationRef === undefined || (resultRef !== undefined && resultRef !== operationRef)) {
        return { kind: 'refused', reason: 'operation_ref_invalid' }
      }
    }
    if (toolId.startsWith('capability.')) {
      operationRef = toolId.slice('capability.'.length)
      if (!isCanonicalOperationRef(operationRef)) return { kind: 'refused', reason: 'operation_ref_invalid' }
    }
    calls.push({
      toolId: redactText(toolId),
      status,
      resultHash,
      ...(operationRef === undefined ? {} : { operationRef }),
    })
  }
  return { kind: 'ok', calls }
}

function readOperationRefFromJson(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = parseRecord(value)
  if (parsed === undefined) return undefined
  const direct = readString(parsed.operationRef)
  return direct !== undefined && isCanonicalOperationRef(direct) ? direct : undefined
}


function readContractRefs(value: unknown): LearningContractRef[] {
  if (!Array.isArray(value)) return []
  const refs: LearningContractRef[] = []
  for (const rawCall of value) {
    if (!isRecord(rawCall)) continue
    const result = parseRecord(rawCall.resultJson)
    if (result === undefined) continue
    const contract = isRecord(result.contractRef)
      ? result.contractRef
      : isRecord(result.contract)
        ? result.contract
        : undefined
    if (contract === undefined) continue
    const capabilityId = readString(contract.capabilityId)
    const version = readPositiveInteger(contract.version)
    if (capabilityId !== undefined && version !== undefined) refs.push({ capabilityId, version })
  }
  return uniqueRefs(refs, (ref) => `${ref.capabilityId}:${ref.version}`)
}

function readPublicationRefs(value: unknown): LearningPublicationRef[] {
  if (!Array.isArray(value)) return []
  const refs: LearningPublicationRef[] = []
  for (const rawCall of value) {
    if (!isRecord(rawCall)) continue
    const result = parseRecord(rawCall.resultJson)
    if (result === undefined) continue
    const publication = isRecord(result.publication) ? result.publication : result
    const publicationRef = readString(publication.publicationRef)
    const revision = readPositiveInteger(publication.publicationRevision ?? publication.revision)
    if (publicationRef !== undefined && revision !== undefined) refs.push({ publicationRef, revision })
  }
  return uniqueRefs(refs, (ref) => `${ref.publicationRef}:${ref.revision}`)
}
function uniqueRefs<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const valueKey = key(value)
    if (seen.has(valueKey)) return false
    seen.add(valueKey)
    return true
  })
}

function parseRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length === 0 ? undefined : normalized
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isCanonicalOperationRef(value: string): boolean {
  return CANONICAL_OPERATION_REF.test(value)
}

/** Remove identity/credential-shaped text while retaining the selected answer context. */
function redactText(value: string): string {
  return value
    .replace(/\bbearer\s+[^\s,;]+/giu, 'bearer=[redacted]')
    .replace(/\b(token|api[_-]?key|secret|password|cookie|authorization)\s*[:=]\s*[^\s,;]+/giu, '$1=[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[redacted-email]')
    .replace(/\b(?:\+?\d[\d ()-]{7,}\d)\b/gu, '[redacted-phone]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/giu, '[redacted-id]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 2_000)
}
