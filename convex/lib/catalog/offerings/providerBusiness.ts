import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Id } from '../../../_generated/dataModel'
import { resolveBusinessActor } from '../../../authz'
import { requireSourceWrite } from '../../../sourceWriteAdmission'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { normalizeSlug } from '../../../../src/modules/common/normalize-slug'
import { canonicalProviderIdentifier, canonicalProviderWebsite } from '../../../../src/modules/business/public'
import { deriveBusinessOfferingSupportFromCapabilitySupply } from '../../capabilitySupply/projection/support'
import { rebuildBusinessSupplyProjectionSnapshotCommand } from '../../capabilitySupply/projection/snapshot'
import type { OfferingSourceMutationArgs } from './sourceCommand'

type EnsureProviderBusinessArgs = {
  name: string
  slug: string
  website: string
  providerIdentifier: string
}
type RenameProviderBusinessArgs = OfferingSourceMutationArgs & { name: string }

export type RenameProviderBusinessResult =
  | { kind: 'updated' | 'unchanged'; businessId: Id<'businesses'>; slug: string; name: string }
  | { kind: 'refused'; code: 'unauthenticated' | 'wrong_owner' | 'invalid_name' | 'source_write_refused' }

export type EnsureProviderBusinessResult =
  | { kind: 'created' | 'existing'; businessId: Id<'businesses'>; slug: string }
  | {
      kind: 'refused'
      code: 'unauthenticated' | 'invalid_business' | 'slug_taken' | 'multiple_businesses'
    }


export async function authorizeProviderBusinessHandler(
  ctx: QueryCtx,
  args: { businessId: Id<'businesses'> },
): Promise<boolean> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return false
  const business = await ctx.db.get(args.businessId)
  return business !== null && business.owningAccountRef === actor.canonicalAccountRef
}

export async function ensureProviderBusinessHandler(
  ctx: MutationCtx,
  args: EnsureProviderBusinessArgs,
): Promise<EnsureProviderBusinessResult> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'refused', code: 'unauthenticated' }
  }

  const owned = await ctx.db
    .query('businesses')
    .withIndex('by_owningAccountRef_and_updatedAt', (query) => (
      query.eq('owningAccountRef', actor.canonicalAccountRef)
    ))
    .order('desc')
    .take(2)
  if (owned.length > 1) return { kind: 'refused', code: 'multiple_businesses' }
  if (owned[0] !== undefined) {
    return { kind: 'existing', businessId: owned[0]._id, slug: owned[0].slug }
  }

  const name = args.name.trim().normalize('NFKC').replace(/\s+/g, ' ').slice(0, 160)
  const slug = normalizeSlug(args.slug || name)
  const website = canonicalProviderWebsite(args.website)
  const providerIdentifier = canonicalProviderIdentifier(args.providerIdentifier)
  if (name.length === 0 || slug.length === 0 || website === undefined || providerIdentifier === undefined) {
    return { kind: 'refused', code: 'invalid_business' }
  }
  const slugOwner = await ctx.db.query('businesses')
    .withIndex('by_slug', (query) => query.eq('slug', slug))
    .unique()
  if (slugOwner !== null) return { kind: 'refused', code: 'slug_taken' }

  const now = Date.now()
  const businessContext = {
    kind: 'programmable_provider' as const,
    website,
    providerIdentifier,
  }
  const sourceHash = canonicalDigest({
    kind: 'self_serve_supplier_business:v1',
    owningAccountRef: actor.canonicalAccountRef,
    slug,
    name,
    category: 'API services',
    businessContext,
  })
  const businessId = await ctx.db.insert('businesses', {
    owningAccountRef: actor.canonicalAccountRef,
    slug,
    name,
    normalizedName: name.toLocaleLowerCase('en-US'),
    category: 'API services',
    businessContext,
    publicStatus: 'unpublished',
    trustTier: 'claimed',
    sourceHash,
    createdAt: now,
    updatedAt: now,
  })
  return { kind: 'created', businessId, slug }
}

export async function renameProviderBusinessHandler(
  ctx: MutationCtx,
  args: RenameProviderBusinessArgs,
): Promise<RenameProviderBusinessResult> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'refused', code: 'unauthenticated' }
  const business = await ctx.db.get(args.businessId)
  if (business === null || business.owningAccountRef !== actor.canonicalAccountRef) {
    return { kind: 'refused', code: 'wrong_owner' }
  }
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused', code: 'source_write_refused' }

  const name = args.name.trim().normalize('NFKC').replace(/\s+/g, ' ')
  if (name.length < 1 || name.length > 160) return { kind: 'refused', code: 'invalid_name' }
  if (name === business.name) {
    return { kind: 'unchanged', businessId: business._id, slug: business.slug, name }
  }

  const now = Date.now()
  const sourceHash = canonicalDigest({
    kind: 'owner_supplier_display_name:v1',
    owningAccountRef: business.owningAccountRef,
    slug: business.slug,
    name,
    category: business.category,
    businessContext: business.businessContext,
  })
  await ctx.db.patch(business._id, {
    name,
    normalizedName: name.toLocaleLowerCase('en-US'),
    sourceHash,
    updatedAt: now,
  })

  if (business.publicStatus === 'published') {
    const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, business._id, now)
    const projection = await rebuildBusinessSupplyProjectionSnapshotCommand({
      db: ctx.db,
      sourceDb: ctx.db,
      businessId: business._id,
      support,
      now,
    })
    if (projection.kind !== 'ok') {
      const existingProjection = await ctx.db.query('registrySearchDocuments')
        .withIndex('by_business', (query) => query.eq('businessSlug', business.slug))
        .take(1)
      if (existingProjection.length > 0) {
        throw new Error(`provider_rename_projection_failed:${projection.code}`)
      }
    }
  }
  return { kind: 'updated', businessId: business._id, slug: business.slug, name }
}
