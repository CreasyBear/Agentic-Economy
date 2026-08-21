import {
  buildArtifactsFromSnapshot,
  type AnswerSnapshot,
  type AnswerSource,
  type AnswerWorkStep,
} from '@/modules/answer/public'
import type { AeSearchContext } from '@/modules/answer/search-context'
import type { AnswerOperationCandidate } from '@/modules/answer/answer-schema'
import {
  sanitizeAnswerOperationOutcome,
  sanitizeAnswerOperationToolCallRecord,
} from '@/modules/answer/convex'
import type { HarnessRunReport } from '@/modules/harness/public'
import type {
  AnswerContinuationSource,
  AnswerPendingDecision,
  AnswerRequestInterpretation,
  AnswerToolCallRecord,
  AnswerTurnOperationArtifacts,
  AnswerTurnRecord,
  AnswerTurnTimingEntry,
  FrozenTurnEvidence,
  FrozenTurnEvidenceDraft,
  FrozenTurnProse,
} from '../answer-thread.schema'
import { getThreadTurns } from '../answer-thread.functions'
import { parseFrozenEvidence } from './public-projection'

export type AnswerTurnRecordLite = Pick<
  AnswerTurnRecord,
  'evidenceJson' | 'query' | 'seq' | 'status' | 'turnId' | 'snapshotHash'
>

export type FrozenTurnCoreInput = {
  turnId: string
  expectedGeneration: number
  interpretation?: AnswerRequestInterpretation
  requestedIntents?: AnswerRequestInterpretation['requestedIntents']
  continuationSource?: AnswerContinuationSource
  pendingDecision?: AnswerPendingDecision
  selectedInputDigest?: string
  terminalCheckpointDigest?: string
}

export async function readPriorCompleteTurns(
  threadId: string | undefined,
  pseudonymousSessionId: string,
): Promise<AnswerTurnRecordLite[]> {
  if (threadId === undefined) {
    return []
  }

  try {
    // Answer-thread writes cap a thread at 25 turns, so one bounded native page is complete.
    const page = await getThreadTurns(threadId, pseudonymousSessionId, {
      cursor: null,
      numItems: 25,
    })
    return page.page.filter(
      (turn: AnswerTurnRecord) => turn.status === 'complete',
    )
  } catch {
    return []
  }
}

export function collectLatestFrozenProviders(
  priorTurns: readonly AnswerTurnRecordLite[],
): AnswerSource[] {
  return readLatestFrozenEvidence(priorTurns)?.providers.slice() ?? []
}

export function collectLatestFrozenAllowedSlugs(
  priorTurns: readonly AnswerTurnRecordLite[],
): string[] {
  return [...(readLatestFrozenEvidence(priorTurns)?.allowedSlugs ?? [])]
}

export function collectLatestFrozenOperationCandidates(
  priorTurns: readonly AnswerTurnRecordLite[],
): AnswerOperationCandidate[] {
  return (
    readLatestFrozenEvidence(priorTurns)?.operationCandidates?.slice() ?? []
  )
}

export function collectLatestFrozenSelectedOperationRef(
  priorTurns: readonly AnswerTurnRecordLite[],
): AnswerOperationCandidate['operationRef'] | undefined {
  const evidence = readLatestFrozenEvidence(priorTurns)
  const operationRef =
    evidence?.operationOutcome?.operationRef ??
    evidence?.operationSelection?.operationRef
  return evidence?.operationCandidates?.some(
    (candidate) => candidate.operationRef === operationRef,
  )
    ? operationRef
    : undefined
}

export function buildFrozenEvidence(
  snapshot: AnswerSnapshot,
  allowedSlugs: ReadonlySet<string>,
  toolCalls: readonly AnswerToolCallRecord[],
  searchContext: AeSearchContext | undefined,
  timings: readonly AnswerTurnTimingEntry[],
  workLog: readonly AnswerWorkStep[],
  coreInput: FrozenTurnCoreInput,
): FrozenTurnEvidenceDraft {
  const safeToolCalls = toolCalls.map(sanitizeAnswerOperationToolCallRecord)
  const safeOutcome = snapshot.operationOutcome === undefined
    ? undefined
    : sanitizeAnswerOperationOutcome(snapshot.operationOutcome)
  return {
    providers: snapshot.providers,
    ...(snapshot.operationCandidates === undefined
      ? {}
      : { operationCandidates: snapshot.operationCandidates }),
    ...(snapshot.operationCandidatesDigest === undefined
      ? {}
      : { operationCandidatesDigest: snapshot.operationCandidatesDigest }),
    ...(snapshot.operationComparison === undefined
      ? {}
      : { operationComparison: snapshot.operationComparison }),
    ...(safeOutcome === undefined
      ? {}
      : { operationOutcome: safeOutcome }),
    ...(snapshot.operationPlan === undefined
      ? {}
      : { operationPlan: snapshot.operationPlan }),
    ...(snapshot.operationSelection === undefined
      ? {}
      : { operationSelection: snapshot.operationSelection }),
    ...(snapshot.importedClaims === undefined ||
    snapshot.importedClaims.length === 0
      ? {}
      : { importedClaims: snapshot.importedClaims }),
    ...coreEvidenceFields(coreInput),
    allowedSlugs: [...allowedSlugs],
    agentJsonUrl: snapshot.agentJsonUrl,
    ...(searchContext === undefined ? {} : { searchContext }),
    toolCalls: safeToolCalls,
    timings,
    workLog,
  }
}

export function buildFrozenProse(snapshot: AnswerSnapshot): FrozenTurnProse {
  return {
    oneLine: snapshot.oneLine,
    summary: snapshot.summary,
    nextStep: snapshot.nextStep,
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    ...(snapshot.layoutProfile === undefined
      ? {}
      : { layoutProfile: snapshot.layoutProfile }),
  }
}

export function emptyEvidence(
  searchContext: AeSearchContext | undefined,
  timings: readonly AnswerTurnTimingEntry[],
  workLog: readonly AnswerWorkStep[],
  allowedSlugs: ReadonlySet<string>,
  toolCalls: readonly AnswerToolCallRecord[],
  operationArtifacts: AnswerTurnOperationArtifacts | undefined,
  coreInput: FrozenTurnCoreInput,
): FrozenTurnEvidenceDraft {
  const safeToolCalls = toolCalls.map(sanitizeAnswerOperationToolCallRecord)
  const safeOutcome = operationArtifacts?.operationOutcome === undefined
    ? undefined
    : sanitizeAnswerOperationOutcome(operationArtifacts.operationOutcome)
  return {
    providers: [],
    ...(operationArtifacts?.operationCandidates === undefined
      ? {}
      : { operationCandidates: operationArtifacts.operationCandidates }),
    ...(operationArtifacts?.operationCandidatesDigest === undefined
      ? {}
      : {
          operationCandidatesDigest:
            operationArtifacts.operationCandidatesDigest,
        }),
    ...(operationArtifacts?.operationComparison === undefined
      ? {}
      : { operationComparison: operationArtifacts.operationComparison }),
    ...(safeOutcome === undefined
      ? {}
      : { operationOutcome: safeOutcome }),
    ...(operationArtifacts?.operationPlan === undefined
      ? {}
      : { operationPlan: operationArtifacts.operationPlan }),
    ...(operationArtifacts?.operationSelection === undefined
      ? {}
      : { operationSelection: operationArtifacts.operationSelection }),
    ...coreEvidenceFields(coreInput),
    allowedSlugs: [...allowedSlugs],
    agentJsonUrl: '',
    ...(searchContext === undefined ? {} : { searchContext }),
    toolCalls: safeToolCalls,
    timings,
    workLog,
  }
}

export function emptyProse(): FrozenTurnProse {
  return { oneLine: '', summary: '', nextStep: '' }
}

export function buildArtifactKinds(
  captured: AnswerSnapshot | undefined,
  operationArtifacts: AnswerTurnOperationArtifacts | undefined,
): string[] {
  if (captured !== undefined) {
    return buildArtifactsFromSnapshot(captured).map((artifact) => artifact.kind)
  }
  return [
    ...(operationArtifacts?.operationCandidates === undefined ||
    operationArtifacts.operationCandidates.length === 0
      ? []
      : ['operation-candidates']),
    ...(operationArtifacts?.operationComparison === undefined
      ? []
      : ['operation-comparison']),
    ...(operationArtifacts?.operationPlan === undefined
      ? []
      : ['operation-plan']),
    ...(operationArtifacts?.operationOutcome === undefined
      ? []
      : ['operation-outcome']),
  ]
}

export function finalizeEvidenceJson(input: {
  evidenceJson: string
  harnessRun: HarnessRunReport
  finalizationHash: string
  journalEntryCount: number
}): string {
  const evidence = parseFrozenEvidence(input.evidenceJson)
  // Spread preserves `harnessRunRef`; the full report stays in `harnessSessionEntries`.
  const finalized: FrozenTurnEvidence = {
    ...evidence,
    harnessFinalization: {
      schemaVersion: 1,
      status: 'accepted',
      finalizationHash: input.finalizationHash,
      journalEntryCount: input.journalEntryCount,
      finalizedAt: input.harnessRun.summary.run.endedAt ?? Date.now(),
    },
  }
  return JSON.stringify(finalized)
}

function readLatestFrozenEvidence(
  priorTurns: readonly AnswerTurnRecordLite[],
): FrozenTurnEvidence | undefined {
  const sorted = priorTurns.toSorted((left, right) => right.seq - left.seq)
  for (const turn of sorted) {
    try {
      return parseFrozenEvidence(turn.evidenceJson)
    } catch {
      // Skip malformed evidence and keep looking for the latest usable turn.
    }
  }
  return undefined
}

function coreEvidenceFields(
  input: FrozenTurnCoreInput,
): Partial<Pick<
  FrozenTurnEvidenceDraft,
  | 'interpretation'
  | 'requestedIntents'
  | 'continuationSource'
  | 'pendingDecision'
  | 'selectedInputDigest'
  | 'terminalCheckpointDigest'
>> {
  const pendingDecision =
    input.pendingDecision === undefined || input.terminalCheckpointDigest === undefined
      ? input.pendingDecision
      : {
          ...input.pendingDecision,
          origin: {
            originTurnId: input.turnId,
            originGeneration: input.expectedGeneration,
            terminalCheckpointDigest: input.terminalCheckpointDigest,
          },
        }
  const interpretation = input.interpretation
  const requestedIntents =
    interpretation?.requestedIntents ?? input.requestedIntents
  const continuationSource = input.continuationSource
  const selectedInputDigest = input.selectedInputDigest
  const terminalCheckpointDigest = input.terminalCheckpointDigest
  return {
    ...(interpretation === undefined ? {} : { interpretation }),
    ...(requestedIntents === undefined ? {} : { requestedIntents }),
    ...(continuationSource === undefined ? {} : { continuationSource }),
    ...(pendingDecision === undefined ? {} : { pendingDecision }),
    ...(selectedInputDigest === undefined ? {} : { selectedInputDigest }),
    ...(terminalCheckpointDigest === undefined
      ? {}
      : { terminalCheckpointDigest }),
  }
}
