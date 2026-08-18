import { v } from 'convex/values'

import {
  capabilityOperationId,
  capabilityPublicationProvenanceDigest,
  createPublicOperationRef,
} from '../src/modules/capability-supply/public'
import { internalMutation } from './_generated/server'

const batchResult = v.object({
  done: v.boolean(),
  cursor: v.string(),
  scanned: v.number(),
  updated: v.number(),
})

/**
 * One-time widen/migrate/narrow bridge for publications created before
 * admitted operation identity and publisher provenance became mandatory.
 * Safe to replay: rows with canonical operation refs and complete provenance are not rewritten.
 */
export const backfillCapabilityPublicationIdentity = internalMutation({
  args: { cursor: v.optional(v.string()), batchSize: v.optional(v.number()) },
  returns: batchResult,
  handler: async (ctx, args) => {
    const page = await ctx.db.query('capabilityPublications').paginate({
      cursor: args.cursor ?? null,
      numItems: Math.min(Math.max(args.batchSize ?? 100, 1), 250),
    })
    let updated = 0
    for (const publication of page.page) {
      const legacy = publication as typeof publication & Partial<{
        operationRef: string
        sourceRevision: string
        publisherRef: string
        authorityMode: 'provider_owned' | 'ae_curated_external'
        provenanceDigest: string
      }>
      const operationRef = createPublicOperationRef({
        operationId: capabilityOperationId(publication.capabilityId),
        publicationRef: publication.publicationRef,
        publicationRevision: publication.revision,
        contractRef: {
          capabilityId: publication.capabilityId,
          version: publication.version,
          contractDigest: publication.contractDigest,
        },
      })
      if (legacy.operationRef === operationRef
        && legacy.sourceRevision !== undefined
        && legacy.publisherRef !== undefined
        && legacy.authorityMode !== undefined
        && legacy.provenanceDigest !== undefined) continue

      const business = await ctx.db.get(publication.businessId)
      if (business === null) throw new Error('capability_publication_migration_business_missing')
      const sourceRevision = legacy.sourceRevision ?? publication.sourceDigest
      const publisherRef = legacy.publisherRef ?? `legacy-owner:${String(business.ownerId)}`
      const authorityMode = legacy.authorityMode ?? 'provider_owned'
      await ctx.db.patch(publication._id, {
        operationRef,
        sourceRevision,
        publisherRef,
        authorityMode,
        provenanceDigest: legacy.provenanceDigest ?? capabilityPublicationProvenanceDigest({
          publisherRef,
          authorityMode,
          sourceRevision,
          sourceDigest: publication.sourceDigest,
        }),
      })
      updated += 1
    }
    return {
      done: page.isDone,
      cursor: page.continueCursor,
      scanned: page.page.length,
      updated,
    }
  },
})

/**
 * One-time widen/migrate/narrow bridge for money accounts created before
 * recovery due units became mandatory. Safe to replay: present values are not rewritten.
 */
export const backfillMoneyAccountRecoveryDueUnits = internalMutation({
  args: { cursor: v.optional(v.string()), batchSize: v.optional(v.number()) },
  returns: batchResult,
  handler: async (ctx, args) => {
    const page = await ctx.db.query('moneyAccounts').paginate({
      cursor: args.cursor ?? null,
      numItems: Math.min(Math.max(args.batchSize ?? 100, 1), 250),
    })
    let updated = 0
    for (const account of page.page) {
      if (account.recoveryDueUnits !== undefined) continue
      await ctx.db.patch(account._id, { recoveryDueUnits: '0' })
      updated += 1
    }
    return {
      done: page.isDone,
      cursor: page.continueCursor,
      scanned: page.page.length,
      updated,
    }
  },
})

/**
 * Retired: Customer Request x402 attempts were rehomed onto money-owned persist.
 * Kept as a no-op so a scheduled replay cannot query the orphan table.
 */
export const backfillMoneyX402PaymentAttempts = internalMutation({
  args: { cursor: v.optional(v.string()), batchSize: v.optional(v.number()) },
  returns: batchResult,
  handler: async () => ({
    done: true,
    cursor: '',
    scanned: 0,
    updated: 0,
  }),
})
