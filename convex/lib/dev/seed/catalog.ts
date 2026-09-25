import { v } from 'convex/values'
import type { Doc } from '../../../_generated/dataModel'
import { internal } from '../../../_generated/api'
import type { MutationCtx } from '../../../_generated/server'
import { buildDevSeedCatalogState, DEV_SEED_BUSINESS_FIXTURES } from '@/modules/dev/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { MAX_ACCESS_PATHS_PER_OFFERING, type OfferingPrice } from '@/modules/catalog/public'
import { deriveBusinessOfferingSupportFromCapabilitySupply } from '../../capabilitySupply/projection/support'
import { rebuildBusinessSupplyProjectionSnapshotCommand } from '../../capabilitySupply/projection/snapshot'
import { readCatalogDescriptor } from '../../catalog/offerings/readModels'
import { reviseBusinessOfferingCommand, upsertOfferingAccessPathCommand } from '../../catalog/offerings/commands'
import { persistDevSeedCatalogState } from '../../../devSeedStore'
import { admitDevSeedCatalogAuthority } from './authority'
import { provisionDevSeedCatalogIdentityRows } from './identity'
import { DEV_SEED_PRICE_BY_SLUG, DEV_SEED_PRICING_BY_SLUG } from './pricing' 

type SeedDevCatalogResult = Readonly<{
  kind: 'seeded'
  seededSlugs: string[]
  businessIdsBySlug: Record<string, string>
}>

export const seedDevCatalogArgs = {}
export const seedDevCatalogResult = v.object({
    kind: v.literal('seeded'),
    seededSlugs: v.array(v.string()),
    businessIdsBySlug: v.record(v.string(), v.string()),
  })
export async function seedDevCatalogHandler(ctx: MutationCtx): Promise<SeedDevCatalogResult> {
    // Self-heal the fixed dev-seed identity before authority admission.
    await provisionDevSeedCatalogIdentityRows(ctx)
    const authority = await admitDevSeedCatalogAuthority(ctx, 'seedDevCatalog')
    // The development catalog owns only its declared fixtures. Market
    // Operations are admitted through supplier/facilitator flows, so startup
    // must never sweep or rewrite unrelated supplier businesses.
    const bundle = buildDevSeedCatalogState(DEV_SEED_BUSINESS_FIXTURES, authority.accountRef)
    const result = await persistDevSeedCatalogState(ctx.db, bundle, authority.accountRef)
    return {
      ...result,
      kind: 'seeded' as const,
      seededSlugs: [...result.seededSlugs],
      businessIdsBySlug: { ...result.businessIdsBySlug },
    }
}

export const seedOfferingSupplyArgs = { cursor: v.union(v.string(), v.null()) }
export const seedOfferingSupplyResult = v.object({
    processed: v.number(),
    seeded: v.number(),
    errors: v.array(v.string()),
    nextCursor: v.union(v.string(), v.null()),
    done: v.boolean(),
  })
export async function seedOfferingSupplyHandler(ctx: MutationCtx, args: { cursor: string | null }) {
    await admitDevSeedCatalogAuthority(ctx, `seedOfferingSupply:${args.cursor ?? 'start'}`)
    const now = Date.now()
    const page = await ctx.db.query('businesses').paginate({ cursor: args.cursor, numItems: 10 })
    const errors: string[] = []
    let seeded = 0
    for (const business of page.page) {
      const result = await seedBusinessOfferings(
        ctx,
        business,
        now,
        DEV_SEED_PRICING_BY_SLUG,
        DEV_SEED_PRICE_BY_SLUG,
      )
      if (result.kind === 'error') {
        errors.push(`${business.slug}:${result.code}`)
        continue
      }
      seeded += result.seeded
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.devSeed.seedOfferingSupply, { cursor: page.continueCursor })
    }
    return {
      processed: page.page.length,
      seeded,
      errors,
      nextCursor: page.isDone ? null : page.continueCursor,
      done: page.isDone,
    }
}

export async function seedBusinessOfferings(
  ctx: MutationCtx,
  business: Doc<'businesses'>,
  now: number,
  pricingBySlug: Readonly<Record<string, string>>,
  priceBySlug: Readonly<Record<string, OfferingPrice>>,
): Promise<{ kind: 'ok'; seeded: number } | { kind: 'error'; code: string }> {
  const offerings = await ctx.db
    .query('businessOfferings')
    .withIndex('by_businessId_and_status', (query) => query.eq('businessId', business._id))
    .collect()
  let seeded = 0

  for (const offering of offerings) {
    let revision = await ctx.db
      .query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision)
      ))
      .unique()
    if (revision === null) return { kind: 'error', code: 'revision_not_found' }
    const pricingSummary = pricingBySlug[business.slug]
    const price = priceBySlug[business.slug]
    if (pricingSummary !== undefined) {
      const facts = {
        name: revision.name,
        category: revision.category,
        summary: revision.summary,
        ...(revision.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: revision.serviceAreaSummary }),
        ...(revision.availabilitySummary === undefined ? {} : { availabilitySummary: revision.availabilitySummary }),
        pricingSummary,
        ...(price === undefined ? {} : { price }),
      }
      const priceMatches = canonicalDigest(revision.price ?? null) === canonicalDigest(price ?? null)
      if (revision.pricingSummary !== pricingSummary || !priceMatches) {
        const revised = await reviseBusinessOfferingCommand(ctx, {
          businessId: business._id,
          offeringRef: offering.offeringRef,
          expectedRevision: revision.revision,
          operationKey: `seed:offering-pricing:${business.slug}:${offering.offeringRef}:${canonicalDigest({ pricingSummary, price: price ?? null })}`,
          facts,
        }, now)
        if (revised.kind === 'error') return { kind: 'error', code: `pricing_${revised.code}` }
        revision = await ctx.db
          .query('businessOfferingRevisions')
          .withIndex('by_offeringRef_and_revision', (query) => (
            query.eq('offeringRef', offering.offeringRef).eq('revision', revised.currentRevision ?? offering.currentRevision)
          ))
          .unique()
        if (revision === null) return { kind: 'error', code: 'revision_not_found_after_pricing' }
      }
      const accessPaths = await ctx.db.query('offeringAccessPaths')
        .withIndex('by_offeringRef_and_status', (query) => query.eq('offeringRef', offering.offeringRef))
        .take(MAX_ACCESS_PATHS_PER_OFFERING + 1)
      if (accessPaths.length > MAX_ACCESS_PATHS_PER_OFFERING) {
        return { kind: 'error', code: 'access_path_capacity_exceeded' }
      }
      for (const accessPath of accessPaths) {
        if (accessPath.status === 'withdrawn') continue
        if (
          accessPath.offeringRevision === revision.revision
          && accessPath.offeringSourceHash === revision.sourceHash
        ) {
          continue
        }
        const updated = await upsertOfferingAccessPathCommand(ctx, {
          businessId: business._id,
          offeringRef: offering.offeringRef,
          accessPathRef: accessPath.accessPathRef,
          expectedRevision: revision.revision,
          operationKey: `seed:offering-access-path:${business.slug}:${accessPath.accessPathRef}:${revision.revision}`,
          descriptor: readCatalogDescriptor(accessPath.descriptor),
        }, now)
        if (updated.kind === 'error') return { kind: 'error', code: `access_path_${updated.code}` }
      }
    }

    seeded += 1
  }
  const sourceDb = ctx.db
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(sourceDb, business._id, now)
  const rebuilt = await rebuildBusinessSupplyProjectionSnapshotCommand({
    db: sourceDb,
    sourceDb,
    businessId: business._id,
    support,
    now,
  })
  if (rebuilt.kind === 'error') return { kind: 'error', code: `projection_${rebuilt.code}` }
  return { kind: 'ok', seeded }
}
