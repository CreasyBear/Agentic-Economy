import type { MutationCtx } from '../../../_generated/server'
import type { ObjectType } from 'convex/values'
import { resolveOwnerChatActor } from '../threads/listing'
import { chatThreadBelongsToPrincipal } from '../threads/ownership'
import { publicChatTurn } from './errors'
import { ownerReadableActor, requirePrincipalTurn, reserveAndStartTurn, resolveTurnActor, unresolvedTurnCallRefs } from './handlers'
import type { startTurnArgs, cancelTurnArgs, recordOwnerChatCallArgs, finishTurnArgs } from './contracts'

export const startTurnHandler = async (ctx: MutationCtx, args: ObjectType<typeof startTurnArgs>) => publicChatTurn(async () => {
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
    return await reserveAndStartTurn(ctx, { actor, threadId: selectedThread,
      prompt: args.prompt, clientTurnId: args.clientTurnId })
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
      || !turn.inFlightCallRefs?.includes(callRef)
      || call.state !== 'pending' || call.result?.kind !== 'needs_authority') return false
    if (!turn.callRefs?.includes(callRef)) {
      await ctx.db.patch(turn._id, { callRefs: [...(turn.callRefs ?? []), callRef], updatedAt: Date.now() })
    }
    return true
  }

export const finishTurnHandler = async (ctx: MutationCtx, args: ObjectType<typeof finishTurnArgs>) => {
    const turn = await ctx.db.query('chatTurns').withIndex('by_turnRef', q => q.eq('turnRef', args.turnRef)).unique()
    if (turn === null || turn.promptMessageId !== args.promptMessageId || turn.cancelRequestedAt !== undefined
      || (['completed', 'failed', 'rejected', 'canceled'].includes(turn.state)
        && turn.state !== args.state)) return false
    if (turn.state !== args.state) await ctx.db.patch(turn._id, { state: args.state, updatedAt: Date.now() })
    return true
  }

