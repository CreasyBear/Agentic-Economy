import {
  buildAnswerTurnProblem,
  collectAllowedSlugsFromToolResults,
  type AnswerSnapshot,
  type AnswerToolUseAgentCheckpoint,
  type AnswerWorkStep,
} from '@/modules/answer/public'
import {
  operationInvokeResultSchema,
  type OperationInvokeResult,
} from '@/modules/capability-execution/operation-invoke-contracts'
import {
  ANSWER_AGENT_MAX_TOOL_CALLS,
  isAnswerToolUseAgentError,
  runAnswerToolUseAgent,
} from '@/modules/answer/server'

import type {
  AnswerToolCallRecord,
  AnswerTurnOperationArtifacts,
} from '../../answer-thread.schema'
import type { AnswerToolPolicy } from '../answer-response-planner'
import {
  answerRunGateFromAnswerGate,
  finalizeAnswerTurnSnapshot,
} from '../answer-turn-safety'
import { toolCallRecordsToGateInput } from '../tool-runner'
import { safeWorkLogUserText } from '../public-worklog'
import {
  describeProviderCount,
  emitReadAndCompareSteps,
  makeCopyId,
  rejectBlockedSnapshot,
  withFollowUpLayout,
  type StreamPlanMode,
  type TurnPath,
  type TurnPathContext,
  type TurnPathResult,
} from './types'

type AgentInput = Parameters<typeof runAnswerToolUseAgent>[0]

export const agentTurnPath: TurnPath<
  [
    AgentInput,
    readonly AnswerToolCallRecord[],
    StreamPlanMode | undefined,
    AnswerToolPolicy | undefined,
  ]
> = {
  id: 'agent',
  async run(ctx, agentInput, seedToolCalls = [], planMode, toolPolicy) {
    return streamAgentTurn(
      ctx,
      toolPolicy === undefined
        ? agentInput
        : {
            ...agentInput,
            maxToolCalls:
              toolPolicy.kind === 'registry.search' ||
              toolPolicy.kind === 'registry.detail'
                ? toolPolicy.maxCalls
                : 0,
          },
      seedToolCalls,
      planMode,
    )
  },
}

async function streamAgentTurn(
  ctx: TurnPathContext,
  agentInput: AgentInput,
  seedToolCalls: readonly AnswerToolCallRecord[] = [],
  planMode?: StreamPlanMode,
): Promise<TurnPathResult | undefined> {
  const keylessDataAsk = agentInput.keylessDataAsk
  const capabilityCandidates =
    keylessDataAsk?.kind === 'resolved' ? keylessDataAsk.candidates : []
  const selectedCapability =
    keylessDataAsk?.kind === 'resolved' ? keylessDataAsk.selected : undefined
  const capabilityName = selectedCapability?.name.trim() || 'selected operation'
  const hasCapabilityCandidates = capabilityCandidates.length > 0
  const recoveryStartedAt = Date.now()
  if (hasCapabilityCandidates) {
    ctx.workLog.emit({
      id: 'capability.execute',
      phase: 'read',
      status: 'running',
      title:
        selectedCapability === undefined
          ? 'Choosing a live capability'
          : `Running ${capabilityName}`,
      summary:
        selectedCapability === undefined
          ? 'Choosing from the matching published operations.'
          : 'Running the selected operation.',
      startedAtMs: recoveryStartedAt,
    })
    ctx.send({
      type: 'thinking',
      step: 'read',
      label:
        selectedCapability === undefined
          ? 'Choosing a live capability…'
          : `Running ${capabilityName}…`,
    })
  } else if (planMode !== 'clarify' || agentInput.disableTools !== true) {
    if (agentInput.disableTools === true) {
      ctx.workLog.emit({
        id: 'search.registry.recovery',
        phase: 'search',
        status: 'skipped',
        title: 'Using businesses already found',
        summary: 'No extra search is needed for this follow-up.',
        completedAtMs: recoveryStartedAt,
      })
    } else {
      ctx.workLog.emit({
        id: 'search.registry.recovery',
        phase: 'search',
        status: 'running',
        title: 'Trying another search',
        summary:
          'The first search did not settle the answer, so another search is underway.',
        startedAtMs: recoveryStartedAt,
      })
    }
    ctx.send({
      type: 'thinking',
      step: 'search',
      label: 'Searching for matches…',
    })
  }

  let latestCheckpoint: AnswerToolUseAgentCheckpoint | undefined
  const stopAgentTiming = ctx.timings.start('model.agent_total', {
    hasCapabilityCandidates,
  })
  let agentTimingStopped = false
  const stopModelTiming = (
    metadata?: Record<string, string | number | boolean | null>,
  ): void => {
    if (agentTimingStopped) return
    agentTimingStopped = true
    stopAgentTiming(metadata)
  }
  const maxToolCalls =
    agentInput.maxToolCalls ??
    (agentInput.effectiveRoute?.lane === 'operation' ||
      agentInput.keylessDataAsk === undefined
      ? ANSWER_AGENT_MAX_TOOL_CALLS
      : 1)
  try {
    const result = await runAnswerToolUseAgent({
      ...agentInput,
      maxToolCalls: Math.max(0, maxToolCalls - seedToolCalls.length),
      turnId: ctx.turnId,
      harnessLoop: ctx.harness.loop,
      ...(ctx.operationInvokeContext === undefined
        ? {}
        : {
            operationInvokeContext: {
              ...ctx.operationInvokeContext,
              reservationKey: ctx.reservationKey,
              generation: ctx.generation,
            },
          }),
      ...(keylessDataAsk === undefined ? {} : { keylessDataAsk }),
      ...(ctx.resumeCheckpoint === undefined
        ? {}
        : { resumeCheckpoint: ctx.resumeCheckpoint }),
      onToolCheckpoint: async (checkpoint) => {
        latestCheckpoint = checkpoint
        await ctx.persistCheckpoint?.(checkpoint)
      },
      ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
      onModelRequest: (record) => {
        agentInput.onModelRequest?.(record)
        ctx.harness.loop.recordModelRequest(record)
      },
    })
    ctx.timings.add(result.timings, { phase: 'agent' })
    stopModelTiming({
      providerCount: result.providers.length,
      toolCalls: result.toolCalls.length,
      gateOk: result.gate.ok,
    })
    const capabilityCalls = result.toolCalls.filter(
      (call) =>
        call.toolId === 'operation.execute' ||
        call.toolId === 'operation.invoke',
    )
    const operationArtifacts = readOperationArtifacts(result.snapshot)
    const hasCapabilityActivity =
      hasCapabilityCandidates ||
      capabilityCalls.length > 0 ||
      operationArtifacts !== undefined
    if (hasCapabilityActivity) {
      if (capabilityCalls.length === 0) {
        ctx.workLog.emit({
          id: 'capability.execute',
          phase: 'read',
          status: 'skipped',
          title: 'Presented available capabilities',
          summary: 'No live operation was needed yet.',
          startedAtMs: recoveryStartedAt,
          completedAtMs: Date.now(),
        })
      } else {
        capabilityCalls.forEach((call, index) => {
          const executedOperationRef = readExecutedOperationRef(call)
          const executedCapabilityName =
            keylessDataAsk?.kind === 'resolved'
              ? keylessDataAsk.descriptors
                  .find(
                    ({ operationRef }) => operationRef === executedOperationRef,
                  )
                  ?.name.trim()
              : undefined
          const selectedCapabilityName = capabilityCandidates
            .find(({ operationRef }) => operationRef === executedOperationRef)
            ?.name.trim()
          ctx.workLog.emit(
            buildCapabilityExecutionWorkStep(
              executedCapabilityName ||
                selectedCapabilityName ||
                executedOperationRef ||
                capabilityName,
              call,
              recoveryStartedAt,
              index === 0
                ? 'capability.execute'
                : `capability.execute.${index + 1}`,
            ),
          )
        })
      }
    }
    if (
      agentInput.disableTools !== true &&
      !hasCapabilityCandidates
    ) {
      ctx.workLog.emit({
        id: 'search.registry.recovery',
        phase: 'search',
        status: result.toolCalls.length === 0 ? 'skipped' : 'complete',
        title:
          result.toolCalls.length === 0
            ? 'Using the first search result'
            : hasCapabilityActivity
              ? 'Checked registered capabilities'
              : 'Trying another search',
        summary:
          result.toolCalls.length === 0
            ? 'No extra search was needed.'
            : hasCapabilityActivity
              ? 'Current operation evidence was checked.'
              : describeProviderCount(result.providers.length, 'match'),
        detailRows: buildRecoveryWorkStepDetailRows(
          result.toolCalls,
          result.providers.length,
        ),
        relatedProviderSlugs: result.providers.map((provider) => provider.slug),
        startedAtMs: recoveryStartedAt,
        completedAtMs: Date.now(),
      })
    }
    const toolCalls = [
      ...seedToolCalls,
      ...resequenceToolCalls(result.toolCalls, seedToolCalls.length),
    ]
    const gate = answerRunGateFromAnswerGate(result.gate)
    if (!result.gate.ok) {
      const copyId = result.gate.copyId
      const errorProblem = buildAnswerTurnProblem(result.gate.code)
      const operationArtifacts = readOperationArtifacts(result.snapshot)
      return {
        snapshot: undefined,
        toolCalls,
        modelRequests: result.modelRequests,
        allowedSlugs: result.allowedSlugs,
        errorCopyId: copyId,
        errorProblem,
        gate,
        ...(operationArtifacts === undefined ? {} : { operationArtifacts }),
      }
    }

    emitReadAndCompareSteps(ctx.workLog, result.providers)
    const snapshot = {
      ...withFollowUpLayout(result.snapshot, ctx.priorTurnsCount, ctx.intent),
      ...(planMode === 'clarify'
        ? { layoutProfile: 'clarification' as const }
        : hasCapabilityActivity
          ? { layoutProfile: 'data_answer' as const }
          : {}),
    }
    const finalized = finalizeAnswerTurnSnapshot({
      snapshot,
      allowedSlugs: result.allowedSlugs,
    })
    if (!finalized.ok) {
      const operationArtifacts = readOperationArtifacts(result.snapshot)
      return {
        ...rejectBlockedSnapshot(toolCalls, result.allowedSlugs, finalized),
        modelRequests: result.modelRequests,
        ...(operationArtifacts === undefined ? {} : { operationArtifacts }),
      }
    }
    const assembly = await ctx.emitOrDeferSnapshot(
      finalized.snapshot,
      'agent',
      hasCapabilityActivity
        ? { planMode: 'answer' }
        : planMode === undefined
          ? {}
          : { planMode },
    )
    return {
      snapshot: finalized.snapshot,
      toolCalls,
      modelRequests: result.modelRequests,
      allowedSlugs: result.allowedSlugs,
      errorCopyId: undefined,
      gate: finalized.gate,
      ...(assembly === undefined ? {} : { assembly }),
    }
  } catch (error) {
    stopModelTiming({ error: true })
    const recoveryCheckpoint = latestCheckpoint ?? ctx.resumeCheckpoint
    const recoveredToolCalls = recoveryCheckpoint?.toolCalls ?? []
    const toolCalls = [
      ...seedToolCalls,
      ...resequenceToolCalls(recoveredToolCalls, seedToolCalls.length),
    ]
    const capabilityCalls = toolCalls.filter(
      (call) =>
        call.toolId === 'operation.execute' ||
        call.toolId === 'operation.invoke',
    )
    const operationArtifacts = readOperationArtifacts(recoveryCheckpoint)
    const hasCapabilityActivity =
      hasCapabilityCandidates ||
      capabilityCalls.length > 0 ||
      operationArtifacts !== undefined
    if (hasCapabilityActivity) {
      if (capabilityCalls.length === 0) {
        ctx.workLog.emit(
          buildCapabilityExecutionWorkStep(
            capabilityName,
            undefined,
            recoveryStartedAt,
          ),
        )
      } else {
        capabilityCalls.forEach((call, index) => {
          const executedOperationRef = readExecutedOperationRef(call)
          const executedCapabilityName =
            keylessDataAsk?.kind === 'resolved'
              ? keylessDataAsk.descriptors
                  .find(
                    ({ operationRef }) => operationRef === executedOperationRef,
                  )
                  ?.name.trim()
              : undefined
          ctx.workLog.emit(
            buildCapabilityExecutionWorkStep(
              executedCapabilityName || executedOperationRef || capabilityName,
              call,
              recoveryStartedAt,
              index === 0
                ? 'capability.execute'
                : `capability.execute.${index + 1}`,
            ),
          )
        })
      }
    }
    if (
      agentInput.disableTools !== true &&
      !hasCapabilityCandidates
    ) {
      ctx.workLog.emit({
        id: 'search.registry.recovery',
        phase: 'search',
        status: 'error',
        title: hasCapabilityActivity
          ? 'Checked registered capabilities'
          : 'Trying another search',
        summary: hasCapabilityActivity
          ? 'The capability call did not complete.'
          : 'The extra search did not complete.',
        startedAtMs: recoveryStartedAt,
        completedAtMs: Date.now(),
      })
    }
    const copyId = makeCopyId()
    const errorProblem = buildAnswerTurnProblem(
      isAnswerToolUseAgentError(error) ? error.code : 'answer_turn_failed',
    )
    const allowedSlugs = new Set([
      ...(recoveryCheckpoint?.priorAllowedSlugs ?? []),
      ...collectAllowedSlugsFromToolResults(
        toolCallRecordsToGateInput(toolCalls),
      ),
    ])
    return {
      snapshot: undefined,
      toolCalls,
      ...(recoveryCheckpoint === undefined
        ? {}
        : { modelRequests: recoveryCheckpoint.modelRequests }),
      allowedSlugs,
      errorCopyId: copyId,
      errorProblem,
      gate: undefined,
      ...(operationArtifacts === undefined ? {} : { operationArtifacts }),
    }
  }
}

function resequenceToolCalls(
  records: readonly AnswerToolCallRecord[],
  startSeq: number,
): AnswerToolCallRecord[] {
  return records.map((record, index) => ({
    ...record,
    seq: startSeq + index,
  }))
}
export function readOperationArtifacts(
  source:
    | AnswerSnapshot
    | AnswerToolUseAgentCheckpoint
    | AnswerTurnOperationArtifacts
    | undefined,
): AnswerTurnOperationArtifacts | undefined {
  if (source === undefined) return undefined
  if (
    source.operationCandidates === undefined &&
    source.operationCandidatesDigest === undefined &&
    source.operationComparison === undefined &&
    source.operationOutcome === undefined &&
    source.operationPlan === undefined &&
    source.operationSelection === undefined
  ) {
    return undefined
  }
  return {
    ...(source.operationCandidates === undefined
      ? {}
      : { operationCandidates: source.operationCandidates }),
    ...(source.operationCandidatesDigest === undefined
      ? {}
      : { operationCandidatesDigest: source.operationCandidatesDigest }),
    ...(source.operationComparison === undefined
      ? {}
      : { operationComparison: source.operationComparison }),
    ...(source.operationOutcome === undefined
      ? {}
      : { operationOutcome: source.operationOutcome }),
    ...(source.operationPlan === undefined
      ? {}
      : { operationPlan: source.operationPlan }),
    ...(source.operationSelection === undefined
      ? {}
      : { operationSelection: source.operationSelection }),
  }
}

function buildRecoveryWorkStepDetailRows(
  toolCalls: readonly AnswerToolCallRecord[],
  providerCount: number,
): NonNullable<AnswerWorkStep['detailRows']> {
  const queries: string[] = []
  for (const call of toolCalls) {
    const query = readToolCallQuery(call)
    if (query.length > 0) {
      queries.push(query)
    }
  }

  return [
    ...(queries.length === 0
      ? []
      : [
          {
            label: 'Searches tried',
            value: queries.map(safeWorkLogUserText).join(' -> '),
          },
        ]),
    { label: 'Results', value: String(providerCount) },
  ]
}

function buildCapabilityExecutionWorkStep(
  capabilityName: string,
  call: AnswerToolCallRecord | undefined,
  startedAtMs: number,
  stepId = 'capability.execute',
): AnswerWorkStep {
  let resultKind: string | undefined
  let resultReason: string | undefined
  let invokeResult: OperationInvokeResult | undefined
  try {
    const parsed = JSON.parse(call?.resultJson ?? '')
    if (call?.toolId === 'operation.invoke') {
      const validated = operationInvokeResultSchema.safeParse(parsed)
      if (validated.success) {
        invokeResult = validated.data
        resultKind = validated.data.kind
        resultReason =
          validated.data.kind === 'pending'
            ? `Retry after ${validated.data.retryAfterMs} ms.`
            : validated.data.kind === 'needs_authority'
              ? 'Required authority has not been granted.'
              : validated.data.kind === 'reconciliation_required'
                ? 'The outcome must be reconciled before relying on it.'
                : validated.data.kind === 'refused'
                  ? validated.data.code
                  : undefined
      }
    } else {
      const parsedRecord = parsed as {
        kind?: unknown
        reason?: unknown
        code?: unknown
      }
      resultKind =
        typeof parsedRecord.kind === 'string' ? parsedRecord.kind : undefined
      resultReason =
        typeof parsedRecord.reason === 'string'
          ? parsedRecord.reason
          : typeof parsedRecord.code === 'string'
            ? parsedRecord.code
            : undefined
    }
  } catch {
    // A malformed or missing execution record is represented as an error step.
  }

  const reason =
    resultReason === undefined ? undefined : safeWorkLogUserText(resultReason)
  const operationRef = readExecutedOperationRef(call)
  const detailRows = [
    ...(operationRef === undefined
      ? []
      : [{ label: 'Source', value: safeWorkLogUserText(operationRef) }]),
    ...(resultKind === undefined
      ? []
      : [
          {
            label: 'Result',
            value:
              reason ??
              (resultKind === 'ok' || resultKind === 'completed'
                ? 'Data returned.'
                : resultKind),
          },
        ]),
  ]
  const status: AnswerWorkStep['status'] =
    invokeResult === undefined
      ? resultKind === 'ok'
        ? 'complete'
        : 'error'
      : invokeResult.kind === 'completed'
        ? 'complete'
        : invokeResult.kind === 'pending'
          ? 'running'
          : invokeResult.kind === 'needs_authority'
            ? 'skipped'
            : invokeResult.kind === 'reconciliation_required'
              ? 'stopped'
              : 'error'
  const summary =
    invokeResult?.kind === 'completed'
      ? 'Data returned.'
      : invokeResult?.kind === 'pending'
        ? 'The operation is still running.'
        : invokeResult?.kind === 'needs_authority'
          ? 'The operation is waiting for the required authority.'
          : invokeResult?.kind === 'reconciliation_required'
            ? 'The operation outcome is unknown and requires reconciliation.'
            : resultKind === 'ok'
              ? 'Data returned.'
              : resultKind === 'refused'
                ? reason === undefined
                  ? 'The operation refused this request.'
                  : `The operation refused this request: ${reason}`
                : resultKind === 'error'
                  ? reason === undefined
                    ? 'The operation did not complete.'
                    : `The operation did not complete: ${reason}`
                  : call === undefined
                    ? 'The operation did not run.'
                    : 'The operation returned no usable result.'
  const title =
    status === 'complete'
      ? `Ran ${capabilityName}`
      : status === 'running'
        ? `Running ${capabilityName}`
        : status === 'skipped'
          ? `Waiting for authority: ${capabilityName}`
          : status === 'stopped'
            ? `Reconciliation required: ${capabilityName}`
            : `Tried ${capabilityName}`

  return {
    id: stepId,
    phase: 'read',
    status,
    title,
    summary,
    ...(detailRows.length === 0 ? {} : { detailRows }),
    startedAtMs,
    ...(status === 'running' ? {} : { completedAtMs: Date.now() }),
  }
}

function readToolCallQuery(call: AnswerToolCallRecord): string {
  try {
    const parsed = JSON.parse(call.inputJson) as { query?: unknown }
    return typeof parsed.query === 'string' ? parsed.query : ''
  } catch {
    return ''
  }
}

function readExecutedOperationRef(
  call: AnswerToolCallRecord | undefined,
): string | undefined {
  try {
    const parsed = JSON.parse(call?.inputJson ?? '') as {
      operationRef?: unknown
    }
    return typeof parsed.operationRef === 'string'
      ? parsed.operationRef
      : undefined
  } catch {
    return undefined
  }
}
