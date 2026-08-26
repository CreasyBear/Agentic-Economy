import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import {
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from './_generated/server'
import { readCanonicalCompatibilityOwner, resolveBusinessActor } from './authz'
import {
  buildQualifiedUseReceipt,
  decideQualifiedUseWrite,
  qualifiedUseEligibility,
  QUALIFIED_USE_EXCLUSIONS,
  type QualifiedUseReceipt,
} from '../src/modules/money/public'
import {
  recordQualifiedUsePayoutAllocation,
  resolveCanonicalInvocationAuthority,
  type CanonicalQualifiedUseAuthority,
} from './moneyQualifiedUsePayout'
import type { Id } from './_generated/dataModel'
import { recordMarketEvidenceFact } from './marketEvidence'

const identifier = v.string()

const principalClassValue = v.union(
  v.literal('agent_key'),
  v.literal('human_owner'),
  v.literal('service'),
)

const qualifiedUseMaterialArgs = {
  invocationRef: identifier,
  attemptRef: identifier,
  effectGeneration: v.number(),
  businessId: identifier,
  operationRef: identifier,
  publicationRef: identifier,
  publicationRevision: v.number(),
  contractDigest: identifier,
  bindingDigest: identifier,
  principalClass: principalClassValue,
  requestDigest: identifier,
  responseDigest: identifier,
  evidenceRefs: v.array(identifier),
} as const

const qualifiedUseReceiptValue = v.object({
  qualifiedUseRef: identifier,
  materialDigest: identifier,
  ...qualifiedUseMaterialArgs,
  environment: v.literal('production'),
  qualifiedAt: v.number(),
  usageRef: v.optional(identifier),
  transactionRef: v.optional(identifier),
})

const recordQualifiedUseResultValue = v.union(
  v.object({
    kind: v.union(v.literal('recorded'), v.literal('replayed')),
    receipt: qualifiedUseReceiptValue,
  }),
  v.object({
    kind: v.literal('excluded'),
    reason: v.union(
      ...QUALIFIED_USE_EXCLUSIONS.map((exclusion) => v.literal(exclusion)),
    ),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.literal('qualified_use_identity_conflict'),
  }),
)

/**
 * Convex validators infer mutable arrays, so receipts cross the wire with a
 * copied `evidenceRefs` rather than the domain's readonly view.
 */
type WireQualifiedUseReceipt = Omit<QualifiedUseReceipt, 'evidenceRefs'> &
  Readonly<{ evidenceRefs: string[] }>

function toWire(receipt: QualifiedUseReceipt): WireQualifiedUseReceipt {
  return { ...receipt, evidenceRefs: [...receipt.evidenceRefs] }
}

function toReceipt(row: Doc<'qualifiedUseReceipts'>): QualifiedUseReceipt {
  return {
    qualifiedUseRef: row.qualifiedUseRef,
    materialDigest: row.materialDigest,
    invocationRef: row.invocationRef,
    attemptRef: row.attemptRef,
    effectGeneration: row.effectGeneration,
    businessId: row.businessId,
    operationRef: row.operationRef,
    publicationRef: row.publicationRef,
    publicationRevision: row.publicationRevision,
    contractDigest: row.contractDigest,
    bindingDigest: row.bindingDigest,
    principalClass: row.principalClass,
    requestDigest: row.requestDigest,
    responseDigest: row.responseDigest,
    evidenceRefs: row.evidenceRefs,
    environment: row.environment,
    qualifiedAt: row.qualifiedAt,
    ...(row.usageRef === undefined ? {} : { usageRef: row.usageRef }),
    ...(row.transactionRef === undefined
      ? {}
      : { transactionRef: row.transactionRef }),
  }
}

function receiptAuthorityMatches(
  row: Doc<'qualifiedUseReceipts'>,
  authority: CanonicalQualifiedUseAuthority,
): boolean {
  const pinned = row as typeof row & Partial<CanonicalQualifiedUseAuthority>
  return pinned.owningAccountRef === authority.owningAccountRef &&
    pinned.authorityPrincipalRef === authority.authorityPrincipalRef &&
    pinned.authorityGrantRef === authority.authorityGrantRef &&
    pinned.authorityGrantGeneration === authority.authorityGrantGeneration &&
    pinned.authorityResourceRef === authority.authorityResourceRef
}

/**
 * A supplier invoking its own operation does not accrue Qualified Use, so the
 * owner behind the invoking principal is compared against the owner of the
 * supplying business. Unknown principals are treated as third parties: the
 * caller already proved authorization before reaching delivery.
 */
async function isOwnerSelfInvocation(
  ctx: QueryCtx,
  principalId: string,
  businessId: string,
): Promise<boolean> {
  const principal = await ctx.db
    .query('agentAccessPrincipals')
    .withIndex('by_principalId', (q) => q.eq('principalId', principalId))
    .unique()
  if (principal === null) return false
  const business = await ctx.db.get(businessId as Id<'businesses'>)
  return business !== null && String(business.ownerId) === principal.ownerId
}

/**
 * Insert-once delivery evidence. Exact replay returns the original receipt;
 * the same identity carrying changed material is refused rather than updated,
 * so delivery history stays immutable.
 *
 * Callers must only reach this mutation from a contract-valid terminal
 * delivery with a released settlement; environment and owner-self exclusions
 * are re-checked here because they need durable state.
 */
export const recordQualifiedUse = internalMutation({
  args: {
    ...qualifiedUseMaterialArgs,
    principalId: identifier,
    environment: v.union(v.literal('sandbox'), v.literal('production')),
    qualifiedAt: v.number(),
    usageRef: v.optional(identifier),
    transactionRef: v.optional(identifier),
  },
  returns: recordQualifiedUseResultValue,
  handler: async (ctx, args) => {
    const eligibility = qualifiedUseEligibility({
      environment: args.environment,
      contractValidOutput: true,
      releaseOutcome: 'released',
      ownerSelfInvocation: await isOwnerSelfInvocation(
        ctx,
        args.principalId,
        args.businessId,
      ),
      refundedBeforeDelivery: false,
    })
    if (eligibility.kind === 'excluded')
      return { kind: 'excluded' as const, reason: eligibility.reason }
    const authority = await resolveCanonicalInvocationAuthority(
      ctx,
      args.invocationRef,
    )
    if (authority.authorityPrincipalRef !== args.principalId)
      throw new Error('qualified_use_payout_allocation_invalid')
    if (authority.authorityResourceRef !== args.operationRef)
      throw new Error('qualified_use_authority_invalid')
    const candidate = buildQualifiedUseReceipt(args)
    const existingRow = await ctx.db
      .query('qualifiedUseReceipts')
      .withIndex('by_qualifiedUseRef', (q) =>
        q.eq('qualifiedUseRef', candidate.qualifiedUseRef),
      )
      .unique()
    if (existingRow !== null && !receiptAuthorityMatches(existingRow, authority))
      throw new Error('qualified_use_payout_allocation_invalid')
    const existing = existingRow === null ? undefined : toReceipt(existingRow)
    if (
      existing !== undefined &&
      (existing.usageRef !== candidate.usageRef ||
        existing.transactionRef !== candidate.transactionRef)
    )
      return {
        kind: 'refused' as const,
        code: 'qualified_use_identity_conflict' as const,
      }
    const decision = decideQualifiedUseWrite({ existing, candidate })
    switch (decision.kind) {
      case 'refused':
        return { kind: 'refused' as const, code: decision.code }
      case 'replay':
        if (
          decision.receipt.usageRef !== undefined &&
          decision.receipt.transactionRef !== undefined
        ) {
          const allocationResult = await recordQualifiedUsePayoutAllocation(
            ctx,
            decision.receipt,
            args.principalId,
          )
          if (allocationResult === 'excluded_refunded_before_delivery')
            return {
              kind: 'excluded' as const,
              reason: 'refunded_before_delivery' as const,
            }
        }
        return { kind: 'replayed' as const, receipt: toWire(decision.receipt) }
      case 'write': {
        if (
          decision.receipt.usageRef !== undefined &&
          decision.receipt.transactionRef !== undefined
        ) {
          const allocationResult = await recordQualifiedUsePayoutAllocation(
            ctx,
            decision.receipt,
            args.principalId,
          )
          if (allocationResult === 'excluded_refunded_before_delivery')
            return {
              kind: 'excluded' as const,
              reason: 'refunded_before_delivery' as const,
            }
        }
        await ctx.db.insert('qualifiedUseReceipts', {
          ...toWire(decision.receipt),
          ...authority,
        })
        await recordMarketEvidenceFact(
          ctx,
          'ae_qualified_use',
          decision.receipt.qualifiedUseRef,
          decision.receipt.qualifiedAt,
        )
        return { kind: 'recorded' as const, receipt: toWire(decision.receipt) }
      }
      default: {
        const exhaustive: never = decision
        return exhaustive
      }
    }
  },
})

export const readQualifiedUseByInvocation = internalQuery({
  args: { invocationRef: identifier },
  returns: v.union(qualifiedUseReceiptValue, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('qualifiedUseReceipts')
      .withIndex('by_invocationRef', (q) =>
        q.eq('invocationRef', args.invocationRef),
      )
      .first()
    return row === null ? null : toWire(toReceipt(row))
  },
})

/**
 * Owner-bounded readback. Business authority is derived from the authenticated
 * owner, never accepted from the caller.
 */
export const readOwnerQualifiedUse = query({
  args: { limit: v.optional(v.number()) },
  returns: v.union(
    v.object({
      kind: v.literal('found'),
      businessId: identifier,
      receipts: v.array(qualifiedUseReceiptValue),
    }),
    v.object({ kind: v.literal('not_found') }),
    v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
  ),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner')
      return { kind: 'error' as const, code: 'unauthenticated' as const }
    const owner = await readCanonicalCompatibilityOwner(ctx.db, actor)
    if (owner === null) return { kind: 'not_found' as const }
    const business = await ctx.db
      .query('businesses')
      .withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id))
      .order('desc')
      .first()
    if (business === null) return { kind: 'not_found' as const }
    const businessId = String(business._id)
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100)
    const rows = await ctx.db
      .query('qualifiedUseReceipts')
      .withIndex('by_businessId_and_qualifiedAt', (q) =>
        q.eq('businessId', businessId),
      )
      .order('desc')
      .take(limit)
    return {
      kind: 'found' as const,
      businessId,
      receipts: rows.map((row) => toWire(toReceipt(row))),
    }
  },
})
