import {
  buildArtifactsFromSnapshot,
  type AnswerSnapshot,
} from '@/modules/answer/projection'
import { parseAnswerTurnProblemStrict, redactAnswerTurnProblem } from '@/lib/errors'
import { isRecord } from '@/modules/common/is-record'

import type {
  AnswerTurnRecord,
  AnswerTurnReservationRecord,
  AnswerThreadRecord,
  FrozenTurnEvidence,
  FrozenTurnProse,
  PublicThreadProjection,
  PublicThreadTurn,
} from '../answer-thread.schema'
import { buildPublicAnswerCheckSummary } from './answer-run-summary'
import { publicWorkLog } from './public-worklog'

function isCurrentFrozenEvidence(value: unknown): value is FrozenTurnEvidence {
  if (!isRecord(value)) {
    return false
  }
  if (
    !Array.isArray(value.providers) ||
    !Array.isArray(value.allowedSlugs) ||
    typeof value.agentJsonUrl !== 'string' ||
    !Array.isArray(value.toolCalls) ||
    !Array.isArray(value.timings) ||
    !Array.isArray(value.workLog) ||
    !isRecord(value.answerRun)
  ) {
    return false
  }
  const summary = value.answerRun.summary
  const coverage = value.answerRun.coverage
  return isRecord(summary) &&
    isRecord(summary.tools) &&
    isRecord(summary.evidence) &&
    isRecord(summary.workLog) &&
    isRecord(summary.timings) &&
    isRecord(summary.gates) &&
    isRecord(coverage)
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
    if (
      reservation.state !== 'reserved' &&
      reservation.state !== 'answer_persisted' &&
      reservation.state !== 'stopped'
    ) {
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
    : reservation.state === 'reserved' || reservation.state === 'answer_persisted'
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
    const prose = JSON.parse(turn.proseJson) as FrozenTurnProse
    const snapshot: AnswerSnapshot = {
      query: turn.query,
      oneLine: prose.oneLine,
      providers: evidence.providers,
      ...(evidence.importedClaims === undefined ? {} : { importedClaims: evidence.importedClaims }),
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

