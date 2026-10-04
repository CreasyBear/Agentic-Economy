import type { MutationCtx } from '../../../_generated/server'
import { recordChatAnswer } from '@/lib/observability/journey'
import type { ObjectType } from 'convex/values'
import { resolveOwnerChatActor } from '../threads/listing'
import { chatThreadBelongsToPrincipal } from '../threads/ownership'
import { publicChatTurn } from './errors'
import { ownerReadableActor, requirePrincipalTurn, reserveAndStartTurn, resolveTurnActor } from './handlers'
import { expireStaleTurn, failPendingTurnSteps, unresolvedTurnCallRefs } from './recovery'
import type { startTurnArgs, cancelTurnArgs, recordOwnerChatCallArgs, finishTurnArgs } from './contracts'
import { issueSearchContinuation, resolveSearchContinuation } from './searchContinuation'
import { requireSourceWrite } from '../../security/sourceWrite/admission'


export const startTurnHandler = async (ctx: MutationCtx, args: ObjectType<typeof startTurnArgs>) => publicChatTurn(async () => {
    // Production Clerk turns can purchase Tools during generation. Require the
    // existing request-bound source proof before reserving a turn or scheduling work.
    if (args.principal.kind === 'clerk' && process.env.AE_DEPLOYMENT_ENVIRONMENT === 'production') {
      const admission = await requireSourceWrite(ctx, args, 'protected_action')
      if (admission.kind !== 'accepted') throw new Error('unauthenticated')
    }
    const actor = args.principal.kind === 'clerk'
      ? await resolveOwnerChatActor(ctx) ?? await resolveTurnActor(ctx, args.principal, args, true)
      : await resolveTurnActor(ctx, args.principal, args, true)
    let selectedThread = args.threadId
    const threadRef = selectedThread
    if (actor.origin === 'owner_chat' && threadRef !== undefined) {
      const row = await ctx.db.query('chatThreads')
        .withIndex('by_threadId', q => q.eq('threadId', threadRef)).unique()
      if (row === null || !chatThreadBelongsToPrincipal(row, actor.accountRef, 'agent_key', actor.principalRef)) {
        selectedThread = undefined
      }
    }
    const searchContinuation = args.continuation === undefined ? undefined
      : await resolveSearchContinuation(ctx, { actor, threadId: selectedThread, ...args.continuation })
    return await reserveAndStartTurn(ctx, { actor, threadId: selectedThread,
      prompt: searchContinuation === undefined ? args.prompt : `Show more results for ${searchContinuation.query}`,
      clientTurnId: args.clientTurnId,
      ...(searchContinuation === undefined ? {} : { searchContinuation }) })
  })

export const cancelTurnHandler = async (ctx: MutationCtx, args: ObjectType<typeof cancelTurnArgs>) => publicChatTurn(async () => {
    const actor = await ownerReadableActor(ctx, args.principal, args.turnRef, args, true)
    const turn = await requirePrincipalTurn(ctx, args.turnRef, actor)
    if (turn.cancelRequestedAt === undefined) {
      const now = Date.now()
      await ctx.db.patch(turn._id, {
        cancelRequestedAt: now,
        ...(turn.state === 'completed' || turn.state === 'failed' || turn.state === 'rejected'
          ? {} : { state: 'canceled' as const }),
        updatedAt: now,
      })
    }
    const unresolved = await unresolvedTurnCallRefs(ctx, turn.inFlightCallRefs ?? [])
    const effects = unresolved.map(callRef => ({ callRef }))
    return effects.length === 0
      ? { kind: 'stopped' as const, turnRef: turn.turnRef, inFlightEffects: [] }
      : { kind: 'in_flight' as const, turnRef: turn.turnRef, inFlightEffects: effects }
  })

export const recordOwnerChatCallHandler = async (ctx: MutationCtx, { authority, quoteRef, callRef }: ObjectType<typeof recordOwnerChatCallArgs>) => {
    if (authority.applicationRef !== 'ae-owner-chat') return false
    const turn = await ctx.db.query('chatTurns')
      .withIndex('by_turnRef', q => q.eq('turnRef', authority.turnRef)).unique()
    const call = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', q => q.eq('callRef', callRef)).unique()
    if (turn?.origin !== 'owner_chat' || turn.credentialLocator !== authority.credentialLocator
      || turn.grantRef !== authority.grantRef || call?.quoteRef !== quoteRef
      || call.ownerId !== turn.accountRef || call.principalId !== turn.principalRef
      || call.credentialId !== turn.credentialLocator || call.grantRef !== turn.grantRef
      || call.applicationRef !== 'ae-owner-chat'
      || !turn.inFlightCallRefs?.includes(callRef)) return false
    if (!turn.callRefs?.includes(callRef)) {
      await ctx.db.patch(turn._id, { callRefs: [...(turn.callRefs ?? []), callRef], updatedAt: Date.now() })
    }
    return true
  }

export const finishTurnHandler = async (ctx: MutationCtx, args: ObjectType<typeof finishTurnArgs>) => {
  if (args.expectedDeadlineAt !== undefined) {
    return args.state === 'failed' && await expireStaleTurn(ctx, {
      turnRef: args.turnRef,
      promptMessageId: args.promptMessageId,
      expectedDeadlineAt: args.expectedDeadlineAt,
    })
  }
  const turn = await ctx.db.query('chatTurns')
    .withIndex('by_turnRef', query => query.eq('turnRef', args.turnRef)).unique()
  if (turn === null || turn.contentRetention !== undefined || turn.promptMessageId !== args.promptMessageId || turn.cancelRequestedAt !== undefined) {
    return false
  }
  if (['completed', 'failed', 'rejected', 'canceled'].includes(turn.state)) return turn.state === args.state
  if (args.state === 'working') {
    if (turn.deadlineAt !== undefined && Date.now() >= turn.deadlineAt) {
      return await expireStaleTurn(ctx, {
        turnRef: turn.turnRef, promptMessageId: turn.promptMessageId,
        expectedDeadlineAt: turn.deadlineAt,
      })
    }
    if (turn.state !== 'submitted') return false
  }
  const now = Date.now()
  if (args.state === 'failed') {
    const callRefs = await unresolvedTurnCallRefs(ctx, turn.inFlightCallRefs ?? [])
    const failureReason = callRefs.length > 0 ? 'outcome_unknown' : args.failureReason ?? 'generation_failed'
    await failPendingTurnSteps(ctx, turn)

    recordChatAnswer(turn.state, 'failed')
    await ctx.db.patch(turn._id, {
      state: 'failed', failureReason,
      ...(callRefs.length === 0 ? { failureCallRefs: undefined } : { failureCallRefs: callRefs }),
      updatedAt: now,
    })
    return true
  }
  if (turn.state !== args.state) {
    recordChatAnswer(turn.state, args.state)
    await ctx.db.patch(turn._id, { state: args.state, updatedAt: now })
  }
  return true
}

export { issueSearchContinuation }
