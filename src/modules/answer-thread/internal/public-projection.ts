import { z } from 'zod'
import {
  ANSWER_OPERATION_CANDIDATE_LIMIT,
  AnswerOperationCandidateSchema,
  AnswerOperationComparisonSchema,
  AnswerOperationOutcomeSchema,
  AnswerOperationPlanSchema,
  AnswerOperationSelectionSchema,
  AnswerRequestedIntentsSchema,
  AnswerRequestInterpretationSchema,
  answerOperationCandidateSetDigest,
  AnswerSourceSchema,
  WebDiscoveryClaimSchema,
} from '@/modules/answer/answer-schema'
import {
  AnswerLayoutProfileValues,
  AnswerWorkStepSchema,
  isValidFrozenAnswerOperationArtifacts,
} from '@/modules/answer/answer-event-schema'
import {
  buildArtifactsFromSnapshot,
  type AnswerSnapshot,
} from '@/modules/answer/projection'
import { sanitizeAnswerOperationOutcome } from '@/modules/answer/convex'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { MAX_ANSWER_TURN_CHECKPOINT_BYTES } from './answer-turn-checkpoint'
import { parseAnswerTurnProblemStrict, redactAnswerTurnProblem } from '@/lib/errors'
import { isRecord } from '@/modules/common/is-record'

import {
  AnswerToolIdValues,
  AnswerContinuationSourceSchema,
  AnswerPendingDecisionSchema,
  type AnswerTurnRecord,
  type AnswerTurnReservationRecord,
  type AnswerThreadRecord,
  type FrozenTurnEvidence,
  type PublicThreadTurn,
  type PublicThreadProjection,
} from '../answer-thread.schema'
import { buildPublicAnswerCheckSummary } from './answer-run-summary'
import { publicWorkLog } from './public-worklog'

const frozenToolCallSchema = z.strictObject({
  toolCallId: z.string().min(1),
  turnId: z.string().min(1),
  seq: z.number().finite().int().nonnegative(),
  toolId: z.enum(AnswerToolIdValues),
  inputJson: z.string(),
  resultSummaryJson: z.string(),
  resultJson: z.string(),
  resultHash: z.string().min(1),
  status: z.enum(['complete', 'error', 'refused']),
  executed: z.boolean().exactOptional(),
  createdAt: z.number().finite(),
})

const frozenHarnessFinalizationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.enum(['accepted', 'replayed']),
  finalizationHash: z.string().min(1),
  journalEntryCount: z.number().finite().int().nonnegative(),
  finalizedAt: z.number().finite(),
})
const frozenTurnProseSchema = z.strictObject({
  oneLine: z.string(),
  summary: z.string(),
  nextStep: z.string(),
  compactLayout: z.boolean().exactOptional(),
  layoutProfile: z.enum(AnswerLayoutProfileValues).exactOptional(),
})
function isCurrentFrozenEvidence(value: unknown): value is FrozenTurnEvidence {
  if (!isRecord(value)) return false
  if (
    !Array.isArray(value.providers)
    || !Array.isArray(value.allowedSlugs)
    || typeof value.agentJsonUrl !== 'string'
    || !Array.isArray(value.toolCalls)
    || !Array.isArray(value.timings)
    || !Array.isArray(value.workLog)
    || !isRecord(value.answerRun)
    || (value.harnessRunRef !== undefined && (typeof value.harnessRunRef !== 'string' || value.harnessRunRef.length === 0))
    || (value.harnessRun !== undefined && !isRecord(value.harnessRun))
  ) {
    return false
  }

  const providers = z.array(AnswerSourceSchema).safeParse(value.providers)
  const toolCalls = z.array(frozenToolCallSchema).safeParse(value.toolCalls)
  const workLog = z.array(AnswerWorkStepSchema).safeParse(value.workLog)
  if (!providers.success
    || !value.allowedSlugs.every((slug) => typeof slug === 'string' && slug.length > 0)
    || !toolCalls.success
    || !workLog.success
    || !value.timings.every((timing) => isRecord(timing)
      && typeof timing.name === 'string'
      && typeof timing.durationMs === 'number'
      && Number.isFinite(timing.durationMs)
      && typeof timing.atMs === 'number'
      && Number.isFinite(timing.atMs))
    || hasForbiddenReplayKey(value.toolCalls)) {
    return false
  }
  for (const call of toolCalls.data) {
    for (const field of ['inputJson', 'resultSummaryJson', 'resultJson'] as const) {
      const encoded = call[field]
      try {
        if (hasForbiddenReplayKey(JSON.parse(encoded))) return false
      } catch {
        return false
      }
    }
  }
  if (value.importedClaims !== undefined
    && !z.array(WebDiscoveryClaimSchema).max(5).safeParse(value.importedClaims).success) {
    return false
  }
  const interpretation = value.interpretation === undefined
    ? undefined
    : AnswerRequestInterpretationSchema.safeParse(value.interpretation)
  const requestedIntents = value.requestedIntents === undefined
    ? undefined
    : AnswerRequestedIntentsSchema.safeParse(value.requestedIntents)
  const continuationSource = value.continuationSource === undefined
    ? undefined
    : AnswerContinuationSourceSchema.safeParse(value.continuationSource)
  const pendingDecision = value.pendingDecision === undefined
    ? undefined
    : AnswerPendingDecisionSchema.safeParse(value.pendingDecision)
  if (
    interpretation !== undefined && !interpretation.success
    || requestedIntents !== undefined && !requestedIntents.success
    || continuationSource !== undefined && !continuationSource.success
    || pendingDecision !== undefined && !pendingDecision.success
    || value.selectedInputDigest !== undefined
      && (typeof value.selectedInputDigest !== 'string' || value.selectedInputDigest.length === 0)
    || value.terminalCheckpointDigest !== undefined
      && (typeof value.terminalCheckpointDigest !== 'string'
        || value.terminalCheckpointDigest.length === 0)
    || interpretation?.success === true
      && requestedIntents?.success === true
      && canonicalDigest(interpretation.data.requestedIntents).toString()
        !== canonicalDigest(requestedIntents.data).toString()
  ) {
    return false
  }

  const parsedCandidates = value.operationCandidates === undefined
    ? undefined
    : z.array(AnswerOperationCandidateSchema).max(ANSWER_OPERATION_CANDIDATE_LIMIT).safeParse(value.operationCandidates)
  if (value.operationCandidates !== undefined
    && (parsedCandidates === undefined || !parsedCandidates.success)) {
    return false
  }
  if (parsedCandidates?.success) {
    if (typeof value.operationCandidatesDigest !== 'string'
      || answerOperationCandidateSetDigest(parsedCandidates.data) !== value.operationCandidatesDigest) {
      return false
    }
    for (const candidate of parsedCandidates.data) {
      if (candidate.inputJsonSchema !== undefined
        && new TextEncoder().encode(JSON.stringify(candidate.inputJsonSchema)).byteLength
          > MAX_ANSWER_TURN_CHECKPOINT_BYTES) {
        return false
      }
    }
  } else if (value.operationCandidatesDigest !== undefined) {
    return false
  }
  const operationCandidates = parsedCandidates?.success ? parsedCandidates.data : undefined
  const parsedComparison = value.operationComparison === undefined
    ? undefined
    : AnswerOperationComparisonSchema.safeParse(value.operationComparison)
  if (value.operationComparison !== undefined
    && (parsedComparison === undefined || !parsedComparison.success)) {
    return false
  }
  const operationComparison = parsedComparison?.success ? parsedComparison.data : undefined
  const parsedPlan = value.operationPlan === undefined
    ? undefined
    : AnswerOperationPlanSchema.safeParse(value.operationPlan)
  if (value.operationPlan !== undefined
    && (parsedPlan === undefined || !parsedPlan.success)) {
    return false
  }
  const operationPlan = parsedPlan?.success ? parsedPlan.data : undefined
  if (
    operationComparison !== undefined
    && new TextEncoder().encode(JSON.stringify(operationComparison)).byteLength > MAX_ANSWER_TURN_CHECKPOINT_BYTES
    || operationPlan !== undefined
    && new TextEncoder().encode(JSON.stringify(operationPlan)).byteLength > MAX_ANSWER_TURN_CHECKPOINT_BYTES
  ) {
    return false
  }
  const parsedOutcome = value.operationOutcome === undefined
    ? undefined
    : AnswerOperationOutcomeSchema.safeParse(value.operationOutcome)
  if (value.operationOutcome !== undefined && (parsedOutcome === undefined || !parsedOutcome.success)) {
    return false
  }
  const operationOutcome = parsedOutcome?.success ? parsedOutcome.data : undefined
  const parsedSelection = value.operationSelection === undefined
    ? undefined
    : AnswerOperationSelectionSchema.safeParse(value.operationSelection)
  if (value.operationSelection !== undefined && (parsedSelection === undefined || !parsedSelection.success)) {
    return false
  }
  const operationSelection = parsedSelection?.success ? parsedSelection.data : undefined
  if (!isValidFrozenAnswerOperationArtifacts({
    candidates: operationCandidates,
    candidateSetDigest: value.operationCandidatesDigest,
    comparison: operationComparison,
    outcome: operationOutcome,
    plan: operationPlan,
    selection: operationSelection,
    toolCalls: toolCalls.data,
    requireToolEvidence: operationOutcome !== undefined,
  })) {
    return false
  }
  if (operationOutcome !== undefined && operationSelection !== undefined
    && (
      operationOutcome.operationRef !== operationSelection.operationRef
      || operationOutcome.toolId !== operationSelection.toolId
      || operationOutcome.resultDigest !== operationSelection.resultDigest
    )) {
    return false
  }
  if (operationSelection !== undefined) {
    if (value.operationCandidatesDigest !== undefined
      && operationSelection.candidateSetDigest !== value.operationCandidatesDigest) {
      return false
    }
    if (operationOutcome !== undefined
      && (operationSelection.operationRef !== operationOutcome.operationRef
        || operationSelection.toolId !== operationOutcome.toolId
        || operationSelection.resultDigest !== operationOutcome.resultDigest)) {
      return false
    }
  }
  if (operationSelection?.candidateSetDigest !== undefined
    && operationCandidates !== undefined
    && answerOperationCandidateSetDigest(operationCandidates) !== operationSelection.candidateSetDigest) {
    return false
  }
  if (pendingDecision?.success) {
    const pending = pendingDecision.data
    const candidate = operationCandidates?.filter(
      (item) => item.operationRef === pending.operationRef,
    )
    const selectedCandidate =
      candidate?.length === 1 ? candidate[0] : undefined
    const inputCall = toolCalls.data
      .toReversed()
      .find(
        (call) =>
          call.toolId === pending.toolId
          && call.status === 'complete',
      )
    if (
      pending.origin === undefined
      || value.terminalCheckpointDigest === undefined
      || pending.origin.terminalCheckpointDigest !== value.terminalCheckpointDigest
      || pending.operationRef !== operationSelection?.operationRef
      || pending.toolId !== operationSelection.toolId
      || pending.candidateSetDigest !== value.operationCandidatesDigest
      || pending.candidateSetDigest !== operationSelection.candidateSetDigest
      || pending.descriptorDigest !== selectedCandidate?.descriptorDigest
      || pending.descriptorDigest !== operationSelection.descriptorDigest
      || selectedCandidate?.executionBindingDigest
        !== operationSelection.executionBindingDigest
      || inputCall === undefined
      || pending.inputDigest !== value.selectedInputDigest
      || pending.inputDigest !== canonicalDigest(inputCall.inputJson).toString()
      || operationOutcome === undefined
      || pending.decisionDigest
        !== canonicalDigest(operationOutcome.result).toString()
    ) {
      return false
    }
  }

  const summary = value.answerRun.summary
  const coverage = value.answerRun.coverage
  if (
    !isRecord(summary)
    || summary.schemaVersion !== 1
    || !isRecord(summary.turn)
    || !isRecord(summary.tools)
    || !isRecord(summary.evidence)
    || !isRecord(summary.workLog)
    || !isRecord(summary.timings)
    || !isRecord(summary.gates)
    || !isRecord(coverage)
    || hasForbiddenReplayKey(value.answerRun)
  ) {
    return false
  }
  if (value.harnessFinalization !== undefined
    && !frozenHarnessFinalizationSchema.safeParse(value.harnessFinalization).success) {
    return false
  }
  return true
}

function hasForbiddenReplayKey(value: unknown, seen = new Set<object>()): boolean {
  if (Array.isArray(value)) {
    if (seen.has(value)) return true
    seen.add(value)
    return value.some((item) => hasForbiddenReplayKey(item, seen))
  }
  if (!isRecord(value)) return false
  if (seen.has(value)) return true
  seen.add(value)
  return Object.entries(value).some(([key, nested]) =>
    /(?:api[_-]?key|authorization|bearer|credential|password|private[_-]?key|secret|token)/i.test(key)
    || hasForbiddenReplayKey(nested, seen))
}


export type AnswerThreadTurnRows = {
  turns: AnswerTurnRecord[]
  reservations: AnswerTurnReservationRecord[]
}

export function countAnswerThreadTurns(
  rows: AnswerThreadTurnRows,
  limit: number,
): number {
  const seenTurnIds = new Set<string>()
  const seenSeqs = new Set<number>()
  let count = 0
  for (const turn of rows.turns) {
    if (seenTurnIds.has(turn.turnId) || seenSeqs.has(turn.seq)) continue
    seenTurnIds.add(turn.turnId)
    seenSeqs.add(turn.seq)
    count += 1
  }
  for (const reservation of rows.reservations) {
    if (reservation.state !== 'reserved' && reservation.state !== 'stopped') {
      continue
    }
    if (seenTurnIds.has(reservation.turnId) || seenSeqs.has(reservation.seq)) continue
    seenTurnIds.add(reservation.turnId)
    seenSeqs.add(reservation.seq)
    count += 1
  }
  return Math.min(count, limit)
}

export function buildPublicThreadProjectionWithReservations(
  thread: AnswerThreadRecord,
  rows: AnswerThreadTurnRows,
  limit: number,
): PublicThreadProjection {
  const persistedProjection = buildPublicThreadProjection(thread, rows.turns)
  const turns: PublicThreadProjection['turns'][number][] = []
  const seenTurnIds = new Set<string>()
  const seenSeqs = new Set<number>()

  for (const turn of persistedProjection.turns) {
    if (seenTurnIds.has(turn.turnId) || seenSeqs.has(turn.seq)) continue
    seenTurnIds.add(turn.turnId)
    seenSeqs.add(turn.seq)
    turns.push(turn)
  }
  for (const reservation of rows.reservations) {
    const turn = buildPublicReservationTurn(reservation)
    if (turn === undefined || seenTurnIds.has(turn.turnId) || seenSeqs.has(turn.seq)) continue
    seenTurnIds.add(turn.turnId)
    seenSeqs.add(turn.seq)
    turns.push(turn)
  }

  turns.sort((left, right) => left.seq - right.seq)
  return {
    ...persistedProjection,
    turns: turns.slice(0, limit),
  }
}
export function toThreadRecord(row: Record<string, unknown>): AnswerThreadRecord {
  return {
    threadId: String(row.threadId),
    pseudonymousSessionId: String(row.pseudonymousSessionId),
    title: String(row.title),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  }
}

export function toTurnRecord(row: Record<string, unknown>): AnswerTurnRecord {
  return {
    turnId: String(row.turnId),
    threadId: String(row.threadId),
    seq: Number(row.seq),
    query: String(row.query),
    intent: row.intent as AnswerTurnRecord['intent'],
    evidenceJson: String(row.evidenceJson),
    snapshotHash: String(row.snapshotHash),
    proseJson: String(row.proseJson),
    artifactKindsJson: String(row.artifactKindsJson),
    status: row.status as AnswerTurnRecord['status'],
    ...(row.errorCopyId === undefined ? {} : { errorCopyId: String(row.errorCopyId) }),
    ...(row.errorProblemJson === undefined ? {} : { errorProblemJson: String(row.errorProblemJson) }),
    createdAt: Number(row.createdAt),
  }
}

export function toReservationRecord(row: Record<string, unknown>): AnswerTurnReservationRecord {
  return {
    reservationKey: String(row.reservationKey),
    sessionId: String(row.sessionId),
    requestedThreadScope: String(row.requestedThreadScope),
    requestDigest: String(row.requestDigest),
    threadId: String(row.threadId),
    turnId: String(row.turnId),
    seq: Number(row.seq),
    query: String(row.query),
    ...(row.searchContextJson === undefined ? {} : { searchContextJson: String(row.searchContextJson) }),
    state: row.state as AnswerTurnReservationRecord['state'],
    ...(row.finalStatus === undefined ? {} : { finalStatus: row.finalStatus as 'complete' | 'error' }),
    ...(row.answerDigest === undefined ? {} : { answerDigest: String(row.answerDigest) }),
    ...(row.harnessFinalizationDigest === undefined ? {} : { harnessFinalizationDigest: String(row.harnessFinalizationDigest) }),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  }
}

export function buildPublicThreadProjection(
  thread: AnswerThreadRecord,
  turns: readonly AnswerTurnRecord[],
): PublicThreadProjection {
  return {
    threadId: thread.threadId,
    title: thread.title,
    turns: turns
      .toSorted((a, b) => a.seq - b.seq)
      .map((turn) => buildPublicTurn(turn)),
  }
}

/**
 * Project a reservation that has no persisted answer row yet. Reservation
 * fields are lifecycle truth only; never parse or manufacture answer evidence,
 * prose, artifacts, work-log entries, or tool payloads here.
 */
export function buildPublicReservationTurn(
  reservation: Pick<AnswerTurnReservationRecord, 'threadId' | 'turnId' | 'seq' | 'query' | 'state' | 'createdAt'>,
): PublicThreadTurn | undefined {
  const status = reservation.state === 'stopped'
    ? 'stopped'
    : reservation.state === 'reserved'
      ? 'pending'
      : undefined
  if (status === undefined) {
    return undefined
  }
  return {
    turnId: reservation.turnId,
    seq: reservation.seq,
    query: reservation.query,
    intent: 'refine_search',
    status,
    workLog: [],
    artifacts: [],
    oneLine: '',
    createdAt: reservation.createdAt,
  }
}

function buildPublicTurn(turn: AnswerTurnRecord): PublicThreadTurn {
  const lifecycle = {
    turnId: turn.turnId,
    seq: turn.seq,
    createdAt: turn.createdAt,
    query: turn.query,
    intent: turn.intent,
    status: turn.status,
  }

  if (turn.status === 'pending' || turn.status === 'stopped') {
    return {
      ...lifecycle,
      workLog: [],
      artifacts: [],
      oneLine: '',
    }
  }

  try {
    const evidence = parseFrozenEvidence(turn.evidenceJson)
    const proseValue: unknown = JSON.parse(turn.proseJson)
    const parsedProse = frozenTurnProseSchema.safeParse(proseValue)
    if (!parsedProse.success) {
      throw new Error('answer_prose_invalid')
    }
    const prose = parsedProse.data
    const operationOutcome = evidence.operationOutcome === undefined
      ? undefined
      : sanitizeAnswerOperationOutcome(evidence.operationOutcome)
    const snapshot: AnswerSnapshot = {
      query: turn.query,
      oneLine: prose.oneLine,
      providers: evidence.providers,
      ...(evidence.importedClaims === undefined ? {} : { importedClaims: evidence.importedClaims }),
      ...(evidence.operationCandidates === undefined ? {} : { operationCandidates: evidence.operationCandidates }),
      ...(evidence.operationCandidatesDigest === undefined
        ? {}
        : { operationCandidatesDigest: evidence.operationCandidatesDigest }),
      ...(evidence.operationComparison === undefined ? {} : { operationComparison: evidence.operationComparison }),
      ...(operationOutcome === undefined ? {} : { operationOutcome }),
      ...(evidence.operationPlan === undefined ? {} : { operationPlan: evidence.operationPlan }),
      ...(evidence.operationSelection === undefined ? {} : { operationSelection: evidence.operationSelection }),
      ...(turn.intent === 'inquiry_handoff' && evidence.providers.length === 1
        ? { selectedProvider: evidence.providers[0] }
        : {}),
      summary: prose.summary,
      nextStep: prose.nextStep,
      agentJsonUrl: evidence.agentJsonUrl,
      ...(prose.compactLayout === true ? { compactLayout: true } : {}),
      ...(prose.layoutProfile === undefined ? {} : { layoutProfile: prose.layoutProfile }),
    }

    const problem = turn.status === 'error' ? parsePublicTurnProblem(turn.errorProblemJson) : undefined
    return {
      ...lifecycle,
      ...(evidence.requestedIntents === undefined
        ? {}
        : { requestedIntents: evidence.requestedIntents }),
      workLog: publicWorkLog(evidence.workLog),
      artifacts: buildArtifactsFromSnapshot(snapshot),
      oneLine: prose.oneLine,
      answerCheckSummary: buildPublicAnswerCheckSummary(evidence.answerRun),
      ...(evidence.searchContext?.timing === undefined ? {} : { timing: evidence.searchContext.timing }),
      ...(evidence.searchContext?.timingDate === undefined ? {} : { timingDate: evidence.searchContext.timingDate }),
      ...(prose.layoutProfile === undefined ? {} : { layoutProfile: prose.layoutProfile }),
      ...(problem === undefined ? {} : { problem }),
    }
  } catch {
    return {
      ...lifecycle,
      status: 'error',
      workLog: [],
      artifacts: [],
      oneLine: '',
      problem: parsePublicTurnProblem(turn.status === 'error' ? turn.errorProblemJson : undefined),
    }
  }
}


function parsePublicTurnProblem(value: string | undefined): NonNullable<PublicThreadTurn['problem']> {
  if (value === undefined) {
    return redactAnswerTurnProblem(undefined)
  }

  try {
    const parsed: unknown = JSON.parse(value)
    return parseAnswerTurnProblemStrict(parsed) ?? redactAnswerTurnProblem(parsed)
  } catch {
    return redactAnswerTurnProblem(undefined)
  }
}

export function parseFrozenEvidence(value: string): FrozenTurnEvidence {
  const parsed: unknown = JSON.parse(value)
  if (!isCurrentFrozenEvidence(parsed)) {
    throw new Error('answer_evidence_invalid')
  }
  return parsed
}

