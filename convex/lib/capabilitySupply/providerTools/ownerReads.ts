import { MAX_ACCESS_PATHS_PER_OFFERING } from '@/modules/catalog/public'
import {
  displayPriceFromPricingConfig,
  fixedAudPricingConfig,
  formatDisplayAmount,
  parseDecimalExactAmount,
  rescaleExactAmount,
} from '@/modules/money/public'
import { resolveBusinessActor } from '../../../authz'
import { canonicalSlugForToolRef } from '../../market/directoryIndex/rows'
import type { QueryCtx } from '../../../_generated/server'
import type { Infer } from 'convex/values'
import { listOwnerArgs, readOwnerArgs } from './contracts'
import { projectIdentity } from './projection'

export async function readOwnerHandler(ctx: QueryCtx, args: Infer<typeof readOwnerArgs>) {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'not_found' as const }
    const business = await ctx.db.get(args.businessId)
    if (business === null || business.owningAccountRef !== actor.canonicalAccountRef) {
      return { kind: 'not_found' as const }
    }
    const identity = await ctx.db.query('capabilityProviderToolProjections')
      .withIndex('by_businessId_and_offeringRef', (index) => index.eq('businessId', args.businessId).eq('offeringRef', args.offeringRef))
      .unique()
    if (identity === null) return { kind: 'not_found' as const }
    const [status, offering, revision, paths, canonical] = await Promise.all([
      projectIdentity(ctx, identity, args.now, true),
      ctx.db.query('businessOfferings')
        .withIndex('by_offeringRef', (index) => index.eq('offeringRef', identity.offeringRef))
        .unique(),
      ctx.db.query('businessOfferingRevisions')
        .withIndex('by_offeringRef_and_revision', (index) => index
          .eq('offeringRef', identity.offeringRef)
          .eq('revision', identity.offeringRevision))
        .unique(),
      ctx.db.query('offeringAccessPaths')
        .withIndex('by_offeringRef_and_offeringRevision', (index) => index.eq('offeringRef', identity.offeringRef).eq('offeringRevision', identity.offeringRevision))
        .take(21),
      canonicalSlugForToolRef(ctx, identity.toolRef),
    ])
    if (
      status === null
      || offering === null
      || revision === null
      || offering.businessId !== args.businessId
      || revision.businessId !== args.businessId
      || paths.length > 20
    ) return { kind: 'not_found' as const }
    const draft = paths.find((path) => path.integrationDraft !== undefined)?.integrationDraft
    const resumeCandidateRef = draft?.candidateRef
    const pricingLabel = identity.publicationRef === undefined ? draftPriceLabel(draft?.terms) : undefined
    return {
      kind: 'available' as const,
      statusJson: JSON.stringify(status),
      tool: {
        offeringRef: offering.offeringRef,
        currentRevision: offering.currentRevision,
        name: revision.name,
        category: revision.category,
        summary: revision.summary,
        status: offering.status,
        accessPathCount: paths.filter((path) => path.status !== 'withdrawn').length,
        ...(canonical === null ? {} : { slug: canonical.slug }),
        ...(pricingLabel === undefined ? {} : { pricingLabel }),
      },
      ...(identity.publicationRef === undefined || identity.publicationRevision === undefined
        ? {}
        : {
            maintenance: {
              offeringRef: offering.offeringRef,
              offeringRevision: identity.offeringRevision,
              offeringSourceHash: revision.sourceHash,
              publicationRef: identity.publicationRef,
              publicationRevision: identity.publicationRevision,
            },
          }),
      ...(resumeCandidateRef === undefined ? {} : { resumeCandidateRef }),
    }
}

export async function listOwnerHandler(ctx: QueryCtx, args: Infer<typeof listOwnerArgs>) {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'not_found' as const }
    const business = await ctx.db.get(args.businessId)
    if (business === null || business.owningAccountRef !== actor.canonicalAccountRef) {
      return { kind: 'not_found' as const }
    }
    const rows = await ctx.db.query('capabilityProviderToolProjections')
      .withIndex('by_businessId_and_updatedAt', (index) => index.eq('businessId', args.businessId))
      .order('desc')
      .paginate(args.paginationOpts)
    const page = await Promise.all(rows.page.map(async (identity) => {
      const [projected, offering, revision, paths, canonical] = await Promise.all([
        projectIdentity(ctx, identity, args.now, false),
        ctx.db.query('businessOfferings').withIndex('by_offeringRef', (index) => index.eq('offeringRef', identity.offeringRef)).unique(),
        ctx.db.query('businessOfferingRevisions').withIndex('by_offeringRef_and_revision', (index) => index.eq('offeringRef', identity.offeringRef).eq('revision', identity.offeringRevision)).unique(),
        ctx.db.query('offeringAccessPaths').withIndex('by_offeringRef_and_offeringRevision', (index) => index.eq('offeringRef', identity.offeringRef).eq('offeringRevision', identity.offeringRevision)).take(MAX_ACCESS_PATHS_PER_OFFERING + 1),
        canonicalSlugForToolRef(ctx, identity.toolRef),
      ])
      if (projected === null || offering === null || revision === null || offering.businessId !== args.businessId || revision.businessId !== args.businessId) return null
      return {
        offeringRef: identity.offeringRef,
        currentRevision: offering.currentRevision,
        name: revision.name,
        category: revision.category,
        summary: revision.summary,
        status: offering.status,
        accessPathCount: paths.filter((path) => path.status !== 'withdrawn').length,
        ...(canonical === null ? {} : { slug: canonical.slug }),
        statusJson: JSON.stringify(projected),
      }
    }))
    return {
      kind: 'available' as const,
      page: page.flatMap((item) => item === null ? [] : [item]),
      isDone: rows.isDone,
      continueCursor: rows.continueCursor,
    }
}

/** Saved draft price shown on status before a publication price exists. */
export function draftPriceLabel(
  terms: Readonly<{ pricingKind: 'free' | 'fixed_aud' | 'source_x402'; price: string }> | undefined,
): string | undefined {
  if (terms === undefined) return undefined
  if (terms.pricingKind === 'free') return 'Free'
  if (terms.pricingKind === 'source_x402') return 'Provider source payment'
  const parsed = parseDecimalExactAmount('AUD', terms.price, 2)
  const amount = parsed === undefined ? undefined : rescaleExactAmount(parsed, 6)
  const config = amount === undefined ? undefined : fixedAudPricingConfig(amount)
  if (config === undefined) return undefined
  const display = displayPriceFromPricingConfig(config)
  return display.kind === 'fixed' ? formatDisplayAmount(display.amount) : undefined
}
