import { isRecord } from '@/modules/common/is-record'
import { collectAllowedSlugsFromToolResults } from './catalog-grounding'
import {
  buildDeterministicOperationProse,
} from './answer-operation-prose'
import { buildOperationArtifactsFromToolCalls } from './operation-artifacts'
import {
  sanitizeAnswerOperationOutcome,
  sanitizeAnswerOperationToolCallRecord,
} from './operation-result-presentation'
import { runAnswerGate } from './answer-gate'
import {
  snapshotProseFromAnswer,
  type AnswerProse,
} from '../answer-prose'
import {
  buildAgentJsonUrl,
  type AnswerSource,
  type AnswerSnapshot,
} from '../answer-synthesizer'
import {
  isAnswerOperationReadToolId,
  toolCallRecordsToGateInput,
  type AnswerToolCallRecord,
  type AnswerTurnTimingEntry,
} from '@/modules/answer-thread/tooling'
import type { HarnessModelRequestRecord } from '@/modules/harness/public'
import type { AeSearchContext } from '../search-context'
import {
  DEFAULT_LIMIT,
  OPERATION_EXECUTE_TOOL_ID,
  OPERATION_INVOKE_TOOL_ID,
  type AnswerToolUseAgentCheckpoint,
  type AnswerToolUseAgentInput,
  type AnswerToolUseAgentResult,
} from './answer-tool-use-agent-types'

export function finalizeAgentResult(
  input: AnswerToolUseAgentInput,
  prose: AnswerProse,
  toolCalls: readonly AnswerToolCallRecord[],
  providers: readonly AnswerSource[],
  timings: readonly AnswerTurnTimingEntry[],
  modelRequests: readonly HarnessModelRequestRecord[],
): AnswerToolUseAgentResult {
  const result = buildAgentResult(
    input,
    prose,
    toolCalls,
    providers,
    timings,
    modelRequests,
  )
  if (result.gate.ok || result.providers.length === 0) return result
  return buildAgentResult(
    input,
    buildGroundedProviderFallback(result.providers),
    toolCalls,
    providers,
    timings,
    modelRequests,
  )
}

export function buildAnswerToolUseAgentCheckpoint(input: {
  stepOrdinal: number
  toolCalls: readonly AnswerToolCallRecord[]
  providers: readonly AnswerSource[]
  modelRequests: readonly HarnessModelRequestRecord[]
  replayMessagesJson: string
}): AnswerToolUseAgentCheckpoint {
  const safeCheckpointToolCalls = input.toolCalls.map(
    sanitizeAnswerOperationToolCallRecord,
  )
  const checkpointArtifacts = buildOperationArtifactsFromToolCalls(
    safeCheckpointToolCalls,
  )
  return {
    stepOrdinal: input.stepOrdinal,
    toolCalls: [...safeCheckpointToolCalls],
    priorProviders: [...input.providers],
    priorAllowedSlugs: [
      ...collectAllowedSlugsFromToolResults(
        toolCallRecordsToGateInput(safeCheckpointToolCalls),
      ),
    ],
    modelRequests: [...input.modelRequests],
    replayMessagesJson: input.replayMessagesJson,
    ...(checkpointArtifacts.selection === undefined
      ? {}
      : {
          selectedOperationRef: checkpointArtifacts.selection.operationRef,
          selectedToolId: checkpointArtifacts.selection.toolId,
          ...(checkpointArtifacts.selection.descriptorDigest === undefined
            ? {}
            : {
                descriptorDigest:
                  checkpointArtifacts.selection.descriptorDigest,
              }),
          ...(checkpointArtifacts.selection.resultDigest === undefined
            ? {}
            : { resultDigest: checkpointArtifacts.selection.resultDigest }),
        }),
    ...(checkpointArtifacts.candidates.length === 0
      ? {}
      : { operationCandidates: checkpointArtifacts.candidates }),
    ...(checkpointArtifacts.candidateSetDigest === undefined
      ? {}
      : {
          operationCandidatesDigest: checkpointArtifacts.candidateSetDigest,
        }),
    ...(checkpointArtifacts.comparison === undefined
      ? {}
      : { operationComparison: checkpointArtifacts.comparison }),
    ...(checkpointArtifacts.outcome === undefined
      ? {}
      : { operationOutcome: checkpointArtifacts.outcome }),
    ...(checkpointArtifacts.plan === undefined
      ? {}
      : { operationPlan: checkpointArtifacts.plan }),
    ...(checkpointArtifacts.selection === undefined
      ? {}
      : { operationSelection: checkpointArtifacts.selection }),
  }
}

function buildAgentResult(
  input: AnswerToolUseAgentInput,
  prose: AnswerProse,
  toolCalls: readonly AnswerToolCallRecord[],
  providers: readonly AnswerSource[],
  timings: readonly AnswerTurnTimingEntry[] = [],
  modelRequests: readonly HarnessModelRequestRecord[] = [],
): AnswerToolUseAgentResult {
  const safeToolCalls = toolCalls.map(sanitizeAnswerOperationToolCallRecord)
  const executedSamePriorOperation = safeToolCalls.some((call) => {
    if (
      (call.toolId !== OPERATION_EXECUTE_TOOL_ID
        && call.toolId !== OPERATION_INVOKE_TOOL_ID)
      || call.status !== 'complete'
    ) {
      return false
    }
    try {
      const parsed: unknown = JSON.parse(call.inputJson)
      return isRecord(parsed) && parsed.operationRef === input.priorOperationRef
    } catch {
      return false
    }
  })
  const frozenPresentation =
    input.priorOperationPresentation !== undefined &&
    input.priorOperationRef !== undefined &&
    executedSamePriorOperation
      ? {
          operationRef: input.priorOperationRef,
          presentation: input.priorOperationPresentation,
        }
      : undefined
  const operationArtifactsFromCalls = buildOperationArtifactsFromToolCalls(
    safeToolCalls,
    frozenPresentation,
  )
  const operationArtifacts =
    input.resumeCheckpoint === undefined
      ? operationArtifactsFromCalls
      : {
          candidates:
            input.resumeCheckpoint.operationCandidates ??
            operationArtifactsFromCalls.candidates,
          ...(input.resumeCheckpoint.operationCandidatesDigest === undefined
            ? operationArtifactsFromCalls.candidateSetDigest === undefined
              ? {}
              : {
                  candidateSetDigest:
                    operationArtifactsFromCalls.candidateSetDigest,
                }
            : {
                candidateSetDigest:
                  input.resumeCheckpoint.operationCandidatesDigest,
              }),
          ...(input.resumeCheckpoint.operationComparison === undefined
            ? operationArtifactsFromCalls.comparison === undefined
              ? {}
              : { comparison: operationArtifactsFromCalls.comparison }
            : { comparison: input.resumeCheckpoint.operationComparison }),
          ...(input.resumeCheckpoint.operationOutcome === undefined
            ? operationArtifactsFromCalls.outcome === undefined
              ? {}
              : { outcome: sanitizeAnswerOperationOutcome(operationArtifactsFromCalls.outcome) }
            : { outcome: sanitizeAnswerOperationOutcome(input.resumeCheckpoint.operationOutcome) }),
          ...(input.resumeCheckpoint.operationPlan === undefined
            ? operationArtifactsFromCalls.plan === undefined
              ? {}
              : { plan: operationArtifactsFromCalls.plan }
            : { plan: input.resumeCheckpoint.operationPlan }),
          ...(input.resumeCheckpoint.operationSelection === undefined
            ? operationArtifactsFromCalls.selection === undefined
              ? {}
              : { selection: operationArtifactsFromCalls.selection }
            : { selection: input.resumeCheckpoint.operationSelection }),
        }
  const toolAllowedSlugs = collectAllowedSlugsFromToolResults(
    toolCallRecordsToGateInput(safeToolCalls),
  )
  const priorAllowed = new Set(input.priorAllowedSlugs ?? [])
  const candidateAllowedSlugs = new Set<string>([...toolAllowedSlugs, ...priorAllowed])

  const agentQueryFromTools = resolveAgentQuery(safeToolCalls, input.query)

  // For non-search intents the providers come from frozen prior evidence.
  const operationNavigationAttempted = safeToolCalls.some((call) =>
    isAnswerOperationReadToolId(call.toolId),
  )
  const finalProviders: readonly AnswerSource[] = operationNavigationAttempted
    ? []
    : providers.length > 0
      ? providers
      : (input.priorProviders ?? [])
  const finalProviderSlugs = new Set(finalProviders.map((provider) => provider.slug))
  const allowedSlugs = new Set(
    [...candidateAllowedSlugs].filter((slug) => finalProviderSlugs.has(slug)),
  )

  const deterministicOperationProse =
    buildDeterministicOperationProse(safeToolCalls)
  const effectiveProse = deterministicOperationProse ?? prose
  const mapped = snapshotProseFromAnswer(effectiveProse)
  // The agent JSON URL points at the search that actually grounded the answer.
  // When the model chose a corrected `registry.search` argument (e.g.
  // "parramatta" for a misspelled "paramata"), the URL reflects that chosen
  // query while the frozen snapshot query stays honest to what the person typed.
  const agentJsonUrl = buildAgentJsonUrl(
    agentQueryFromTools,
    DEFAULT_LIMIT,
    resolveAgentJsonScope(safeToolCalls, input.searchContext),
  )
  const rawSnapshot: AnswerSnapshot = {
    query: input.query,
    oneLine: mapped.oneLine,
    providers: finalProviders,
    ...(operationArtifacts.candidates.length === 0
      ? {}
      : { operationCandidates: operationArtifacts.candidates }),
    ...(operationArtifacts.candidateSetDigest === undefined
      ? {}
      : { operationCandidatesDigest: operationArtifacts.candidateSetDigest }),
    ...(operationArtifacts.comparison === undefined
      ? {}
      : { operationComparison: operationArtifacts.comparison }),
    ...(operationArtifacts.outcome === undefined
      ? {}
      : { operationOutcome: operationArtifacts.outcome }),
    ...(operationArtifacts.plan === undefined
      ? {}
      : { operationPlan: operationArtifacts.plan }),
    ...(operationArtifacts.selection === undefined
      ? {}
      : { operationSelection: operationArtifacts.selection }),
    summary: mapped.summary,
    nextStep: mapped.nextStep,
    agentJsonUrl,
  }
  const rawGate = runAnswerGate({
    snapshot: rawSnapshot,
    allowedSlugs,
  })
  if (!rawGate.ok) {
    return {
      prose: effectiveProse,
      providers: finalProviders,
      allowedSlugs,
      toolCalls: [...safeToolCalls],
      modelRequests: [...modelRequests],
      timings: [...timings],
      snapshot: rawSnapshot,
      gate: rawGate,
    }
  }

  return {
    prose: effectiveProse,
    providers: finalProviders,
    allowedSlugs,
    toolCalls: [...safeToolCalls],
    modelRequests: [...modelRequests],
    timings: [...timings],
    snapshot: rawSnapshot,
    gate: rawGate,
  }
}

function buildGroundedProviderFallback(
  providers: readonly AnswerSource[],
): AnswerProse {
  const count = providers.length
  return {
    oneLine: `I found ${count} listed ${count === 1 ? 'business' : 'businesses'} for this request.`,
    summary:
      'The cards below show published listing details; fit, scope, price, and current availability still need confirmation.',
    whatToDoNow:
      'Open a listing and contact the business to confirm the work, price, and timing.',
  }
}

function resolveAgentQuery(
  toolCalls: readonly AnswerToolCallRecord[],
  fallback: string,
): string {
  for (const call of toolCalls.toReversed()) {
    if (call.toolId !== 'registry.search' || call.status !== 'complete') {
      continue
    }
    try {
      const input: unknown = JSON.parse(call.inputJson)
      if (
        isRecord(input) &&
        typeof input.query === 'string' &&
        input.query.trim().length > 0
      ) {
        return input.query.trim()
      }
    } catch {
      // Fall through to the next call or the fallback.
    }
  }
  return fallback
}

function resolveAgentJsonScope(
  toolCalls: readonly AnswerToolCallRecord[],
  searchContext: AeSearchContext | undefined,
): { mode?: 'near_me' | 'whole_catalogue'; location?: string } | undefined {
  for (const call of toolCalls.toReversed()) {
    if (call.toolId !== 'registry.search' || call.status !== 'complete') {
      continue
    }
    try {
      const input: unknown = JSON.parse(call.inputJson)
      if (
        !isRecord(input) ||
        typeof input.query !== 'string' ||
        input.query.trim().length === 0
      ) {
        continue
      }
      const mode =
        input.mode === 'near_me' || input.mode === 'whole_catalogue'
          ? input.mode
          : undefined
      const location =
        typeof input.location === 'string' && input.location.trim().length > 0
          ? input.location.trim()
          : undefined
      if (mode !== undefined || location !== undefined) {
        return {
          ...(mode === undefined ? {} : { mode }),
          ...(location === undefined ? {} : { location }),
        }
      }
      break
    } catch {
      // Fall through to the next call or the active search context.
    }
  }
  if (searchContext?.mode === 'whole_catalogue') {
    return { mode: 'whole_catalogue' }
  }

  return undefined
}
