import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { TrustedChatAuthority } from '@/modules/chat/agent-turn.contracts'
import { callResultValue } from '@/modules/capability-execution/convex'
import { internalAction, internalMutation, internalQuery } from './_generated/server'
import { trustedChatAuthorityValue } from './chatTurns'
import { principalValue } from './lib/callLifecycle/contracts'
import { canonicalAgentCallCore, resolveTrustedChatAuthority } from './lib/callLifecycle/authorityHandlers'

const authorizeRef = makeFunctionReference<
  'mutation', { authority: TrustedChatAuthority; quoteRef: string }, typeof principalValue.type | null
>('chatCall:authorize')

export const authorize = internalMutation({
  args: { authority: trustedChatAuthorityValue, quoteRef: v.string() },
  returns: v.union(principalValue, v.null()),
  handler: async (ctx, { authority, quoteRef }) => {
    const quote = await ctx.db.query('capabilityQuotes')
      .withIndex('by_quoteRef', (query) => query.eq('quoteRef', quoteRef)).unique()
    if (quote === null || quote.credentialId !== authority.credentialLocator) return null
    const principal = await resolveTrustedChatAuthority(ctx, authority, quote.toolRef)
    return principal !== null && quote.principalId === principal.principalId
      && quote.accountRef === principal.ownerId && quote.applicationRef === principal.applicationRef
      && quote.environment === principal.environment ? principal : null
  },
})

export const readTurnEffects = internalQuery({
  args: { turnRef: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, { turnRef }) => {
    const turn = await ctx.db.query('chatTurns')
      .withIndex('by_turnRef', (query) => query.eq('turnRef', turnRef)).unique()
    return turn?.inFlightCallRefs ?? []
  },
})


/** Internal-only Call: the public source-write wrapper remains unchanged. */
export const call = internalAction({
  args: {
    authority: trustedChatAuthorityValue,
    quoteRef: v.string(),
    idempotencyKey: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: callResultValue,
  handler: async (ctx, args) => {
    const principal = await ctx.runMutation(authorizeRef, {
      authority: args.authority, quoteRef: args.quoteRef,
    })
    if (principal === null) return { kind: 'refused' as const, code: 'grant_not_found', retryable: false }
    return await canonicalAgentCallCore(ctx, {
      principal, quoteRef: args.quoteRef, idempotencyKey: args.idempotencyKey,
      operationKey: args.operationKey, correlationId: args.correlationId,
    }, args.authority)
  },
})
