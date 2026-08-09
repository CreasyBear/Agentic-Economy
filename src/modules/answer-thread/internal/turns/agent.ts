import {
  buildAnswerTurnProblem,
  collectAllowedSlugsFromToolResults,
  filterKeylessDataAskCandidates,
  type AnswerWorkStep,
} from '@/modules/answer/public'
import {
  isAnswerToolUseAgentError,
  runAnswerToolUseAgent,
} from '@/modules/answer/server'

import type { AnswerToolCallRecord } from '../../answer-thread.schema'
import type { AnswerToolPolicy } from '../answer-response-planner'
import { answerRunGateFromAnswerGate, finalizeAnswerTurnSnapshot } from '../answer-turn-safety'
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

export const agentTurnPath: TurnPath<[
  AgentInput,
  readonly AnswerToolCallRecord[],
  StreamPlanMode | undefined,
  AnswerToolPolicy | undefined,
]> = {
  id: 'agent',
  async run(ctx, agentInput, seedToolCalls = [], planMode, toolPolicy) {
    return streamAgentTurn(
      ctx,
      toolPolicy === undefined
        ? agentInput
        : {
            ...agentInput,
            maxToolCalls: toolPolicy.kind === 'registry.search' || toolPolicy.kind === 'registry.detail'
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
  const keylessDataAsk = filterKeylessDataAskCandidates(
    agentInput.query,
    agentInput.keylessDataAsk,
  )
  const capabilityCandidates = keylessDataAsk?.kind === 'resolved'
    ? keylessDataAsk.candidates
    : []
  const selectedCapability = keylessDataAsk?.kind === 'resolved'
    ? keylessDataAsk.selected
    : undefined
  const capabilityName = selectedCapability?.name.trim() || 'selected operation'
  const hasCapabilityCandidates = capabilityCandidates.length > 0
  const recoveryStartedAt = Date.now()
  if (hasCapabilityCandidates) {
    ctx.workLog.emit({
      id: 'capability.execute',
      phase: 'read',
      status: 'running',
      title: selectedCapability === undefined ? 'Choosing a live capability' : `Running ${capabilityName}`,
      summary: selectedCapability === undefined
        ? 'Choosing from the matching published operations.'
        : 'Running the selected operation.',
      startedAtMs: recoveryStartedAt,
    })
    ctx.send({
      type: 'thinking',
      step: 'read',
      label: selectedCapability === undefined ? 'Choosing a live capability…' : `Running ${capabilityName}…`,
    })
  } else if (agentInput.disableTools === true) {
    ctx.workLog.emit({
      id: 'search.registry.recovery',
      phase: 'search',
      status: 'skipped',
      title: 'Using businesses already found',
      summary: 'No extra search is needed for this follow-up.',
      completedAtMs: recoveryStartedAt,
    })
    ctx.send({ type: 'thinking', step: 'search', label: 'Searching for matches…' })
  } else {
    ctx.workLog.emit({
      id: 'search.registry.recovery',
      phase: 'search',
      status: 'running',
      title: 'Trying another search',
      summary: 'The first search did not settle the answer, so another search is underway.',
      startedAtMs: recoveryStartedAt,
    })
    ctx.send({ type: 'thinking', step: 'search', label: 'Searching for matches…' })
  }

  const stopModelTiming = ctx.timings.start('model.agent_total', {
    toolsEnabled: agentInput.disableTools !== true,
    seedToolCalls: seedToolCalls.length,
  })
  try {
    const result = await runAnswerToolUseAgent({
      ...agentInput,
      ...(keylessDataAsk === undefined ? {} : { keylessDataAsk }),
      ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
      harnessLoop: ctx.harness.loop,
      onModelRequest: (record) => {
        agentInput.onModelRequest?.(record)
        ctx.harness.loop.recordModelRequest(record)
      },
    })
    stopModelTiming({
      providerCount: result.providers.length,
      toolCalls: result.toolCalls.length,
      gateOk: result.gate.ok,
    })
    ctx.timings.add(result.timings, { phase: 'agent' })
    const capabilityCalls = result.toolCalls.filter((call) => call.toolId === 'operation.execute')
    if (hasCapabilityCandidates) {
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
          const executedCapabilityName = keylessDataAsk?.kind === 'resolved'
            ? keylessDataAsk.descriptors.find(({ operationRef }) => operationRef === executedOperationRef)?.name.trim()
            : undefined
          const selectedCapabilityName = capabilityCandidates
            .find(({ operationRef }) => operationRef === executedOperationRef)
            ?.name.trim()
          ctx.workLog.emit(buildCapabilityExecutionWorkStep(
            executedCapabilityName || selectedCapabilityName || capabilityName,
            call,
            recoveryStartedAt,
            index === 0 ? 'capability.execute' : `capability.execute.${index + 1}`,
          ))
        })
      }
    } else if (agentInput.disableTools !== true) {
      ctx.workLog.emit({
        id: 'search.registry.recovery',
        phase: 'search',
        status: result.toolCalls.length === 0 ? 'skipped' : 'complete',
        title: result.toolCalls.length === 0
          ? 'Using the first search result'
          : 'Trying another search',
        summary: result.toolCalls.length === 0
          ? 'No extra search was needed.'
          : describeProviderCount(result.providers.length, 'match'),
        detailRows: buildRecoveryWorkStepDetailRows(result.toolCalls, result.providers.length),
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
      return {
        snapshot: undefined,
        toolCalls,
        modelRequests: result.modelRequests,
        allowedSlugs: result.allowedSlugs,
        errorCopyId: copyId,
        errorProblem,
        gate,
      }
    }

    emitReadAndCompareSteps(ctx.workLog, result.providers)
    const snapshot = {
      ...withFollowUpLayout(result.snapshot, ctx.priorTurnsCount, ctx.intent),
      ...(hasCapabilityCandidates ? { layoutProfile: 'data_answer' as const } : {}),
    }
    const finalized = finalizeAnswerTurnSnapshot({
      snapshot,
      allowedSlugs: result.allowedSlugs,
    })
    if (!finalized.ok) {
      return {
        ...rejectBlockedSnapshot(toolCalls, result.allowedSlugs, finalized),
        modelRequests: result.modelRequests,
      }
    }
    const assembly = await ctx.emitOrDeferSnapshot(
      finalized.snapshot,
      'agent',
      hasCapabilityCandidates
        ? { planMode: 'answer' }
        : (planMode === undefined ? {} : { planMode }),
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
    if (hasCapabilityCandidates) {
      ctx.workLog.emit(buildCapabilityExecutionWorkStep(
        capabilityName,
        undefined,
        recoveryStartedAt,
      ))
    } else {
      ctx.workLog.emit({
        id: 'search.registry.recovery',
        phase: 'search',
        status: 'error',
        title: 'Trying another search',
        summary: 'The extra search did not complete.',
        startedAtMs: recoveryStartedAt,
        completedAtMs: Date.now(),
      })
    }
    const copyId = makeCopyId()
    const errorProblem = buildAnswerTurnProblem(
      isAnswerToolUseAgentError(error) ? error.code : 'answer_turn_failed',
    )
    return {
      snapshot: undefined,
      toolCalls: [...seedToolCalls],
      allowedSlugs: collectAllowedSlugsFromToolResults(toolCallRecordsToGateInput(seedToolCalls)),
      errorCopyId: copyId,
      errorProblem,
      gate: undefined,
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
    ...(queries.length === 0 ? [] : [{ label: 'Searches tried', value: queries.map(safeWorkLogUserText).join(' -> ') }]),
    { label: 'Matches found', value: String(providerCount) },
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
  try {
    const parsed = JSON.parse(call?.resultJson ?? '') as {
      kind?: unknown
      reason?: unknown
      code?: unknown
    }
    resultKind = typeof parsed.kind === 'string' ? parsed.kind : undefined
    resultReason = typeof parsed.reason === 'string'
      ? parsed.reason
      : typeof parsed.code === 'string' ? parsed.code : undefined
  } catch {
    // A malformed or missing execution record is represented as an error step.
  }

  const reason = resultReason === undefined ? undefined : safeWorkLogUserText(resultReason)
  const operationRef = readExecutedOperationRef(call)
  const detailRows = [
    ...(operationRef === undefined
      ? []
      : [{ label: 'Source', value: safeWorkLogUserText(operationRef) }]),
    ...(reason === undefined && resultKind !== 'ok'
      ? []
      : [{ label: 'Result', value: reason ?? 'Data returned' }]),
  ]
  const status = resultKind === 'ok' ? 'complete' : 'error'
  const summary = resultKind === 'ok'
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

  return {
    id: stepId,
    phase: 'read',
    status,
    title: `${status === 'complete' ? 'Ran' : 'Tried'} ${capabilityName}`,
    summary,
    ...(detailRows.length === 0 ? {} : { detailRows }),
    startedAtMs,
    completedAtMs: Date.now(),
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

function readExecutedOperationRef(call: AnswerToolCallRecord | undefined): string | undefined {
  try {
    const parsed = JSON.parse(call?.inputJson ?? '') as { operationRef?: unknown }
    return typeof parsed.operationRef === 'string' ? parsed.operationRef : undefined
  } catch {
    return undefined
  }
}
