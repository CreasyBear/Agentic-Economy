import {
  buildArtifactsFromSnapshot,
  type AnswerSnapshot,
  type AnswerSource,
  type AnswerWorkStep,
} from '@/modules/answer/public'
import {
  stableAeSearchContextKey,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import { stableHash } from '@/modules/common/stable-hash'

import type {
  AnswerRunGateSummary,
  AnswerToolCallRecord,
  AnswerTurnRecord,
  AnswerTurnTimingEntry,
  FollowUpIntent,
  FrozenTurnEvidence,
  FrozenTurnProse,
} from '../answer-thread.schema'
import {
  appendAnswerTurnWithThreadAndToolCalls,
  appendAnswerTurnWithToolCalls,
  getThreadTurns,
} from '../answer-thread.functions'
import { buildAnswerHarnessOperationReport } from './answer-harness-operation'
import { buildAnswerRunReport, buildHarnessRunReportForAnswer } from './answer-run-summary'
import { parseFrozenEvidence } from './public-projection'

export type AnswerTurnRecordLite = Pick<AnswerTurnRecord, 'evidenceJson' | 'query' | 'seq' | 'status'>

export async function readPriorCompleteTurns(threadId: string | undefined): Promise<AnswerTurnRecordLite[]> {
  if (threadId === undefined) {
    return []
  }

  try {
    return (await getThreadTurns(threadId)).turns.filter((turn) => turn.status === 'complete')
  } catch {
    return []
  }
}

export type PersistAnswerTurnInput = {
  sessionId: string
  threadId: string
  isNewThread: boolean
  title: string
  turnId: string
  turnSeq: number
  query: string
  intent: FollowUpIntent
  captured: AnswerSnapshot | undefined
  errorCopyId: string | undefined
  toolCalls: readonly AnswerToolCallRecord[]
  gate: AnswerRunGateSummary | undefined
  searchContext: AeSearchContext | undefined
  timings: readonly AnswerTurnTimingEntry[]
  workLog: readonly AnswerWorkStep[]
  allowedSlugs: ReadonlySet<string>
}

export async function persistAnswerTurn(input: PersistAnswerTurnInput): Promise<boolean> {
  return persistAnswerTurnWithHarnessLoop(input)
}

export async function persistAnswerTurnWithHarnessLoop(input: PersistAnswerTurnInput): Promise<boolean> {
  const status = input.captured !== undefined ? ('complete' as const) : ('error' as const)
  const baseEvidence = input.captured !== undefined
    ? buildFrozenEvidence(input.captured, input.allowedSlugs, input.toolCalls, input.searchContext, input.timings, input.workLog)
    : emptyEvidence(input.searchContext, input.timings, input.workLog)
  const prose = input.captured !== undefined ? buildFrozenProse(input.captured) : emptyProse()
  const snapshotHash = stableHash({
    query: input.query,
    intent: input.intent,
    ...(input.searchContext === undefined ? {} : { searchContext: stableAeSearchContextKey(input.searchContext) }),
    providers: baseEvidence.providers.map((provider) => provider.slug),
    prose,
    ...(input.toolCalls.length === 0 ? {} : { toolCalls: input.toolCalls.map((call) => call.resultHash) }),
  }).toString()
  const evidenceForSummary: FrozenTurnEvidence =
    baseEvidence.toolCalls !== undefined || input.toolCalls.length === 0
      ? baseEvidence
      : { ...baseEvidence, toolCalls: input.toolCalls }
  const answerRun = buildAnswerRunReport({
    intent: input.intent,
    status,
    snapshotHash,
    evidence: evidenceForSummary,
    ...(input.gate === undefined ? {} : { gate: input.gate }),
  })
  const fallbackHarnessRun = buildHarnessRunReportForAnswer({
    runId: input.turnId,
    intent: input.intent,
    status,
    snapshotHash,
    evidence: evidenceForSummary,
    ...(input.gate === undefined ? {} : { gate: input.gate }),
  })
  const harnessRun = await buildAnswerHarnessOperationReport({
    runId: input.turnId,
    sessionId: input.sessionId,
    status,
    toolCalls: input.toolCalls,
    fallbackReport: fallbackHarnessRun,
    ...(input.gate === undefined ? {} : { gate: input.gate }),
  })
  const evidence: FrozenTurnEvidence = {
    ...evidenceForSummary,
    answerRun,
    harnessRun,
  }
  const turnRow = {
    turnId: input.turnId,
    threadId: input.threadId,
    pseudonymousSessionId: input.sessionId,
    seq: input.turnSeq,
    query: input.query,
    intent: input.intent,
    evidenceJson: JSON.stringify(evidence),
    snapshotHash,
    proseJson: JSON.stringify(prose),
    artifactKindsJson: JSON.stringify(
      input.captured === undefined ? [] : buildArtifactsFromSnapshot(input.captured).map((artifact) => artifact.kind),
    ),
    status,
    ...(input.errorCopyId === undefined ? {} : { errorCopyId: input.errorCopyId }),
    toolCalls: input.toolCalls.map((call) => ({
      toolCallId: call.toolCallId,
      seq: call.seq,
      toolId: call.toolId,
      inputJson: call.inputJson,
      resultSummaryJson: call.resultSummaryJson,
      resultHash: call.resultHash,
      status: call.status,
    })),
  }

  try {
    if (input.isNewThread) {
      await appendAnswerTurnWithThreadAndToolCalls({
        ...turnRow,
        title: input.title,
      })
      return true
    }

    await appendAnswerTurnWithToolCalls(turnRow)
    return true
  } catch {
    return false
  }
}

export function collectLatestFrozenProviders(priorTurns: readonly AnswerTurnRecordLite[]): AnswerSource[] {
  return readLatestFrozenEvidence(priorTurns)?.providers.slice() ?? []
}

export function collectLatestFrozenAllowedSlugs(priorTurns: readonly AnswerTurnRecordLite[]): string[] {
  return [...(readLatestFrozenEvidence(priorTurns)?.allowedSlugs ?? [])]
}

function readLatestFrozenEvidence(priorTurns: readonly AnswerTurnRecordLite[]): FrozenTurnEvidence | undefined {
  const sorted = priorTurns.slice().sort((left, right) => right.seq - left.seq)
  for (const turn of sorted) {
    try {
      return parseFrozenEvidence(turn.evidenceJson)
    } catch {
      // Skip malformed legacy evidence and keep looking for the latest usable turn.
    }
  }
  return undefined
}

function buildFrozenEvidence(
  snapshot: AnswerSnapshot,
  allowedSlugs: ReadonlySet<string>,
  toolCalls: readonly AnswerToolCallRecord[],
  searchContext: AeSearchContext | undefined,
  timings: readonly AnswerTurnTimingEntry[],
  workLog: readonly AnswerWorkStep[],
): FrozenTurnEvidence {
  return {
    providers: snapshot.providers,
    allowedSlugs: [...allowedSlugs],
    agentJsonUrl: snapshot.agentJsonUrl,
    ...(searchContext === undefined ? {} : { searchContext }),
    ...(toolCalls.length === 0 ? {} : { toolCalls }),
    ...(timings.length === 0 ? {} : { timings }),
    ...(workLog.length === 0 ? {} : { workLog }),
  }
}

function buildFrozenProse(snapshot: AnswerSnapshot): FrozenTurnProse {
  return {
    oneLine: snapshot.oneLine,
    summary: snapshot.summary,
    nextStep: snapshot.nextStep,
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    ...(snapshot.layoutProfile === undefined ? {} : { layoutProfile: snapshot.layoutProfile }),
  }
}

function emptyEvidence(
  searchContext?: AeSearchContext,
  timings: readonly AnswerTurnTimingEntry[] = [],
  workLog: readonly AnswerWorkStep[] = [],
): FrozenTurnEvidence {
  return {
    providers: [],
    allowedSlugs: [],
    agentJsonUrl: '',
    ...(searchContext === undefined ? {} : { searchContext }),
    ...(timings.length === 0 ? {} : { timings }),
    ...(workLog.length === 0 ? {} : { workLog }),
  }
}

function emptyProse(): FrozenTurnProse {
  return { oneLine: '', summary: '', nextStep: '' }
}
