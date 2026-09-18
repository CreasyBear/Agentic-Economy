import type { GenericDatabaseWriter } from 'convex/server'
import { v } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'

import { internalMutation, type MutationCtx, type QueryCtx } from './_generated/server'
import type { DataModel, Id } from './_generated/dataModel'

import { brandNonEmpty } from '../src/modules/common/ids'
import {
  readActiveAdminMembership,
  resolveBusinessActor,
} from './authz'
import { requireSourceWrite } from './sourceWriteAdmission'
import { requireAdminAuthority } from '../src/modules/security/public'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './capabilitySupplyProjection'
import {
  changeOfferingStatusInState,
  createOfferingInState,
  reviseOfferingInState,
  upsertAccessPathInState,
  withdrawAccessPathInState,
  type OfferingAccessPathDescriptor,
  type OfferingSourceResult,
  type OfferingSourceState,
  type OfferingFactsInput,
} from '../src/modules/catalog/public'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { normalizeSlug } from '../src/modules/common/normalize-slug'
import {
  canonicalProviderIdentifier,
  canonicalProviderWebsite,
} from '../src/modules/business/public'
import { admitDevSeedCatalogAuthority } from './lib/catalog/devSeedAuthority'
import type { DelegationAuthoritySnapshot } from '../src/modules/authority/delegation/public'
import {
  loadExactOfferingSourceState,
  persistOfferingSourceState,
  type OfferingCommandTarget,
} from './lib/catalog/offeringPersistence'
import {
  promoteAdmittedSellerCanaryHandler,
  promoteX402SellerCanaryResultValue,
} from './lib/catalog/sellerCanary'

export {
  type PromoteX402SellerCanaryArgs,
  type PromoteX402SellerCanaryResult,
  promoteAdmittedSellerCanaryHandler,
  promoteX402SellerCanaryForOwner,
  promoteX402SellerCanaryHandler,
} from './lib/catalog/sellerCanary'

export {
  loadExactOfferingSourceState,
  loadOfferingSourceState,
  persistOfferingSourceState,
  readCatalogDescriptor,
} from './lib/catalog/offeringPersistence'
export {
  admitDevSeedCatalogAuthority,
  DEV_SEED_CATALOG_ACCOUNT_NAME,
  DEV_SEED_CATALOG_ACCOUNT_REF,
  DEV_SEED_CATALOG_PRINCIPAL_NAME,
  DEV_SEED_CATALOG_PRINCIPAL_REF,
  DEV_SEED_CATALOG_RESOURCE,
  DEV_SEED_CATALOG_SCOPE,
  DevSeedCatalogAuthorityError,
} from './lib/catalog/devSeedAuthority'

type OfferingCommandResult =
  | { kind: 'ok'; code: string; resultRef?: string; currentRevision?: number }
  | { kind: 'error'; code: string; reason: string }
type OfferingSourceMutationArgs = { businessId: Id<'businesses'>; operationKey: string; correlationId: string; sourceWrite?: unknown }
type CreateBusinessOfferingArgs = OfferingSourceMutationArgs & { offeringRef: string; facts: OfferingFactsInput }
type ReviseBusinessOfferingArgs = OfferingSourceMutationArgs & { offeringRef: string; expectedRevision: number; facts: OfferingFactsInput }
type ChangeBusinessOfferingStatusArgs = OfferingSourceMutationArgs & { offeringRef: string; expectedRevision: number; status: 'draft' | 'published' | 'paused' | 'retired' }
type UpsertOfferingAccessPathArgs = OfferingSourceMutationArgs & { offeringRef: string; accessPathRef: string; expectedRevision: number; status: 'draft' | 'published'; descriptor: OfferingAccessPathDescriptor }
type WithdrawOfferingAccessPathArgs = OfferingSourceMutationArgs & { accessPathRef: string; expectedRevision: number }
type RetryBusinessSupplyProjectionArgs = { businessId: Id<'businesses'> }
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

export async function reviseBusinessOfferingCommand(
  ctx: MutationCtx,
  command: Readonly<{
    businessId: Id<'businesses'>
    offeringRef: string
    expectedRevision: number
    operationKey: string
    facts: OfferingFactsInput
  }>,
  now: number,
) {
  return runSystemOfferingSourceCommand(ctx, { ...command, operationName: 'reviseOffering' }, { offeringRef: command.offeringRef }, (state, authority) => reviseOfferingInState(state, {
    authority,
    operationKey: command.operationKey,
    offeringRef: brandNonEmpty(command.offeringRef, 'OfferingRef'),
    expectedRevision: command.expectedRevision,
    facts: command.facts,
    now,
  }), now)
}
export async function upsertOfferingAccessPathCommand(
  ctx: MutationCtx,
  command: Readonly<{
    businessId: Id<'businesses'>
    offeringRef: string
    accessPathRef: string
    expectedRevision: number
    operationKey: string
    descriptor: OfferingAccessPathDescriptor
  }>,
  now: number,
) {
  return runSystemOfferingSourceCommand(ctx, { ...command, operationName: 'upsertAccessPath' }, { offeringRef: command.offeringRef }, (state, authority) => upsertAccessPathInState(state, {
    authority,
    operationKey: command.operationKey,
    offeringRef: brandNonEmpty(command.offeringRef, 'OfferingRef'),
    accessPathRef: brandNonEmpty(command.accessPathRef, 'AccessPathRef'),
    expectedRevision: command.expectedRevision,
    status: 'published',
    descriptor: command.descriptor,
    now,
  }), now)
}
export async function withdrawOfferingAccessPathCommand(
  ctx: MutationCtx,
  command: Readonly<{
    businessId: Id<'businesses'>
    accessPathRef: string
    expectedRevision: number
    operationKey: string
  }>,
  now: number,
) {
  return runSystemOfferingSourceCommand(ctx, { ...command, operationName: 'withdrawAccessPath' }, { accessPathRef: command.accessPathRef }, (state, authority) => (
    withdrawAccessPathInState(state, {
      authority,
      operationKey: command.operationKey,
      accessPathRef: brandNonEmpty(command.accessPathRef, 'AccessPathRef'),
      expectedRevision: command.expectedRevision,
      now,
    })
  ), now)
}

async function runOfferingSourceCore(
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
  ownerRef: string,
  actorRef: string,
  operationName: string,
  operationKey: string,
  target: OfferingCommandTarget,
  mutate: (
    state: OfferingSourceState,
    authority: { actorRef?: string; ownerRef: string; businessOwnerRef: string },
    now: number,
  ) => OfferingSourceResult<unknown>,
  now: number,
  actorKind: 'owner' | 'system',
): Promise<OfferingCommandResult> {
  const state = await loadExactOfferingSourceState(db, businessId, target, {
    actorRef: ownerRef,
    operationName,
    operationKey,
  })
  const result = mutate(state, { actorRef, ownerRef, businessOwnerRef: ownerRef }, now)
  if (result.kind === 'error') return { kind: 'error', code: result.code, reason: result.reason }
  const persisted = await persistOfferingSourceState(db, businessId, state, result.state, actorKind)
  if (persisted.kind === 'error') return persisted
  const value = result.value
  const resultRef = typeof value === 'object' && value !== null
    ? ('offeringRef' in value && typeof value.offeringRef === 'string'
      ? value.offeringRef
      : 'accessPathRef' in value && typeof value.accessPathRef === 'string' ? value.accessPathRef : undefined)
    : undefined
  const currentRevision = typeof value === 'object' && value !== null && 'currentRevision' in value && typeof value.currentRevision === 'number'
    ? value.currentRevision
    : undefined
  return { kind: 'ok', code: result.code, ...(resultRef === undefined ? {} : { resultRef }), ...(currentRevision === undefined ? {} : { currentRevision }) }
}

type SystemOfferingCommand = Readonly<{
  businessId: Id<'businesses'>
  operationName: string
  operationKey: string
}>
async function runSystemOfferingSourceCommand(
  ctx: MutationCtx,
  command: SystemOfferingCommand,
  target: OfferingCommandTarget,
  mutate: (
    state: OfferingSourceState,
    authority: { actorRef?: string; ownerRef: string; businessOwnerRef: string },
  ) => OfferingSourceResult<unknown>,
  now: number,
): Promise<OfferingCommandResult> {
  let snapshot: DelegationAuthoritySnapshot
  try {
    snapshot = await admitDevSeedCatalogAuthority(ctx, command.operationKey, command.businessId)
  } catch (cause) {
    return degradeBackend(cause, {
      kind: 'error' as const,
      code: 'authority_denied' as const,
      reason: 'Declared development seed workload authority is not current.',
    }, { site: 'runSystemOfferingSourceCommand', reason: 'invalid_response' })
  }
  return runOfferingSourceCore(
    ctx.db,
    command.businessId,
    snapshot.actorPrincipalRef,
    snapshot.actorPrincipalRef,
    command.operationName,
    command.operationKey,
    target,
    mutate,
    now,
    'system',
  )
}

export async function createBusinessOfferingHandler(ctx: MutationCtx, args: CreateBusinessOfferingArgs) {
  return runOfferingSourceMutation(ctx, args, 'createOffering', { offeringRef: args.offeringRef }, (state, authority, now) => createOfferingInState(state, {
    authority,
    operationKey: args.operationKey,
    businessId: brandNonEmpty(args.businessId, 'BusinessId'),
    offeringRef: brandNonEmpty(args.offeringRef, 'OfferingRef'),
    facts: args.facts,
    now,
  }))
}

export async function reviseBusinessOfferingHandler(ctx: MutationCtx, args: ReviseBusinessOfferingArgs) {
  return runOfferingSourceMutation(ctx, args, 'reviseOffering', { offeringRef: args.offeringRef }, (state, authority, now) => reviseOfferingInState(state, {
    authority,
    operationKey: args.operationKey,
    offeringRef: brandNonEmpty(args.offeringRef, 'OfferingRef'),
    expectedRevision: args.expectedRevision,
    facts: args.facts,
    now,
  }))
}

export async function changeBusinessOfferingStatusHandler(ctx: MutationCtx, args: ChangeBusinessOfferingStatusArgs) {
  return runOfferingSourceMutation(ctx, args, 'changeOfferingStatus', { offeringRef: args.offeringRef }, (state, authority, now) => changeOfferingStatusInState(state, {
    authority,
    operationKey: args.operationKey,
    offeringRef: brandNonEmpty(args.offeringRef, 'OfferingRef'),
    expectedRevision: args.expectedRevision,
    status: args.status,
    now,
  }))
}

export async function upsertOfferingAccessPathHandler(ctx: MutationCtx, args: UpsertOfferingAccessPathArgs) {
  return runOfferingSourceMutation(ctx, args, 'upsertAccessPath', { offeringRef: args.offeringRef }, (state, authority, now) => upsertAccessPathInState(state, {
    authority,
    operationKey: args.operationKey,
    offeringRef: brandNonEmpty(args.offeringRef, 'OfferingRef'),
    accessPathRef: brandNonEmpty(args.accessPathRef, 'AccessPathRef'),
    expectedRevision: args.expectedRevision,
    status: args.status,
    descriptor: args.descriptor,
    now,
  }))
}

export async function withdrawOfferingAccessPathHandler(ctx: MutationCtx, args: WithdrawOfferingAccessPathArgs) {
  return runOfferingSourceMutation(ctx, args, 'withdrawAccessPath', { accessPathRef: args.accessPathRef }, (state, authority, now) => withdrawAccessPathInState(state, {
    authority,
    operationKey: args.operationKey,
    accessPathRef: brandNonEmpty(args.accessPathRef, 'AccessPathRef'),
    expectedRevision: args.expectedRevision,
    now,
  }))
}

export const promoteAdmittedSellerCanary = internalMutation({
  args: { canaryRef: v.string() },
  returns: promoteX402SellerCanaryResultValue,
  handler: promoteAdmittedSellerCanaryHandler,
})

async function runOfferingSourceMutation(
  ctx: MutationCtx,
  args: OfferingSourceMutationArgs,
  operationName: string,
  target: OfferingCommandTarget,
  mutate: (state: OfferingSourceState, authority: { actorRef?: string; ownerRef: string; businessOwnerRef: string }, now: number) => OfferingSourceResult<unknown>,
): Promise<OfferingCommandResult> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'error', code: 'unauthenticated', reason: 'Authentication is required.' }
  const business = await ctx.db.get(args.businessId)
  if (business === null) return { kind: 'error', code: 'wrong_owner', reason: 'Business was not found.' }
  if (business.owningAccountRef !== actor.canonicalAccountRef) {
    return { kind: 'error', code: 'wrong_owner', reason: 'Only the canonical business owner may change this business.' }
  }
  const admitted = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (admitted.kind === 'rejected') return { kind: 'error', code: 'operation_conflict', reason: admitted.reason }
  const now = Date.now()
  const core = await runOfferingSourceCore(
    ctx.db,
    args.businessId,
    actor.canonicalPrincipalRef,
    actor.canonicalPrincipalRef,
    operationName,
    args.operationKey,
    target,
    mutate,
    now,
    'owner',
  )
  if (core.kind === 'error') return core
  if (business.businessContext?.kind === 'programmable_provider') return core
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, args.businessId, now)
  await rebuildBusinessSupplyProjectionSnapshotCommand({ db: ctx.db, sourceDb: ctx.db, businessId: args.businessId, support, now })
  return core
}

export async function retryBusinessSupplyProjectionHandler(ctx: MutationCtx, args: RetryBusinessSupplyProjectionArgs) {
  const now = Date.now()
  const db = await requireCatalogSupplyAdmin(ctx)
  if ('kind' in db) return db
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(db, args.businessId, now)
  return rebuildBusinessSupplyProjectionSnapshotCommand({ db, sourceDb: db, businessId: args.businessId, support, now })
}

async function requireCatalogSupplyAdmin(ctx: MutationCtx) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'error' as const, code: 'admin_denied' as const, reason: 'missing_membership' as const }
  }
  const identity = await ctx.auth.getUserIdentity()
  const membership = identity === null ? undefined : await readActiveAdminMembership(ctx.db, identity)
  const authority = requireAdminAuthority(
    membership,
    'register_capability_supply',
  )
  return authority.kind === 'allowed' ? ctx.db : { kind: 'error' as const, code: 'admin_denied' as const, reason: authority.reason }
}
