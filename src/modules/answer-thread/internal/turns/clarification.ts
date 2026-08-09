import type { AnswerResponsePlan } from '../answer-response-planner'
import { finalizeAnswerTurnSnapshot } from '../answer-turn-safety'
import {
  rejectBlockedSnapshot,
  type TurnPath,
  type TurnPathContext,
  type TurnPathResult,
} from './types'

type ClarifyPlan = Extract<AnswerResponsePlan, { mode: 'clarify' }>

export const clarificationTurnPath: TurnPath<[ClarifyPlan]> = {
  id: 'clarification',
  async run(ctx, plan) {
    return streamClarificationTurn(ctx, plan)
  },
}

async function streamClarificationTurn(
  ctx: TurnPathContext,
  plan: ClarifyPlan,
): Promise<TurnPathResult> {
  const startedAt = Date.now()
  ctx.workLog.emit({
    id: 'route.clarify',
    phase: 'route',
    status: 'running',
    title: 'Choosing what to ask',
    summary: 'I need one more detail before I can look for a match.',
    detailRows: [{ label: 'Question', value: plan.reason === 'missing_service' ? 'What you need' : 'Where to look' }],
    startedAtMs: startedAt,
  })
  ctx.workLog.emit({
    id: 'route.clarify',
    phase: 'route',
    status: ctx.signal?.aborted === true ? 'stopped' : 'complete',
    title: 'Choosing what to ask',
    summary: 'Asking one question before I look for a match.',
    detailRows: [{ label: 'Question', value: plan.reason === 'missing_service' ? 'What you need' : 'Where to look' }],
    startedAtMs: startedAt,
    completedAtMs: Date.now(),
  })

  const allowedSlugs = new Set<string>()
  const finalized = finalizeAnswerTurnSnapshot({ snapshot: plan.snapshot, allowedSlugs })
  if (!finalized.ok) {
    return rejectBlockedSnapshot([], allowedSlugs, finalized)
  }
  const assembly = await ctx.emitOrDeferSnapshot(finalized.snapshot, 'clarification', { plan })
  return {
    snapshot: finalized.snapshot,
    toolCalls: [],
    allowedSlugs,
    errorCopyId: undefined,
    gate: finalized.gate,
    ...(assembly === undefined ? {} : { assembly }),
  }
}
