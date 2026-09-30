// Durable failures are recorded on the original prompt so recovery remains visible after reload.
import { saveMessages } from '@convex-dev/agent'
import type { Doc } from '../../../_generated/dataModel'
import { components } from '../../../_generated/api'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { ChatTurnFailureReason } from '@/modules/actions/contract'
import { recordChatAnswer } from '@/lib/observability/journey'
import { ACTIVE_CHAT_GENERATION_MS } from '../threads/listing'

export async function unresolvedTurnCallRefs(
  ctx: Pick<QueryCtx, 'db'>,
  callRefs: readonly string[],
): Promise<string[]> {
  const unresolved: string[] = []
  for (const callRef of callRefs) {
    const call = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', query => query.eq('callRef', callRef)).unique()
    if (call !== null && (call.state === 'pending' || call.state === 'reconciliation_required'
      || call.formanceFinancialState === 'possibly_submitted'
      || call.formanceFinancialState === 'outcome_unknown'
      || call.usage?.chargeState === 'outcome_unknown')) unresolved.push(callRef)
  }
  return unresolved
}

export async function failPendingTurnSteps(ctx: MutationCtx, turn: Doc<'chatTurns'>): Promise<void> {
  if (turn.threadId === undefined || turn.promptMessageId === undefined) return
  await saveMessages(ctx, components.agent, {
    threadId: turn.threadId,
    userId: turn.accountRef,
    promptMessageId: turn.promptMessageId,
    messages: [],
    failPendingSteps: true,
  })
}


export async function expireStaleTurn(
  ctx: MutationCtx,
  input: Readonly<{ turnRef: string; promptMessageId: string; expectedDeadlineAt: number; now?: number }>,
): Promise<boolean> {
  const turn = await ctx.db.query('chatTurns')
    .withIndex('by_turnRef', query => query.eq('turnRef', input.turnRef)).unique()
  if (turn === null || turn.promptMessageId !== input.promptMessageId || turn.cancelRequestedAt !== undefined
    || ['completed', 'failed', 'rejected', 'canceled'].includes(turn.state)) return false
  const threadId = turn.threadId
  if (threadId === undefined) return false
  const thread = await ctx.db.query('chatThreads')
    .withIndex('by_threadId', query => query.eq('threadId', threadId)).unique()
  if (thread === null || thread.activePromptMessageId !== input.promptMessageId) return false
  const deadlineAt = turn.deadlineAt ?? (thread.activeStartedAt === undefined
    ? undefined : thread.activeStartedAt + ACTIVE_CHAT_GENERATION_MS)
  const now = input.now ?? Date.now()
  if (deadlineAt !== input.expectedDeadlineAt || deadlineAt === undefined || now < deadlineAt) return false

  const callRefs = await unresolvedTurnCallRefs(ctx, turn.inFlightCallRefs ?? [])
  const failureReason: ChatTurnFailureReason = callRefs.length > 0 ? 'outcome_unknown' : 'generation_timed_out'
  await failPendingTurnSteps(ctx, turn)
  recordChatAnswer(turn.state, 'failed')
  await ctx.db.patch(turn._id, {
    state: 'failed', failureReason,
    ...(callRefs.length === 0 ? { failureCallRefs: undefined } : { failureCallRefs: callRefs }),
    updatedAt: now,
  })
  await ctx.db.patch(thread._id, {
    activePromptMessageId: undefined,
    activeStartedAt: undefined,
    updatedAt: now,
  })
  return true
}
