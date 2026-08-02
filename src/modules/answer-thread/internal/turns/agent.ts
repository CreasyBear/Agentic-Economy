import {
  type AnswerWorkStep,
  collectAllowedSlugsFromToolResults,
  runAnswerToolUseAgent,
} from '@/modules/answer/public'

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
  const recoveryStartedAt = Date.now()
  if (agentInput.disableTools === true) {
    ctx.workLog.emit({
      id: 'search.registry.recovery',
      phase: 'search',
      status: 'skipped',
      title: 'Using listed businesses already in view',
      summary: 'No extra listed-business search is needed for this follow-up.',
      completedAtMs: recoveryStartedAt,
    })
  } else {
    ctx.workLog.emit({
      id: 'search.registry.recovery',
      phase: 'search',
      status: 'running',
      title: 'Trying another listed-business search',
      summary: 'The first search did not settle the answer, so AE is checking another listed-business search.',
      startedAtMs: recoveryStartedAt,
    })
  }
  ctx.send({ type: 'thinking', step: 'search', label: 'Searching listed businesses…' })

  const stopModelTiming = ctx.timings.start('model.agent_total', {
    toolsEnabled: agentInput.disableTools !== true,
    seedToolCalls: seedToolCalls.length,
  })
  try {
    const result = await runAnswerToolUseAgent({
      ...agentInput,
      ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
      harnessLoop: ctx.harness.loop,
    })
    stopModelTiming({
      providerCount: result.providers.length,
      toolCalls: result.toolCalls.length,
      gateOk: result.gate.ok,
    })
    ctx.timings.add(result.timings, { phase: 'agent' })
    if (agentInput.disableTools !== true) {
      ctx.workLog.emit({
        id: 'search.registry.recovery',
        phase: 'search',
        status: result.toolCalls.length === 0 ? 'skipped' : 'complete',
        title: result.toolCalls.length === 0
          ? 'Using the first search result'
          : 'Trying another listed-business search',
        summary: result.toolCalls.length === 0
          ? 'No extra listed-business search was needed.'
          : describeProviderCount(result.providers.length, 'listed business'),
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
      ctx.send({ type: 'error', code: result.gate.code, copyId })
      return {
        snapshot: undefined,
        toolCalls,
        modelRequests: result.modelRequests,
        allowedSlugs: result.allowedSlugs,
        errorCopyId: copyId,
        gate,
      }
    }

    emitReadAndCompareSteps(ctx.workLog, result.providers)
    const snapshot = withFollowUpLayout(result.snapshot, ctx.priorTurnsCount, ctx.intent)
    const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs: result.allowedSlugs })
    if (!finalized.ok) {
      return {
        ...rejectBlockedSnapshot(ctx, toolCalls, result.allowedSlugs, finalized),
        modelRequests: result.modelRequests,
      }
    }
    const assembly = await ctx.emitOrDeferSnapshot(
      finalized.snapshot,
      'agent',
      planMode === undefined ? {} : { planMode },
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
  } catch {
    stopModelTiming({ error: true })
    ctx.workLog.emit({
      id: 'search.registry.recovery',
      phase: 'search',
      status: 'error',
      title: 'Trying another listed-business search',
      summary: 'The extra listed-business search did not complete.',
      startedAtMs: recoveryStartedAt,
      completedAtMs: Date.now(),
    })
    const copyId = makeCopyId()
    ctx.send({ type: 'error', code: 'answer_turn_failed', copyId })
    return {
      snapshot: undefined,
      toolCalls: [...seedToolCalls],
      allowedSlugs: collectAllowedSlugsFromToolResults(toolCallRecordsToGateInput(seedToolCalls)),
      errorCopyId: copyId,
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
    { label: 'Results', value: String(providerCount) },
  ]
}

function readToolCallQuery(call: AnswerToolCallRecord): string {
  try {
    const parsed = JSON.parse(call.inputJson) as { query?: unknown }
    return typeof parsed.query === 'string' ? parsed.query : ''
  } catch {
    return ''
  }
}
