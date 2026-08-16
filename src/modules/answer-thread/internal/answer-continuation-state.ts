import {
  extractRequestedLocation,
  type AnswerPriorTurnContext,
} from '@/modules/answer/public'
import type { AnswerOperationPresentation } from '@/modules/answer/answer-schema'
import { isRecord } from '@/modules/common/is-record'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { AeSearchContext } from '@/modules/answer/search-context'
import {
  hasAnswerServiceSignal,
} from './answer-response-planner'
import {
  type AnswerPendingDecision,
  type AnswerRequestInterpretation,
  type AnswerToolCallRecord,
  type AnswerTurnCheckpoint,
  type AnswerContinuationSource,
  type FrozenTurnEvidence,
} from '../answer-thread.schema'
import { normalizeAnswerTurnQuery } from './turn-digests'
import {
  findThreadNeedQuery,
  resolveFollowUpRegistryQuery,
} from './follow-up-query'
import { type AnswerTurnRecordLite } from './answer-turn-finalization'
import { parseFrozenEvidence } from './public-projection'
import { isPublicWorkStep } from './public-worklog'

export function selectedInputDigestFor(
  toolCalls: readonly AnswerToolCallRecord[],
  operationSelection: AnswerTurnCheckpoint['operationSelection'] | undefined,
): string | undefined {
  if (operationSelection === undefined) return undefined
  const call = toolCalls
    .toReversed()
    .find(
      (candidate) =>
        candidate.toolId === operationSelection.toolId
        && candidate.status === 'complete',
    )
  return call === undefined
    ? undefined
    : canonicalDigest(call.inputJson).toString()
}

export function pendingDecisionFor(
  outcome: AnswerTurnCheckpoint['operationOutcome'] | undefined,
  selection: AnswerTurnCheckpoint['operationSelection'] | undefined,
  toolCalls: readonly AnswerToolCallRecord[],
): AnswerPendingDecision | undefined {
  if (outcome?.toolId !== 'operation.invoke') return undefined
  const result = outcome.result
  if (
    result.kind !== 'pending'
    && result.kind !== 'needs_authority'
    && result.kind !== 'reconciliation_required'
  ) {
    return undefined
  }
  const kind =
    result.kind === 'pending'
      ? 'operation_pending'
      : result.kind === 'needs_authority'
        ? 'authority_required'
        : 'reconciliation_required'
  const inputCall = toolCalls
    .toReversed()
    .find(
      (candidate) =>
        candidate.toolId === 'operation.invoke'
        && candidate.status === 'complete',
    )
  if (
    selection?.candidateSetDigest === undefined
    || selection.descriptorDigest === undefined
    || inputCall === undefined
  ) {
    return undefined
  }
  return {
    kind,
    operationRef: outcome.operationRef,
    toolId: outcome.toolId,
    candidateSetDigest: selection.candidateSetDigest,
    descriptorDigest: selection.descriptorDigest,
    inputDigest: canonicalDigest(inputCall.inputJson).toString(),
    decisionDigest: canonicalDigest(result).toString(),
  }
}

export function isRationaleFollowUpQuery(query: string): boolean {
  const normalized = query.toLowerCase().replace(/\s+/g, ' ').trim()
  return /\b(?:why|how come|what failed|which constraints?|what constraints?|no matches?|no businesses?|couldn['’]?t find|didn['’]?t find|explain)\b/.test(
    normalized,
  )
}

export function shouldOverrideOperationRouteForBusiness(input: {
  query: string
  interpretation: AnswerRequestInterpretation | undefined
  priorOperationRef: string | undefined
}): boolean {
  const interpretation = input.interpretation
  if (
    interpretation === undefined
    || interpretation.route !== 'operation'
    || interpretation.continuation !== 'new'
    || input.priorOperationRef !== undefined
  ) {
    return false
  }

  // A model route is not enough to suppress the deterministic local-service
  // lane. Frozen/refined operation continuations remain in the operation lane.
  return hasAnswerServiceSignal(input.query)
}

export function isCorrectiveSearchFollowUp(query: string): boolean {
  const normalized = query.toLowerCase().replace(/\s+/g, ' ').trim()
  return (
    extractRequestedLocation(query) !== undefined ||
    /\b(?:only|just|licensed|registered|budget|under|within|available|tonight|today|tomorrow|this week|radius|km|exclude|must|prefer)\b/.test(
      normalized,
    )
  )
}

export function buildCorrectiveRegistryQuery(
  query: string,
  priorTurns: readonly AnswerTurnRecordLite[],
): string | undefined {
  if (!isCorrectiveSearchFollowUp(query)) {
    return undefined
  }

  const resolved = resolveFollowUpRegistryQuery(query, priorTurns)
  if (hasAnswerServiceSignal(resolved)) {
    return normalizeAnswerTurnQuery(resolved)
  }

  const priorNeed = findThreadNeedQuery(priorTurns)
  if (
    priorNeed === undefined ||
    resolved.toLowerCase().includes(priorNeed.toLowerCase())
  ) {
    return normalizeAnswerTurnQuery(resolved)
  }
  return normalizeAnswerTurnQuery(`${priorNeed} ${resolved}`)
}

export function readPriorSearchContext(
  priorTurns: readonly AnswerTurnRecordLite[],
): AeSearchContext | undefined {
  for (const turn of priorTurns.toSorted(
    (left, right) => right.seq - left.seq,
  )) {
    try {
      const context = parseFrozenEvidence(turn.evidenceJson).searchContext
      if (context !== undefined) {
        return context
      }
    } catch {
      // Ignore malformed historical evidence and keep looking for a valid context.
    }
  }
  return undefined
}

export type PriorContinuationState = Readonly<{
  source?: AnswerContinuationSource
  pendingDecision?: AnswerPendingDecision
}>

export function readPriorContinuationState(
  priorTurns: readonly AnswerTurnRecordLite[],
): PriorContinuationState {
  const turn = priorTurns.toSorted((left, right) => right.seq - left.seq)[0]
  if (turn === undefined || turn.status !== 'complete') return {}
  try {
    const evidence = parseFrozenEvidence(turn.evidenceJson)
    const terminalCheckpointDigest = evidence.terminalCheckpointDigest
    if (
      typeof terminalCheckpointDigest !== 'string'
      || terminalCheckpointDigest.length === 0
    ) {
      return {}
    }
    const source: AnswerContinuationSource = {
      priorTurnId: turn.turnId,
      priorTurnSeq: turn.seq,
      priorSnapshotHash: turn.snapshotHash,
      priorTerminalCheckpointDigest: terminalCheckpointDigest,
    }
    const pending = evidence.pendingDecision
    if (pending === undefined) {
      return { source }
    }

    const origin = pending.origin
    const selectedRef =
      evidence.operationOutcome?.operationRef
      ?? evidence.operationSelection?.operationRef
    const selectedTool =
      evidence.operationOutcome?.toolId
      ?? evidence.operationSelection?.toolId
    const matchingCandidates = evidence.operationCandidates?.filter(
      (candidate) => candidate.operationRef === pending.operationRef,
    )
    const selectedCandidate =
      matchingCandidates?.length === 1 ? matchingCandidates[0] : undefined
    const inputCall = evidence.toolCalls
      .toReversed()
      .find(
        (candidate) =>
          candidate.toolId === pending.toolId
          && candidate.status === 'complete'
          && candidate.resultHash === evidence.operationOutcome?.toolCallDigest,
      )
    const selectedInputDigest = evidence.selectedInputDigest
    const pendingIsBound =
      origin !== undefined
      && Number.isInteger(origin.originGeneration)
      && origin.originGeneration >= 0
      && origin.originTurnId === turn.turnId
      && origin.terminalCheckpointDigest === terminalCheckpointDigest
      && pending.operationRef === selectedRef
      && pending.toolId === selectedTool
      && pending.candidateSetDigest !== undefined
      && pending.candidateSetDigest === evidence.operationCandidatesDigest
      && pending.candidateSetDigest === evidence.operationSelection?.candidateSetDigest
      && pending.descriptorDigest !== undefined
      && pending.descriptorDigest === selectedCandidate?.descriptorDigest
      && pending.descriptorDigest === evidence.operationSelection?.descriptorDigest
      && selectedCandidate?.executionBindingDigest
        === evidence.operationSelection?.executionBindingDigest
      && pending.inputDigest !== undefined
      && pending.inputDigest === selectedInputDigest
      && selectedInputDigest !== undefined
      && inputCall !== undefined
      && selectedInputDigest === canonicalDigest(inputCall.inputJson).toString()
      && pending.decisionDigest !== undefined
      && evidence.operationOutcome !== undefined
      && pending.decisionDigest
        === canonicalDigest(evidence.operationOutcome.result).toString()
    if (!pendingIsBound) return { source }
    return { source, pendingDecision: pending }
  } catch {
    return {}
  }
}

export function priorTurnStatus(
  turn: AnswerTurnRecordLite,
): AnswerPriorTurnContext['status'] {
  try {
    const status = parseFrozenEvidence(turn.evidenceJson).operationOutcome?.result.kind
    return status === 'unsafe_output' ? 'refused' : status ?? turn.status
  } catch {
    return turn.status
  }
}

export function priorTurnOperation(
  turn: AnswerTurnRecordLite,
): NonNullable<AnswerPriorTurnContext['operation']> | undefined {
  try {
    const evidence = parseFrozenEvidence(turn.evidenceJson)
    const operationRef =
      evidence.operationSelection?.operationRef
      ?? evidence.operationOutcome?.operationRef
    if (operationRef === undefined) return undefined
    const candidate = evidence.operationCandidates?.find(
      (item) => item.operationRef === operationRef,
    )
    return {
      operationRef,
      ...(candidate === undefined
        ? {}
        : {
            operationId: candidate.operationId,
            label: candidate.offering.label,
          }),
    }
  } catch {
    return undefined
  }
}

export function latestPriorOperationPresentation(
  priorTurns: readonly AnswerTurnRecordLite[],
): AnswerOperationPresentation | undefined {
  for (const turn of priorTurns.toSorted((left, right) => right.seq - left.seq)) {
    try {
      const presentation = parseFrozenEvidence(turn.evidenceJson)
        .operationOutcome?.presentation
      if (presentation !== undefined) return presentation
    } catch {
      continue
    }
  }
  return undefined
}

export function readOperationInputFromToolCalls(
  toolCalls: readonly AnswerToolCallRecord[],
  operationRef: string | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (operationRef === undefined) return undefined
  for (const call of toolCalls.toReversed()) {
    if (
      (call.toolId !== 'operation.execute'
        && call.toolId !== 'operation.invoke')
      || call.status !== 'complete'
    ) {
      continue
    }
    try {
      const parsed = JSON.parse(call.inputJson) as unknown
      if (
        !isRecord(parsed)
        || parsed.operationRef !== operationRef
        || !isRecord(parsed.input)
      ) {
        continue
      }
      return parsed.input
    } catch {
      continue
    }
  }
  return undefined
}

export function readPriorOperationInput(
  priorTurns: readonly AnswerTurnRecordLite[],
): Readonly<Record<string, unknown>> | undefined {
  for (const turn of priorTurns.toSorted((left, right) => right.seq - left.seq)) {
    try {
      const evidence = parseFrozenEvidence(turn.evidenceJson)
      const operationRef =
        evidence.operationSelection?.operationRef
        ?? evidence.operationOutcome?.operationRef
      const input = readOperationInputFromToolCalls(evidence.toolCalls, operationRef)
      if (input !== undefined) return input
    } catch {
      continue
    }
  }
  return undefined
}

export function readDurableFailureEvidence(
  priorTurns: readonly AnswerTurnRecordLite[],
): string | undefined {
  for (const turn of priorTurns.toSorted(
    (left, right) => right.seq - left.seq,
  )) {
    let evidence: FrozenTurnEvidence
    try {
      evidence = parseFrozenEvidence(turn.evidenceJson)
    } catch {
      continue
    }

    const failedStep = evidence.workLog
      .toReversed()
      .find((step) => step.status === 'error' && isPublicWorkStep(step))
    const summary = failedStep?.summary?.replace(/\s+/g, ' ').trim()
    if (
      summary !== undefined
      && summary.length > 0
      && !/\b(?:thought|reasoning|prompt|model|tool|capability|internal|raw)\b/i.test(
        summary,
      )
    ) {
      return summary.slice(0, 240)
    }
  }
  return undefined
}

export function buildRationaleEvidence(input: {
  query: string
  priorTurns: readonly AnswerTurnRecordLite[]
  searchContext: AeSearchContext | undefined
}): {
  constraints: string[]
  budget?: string
  failure?: string
  operationRecall?: Readonly<{
    operationLabel: string
    sourceLabel: string
    rationale: string
    result: unknown
  }>
} {
  const queries = [...input.priorTurns.map((turn) => turn.query), input.query]
  const constraints = new Set<string>()
  const explicitLocations = queries
    .map((query) => extractRequestedLocation(query))
    .filter(
      (location): location is string =>
        location !== undefined && location.trim().length > 0,
    )
  const location =
    explicitLocations.at(-1) ?? input.searchContext?.location?.label
  if (location !== undefined) {
    constraints.add(`Location: ${location}`)
  }

  const timing =
    input.searchContext?.timing === 'date' &&
    input.searchContext.timingDate !== undefined
      ? `Timing: ${input.searchContext.timingDate}`
      : input.searchContext?.timing === undefined
        ? queries
            .toReversed()
            .find((query) =>
              /\b(?:tonight|tomorrow(?: morning)?|today|this week|urgent)\b/i.test(
                query,
              ),
            )
        : `Timing: ${input.searchContext.timing.replace('_', ' ')}`
  if (timing !== undefined) {
    constraints.add(
      timing.startsWith('Timing:')
        ? timing
        : `Timing: ${timing.match(/\b(?:tonight|tomorrow(?: morning)?|today|this week|urgent)\b/i)?.[0] ?? timing}`,
    )
  }

  if (queries.some((query) => /\blicen[cs]ed\b/i.test(query))) {
    constraints.add('Licensed providers requested')
  }
  const radius = queries
    .map((query) =>
      query.match(
        /\b(?:within|under|less than|no more than)\s+(\d+)\s*(km|kilomet(?:re|er)s?|mi(?:le)?s?)\b/i,
      ),
    )
    .find((match): match is RegExpMatchArray => match !== null)
  if (radius?.[1] !== undefined && radius[2] !== undefined) {
    constraints.add(`Distance: ${radius[1]} ${radius[2]}`)
  }

  const budgets = queries.flatMap((query) =>
    [...query.matchAll(/\b(?:A\$|AUD\s*|\$)\s?\d[\d,]*(?:\.\d{1,2})?\b/gi)].map(
      (match) => match[0].replace(/\s+/g, ''),
    ),
  )
  const uniqueBudgets = [...new Set(budgets)]
  const budget =
    uniqueBudgets.length === 0
      ? 'Budget: no explicit budget was retained'
      : uniqueBudgets.length === 1
        ? `Budget retained: ${uniqueBudgets[0]}`
        : `Budget precedence: ${uniqueBudgets.at(-1)} is the latest stated budget; earlier ${uniqueBudgets.slice(0, -1).join(' and ')} was superseded`
  const failure = readDurableFailureEvidence(input.priorTurns)
  const operationRecall = input.priorTurns
    .toSorted((left, right) => right.seq - left.seq)
    .flatMap((turn) => {
      try {
        const evidence = parseFrozenEvidence(turn.evidenceJson)
        const outcome = evidence.operationOutcome
        if (outcome === undefined) return []
        const candidate = evidence.operationCandidates?.find(
          (item) => item.operationRef === outcome.operationRef,
        )
        return [{
          operationLabel:
            outcome.presentation?.operationLabel
            ?? candidate?.offering.label
            ?? outcome.operationRef,
          sourceLabel:
            outcome.presentation?.sourceLabel
            ?? candidate?.business.name
            ?? 'the recorded operation source',
          rationale:
            candidate?.summary
            ?? candidate?.offering.summary
            ?? 'It was the frozen operation selected for the requested result.',
          result: outcome.result,
        }]
      } catch {
        return []
      }
    })
    .at(0)

  return {
    constraints: [...constraints],
    budget,
    ...(failure === undefined ? {} : { failure }),
    ...(operationRecall === undefined ? {} : { operationRecall }),
  }
}
