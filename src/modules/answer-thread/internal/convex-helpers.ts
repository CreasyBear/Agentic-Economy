import type { AnswerToolCallRecord, AnswerTurnRecord } from '../answer-thread.schema'

export type AdminHarnessTurnFilters = {
  status?: string
  turnId?: string
  threadId?: string
  date?: string
  hasRunEvidence?: string
}

export function adminHarnessTurnMatchesFilters(
  turn: AnswerTurnRecord,
  filters: AdminHarnessTurnFilters,
): boolean {
  const turnId = normalizeAdminFilter(filters.turnId)
  if (turnId !== undefined && turn.turnId !== turnId) {
    return false
  }

  const threadId = normalizeAdminFilter(filters.threadId)
  if (threadId !== undefined && turn.threadId !== threadId) {
    return false
  }

  const date = normalizeAdminFilter(filters.date)
  if (date !== undefined && !new Date(turn.createdAt).toISOString().startsWith(date)) {
    return false
  }

  const harnessStatus = readHarnessRunStatus(turn.evidenceJson)
  const hasRunEvidence = harnessStatus !== undefined
  if (filters.hasRunEvidence === 'yes' && !hasRunEvidence) {
    return false
  }
  if (filters.hasRunEvidence === 'no' && hasRunEvidence) {
    return false
  }

  const status = normalizeAdminFilter(filters.status)
  if (status !== undefined && status !== 'any') {
    if (status === 'missing') {
      return !hasRunEvidence
    }
    return turn.status === status || harnessStatus === status
  }

  return true
}

export function normalizeAdminRunViewerLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 100
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 250)
}

export function normalizeSessionThreadLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 20
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 50)
}

export function normalizeAdminFilter(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

type ComparableAnswerToolCall = Pick<
  AnswerToolCallRecord,
  'toolCallId' | 'seq' | 'toolId' | 'inputJson' | 'resultSummaryJson' | 'resultHash' | 'status'
> & {
  resultJson: string | undefined
}

export function toolCallsMatch(
  existing: readonly ComparableAnswerToolCall[],
  incoming: readonly ComparableAnswerToolCall[],
): boolean {
  return existing.length === incoming.length && existing.every((row, index) => {
    const candidate = incoming[index]
    return candidate !== undefined &&
      row.toolCallId === candidate.toolCallId &&
      row.seq === candidate.seq &&
      row.toolId === candidate.toolId &&
      row.inputJson === candidate.inputJson &&
      row.resultSummaryJson === candidate.resultSummaryJson &&
      row.resultJson === candidate.resultJson &&
      row.resultHash === candidate.resultHash &&
      row.status === candidate.status
  })
}

export function toToolCallRecord(row: Record<string, unknown>): AnswerToolCallRecord {
  if (typeof row.resultJson !== 'string') {
    throw new Error('answer_tool_result_missing')
  }

  return {
    toolCallId: String(row.toolCallId),
    turnId: String(row.turnId),
    seq: Number(row.seq),
    toolId: row.toolId as AnswerToolCallRecord['toolId'],
    inputJson: String(row.inputJson),
    resultSummaryJson: String(row.resultSummaryJson),
    resultJson: row.resultJson,
    resultHash: String(row.resultHash),
    status: row.status as AnswerToolCallRecord['status'],
    createdAt: Number(row.createdAt),
  }
}

export type AnswerThreadDeletionTurnDecision = {
  deleteToolCalls: number
  deleteTurn: boolean
  remainingWrites: number
  hasMoreChildren: boolean
}

export function planAnswerThreadTurnDeletion(input: {
  remainingWrites: number
  toolCallCount: number
  hasMoreChildren: boolean
}): AnswerThreadDeletionTurnDecision {
  if (input.remainingWrites <= 0) {
    return {
      deleteToolCalls: 0,
      deleteTurn: false,
      remainingWrites: 0,
      hasMoreChildren: true,
    }
  }

  if (input.toolCallCount >= input.remainingWrites) {
    return {
      deleteToolCalls: input.remainingWrites,
      deleteTurn: false,
      remainingWrites: 0,
      hasMoreChildren: true,
    }
  }

  return {
    deleteToolCalls: input.toolCallCount,
    deleteTurn: true,
    remainingWrites: input.remainingWrites - input.toolCallCount - 1,
    hasMoreChildren: input.hasMoreChildren,
  }
}

function readHarnessRunStatus(evidenceJson: string): string | undefined {
  try {
    const evidence = JSON.parse(evidenceJson) as { harnessRun?: { summary?: { run?: { status?: unknown } } } }
    const status = evidence.harnessRun?.summary?.run?.status
    return typeof status === 'string' ? status : undefined
  } catch {
    return undefined
  }
}
