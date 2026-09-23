import { vStreamArgs } from '@convex-dev/agent'
import { vStreamDelta, vStreamMessage } from '@convex-dev/agent/validators'
import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { resolveCurrentAgentAuthority, resolveTrustedChatAuthority } from './lib/callLifecycle/authorityHandlers'
import { resolveCanonicalAgentContext } from './lib/canonicalAgentAuthority'
import {
  requirePrincipalTurn, reserveAndStartTurn, resolveTurnActor, readTurnStreams, unresolvedTurnCallRefs,
} from './lib/chat/turnHandlers'
import { publicChatTurn } from './lib/chat/publicTurnErrors'
import { chatThreadBelongsToPrincipal } from './lib/chat/threadOwnership'
import { sourceWriteArgs } from './sourceWriteAdmission'

const workStateValue = v.union(
  v.literal('submitted'), v.literal('working'), v.literal('input-required'),
  v.literal('auth-required'), v.literal('completed'), v.literal('failed'),
  v.literal('canceled'), v.literal('rejected'),
)
const keyPrincipalValue = v.object({
  kind: v.literal('agent_key'), principalId: v.string(), ownerId: v.string(),
  credentialId: v.string(), applicationRef: v.string(),
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  scopes: v.array(v.string()),
  authorityMode: v.union(
    v.literal('read_only'), v.literal('approval_required'),
    v.literal('spending_policy'), v.literal('unrestricted_test_only'),
  ),
})
const turnPrincipalValue = v.union(v.object({ kind: v.literal('clerk') }), keyPrincipalValue)
const proofArgs = {
  operationKey: v.optional(v.string()), correlationId: v.optional(v.string()), ...sourceWriteArgs,
}
const turnReadArgs = { principal: turnPrincipalValue, turnRef: v.string(), ...proofArgs }
const turnSnapshotValue = v.object({
  threadId: v.string(), turnRef: v.string(), promptMessageId: v.string(),
  state: workStateValue, sequence: v.number(), cancelRequestedAt: v.optional(v.number()),
  callRefs: v.array(v.string()), inFlightCallRefs: v.array(v.string()),
})
const startValue = v.object({
  threadId: v.string(), turnRef: v.string(), promptMessageId: v.string(),
  state: workStateValue, sequence: v.number(),
})
export const trustedChatAuthorityValue = v.object({
  kind: v.literal('agent_key'), turnRef: v.string(), credentialLocator: v.string(),
  applicationRef: v.string(), environment: v.union(v.literal('sandbox'), v.literal('production')),
  scopes: v.array(v.string()), grantRef: v.string(),
})

export const startTurn = mutation({
  args: {
    principal: turnPrincipalValue, threadId: v.optional(v.string()),
    prompt: v.string(), clientTurnId: v.string(), ...proofArgs,
  },
  returns: startValue,
  handler: async (ctx, args) => publicChatTurn(async () => {
    const actor = await resolveTurnActor(ctx, args.principal, args, true)
    return await reserveAndStartTurn(ctx, { actor, threadId: args.threadId,
      prompt: args.prompt, clientTurnId: args.clientTurnId })
  }),
})

export const cancelTurn = mutation({
  args: turnReadArgs,
  returns: v.union(
    v.object({ kind: v.literal('stopped'), turnRef: v.string(),
      inFlightEffects: v.array(v.object({ callRef: v.string() })) }),
    v.object({ kind: v.literal('in_flight'), turnRef: v.string(),
      inFlightEffects: v.array(v.object({ callRef: v.string() })) }),
  ),
  handler: async (ctx, args) => publicChatTurn(async () => {
    const actor = await resolveTurnActor(ctx, args.principal, args, true)
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
  }),
})

export const readTurn = query({
  args: turnReadArgs,
  returns: turnSnapshotValue,
  handler: async (ctx, args) => publicChatTurn(async () => {
    const actor = await resolveTurnActor(ctx, args.principal, args, false)
    const turn = await requirePrincipalTurn(ctx, args.turnRef, actor)
    if (turn.threadId === undefined || turn.promptMessageId === undefined || turn.sequence === undefined) {
      throw new Error('turn_reservation_incomplete')
    }
    return {
      threadId: turn.threadId, turnRef: turn.turnRef, promptMessageId: turn.promptMessageId,
      state: turn.state, sequence: turn.sequence,
      ...(turn.cancelRequestedAt === undefined ? {} : { cancelRequestedAt: turn.cancelRequestedAt }),
      callRefs: turn.inFlightCallRefs ?? [],
      inFlightCallRefs: await unresolvedTurnCallRefs(ctx, turn.inFlightCallRefs ?? []),
    }
  }),
})

export const readDeltas = query({
  args: { ...turnReadArgs, streamArgs: vStreamArgs },
  returns: v.object({
    turnRef: v.string(), sequence: v.number(), state: workStateValue,
    streams: v.union(
      v.object({ kind: v.literal('list'), messages: v.array(vStreamMessage) }),
      v.object({ kind: v.literal('deltas'), deltas: v.array(vStreamDelta) }),
    ),
  }),
  handler: async (ctx, args) => publicChatTurn(async () => {
    const actor = await resolveTurnActor(ctx, args.principal, args, false)
    const turn = await requirePrincipalTurn(ctx, args.turnRef, actor)
    if (turn.threadId === undefined || turn.sequence === undefined
      || turn.promptMessageId === undefined) throw new Error('turn_reservation_incomplete')
    const streams = await readTurnStreams(ctx, { ...turn,
      threadId: turn.threadId, promptMessageId: turn.promptMessageId }, args.streamArgs)
    return { turnRef: turn.turnRef, sequence: turn.sequence, state: turn.state, streams }
  }),
})

export const authorizeKeyGeneration = internalQuery({
  args: { turnRef: v.string(), threadId: v.string(), promptMessageId: v.string() },
  returns: v.union(v.object({ ownerId: v.string(), authority: trustedChatAuthorityValue }), v.null()),
  handler: async (ctx, args) => {
    const turn = await ctx.db.query('chatTurns').withIndex('by_turnRef', q => q.eq('turnRef', args.turnRef)).unique()
    if (turn === null || turn.principalKind !== 'agent_key' || turn.threadId !== args.threadId
      || turn.promptMessageId !== args.promptMessageId || turn.credentialLocator === undefined
      || turn.grantRef === undefined || turn.cancelRequestedAt !== undefined
      || turn.state === 'canceled' || turn.state === 'failed'
      || turn.state === 'completed' || turn.state === 'rejected') return null
    const row = await ctx.db.query('chatThreads')
      .withIndex('by_threadId', q => q.eq('threadId', args.threadId)).unique()
    if (row === null || !chatThreadBelongsToPrincipal(row, turn.accountRef, 'agent_key', turn.principalRef)
      || row.activePromptMessageId !== args.promptMessageId) return null
    const canonical = await resolveCanonicalAgentContext(ctx, turn.credentialLocator, Date.now())
    if (canonical === null || canonical.principalRef !== turn.principalRef
      || canonical.accountRef !== turn.accountRef) return null
    const stored = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_credentialId', q => q.eq('credentialId', canonical.credentialLocator)).unique()
    if (stored === null || stored.lifecycle !== 'active' || stored.principalId !== turn.principalRef
      || stored.ownerId !== turn.accountRef) return null
    const candidate = {
      principalId: canonical.principalRef, ownerId: canonical.accountRef,
      credentialId: turn.credentialLocator, applicationRef: stored.applicationRef,
      environment: stored.environment, scopes: stored.scopes, authorityMode: stored.authorityMode,
    }
    const current = await resolveCurrentAgentAuthority(ctx, candidate, Date.now(), { kind: 'receipt_list' })
    if (current === null || current.grantRef !== turn.grantRef) return null
    return { ownerId: turn.accountRef, authority: {
      kind: 'agent_key' as const, turnRef: turn.turnRef, credentialLocator: turn.credentialLocator,
      applicationRef: stored.applicationRef, environment: stored.environment,
      scopes: current.principal.scopes, grantRef: current.grantRef,
    } }
  },
})

export const authorizePayableTool = internalQuery({
  args: { authority: trustedChatAuthorityValue, toolRef: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => await resolveTrustedChatAuthority(ctx, args.authority, args.toolRef) !== null,
})
export const finishTurn = internalMutation({
  args: { turnRef: v.string(), promptMessageId: v.string(),
    state: v.union(v.literal('working'), v.literal('input-required'), v.literal('auth-required'),
      v.literal('completed'), v.literal('failed'), v.literal('rejected')) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const turn = await ctx.db.query('chatTurns').withIndex('by_turnRef', q => q.eq('turnRef', args.turnRef)).unique()
    if (turn === null || turn.promptMessageId !== args.promptMessageId || turn.cancelRequestedAt !== undefined
      || (['completed', 'failed', 'rejected', 'canceled'].includes(turn.state)
        && turn.state !== args.state)) return false
    if (turn.state !== args.state) await ctx.db.patch(turn._id, { state: args.state, updatedAt: Date.now() })
    return true
  },
})
