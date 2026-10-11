import type { QueryCtx } from '../../../_generated/server'
import type { ObjectType } from 'convex/values'
import { resolveTrustedChatAuthority } from '../../capabilityExecution/callLifecycle/chatCallAuthority'
import { isChatSignedOut, resolveOwnerChatActor } from '../threads/listing'
import { publicChatTurn } from './errors'
import { ownerReadableActor, requirePrincipalTurn, readTurnStreams } from './handlers'
import { unresolvedTurnCallRefs } from './recovery'
import type { readTurnArgs, readDeltasArgs, authorizePayableToolArgs } from './contracts'

export const ownerChatGrantStatusHandler = async (ctx: QueryCtx) => ({
  enabled: !await isChatSignedOut(ctx) && await resolveOwnerChatActor(ctx) !== null,
})

export const readTurnHandler = async (ctx: QueryCtx, args: ObjectType<typeof readTurnArgs>) => publicChatTurn(async () => {
    const actor = await ownerReadableActor(ctx, args.principal, args.turnRef, args, false)
    const turn = await requirePrincipalTurn(ctx, args.turnRef, actor)
    if (turn.threadId === undefined || turn.promptMessageId === undefined || turn.sequence === undefined) {
      throw new Error('turn_reservation_incomplete')
    }
    return {
      threadId: turn.threadId, turnRef: turn.turnRef, promptMessageId: turn.promptMessageId,
      state: turn.state, sequence: turn.sequence,
      ...(turn.deadlineAt === undefined ? {} : { deadlineAt: turn.deadlineAt }),
      ...(turn.cancelRequestedAt === undefined ? {} : { cancelRequestedAt: turn.cancelRequestedAt }),
      ...(turn.failureReason === undefined ? {} : {
        failureReason: turn.failureReason,
        ...(turn.failureCallRefs === undefined ? {} : { failureCallRefs: turn.failureCallRefs }),
      }),
      callRefs: [...new Set([...(turn.callRefs ?? []), ...(turn.inFlightCallRefs ?? [])])],
      inFlightCallRefs: await unresolvedTurnCallRefs(ctx, turn.inFlightCallRefs ?? []),
    }
  })

export const readDeltasHandler = async (ctx: QueryCtx, args: ObjectType<typeof readDeltasArgs>) => publicChatTurn(async () => {
    const actor = await ownerReadableActor(ctx, args.principal, args.turnRef, args, false)
    const turn = await requirePrincipalTurn(ctx, args.turnRef, actor)
    if (turn.threadId === undefined || turn.sequence === undefined
      || turn.promptMessageId === undefined) throw new Error('turn_reservation_incomplete')
    const streams = await readTurnStreams(ctx, { ...turn,
      threadId: turn.threadId, promptMessageId: turn.promptMessageId }, args.streamArgs)
    return {
      turnRef: turn.turnRef, sequence: turn.sequence, state: turn.state,
      ...(turn.deadlineAt === undefined ? {} : { deadlineAt: turn.deadlineAt }),
      ...(turn.failureReason === undefined ? {} : {
        failureReason: turn.failureReason,
        ...(turn.failureCallRefs === undefined ? {} : { failureCallRefs: turn.failureCallRefs }),
      }),
      streams,
    }
  })

/** Without a toolRef this is the cheap turn-only fence (live turn, same credential and grant); with one, full authority. */
export const authorizePayableToolHandler = async (ctx: QueryCtx, args: ObjectType<typeof authorizePayableToolArgs>) => {
  if (args.toolRef !== undefined) return await resolveTrustedChatAuthority(ctx, args.authority, args.toolRef) !== null
  const { authority } = args
  if (authority.kind !== 'agent_key') return false
  const turn = await ctx.db.query('chatTurns').withIndex('by_turnRef', (q) => q.eq('turnRef', authority.turnRef)).unique()
  return turn !== null && turn.principalKind === 'agent_key'
    && turn.credentialLocator === authority.credentialLocator && turn.grantRef === authority.grantRef
    && turn.cancelRequestedAt === undefined
    && turn.state !== 'canceled' && turn.state !== 'failed' && turn.state !== 'completed' && turn.state !== 'rejected'
}

