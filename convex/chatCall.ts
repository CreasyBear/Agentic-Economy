import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { TrustedChatAuthority } from '@/modules/chat/agent-turn.contracts'
import { parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import { callResultValue } from '@/modules/capability-execution/convex'
import { internal } from './_generated/api'
import { internalAction, internalQuery, query } from './_generated/server'
import { internalMutation } from './usageTrackedMutation'
import { trustedChatAuthorityValue } from './lib/chat/turns/contracts'
import { principalValue } from './lib/capabilityExecution/callLifecycle/contracts'
import { approvalDecisionContextValue } from './lib/capabilityExecution/callLifecycle/admissionApproval'
import { readCallApprovalDecisionContext } from './lib/capabilityExecution/callLifecycle/admissionApprovals'
import { requireChatOwner } from './chatThreads'
import { resolveOwnerChatActor } from './lib/chat/threads/listing'
import { chatThreadBelongsToPrincipal } from './lib/chat/threads/ownership'
import { canonicalAgentCallCore } from './lib/capabilityExecution/callLifecycle/agentCallExecution'
import { resolveTrustedChatAuthority } from './lib/capabilityExecution/callLifecycle/chatCallAuthority'

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

export const quoteToolRef = internalQuery({
  args: { quoteRef: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { quoteRef }) => (await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (query) => query.eq('quoteRef', quoteRef)).unique())?.toolRef ?? null,
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

const amountValue = v.object({ currency: v.string(), units: v.string(), exponent: v.number() })
const pendingCardValue = v.object({
  kind: v.literal('pending'), turnRef: v.string(), callRef: v.string(), quoteRef: v.string(),
  toolRef: v.string(), toolName: v.string(),
  provider: v.object({ kind: v.union(v.literal('verified'), v.literal('host')), name: v.string(), href: v.optional(v.string()) }),
  quoteAmount: amountValue, expiresAt: v.number(), inputSummary: v.string(),
  remainingCap: v.optional(v.object({ amount: amountValue, window: v.string() })),
  blockedReason: v.optional(v.string()),
  decisionContext: v.optional(approvalDecisionContextValue),
  acceptedIdentity: v.optional(v.object({
    accountRef: v.string(), toolRef: v.string(), toolVersion: v.number(),
    grantRef: v.string(), grantGeneration: v.number(), policyDigest: v.string(),
  })),
})
const outcomeCardValue = v.object({
  kind: v.literal('result'), turnRef: v.string(), callRef: v.string(),
  status: v.union(v.literal('pending'), v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required'), v.literal('cancelled')),
  detail: v.string(), purchaseKind: v.union(v.literal('pending'), v.literal('uncertain'), v.literal('delivered'), v.literal('refunded'), v.literal('failed')),
  payment: v.string(), delivery: v.string(), receiptHref: v.optional(v.string()),
})
export type OwnerChatServerCard = typeof pendingCardValue.type | typeof outcomeCardValue.type

/** Only the owner of the dedicated key-bound thread can read server Call and Quote facts. */
export const readOwnerChatCards = query({
  args: { threadId: v.string() },
  returns: v.array(v.union(pendingCardValue, outcomeCardValue)),
  handler: async (ctx, { threadId }) => {
    const owner = await requireChatOwner(ctx)
    const actor = await resolveOwnerChatActor(ctx)
    if (actor === null) return []
    const thread = await ctx.db.query('chatThreads')
      .withIndex('by_threadId', q => q.eq('threadId', threadId)).unique()
    if (thread === null || !chatThreadBelongsToPrincipal(thread, owner.canonicalAccountRef, 'agent_key', actor.principalRef)) return []
    const turns = await ctx.db.query('chatTurns')
      .withIndex('by_threadId_and_sequence', q => q.eq('threadId', threadId)).order('desc').take(50)
    const result: OwnerChatServerCard[] = []
    for (const turn of turns) {
      if (turn.origin !== 'owner_chat' || turn.state === 'submitted' || turn.state === 'working'
        || turn.principalRef !== actor.principalRef
        || turn.credentialLocator !== actor.credentialLocator || turn.grantRef !== actor.grantRef) continue
      for (const callRef of turn.callRefs ?? []) {
        const call = await ctx.db.query('capabilityCalls')
          .withIndex('by_callRef', q => q.eq('callRef', callRef)).unique()
        if (call === null || call.ownerId !== owner.canonicalAccountRef
          || call.principalId !== actor.principalRef || call.credentialId !== actor.credentialLocator
          || call.applicationRef !== 'ae-owner-chat' || call.grantRef !== actor.grantRef) continue
        const quoteRef = call.quoteRef
        if (call.state === 'pending' && call.result?.kind === 'needs_authority' && quoteRef !== undefined) {
          const quote = await ctx.db.query('capabilityQuotes')
            .withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
          if (quote === null || quote.state !== 'consumed' || quote.consumedCallRef !== callRef
            || quote.contentExpiredAt !== undefined || quote.normalizedInputJson === undefined
            || quote.accountRef !== call.ownerId || quote.principalId !== call.principalId
            || quote.credentialId !== call.credentialId || quote.grantRef !== call.grantRef
            || quote.grantGeneration !== call.grantGeneration
            || quote.grantPolicyDigest !== call.policyDigest
            || quote.environment !== call.environment || quote.toolRef !== call.toolRef
            || quote.inputDigest !== call.inputDigest || quote.normalizedInputJson !== call.inputJson
            || quote.applicationRef !== 'ae-owner-chat') continue
          if (call.toolJson === undefined) continue
          const tool = parsePublishedToolSnapshot(call.toolJson)
          if (tool === undefined) continue
          const businessId = ctx.db.normalizeId('businesses', tool.identity.businessId)
          const business = businessId === null ? null : await ctx.db.get(businessId)
          const host = new URL(tool.identity.endpoint.url).hostname
          const provider = business !== null && business.publicStatus === 'published'
            && business.suppressedAt === undefined
            ? { kind: 'verified' as const, name: business.name, href: `/${business.slug}` }
            : { kind: 'host' as const, name: host, href: `/providers/${encodeURIComponent(host)}` }
          const price = BigInt(quote.decisionAudUnits)
          const budget = await ctx.db.query('moneyMonthlySpendBudgets')
            .withIndex('by_accountRef', q => q.eq('accountRef', call.ownerId)).unique()
          const candidates = [
            { units: quote.maximumSpendPerCallUnits, window: 'per Call' },
            { units: quote.dailyPeriodAvailableUnits, window: 'daily period at Quote' },
            { units: quote.monthlyPeriodAvailableUnits, window: 'monthly period at Quote' },
          ]
          const validCandidates = candidates.filter((item): item is { units: string; window: string } =>
            item.units !== undefined && /^\d+$/u.test(item.units) && BigInt(item.units) >= price)
          const binding = validCandidates.length === candidates.length && !budget?.enabled
            ? validCandidates.reduce((minimum, item) => BigInt(item.units) < BigInt(minimum.units)
              ? item : minimum)
            : null
          const decisionContext = await readCallApprovalDecisionContext(ctx, call)
          result.push({
            kind: 'pending', turnRef: turn.turnRef, callRef, quoteRef: quote.quoteRef,
            toolRef: call.toolRef, toolName: tool.contract.name, provider,
            quoteAmount: { currency: 'AUD', units: quote.decisionAudUnits, exponent: 6 },
            expiresAt: quote.expiresAt, inputSummary: quote.normalizedInputJson,
            ...(decisionContext === undefined ? {} : { decisionContext }),
            ...(decisionContext?.acceptedQuote.kind !== 'available' ? {} : { acceptedIdentity: {
              accountRef: quote.accountRef, toolRef: quote.toolRef, toolVersion: quote.toolVersion,
              grantRef: quote.grantRef, grantGeneration: quote.grantGeneration, policyDigest: quote.grantPolicyDigest,
            } }),
            ...(binding === null
              ? { blockedReason: 'Remaining spend cap cannot be verified. Approval is unavailable; request a fresh Quote.' }
              : { remainingCap: { amount: { currency: 'AUD', exponent: 6,
                  units: (BigInt(binding.units) - price).toString() }, window: binding.window } }),
          })
        } else {
          const kind = call.state === 'completed' ? (call.result?.kind === 'completed' && call.result.receipt?.state === 'refunded' ? 'refunded' : 'delivered')
            : call.state === 'reconciliation_required' ? 'uncertain'
              : call.result?.kind === 'refused' && call.result.code === 'authority_denied' ? 'failed' : 'pending'
          result.push({
            kind: 'result', turnRef: turn.turnRef, callRef, status: call.state,
            detail: call.result?.kind === 'completed' ? ('output' in call.result
              ? JSON.stringify(call.result.output) : 'Call content has expired. The purchase record remains available.')
              : call.result?.kind === 'refused' ? call.result.code
                : call.state === 'reconciliation_required' ? 'Payment or delivery remains uncertain. Check Call status before retrying.'
                  : 'The Call is awaiting a confirmed result.',
            purchaseKind: kind, payment: call.usage?.chargeState ?? 'Not yet settled',
            delivery: call.state === 'completed' ? 'Delivered' : call.state === 'reconciliation_required' ? 'Unknown' : 'Not delivered',
            ...(call.result !== undefined && 'receipt' in call.result && call.result.receipt !== undefined
              ? { receiptHref: `/calls/${encodeURIComponent(callRef)}` } : {}),
          })
        }
      }
    }
    return result
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
    requireApproval: v.optional(v.boolean()),
    /** Chat-agent Calls: the latest user message. The Call waits for owner approval unless it names the quoted Tool. */
    userRequestText: v.optional(v.string()),
  },
  returns: callResultValue,
  handler: async (ctx, args) => {
    const principal = await ctx.runMutation(authorizeRef, {
      authority: args.authority, quoteRef: args.quoteRef,
    })
    if (principal === null) return { kind: 'refused' as const, code: 'grant_not_found', retryable: false }
    let requireApproval = args.requireApproval === true
    if (args.userRequestText !== undefined) {
      const toolRef = await ctx.runQuery(internal.chatCall.quoteToolRef, { quoteRef: args.quoteRef })
      requireApproval = requireApproval || toolRef === null || !args.userRequestText.includes(toolRef)
    }
    const result = await canonicalAgentCallCore(ctx, {
      principal, quoteRef: args.quoteRef, idempotencyKey: args.idempotencyKey,
      operationKey: args.operationKey, correlationId: args.correlationId,
    }, args.authority, requireApproval)
    if (args.authority.applicationRef === 'ae-owner-chat' && result.kind !== 'refused') {
      const recorded = await ctx.runMutation(internal.chatTurns.recordOwnerChatCall, {
        authority: args.authority, quoteRef: args.quoteRef, callRef: result.callRef,
      })
      if (!recorded) throw new Error('owner_chat_pending_call_not_recorded')
    }
    return result
  },
})
