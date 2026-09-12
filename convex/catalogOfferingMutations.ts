import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'
import { degradeBackend } from '@/lib/observability/degrade-backend'

import type { MutationCtx, QueryCtx } from './_generated/server'
import type { DataModel, Doc, Id } from './_generated/dataModel'

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
  BusinessOfferingStatusValues,
  OfferingAccessPathStatusValues,
  OfferingPriceKindValues,
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
  changeOfferingStatusInState,
  createOfferingInState,
  MAX_ACCESS_PATHS_PER_OFFERING,
  reviseOfferingInState,
  upsertAccessPathInState,
  withdrawAccessPathInState,
  type OfferingAccessPathDescriptor,
  type OfferingAccessPathStatus,
  type OfferingPrice,
  type OfferingSourceResult,
  type OfferingSourceState,
  type BusinessOfferingStatus,
  type BusinessOfferingRevisionRecord,
  type OfferingAccessPathRecord,
  type OfferingFactsInput,
} from '../src/modules/catalog/public'
import { compareExactAmounts, exactAmountSchema, readExactAmount, rescaleExactAmount } from '../src/modules/money/public'
import {
  accountRef,
  membershipRef,
  ownershipRef,
  principalRef,
  WorkloadContextAdmission,
  type Account,
  type AccountActionContext,
  type AccountOwnership,
  type AccountRef,
  type Membership,
  type Principal,
  type PrincipalRef,
  type WorkloadContextStore,
} from '../src/modules/principal-account/public'
import {
  DELEGATION_MAX_ANCESTRY_GRANTS,
  DelegationService,
  delegationGrantRef,
  type DelegationAuthoritySnapshot,
} from '../src/modules/authority/delegation/public'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import type { StableHashValue } from '../src/modules/common/stable-hash'
import { normalizeSlug } from '../src/modules/common/normalize-slug'
import {
  canonicalProviderIdentifier,
  canonicalProviderWebsite,
} from '../src/modules/business/public'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from './lib/delegationPersistence'
import {
  createSellerOnboardingCanaryCommitment,
  sellerOnboardingCanaryExecutionEnvelope,
  type SellerOnboardingCanaryInvocationObservation,
} from '../src/modules/capability-execution'
import {
  materializeRuntimePublishedTool,
  parsePublishedToolSnapshot,
  sellerCanaryCompletionEvidenceMatches,
  X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
  x402SellerCanaryAdmissionEvidenceRef,
} from '../src/modules/capability-supply/public'
import {
  evaluateX402SellerPromotion,
  type X402SellerPromotionAnchor,
} from '../src/modules/capability-supply/public'
import {
  readCurrentPublishedTool,
  readExactSellerCanaryOperationSnapshotHandler,
} from './lib/capabilitySupply/currentTool'
import {
  SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
} from './capabilitySupplyCanaryFunding'
export const DEV_SEED_CATALOG_PRINCIPAL_REF = 'prn_d2000000000000000000000000000001' as PrincipalRef
export const DEV_SEED_CATALOG_ACCOUNT_REF = 'acc_d2000000000000000000000000000001' as AccountRef
export const DEV_SEED_CATALOG_SCOPE = 'catalog:dev_seed' as const
export const DEV_SEED_CATALOG_RESOURCE = 'catalog:dev-seed' as const
export const DEV_SEED_CATALOG_PRINCIPAL_NAME = 'Agentic Economy development catalog seed workload'
export const DEV_SEED_CATALOG_ACCOUNT_NAME = 'Agentic Economy development catalog seed account'

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
type PromoteX402SellerCanaryArgs = OfferingSourceMutationArgs & { canaryRef: string }
type EnsureProviderBusinessArgs = {
  name: string
  slug: string
  website: string
  providerIdentifier: string
}
type RenameProviderBusinessArgs = OfferingSourceMutationArgs & { name: string }
type OfferingCommandTarget = Readonly<{
  offeringRef?: string
  accessPathRef?: string
}>

export type RenameProviderBusinessResult =
  | { kind: 'updated' | 'unchanged'; businessId: Id<'businesses'>; slug: string; name: string }
  | { kind: 'refused'; code: 'unauthenticated' | 'wrong_owner' | 'invalid_name' | 'source_write_refused' }

export type EnsureProviderBusinessResult =
  | { kind: 'created' | 'existing'; businessId: Id<'businesses'>; slug: string }
  | {
      kind: 'refused'
      code: 'unauthenticated' | 'invalid_business' | 'slug_taken' | 'multiple_businesses'
    }

export type PromoteX402SellerCanaryResult =
  | {
      kind: 'promoted' | 'replayed'
      canaryRef: string
      offeringRef: string
      offeringRevision: number
      publicationRef: string
      publicationRevision: number
      toolRef: string
      promotionEvidenceDigest: string
      outputDigest: string
    }
  | {
      kind: 'refused'
      code:
        | 'unauthenticated'
        | 'wrong_owner'
        | 'source_write_refused'
        | 'canary_not_found'
        | 'canary_evidence_invalid'
        | 'target_drift'
        | 'operation_conflict'
        | 'seller_claim_stale'
        | 'funding_authority_invalid'
        | 'readiness_stale'
        | 'output_nondeterministic'
        | 'canary_pending'
        | 'reconciliation_required'
        | 'canary_identity_mismatch'
        | 'canary_expired'
        | 'operation_commitment_stale'
        | 'invocation_refused'
        | 'payment_not_settled'
        | 'payment_evidence_missing'
        | 'spend_commitment_mismatch'
        | 'output_contract_invalid'
        | 'output_unusable'
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

export class DevSeedCatalogAuthorityError extends Error {
  constructor() {
    super('dev_seed_catalog_authority_denied')
    this.name = 'DevSeedCatalogAuthorityError'
  }
}

class DevSeedCatalogWorkloadStore implements WorkloadContextStore {
  constructor(private readonly ctx: Pick<MutationCtx, 'db'>) {}

  async getPrincipal(ref: PrincipalRef): Promise<Principal | undefined> {
    const row = await this.ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', ref))
      .unique()
    return row === null ? undefined : workloadPrincipalFromRow(row)
  }

  async getAccount(ref: AccountRef): Promise<Account | undefined> {
    const row = await this.ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', ref))
      .unique()
    return row === null ? undefined : workloadAccountFromRow(row)
  }

  async getOwnership(account: Account): Promise<AccountOwnership | undefined> {
    const row = await this.ctx.db.query('accountOwnerships')
      .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
      .unique()
    return row === null ? undefined : workloadOwnershipFromRow(row)
  }

  async getActiveMembership(ref: AccountRef, principal: PrincipalRef): Promise<Membership | undefined> {
    const row = await this.ctx.db.query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', ref)
        .eq('memberPrincipalRef', principal)
        .eq('lifecycle', 'active'))
      .unique()
    return row === null ? undefined : workloadMembershipFromRow(row)
  }
}

function workloadPrincipalFromRow(row: Doc<'principals'>): Principal {
  return Object.freeze({
    principalRef: principalRef(row.principalRef),
    kind: row.kind,
    displayName: row.displayName,
    lifecycle: row.lifecycle,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.mergedIntoPrincipalRef === undefined
      ? {}
      : { mergedIntoPrincipalRef: principalRef(row.mergedIntoPrincipalRef) }),
  })
}

function workloadAccountFromRow(row: Doc<'accounts'>): Account {
  return Object.freeze({
    accountRef: accountRef(row.accountRef),
    displayName: row.displayName,
    lifecycle: row.lifecycle,
    recoveryPolicy: Object.freeze({ ...row.recoveryPolicy }),
    creationActorPrincipalRef: principalRef(row.creationActorPrincipalRef),
    creationIdempotencyRef: row.creationIdempotencyRef,
    initialOwnershipRef: ownershipRef(row.initialOwnershipRef),
    currentOwnershipRef: ownershipRef(row.currentOwnershipRef),
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastAction: workloadActionContextFromRow(row.lastAction),
  })
}

function workloadOwnershipFromRow(row: Doc<'accountOwnerships'>): AccountOwnership {
  return Object.freeze({
    ownershipRef: ownershipRef(row.ownershipRef),
    accountRef: accountRef(row.accountRef),
    ownerPrincipalRef: principalRef(row.ownerPrincipalRef),
    lifecycle: row.lifecycle,
    changeKind: row.changeKind,
    revision: row.revision,
    createdAt: row.createdAt,
    createdBy: workloadActionContextFromRow(row.createdBy),
    ...(row.predecessorOwnershipRef === undefined
      ? {}
      : { predecessorOwnershipRef: ownershipRef(row.predecessorOwnershipRef) }),
    ...(row.successionAuthorizationRef === undefined
      ? {}
      : { successionAuthorizationRef: row.successionAuthorizationRef }),
    ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }),
    ...(row.endedBy === undefined ? {} : { endedBy: workloadActionContextFromRow(row.endedBy) }),
    ...(row.successorOwnershipRef === undefined
      ? {}
      : { successorOwnershipRef: ownershipRef(row.successorOwnershipRef) }),
  })
}

function workloadMembershipFromRow(row: Doc<'memberships'>): Membership {
  return Object.freeze({
    membershipRef: membershipRef(row.membershipRef),
    accountRef: accountRef(row.accountRef),
    memberPrincipalRef: principalRef(row.memberPrincipalRef),
    lifecycle: row.lifecycle,
    revision: row.revision,
    createdAt: row.createdAt,
    createdBy: workloadActionContextFromRow(row.createdBy),
    ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }),
    ...(row.endedBy === undefined ? {} : { endedBy: workloadActionContextFromRow(row.endedBy) }),
  })
}

function workloadActionContextFromRow(
  row: Doc<'accounts'>['lastAction'],
): AccountActionContext {
  return Object.freeze({
    actorPrincipalRef: principalRef(row.actorPrincipalRef),
    activeAccountRef: accountRef(row.activeAccountRef),
    correlationRef: row.correlationRef,
    idempotencyRef: row.idempotencyRef,
  })
}

export async function admitDevSeedCatalogAuthority(
  ctx: MutationCtx,
  operationKey: string,
  businessId?: Id<'businesses'>,
): Promise<DelegationAuthoritySnapshot> {
  const [principal, account] = await Promise.all([
    ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', DEV_SEED_CATALOG_PRINCIPAL_REF))
      .unique(),
    ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', DEV_SEED_CATALOG_ACCOUNT_REF))
      .unique(),
  ])
  const nonce = crypto.randomUUID()
  const context = await new WorkloadContextAdmission(new DevSeedCatalogWorkloadStore(ctx)).admit({
    workloadKind: 'job',
    actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
    activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
    correlationRef: `dev-seed:${nonce}`,
    idempotencyRef: `dev-seed:${nonce}`,
    purpose: 'Seed the development-only catalog fixture',
    source: 'convex/devSeed:seedOfferingSupply',
  })
  if (principal?.displayName !== DEV_SEED_CATALOG_PRINCIPAL_NAME
    || account?.displayName !== DEV_SEED_CATALOG_ACCOUNT_NAME) {
    throw new DevSeedCatalogAuthorityError()
  }
  const consequenceNow = Date.now()
  // The grant is scoped to the declared development catalog only. Exact
  // business ownership is established separately from canonical owner facts
  // below, so dynamically allocated Convex ids never become authority inputs.
  const resources = [DEV_SEED_CATALOG_RESOURCE]
  const candidates = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_subjectPrincipalRef_and_lifecycle', (query) => query
      .eq('subjectPrincipalRef', DEV_SEED_CATALOG_PRINCIPAL_REF)
      .eq('lifecycle', 'active'))
    .take(DELEGATION_MAX_ANCESTRY_GRANTS + 1)
  if (candidates.length > DELEGATION_MAX_ANCESTRY_GRANTS) throw new DevSeedCatalogAuthorityError()
  const matching = candidates.filter((grant) => grant.accountRef === DEV_SEED_CATALOG_ACCOUNT_REF
    && grant.expiresAt > consequenceNow
    && Number.isSafeInteger(grant.generation)
    && grant.generation > 0
    && grant.scopes.includes(DEV_SEED_CATALOG_SCOPE)
    && resources.every((resource) => grant.resourceRefs.includes(resource)))
  if (matching.length !== 1) throw new DevSeedCatalogAuthorityError()
  const [grant] = matching
  if (grant === undefined) throw new DevSeedCatalogAuthorityError()
  const digest = canonicalDigest({ operationKey, businessId: businessId ?? null, nonce })
  const snapshot = await new DelegationService(
    createConvexDelegationStore(ctx),
    createConvexDelegationContextPort(ctx, principalRef(context.actorPrincipalRef)),
  ).admitConsequence({
    grantRef: delegationGrantRef(grant.grantRef),
    expectedGeneration: grant.generation,
    context: {
      actorPrincipalRef: principalRef(context.actorPrincipalRef),
      activeAccountRef: accountRef(context.activeAccountRef),
      correlationRef: `dev-seed-admit:${digest.slice('sha256:'.length, 'sha256:'.length + 32)}`,
      idempotencyRef: `dev-seed-admit:${digest.slice('sha256:'.length, 'sha256:'.length + 32)}`,
    },
    requiredScopes: [DEV_SEED_CATALOG_SCOPE],
    resourceRefs: resources,
    budgetAmount: 0,
  })
  if (businessId !== undefined) {
    const business = await ctx.db.get(businessId)
    const account = business === null ? null : await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', business.owningAccountRef))
      .unique()
    const ownership = account === null ? null : await ctx.db
      .query('accountOwnerships')
      .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
      .unique()
    if (business === null || ownership === null
      || ownership.ownerPrincipalRef !== snapshot.actorPrincipalRef
      || business.owningAccountRef !== snapshot.accountRef) {
      throw new DevSeedCatalogAuthorityError()
    }
  }
  return snapshot
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

function promotionAnchorFromEnvelope(
  envelope: NonNullable<Doc<'capabilityCalls'>['sellerOnboardingCanary']>,
): X402SellerPromotionAnchor {
  return {
    ownerId: envelope.ownerId,
    businessId: envelope.businessId,
    offeringRef: envelope.offeringRef,
    offeringRevision: envelope.offeringRevision,
    offeringSourceHash: envelope.offeringSourceHash,
    accessPathRef: envelope.accessPathRef,
    accessPathSourceHash: envelope.accessPathSourceHash,
    publicationRef: envelope.publicationRef,
    publicationRevision: envelope.publicationRevision,
    draftOperationRef: envelope.toolRef,
    toolMaterialDigest: envelope.toolMaterialDigest,
    contractDigest: envelope.contractDigest,
    bindingDigest: envelope.bindingDigest,
    priceDigest: envelope.priceDigest,
    sellerPayTo: envelope.sellerPayTo,
    sellerClaimDigest: envelope.sellerClaimDigest,
    readinessDigest: envelope.readinessDigest,
    readinessObservedAt: envelope.readinessObservedAt,
    readinessValidUntil: envelope.readinessValidUntil,
  }
}

function reconstructCanaryCommitment(
  envelope: NonNullable<Doc<'capabilityCalls'>['sellerOnboardingCanary']>,
) {
  try {
    const commitment = createSellerOnboardingCanaryCommitment({
      ownerId: envelope.ownerId,
      businessId: envelope.businessId,
      offeringRef: envelope.offeringRef,
      offeringRevision: envelope.offeringRevision,
      offeringSourceHash: envelope.offeringSourceHash,
      accessPathRef: envelope.accessPathRef,
      accessPathSourceHash: envelope.accessPathSourceHash,
      publicationRef: envelope.publicationRef,
      publicationRevision: envelope.publicationRevision,
      draftOperationRef: envelope.toolRef,
      toolMaterialDigest: envelope.toolMaterialDigest,
      contractDigest: envelope.contractDigest,
      bindingDigest: envelope.bindingDigest,
      priceDigest: envelope.priceDigest,
      sellerPayTo: envelope.sellerPayTo,
      sellerClaimDigest: envelope.sellerClaimDigest,
      readinessDigest: envelope.readinessDigest,
      readinessObservedAt: envelope.readinessObservedAt,
      readinessValidUntil: envelope.readinessValidUntil,
      expectedOutputSchemaDigest: envelope.expectedOutputSchemaDigest,
      expectedOutputEvidenceDigest: envelope.expectedOutputEvidenceDigest,
      inputDigest: envelope.inputDigest,
      idempotencyKey: envelope.idempotencyKey,
      fundingBudgetRef: envelope.funding.budgetRef,
      fundingPrincipalId: envelope.funding.principalId,
      fundingOwnerId: envelope.funding.ownerId,
      fundingCredentialId: envelope.funding.credentialId,
      fundingApplicationRef: envelope.funding.applicationRef,
      fundingGrantRef: envelope.funding.grantRef,
      fundingGrantGeneration: envelope.funding.grantGeneration,
      fundingPolicyDigest: envelope.funding.policyDigest,
      requestedSpend: envelope.funding.requestedSpend,
      maximumSpend: envelope.funding.maximumSpend,
      expiresAt: envelope.expiresAt,
      now: 0,
    })
    return canonicalDigest(
      sellerOnboardingCanaryExecutionEnvelope(commitment) as StableHashValue,
    ) === canonicalDigest(envelope as StableHashValue)
      ? commitment
      : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'reconstructCanaryCommitment', reason: 'invalid_response' })
  }
}

function canaryObservation(
  row: Doc<'capabilityCalls'>,
  outputContractValid: boolean,
  outputDeterministic: boolean,
): SellerOnboardingCanaryInvocationObservation {
  const envelope = row.sellerOnboardingCanary
  if (envelope === undefined) throw new Error('seller_canary_envelope_missing')
  const result = row.result
  const receipt = result !== undefined && 'receipt' in result ? result.receipt : undefined
  const ambiguous = row.state === 'reconciliation_required'
    || result?.kind === 'reconciliation_required'
    || receipt?.state === 'reconciliation_required'
    || receipt?.refundState === 'unknown'
    || receipt?.lossState === 'unknown'
  const state: SellerOnboardingCanaryInvocationObservation['state'] = ambiguous
    ? 'reconciliation_required'
    : row.state === 'pending'
      ? 'pending'
      : row.state === 'completed' && result?.kind === 'completed'
        ? 'completed'
        : row.state === 'cancelled'
          ? 'cancelled'
          : 'refused'
  const paymentState = receipt?.state === 'reconciliation_required'
    || receipt?.refundState === 'unknown'
    || receipt?.lossState === 'unknown'
    ? 'reconciliation_required' as const
    : receipt?.state === 'settled'
      && receipt.refundState === 'not_applicable'
      && receipt.lossState === 'none'
      ? 'settled' as const
      : 'refunded' as const
  return {
    executionPurpose: envelope.executionPurpose,
    canaryRef: envelope.canaryRef,
    canaryCommitmentDigest: envelope.canaryCommitmentDigest,
    callRef: row.callRef,
    toolRef: row.toolRef,
    inputDigest: row.inputDigest,
    state,
    outputContractValid,
    outputUsable: outputContractValid && outputDeterministic,
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(receipt === undefined || receipt.commercialModel !== 'seller_canary_x402' ? {} : {
      payment: {
        state: paymentState,
        amount: receipt.providerQuotedAmount,
        priceDigest: receipt.priceDigest,
        ...(receipt.paymentIdentifier === undefined ? {} : { paymentIdentifier: receipt.paymentIdentifier }),
        ...(receipt.settlementTransactionHash === undefined
          ? {}
          : { settlementTransactionHash: receipt.settlementTransactionHash }),
        ...(receipt.externalSettlementRef === undefined
          ? {}
          : { externalSettlementRef: receipt.externalSettlementRef }),
      },
    }),
  }
}

async function exactCatalogPromotionTarget(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  anchor: X402SellerPromotionAnchor,
): Promise<boolean> {
  const [offering, revision, path] = await Promise.all([
    ctx.db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', anchor.offeringRef))
      .unique(),
    ctx.db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', anchor.offeringRef).eq('revision', anchor.offeringRevision)
      ))
      .unique(),
    ctx.db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', anchor.accessPathRef))
      .unique(),
  ])
  return offering !== null
    && revision !== null
    && path !== null
    && offering.businessId === businessId
    && offering.currentRevision === anchor.offeringRevision
    && offering.status === 'published'
    && revision.businessId === businessId
    && revision.sourceHash === anchor.offeringSourceHash
    && path.businessId === businessId
    && path.offeringRef === anchor.offeringRef
    && path.offeringRevision === anchor.offeringRevision
    && path.offeringSourceHash === anchor.offeringSourceHash
    && path.status === 'published'
    && path.sourceHash === anchor.accessPathSourceHash
}

async function exactCurrentSellerClaim(
  ctx: MutationCtx,
  operation: NonNullable<ReturnType<typeof parsePublishedToolSnapshot>>,
  anchor: X402SellerPromotionAnchor,
): Promise<boolean> {
  if (operation.binding.authority.kind !== 'provider_connection'
    || operation.identity.payment.kind !== 'x402'
    || operation.identity.payment.payTo.toLowerCase() !== anchor.sellerPayTo.toLowerCase()) return false
  const authority = operation.binding.authority
  const connection = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => (
      query.eq('connectionRef', authority.connectionRef)
    ))
    .unique()
  return connection !== null
    && connection.lifecycle === 'active'
    && String(connection.businessId) === anchor.businessId
    && connection.owningAccountRef === anchor.ownerId
    && connection.providerRef === authority.providerRef
    && connection.evidenceRefs.includes(`x402-payee-claim:${anchor.sellerClaimDigest}`)
}

function exactPlatformCanaryFundingEvidence(
  row: Doc<'capabilityCalls'>,
  envelope: NonNullable<Doc<'capabilityCalls'>['sellerOnboardingCanary']>,
): boolean {
  const funding = envelope.funding
  const authority = row.authority
  const authorizedAmount = readExactAmount(authority?.limits.amount)
  if (funding.ownerId === envelope.ownerId
    || funding.applicationRef !== SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF
    || funding.grantRef !== SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF
    || row.principalId !== funding.principalId
    || row.ownerId !== funding.ownerId
    || row.credentialId !== funding.credentialId
    || row.applicationRef !== funding.applicationRef
    || row.grantRef !== funding.grantRef
    || row.grantGeneration !== funding.grantGeneration
    || row.policyDigest !== funding.policyDigest
    || row.environment !== 'sandbox'
    || authority === undefined
    || authorizedAmount === undefined) return false
  return authority.callRef === row.callRef
    && authority.toolRef === row.toolRef
    && authority.inputDigest === row.inputDigest
    && authority.grantRef === funding.grantRef
    && authority.grantGeneration === funding.grantGeneration
    && authority.grantDigest === funding.policyDigest
    && authority.acceptedBasis.kind === 'spending_policy_use'
    && authority.acceptedBasis.spendingPolicyRef === `agent-access-grant:${funding.grantRef}`
    && authority.acceptedBasis.spendingPolicyGeneration === funding.grantGeneration
    && authority.acceptedBasis.grantEvidenceRef === `agent-access-grant-evidence:${funding.policyDigest}`
    && compareExactAmounts(authorizedAmount, funding.requestedSpend) === 0
}

function promotionOutputEvidence(
  row: Doc<'capabilityCalls'>,
  operation: NonNullable<ReturnType<typeof parsePublishedToolSnapshot>>,
): Readonly<{
  contractValid: boolean
  deterministic: boolean
  assertionMatched: boolean
  outputDigest: string
}> {
  const result = row.result
  if (row.state !== 'completed' || result?.kind !== 'completed') {
    return {
      contractValid: false,
      deterministic: false,
      assertionMatched: false,
      outputDigest: canonicalDigest(null),
    }
  }
  let contractValid = false
  try {
    contractValid = materializeRuntimePublishedTool(operation).validateOutput(result.output)
  } catch (cause) {
    contractValid = degradeBackend(cause, false, { site: 'promotionOutputEvidence', reason: 'invalid_response' })
  }
  const receipt = result.receipt
  const deterministic = row.evidenceHash !== undefined
    && row.evidenceHash === result.evidenceHash
    && receipt !== undefined
    && receipt.evidenceHash === result.evidenceHash
  const envelope = row.sellerOnboardingCanary
  const expectedOutputSchemaDigest = canonicalDigest(operation.contract.outputSchema as StableHashValue)
  const expectedOutputEvidenceDigest = canonicalDigest({
    kind: 'seller_onboarding_canary_expected_output:v1',
    toolMaterialDigest: operation.materialDigest,
    contractDigest: operation.identity.contractDigest,
    inputDigest: row.inputDigest,
    outputSchema: operation.contract.outputSchema,
    evidence: operation.contract.evidence,
  } as StableHashValue)
  return {
    contractValid,
    deterministic,
    assertionMatched: envelope !== undefined
      && sellerCanaryCompletionEvidenceMatches(result.output, operation.contract.evidence)
      && envelope.expectedOutputSchemaDigest === expectedOutputSchemaDigest
      && envelope.expectedOutputEvidenceDigest === expectedOutputEvidenceDigest,
    outputDigest: canonicalDigest(result.output as StableHashValue),
  }
}

function currentAnchorFromSnapshot(
  sealed: X402SellerPromotionAnchor,
  snapshot: NonNullable<Awaited<ReturnType<typeof readExactSellerCanaryOperationSnapshotHandler>>>,
  operation: NonNullable<ReturnType<typeof parsePublishedToolSnapshot>>,
): X402SellerPromotionAnchor {
  return {
    ownerId: sealed.ownerId,
    businessId: operation.identity.businessId,
    offeringRef: snapshot.offeringRef,
    offeringRevision: snapshot.offeringRevision,
    offeringSourceHash: snapshot.offeringSourceHash,
    accessPathRef: snapshot.accessPathRef,
    accessPathSourceHash: snapshot.accessPathSourceHash,
    publicationRef: snapshot.publicationRef,
    publicationRevision: snapshot.publicationRevision,
    draftOperationRef: snapshot.toolRef,
    toolMaterialDigest: operation.materialDigest,
    contractDigest: operation.identity.contractDigest,
    bindingDigest: operation.identity.bindingDigest,
    priceDigest: operation.priceDigest,
    sellerPayTo: snapshot.sellerPayTo,
    sellerClaimDigest: snapshot.sellerClaimDigest,
    readinessDigest: snapshot.readinessDigest,
    readinessObservedAt: snapshot.readinessObservedAt,
    readinessValidUntil: snapshot.readinessValidUntil,
  }
}

function promotionRefusalCode(
  code: Extract<ReturnType<typeof evaluateX402SellerPromotion>, { kind: 'refused' }>['code'],
): Extract<PromoteX402SellerCanaryResult, { kind: 'refused' }>['code'] {
  if (code === 'evidence_invalid') return 'canary_evidence_invalid'
  if (code === 'owner_mismatch') return 'wrong_owner'
  return code
}

async function admitExactSellerCanaryPublication(
  ctx: MutationCtx,
  anchor: X402SellerPromotionAnchor,
  promotionEvidenceDigest: string,
  now: number,
): Promise<boolean> {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', anchor.publicationRef)
      .eq('revision', anchor.publicationRevision))
    .unique()
  if (publication === null
    || String(publication.businessId) !== anchor.businessId
    || publication.toolRef !== anchor.draftOperationRef
    || publication.disposition !== 'current'
    || publication.registrationEvidenceRefs.filter(
      (ref) => ref === X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
    ).length !== 1) return false
  const admissionRef = x402SellerCanaryAdmissionEvidenceRef(promotionEvidenceDigest)
  const existingAdmissionRefs = publication.registrationEvidenceRefs.filter((ref) => (
    ref.startsWith('x402-seller-canary-admission:admitted:v1:')
  ))
  if (existingAdmissionRefs.length > 0) return false
  await ctx.db.patch(publication._id, {
    registrationEvidenceRefs: [...new Set([
      ...publication.registrationEvidenceRefs,
      admissionRef,
    ])].sort(),
    updatedAt: now,
  })
  return true
}

export async function promoteX402SellerCanaryHandler(
  ctx: MutationCtx,
  args: PromoteX402SellerCanaryArgs,
): Promise<PromoteX402SellerCanaryResult> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'refused', code: 'unauthenticated' }
  const business = await ctx.db.get(args.businessId)
  if (business === null || business.owningAccountRef !== actor.canonicalAccountRef) {
    return { kind: 'refused', code: 'wrong_owner' }
  }
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused', code: 'source_write_refused' }

  const rows = await ctx.db.query('capabilityCalls')
    .withIndex('by_sellerOnboardingCanary_canaryRef', (query) => (
      query.eq('sellerOnboardingCanary.canaryRef', args.canaryRef)
    ))
    .take(2)
  const [row] = rows
  if (rows.length !== 1 || row === undefined) return { kind: 'refused', code: 'canary_not_found' }
  const envelope = row.sellerOnboardingCanary
  if (envelope === undefined
    || envelope.canaryRef !== args.canaryRef
    || envelope.ownerId !== actor.canonicalAccountRef
    || envelope.businessId !== String(args.businessId)
    || row.callRef !== envelope.callRef
    || row.toolRef !== envelope.toolRef
    || row.inputDigest !== envelope.inputDigest
    || row.idempotencyKey !== envelope.idempotencyKey) {
    return { kind: 'refused', code: 'canary_evidence_invalid' }
  }
  const commitment = reconstructCanaryCommitment(envelope)
  const retainedOperation = row.toolJson === undefined
    ? undefined
    : parsePublishedToolSnapshot(row.toolJson)
  if (commitment === undefined
    || retainedOperation === undefined
    || retainedOperation.runtimeEnvironment !== 'sandbox'
    || retainedOperation.materialDigest !== envelope.toolMaterialDigest
    || retainedOperation.identity.contractDigest !== envelope.contractDigest
    || retainedOperation.identity.bindingDigest !== envelope.bindingDigest
    || retainedOperation.priceDigest !== envelope.priceDigest) {
    return { kind: 'refused', code: 'canary_evidence_invalid' }
  }
  const sealed = promotionAnchorFromEnvelope(envelope)
  if (!await exactCatalogPromotionTarget(ctx, args.businessId, sealed)) {
    return { kind: 'refused', code: 'target_drift' }
  }
  const output = promotionOutputEvidence(row, retainedOperation)
  const observation = canaryObservation(row, output.contractValid, output.deterministic)
  const now = Date.now()
  const platformFundingAuthorized = exactPlatformCanaryFundingEvidence(row, envelope)
  const operationMarker = await ctx.db.query('operationKeys')
    .withIndex('by_actor_operation_key', (query) => query
      .eq('actorRef', actor.canonicalAccountRef)
      .eq('operationName', 'promoteX402SellerCanary')
      .eq('key', args.canaryRef))
    .unique()

  if (operationMarker !== null) {
    const currentOperation = await readCurrentPublishedTool(ctx, envelope.toolRef, now)
    const claimCurrent = currentOperation !== undefined
      && await exactCurrentSellerClaim(ctx, currentOperation, sealed)
    const current = currentOperation === undefined
      ? sealed
      : {
          ...sealed,
          toolMaterialDigest: currentOperation.materialDigest,
          readinessObservedAt: currentOperation.readiness.observedAt,
          readinessValidUntil: currentOperation.readiness.validUntil,
        }
    const evaluated = evaluateX402SellerPromotion({
      actingOwnerId: actor.canonicalAccountRef,
      sealed,
      current,
      sellerClaimCurrent: claimCurrent,
      platformFundingAuthorized,
      readinessCurrent: currentOperation !== undefined
        && currentOperation.identity.contractDigest === sealed.contractDigest
        && currentOperation.identity.bindingDigest === sealed.bindingDigest
        && currentOperation.priceDigest === sealed.priceDigest,
      outputDeterministic: output.deterministic,
      outputAssertionMatched: output.assertionMatched,
      expectedOutputEvidenceDigest: envelope.expectedOutputEvidenceDigest,
      outputDigest: output.outputDigest,
      commitment,
      observation,
      now,
    })
    if (evaluated.kind === 'refused') {
      return { kind: 'refused', code: promotionRefusalCode(evaluated.code) }
    }
    if (operationMarker.scope !== 'catalog_offering'
      || operationMarker.status !== 'succeeded'
      || operationMarker.requestHash !== evaluated.consumptionDigest
      || operationMarker.resultHash !== evaluated.promotionEvidence.promotionEvidenceDigest
      || business.publicStatus !== 'published'
      || business.suppressedAt !== undefined) {
      return { kind: 'refused', code: 'operation_conflict' }
    }
    const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, args.businessId, now)
    if (support[sealed.offeringRef]?.routeable !== true) {
      return { kind: 'refused', code: 'target_drift' }
    }
    const projection = await rebuildBusinessSupplyProjectionSnapshotCommand({
      db: ctx.db,
      sourceDb: ctx.db,
      businessId: args.businessId,
      support,
      now,
    })
    if (projection.kind !== 'ok') throw new Error(`seller_promotion_projection_failed:${projection.code}`)
    return {
      kind: 'replayed',
      canaryRef: args.canaryRef,
      offeringRef: sealed.offeringRef,
      offeringRevision: sealed.offeringRevision,
      publicationRef: sealed.publicationRef,
      publicationRevision: sealed.publicationRevision,
      toolRef: sealed.draftOperationRef,
      promotionEvidenceDigest: evaluated.promotionEvidence.promotionEvidenceDigest,
      outputDigest: output.outputDigest,
    }
  }

  if ((business.publicStatus !== 'unpublished' && business.publicStatus !== 'published')
    || business.suppressedAt !== undefined) {
    return { kind: 'refused', code: 'target_drift' }
  }
  const snapshot = await readExactSellerCanaryOperationSnapshotHandler(ctx, {
    publicationRef: envelope.publicationRef,
    revision: envelope.publicationRevision,
  })
  const currentOperation = snapshot === null
    ? undefined
    : parsePublishedToolSnapshot(snapshot.toolJson)
  if (snapshot === null || currentOperation === undefined) {
    return { kind: 'refused', code: 'target_drift' }
  }
  const current = currentAnchorFromSnapshot(sealed, snapshot, currentOperation)
  const evaluated = evaluateX402SellerPromotion({
    actingOwnerId: actor.canonicalAccountRef,
    sealed,
    current,
    sellerClaimCurrent: await exactCurrentSellerClaim(ctx, currentOperation, current),
    platformFundingAuthorized,
    readinessCurrent: true,
    outputDeterministic: output.deterministic,
    outputAssertionMatched: output.assertionMatched,
    expectedOutputEvidenceDigest: envelope.expectedOutputEvidenceDigest,
    outputDigest: output.outputDigest,
    commitment,
    observation,
    now,
  })
  if (evaluated.kind === 'refused') {
    return { kind: 'refused', code: promotionRefusalCode(evaluated.code) }
  }

  if (!await admitExactSellerCanaryPublication(
    ctx,
    sealed,
    evaluated.promotionEvidence.promotionEvidenceDigest,
    now,
  )) return { kind: 'refused', code: 'target_drift' }
  if (business.publicStatus === 'unpublished') {
    await ctx.db.patch(args.businessId, { publicStatus: 'published' })
  }
  const publicOperation = await readCurrentPublishedTool(ctx, sealed.draftOperationRef, now)
  if (publicOperation === undefined
    || publicOperation.materialDigest !== evaluated.target.toolMaterialDigest
    || publicOperation.identity.contractDigest !== sealed.contractDigest
    || publicOperation.identity.bindingDigest !== sealed.bindingDigest
    || publicOperation.priceDigest !== sealed.priceDigest) {
    throw new Error('seller_promotion_post_publish_operation_drift')
  }
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, args.businessId, now)
  if (support[sealed.offeringRef]?.routeable !== true) {
    throw new Error('seller_promotion_post_publish_not_routeable')
  }
  const projection = await rebuildBusinessSupplyProjectionSnapshotCommand({
    db: ctx.db,
    sourceDb: ctx.db,
    businessId: args.businessId,
    support,
    now,
  })
  if (projection.kind !== 'ok') throw new Error(`seller_promotion_projection_failed:${projection.code}`)
  await ctx.db.insert('operationKeys', {
    scope: 'catalog_offering',
    actorKind: 'owner',
    actorRef: actor.canonicalAccountRef,
    operationName: 'promoteX402SellerCanary',
    key: args.canaryRef,
    requestHash: evaluated.consumptionDigest,
    sourceHash: evaluated.promotionEvidence.promotionEvidenceDigest,
    status: 'succeeded',
    resultHash: evaluated.promotionEvidence.promotionEvidenceDigest,
    effectRefs: [
      args.canaryRef,
      sealed.offeringRef,
      `${sealed.publicationRef}@${sealed.publicationRevision}`,
      sealed.draftOperationRef,
    ],
    createdAt: now,
    updatedAt: now,
  })
  return {
    kind: 'promoted',
    canaryRef: args.canaryRef,
    offeringRef: sealed.offeringRef,
    offeringRevision: sealed.offeringRevision,
    publicationRef: sealed.publicationRef,
    publicationRevision: sealed.publicationRevision,
    toolRef: sealed.draftOperationRef,
    promotionEvidenceDigest: evaluated.promotionEvidence.promotionEvidenceDigest,
    outputDigest: output.outputDigest,
  }
}

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

function isCatalogRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type CatalogStringKey<Row extends object> = Extract<keyof Row, string>

function requiredCatalogString<Row extends object>(row: Row, field: CatalogStringKey<Row>): string {
  const value = row[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`catalog_invalid_${field}`)
  }
  return value
}

function requiredCatalogNumber<Row extends object>(row: Row, field: CatalogStringKey<Row>): number {
  const value = row[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`catalog_invalid_${field}`)
  }
  return value
}

function optionalCatalogString<Row extends object>(row: Row, field: CatalogStringKey<Row>): string | undefined {
  const value = row[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`catalog_invalid_${field}`)
  return value
}

function requiredCatalogExactAmount<Row extends object>(row: Row, field: CatalogStringKey<Row>) {
  const parsed = exactAmountSchema.safeParse(row[field])
  if (!parsed.success) throw new Error(`catalog_invalid_${field}`)
  return parsed.data
}

function requiredCatalogLiteral<T extends string>(
  values: readonly T[],
  value: unknown,
  field: string,
): T {
  const match = values.find((candidate) => candidate === value)
  if (match === undefined) throw new Error(`catalog_invalid_${field}`)
  return match
}

function readCatalogPrice(value: unknown): OfferingPrice | undefined {
  if (value === undefined) return undefined
  if (!isCatalogRecord(value)) throw new Error('catalog_invalid_price')
  const kind = requiredCatalogLiteral(OfferingPriceKindValues, value.kind, 'price_kind')
  const unit = value.unit === undefined
    ? undefined
    : requiredCatalogLiteral(OfferingPriceUnitValues, value.unit, 'price_unit')
  const taxTreatment = requiredCatalogLiteral(OfferingPriceTaxTreatmentValues, value.taxTreatment, 'price_taxTreatment')

  if (kind === 'quote_only') {
    return {
      kind,
      currency: requiredCatalogString(value, 'currency'),
      ...(unit === undefined ? {} : { unit }),
      taxTreatment,
    }
  }
  if (kind === 'fixed' || kind === 'from') {
    return {
      kind,
      amount: requiredCatalogExactAmount(value, 'amount'),
      ...(unit === undefined ? {} : { unit }),
      taxTreatment,
    }
  }

  const minimum = requiredCatalogExactAmount(value, 'minimum')
  const maximum = requiredCatalogExactAmount(value, 'maximum')
  const exponent = Math.max(minimum.exponent, maximum.exponent)
  const comparableMinimum = rescaleExactAmount(minimum, exponent)
  const comparableMaximum = rescaleExactAmount(maximum, exponent)
  const comparison = comparableMinimum === undefined || comparableMaximum === undefined
    ? undefined
    : compareExactAmounts(comparableMinimum, comparableMaximum)
  if (comparison === undefined || comparison > 0) throw new Error('catalog_invalid_price_range')
  return {
    kind,
    minimum,
    maximum,
    ...(unit === undefined ? {} : { unit }),
    taxTreatment,
  }
}

export function readCatalogDescriptor(value: unknown): OfferingAccessPathDescriptor {
  if (!isCatalogRecord(value)) throw new Error('catalog_invalid_descriptor')
  const kind = value.kind
  if (kind === 'human_request') {
    const url = optionalCatalogString(value, 'url')
    return {
      kind,
      channel: requiredCatalogLiteral(['phone', 'website'], value.channel, 'access_path_channel'),
      disclosure: requiredCatalogString(value, 'disclosure'),
      ...(url === undefined ? {} : { url }),
    }
  }
  if (kind === 'external_operation') {
    const method = optionalCatalogString(value, 'method')
    const documentationUrl = optionalCatalogString(value, 'documentationUrl')
    const authenticationSummary = optionalCatalogString(value, 'authenticationSummary')
    const pricingSummary = optionalCatalogString(value, 'pricingSummary')
    const interfaceDescriptionValue = value.interfaceDescription
    const interfaceDescription = interfaceDescriptionValue === undefined
      ? undefined
      : (() => {
          if (!isCatalogRecord(interfaceDescriptionValue)) throw new Error('catalog_invalid_interface_description')
          const url = optionalCatalogString(interfaceDescriptionValue, 'url')
          return {
            format: requiredCatalogString(interfaceDescriptionValue, 'format'),
            ...(url === undefined ? {} : { url }),
          }
        })()
    return {
      kind,
      name: requiredCatalogString(value, 'name'),
      summary: requiredCatalogString(value, 'summary'),
      url: requiredCatalogString(value, 'url'),
      ...(method === undefined ? {} : { method }),
      ...(documentationUrl === undefined ? {} : { documentationUrl }),
      ...(interfaceDescription === undefined ? {} : { interfaceDescription }),
      ...(authenticationSummary === undefined ? {} : { authenticationSummary }),
      ...(pricingSummary === undefined ? {} : { pricingSummary }),
      provenance: requiredCatalogLiteral(['business_declared', 'publicly_observed'], value.provenance, 'access_path_provenance'),
    }
  }
  throw new Error('catalog_invalid_descriptor_kind')
}

function readCatalogStatus(value: unknown): BusinessOfferingStatus {
  return requiredCatalogLiteral(BusinessOfferingStatusValues, value, 'offering_status')
}

function readCatalogAccessPathStatus(value: unknown): OfferingAccessPathStatus {
  return requiredCatalogLiteral(OfferingAccessPathStatusValues, value, 'access_path_status')
}

function readCatalogRevision(row: Doc<'businessOfferingRevisions'>): BusinessOfferingRevisionRecord {
  const serviceAreaSummary = optionalCatalogString(row, 'serviceAreaSummary')
  const availabilitySummary = optionalCatalogString(row, 'availabilitySummary')
  const pricingSummary = optionalCatalogString(row, 'pricingSummary')
  const price = readCatalogPrice(row.price)
  return {
    offeringRef: brandNonEmpty(requiredCatalogString(row, 'offeringRef'), 'OfferingRef'),
    businessId: brandNonEmpty(requiredCatalogString(row, 'businessId'), 'BusinessId'),
    revision: requiredCatalogNumber(row, 'revision'),
    name: requiredCatalogString(row, 'name'),
    category: requiredCatalogString(row, 'category'),
    summary: requiredCatalogString(row, 'summary'),
    ...(serviceAreaSummary === undefined ? {} : { serviceAreaSummary }),
    ...(availabilitySummary === undefined ? {} : { availabilitySummary }),
    ...(pricingSummary === undefined ? {} : { pricingSummary }),
    ...(price === undefined ? {} : { price }),
    sourceHash: brandNonEmpty(requiredCatalogString(row, 'sourceHash'), 'SourceHash'),
    createdAt: requiredCatalogNumber(row, 'createdAt'),
  }
}

function readCatalogAccessPath(row: Doc<'offeringAccessPaths'>): OfferingAccessPathRecord {
  return {
    accessPathRef: brandNonEmpty(requiredCatalogString(row, 'accessPathRef'), 'AccessPathRef'),
    businessId: brandNonEmpty(requiredCatalogString(row, 'businessId'), 'BusinessId'),
    offeringRef: brandNonEmpty(requiredCatalogString(row, 'offeringRef'), 'OfferingRef'),
    offeringRevision: requiredCatalogNumber(row, 'offeringRevision'),
    offeringSourceHash: brandNonEmpty(requiredCatalogString(row, 'offeringSourceHash'), 'SourceHash'),
    status: readCatalogAccessPathStatus(row.status),
    descriptor: readCatalogDescriptor(row.descriptor),
    sourceHash: brandNonEmpty(requiredCatalogString(row, 'sourceHash'), 'SourceHash'),
    createdAt: requiredCatalogNumber(row, 'createdAt'),
    updatedAt: requiredCatalogNumber(row, 'updatedAt'),
  }
}

export async function loadExactOfferingSourceState(
  db: GenericDatabaseReader<DataModel>,
  businessId: Id<'businesses'>,
  target: OfferingCommandTarget,
  operation?: Readonly<{ actorRef: string; operationName: string; operationKey: string }>,
): Promise<OfferingSourceState> {
  const operationRow = operation === undefined
    ? null
    : await db.query('operationKeys')
      .withIndex('by_actor_operation_key', (query) => (
        query.eq('actorRef', operation.actorRef)
          .eq('operationName', operation.operationName)
          .eq('key', operation.operationKey)
      ))
      .unique()
  const toolRefs = readCatalogOperationRefs(operationRow)
  const accessPathRef = target.accessPathRef
  const explicitPath = accessPathRef === undefined
    ? null
    : await db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', accessPathRef))
      .unique()
  const replayRef = toolRefs[0]
  const replayOffering = target.offeringRef === undefined && explicitPath === null && replayRef !== undefined
    ? await db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', replayRef))
      .unique()
    : null
  const replayPath = target.offeringRef === undefined && explicitPath === null && replayOffering === null && replayRef !== undefined
    ? await db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', replayRef))
      .unique()
    : null
  const offeringRef = target.offeringRef
    ?? (explicitPath === null ? undefined : requiredCatalogString(explicitPath, 'offeringRef'))
    ?? (replayOffering === null ? undefined : requiredCatalogString(replayOffering, 'offeringRef'))
    ?? (replayPath === null ? undefined : requiredCatalogString(replayPath, 'offeringRef'))
  const offeringRow = offeringRef === undefined
    ? null
    : await db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', offeringRef))
      .unique()
  const ownedOffering = offeringRow !== null && requiredCatalogString(offeringRow, 'businessId') === businessId
    ? offeringRow
    : null
  const offering = ownedOffering === null ? undefined : {
    offeringRef: brandNonEmpty(requiredCatalogString(ownedOffering, 'offeringRef'), 'OfferingRef'),
    businessId: brandNonEmpty(requiredCatalogString(ownedOffering, 'businessId'), 'BusinessId'),
    currentRevision: requiredCatalogNumber(ownedOffering, 'currentRevision'),
    status: readCatalogStatus(ownedOffering.status),
    createdAt: requiredCatalogNumber(ownedOffering, 'createdAt'),
    updatedAt: requiredCatalogNumber(ownedOffering, 'updatedAt'),
  }
  const [revisionRow, pathRows] = offering === undefined
    ? [null, []] as const
    : await Promise.all([
        db.query('businessOfferingRevisions')
          .withIndex('by_offeringRef_and_revision', (query) => (
            query.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision)
          ))
          .unique(),
        db.query('offeringAccessPaths')
          .withIndex('by_offeringRef_and_status', (query) => query.eq('offeringRef', offering.offeringRef))
          .take(MAX_ACCESS_PATHS_PER_OFFERING + 1),
      ])
  if (pathRows.length > MAX_ACCESS_PATHS_PER_OFFERING) {
    throw new Error('offering_access_path_capacity_exceeded')
  }
  return {
    offerings: offering === undefined ? [] : [offering],
    revisions: revisionRow === null ? [] : [readCatalogRevision(revisionRow)],
    accessPaths: pathRows.map(readCatalogAccessPath),
    operations: readCatalogOperation(operationRow, toolRefs),
  }
}

function readCatalogOperationRefs(operationRow: Doc<'operationKeys'> | null): string[] {
  if (operationRow === null || operationRow.scope !== 'catalog_offering') return []
  const value = operationRow.effectRefs
  if (!Array.isArray(value) || value.some((ref) => typeof ref !== 'string')) {
    throw new Error('catalog_invalid_operation_effect_refs')
  }
  return value
}

function readCatalogOperation(
  operationRow: Doc<'operationKeys'> | null,
  toolRefs: readonly string[],
): OfferingSourceState['operations'] {
  return toolRefs[0] === undefined || operationRow === null
    ? []
    : [{
        actorRef: requiredCatalogString(operationRow, 'actorRef'),
        operationName: requiredCatalogString(operationRow, 'operationName'),
        operationKey: requiredCatalogString(operationRow, 'key'),
        requestHash: brandNonEmpty(requiredCatalogString(operationRow, 'requestHash'), 'SourceHash'),
        resultRef: toolRefs[0],
        ...(operationRow.resultHash === undefined
          ? {}
          : { resultHash: brandNonEmpty(requiredCatalogString(operationRow, 'resultHash'), 'SourceHash') }),
      }]
}

export async function loadOfferingSourceState(
  db: GenericDatabaseReader<DataModel>,
  businessId: Id<'businesses'>,
  operation?: Readonly<{ actorRef: string; operationName: string; operationKey: string }>,
): Promise<OfferingSourceState> {
  const offeringRows = await db.query('businessOfferings').withIndex('by_businessId_and_status', (query) => query.eq('businessId', businessId)).collect()
  const offerings = offeringRows.map((row) => ({
    offeringRef: brandNonEmpty(requiredCatalogString(row, 'offeringRef'), 'OfferingRef'),
    businessId: brandNonEmpty(requiredCatalogString(row, 'businessId'), 'BusinessId'),
    currentRevision: requiredCatalogNumber(row, 'currentRevision'),
    status: readCatalogStatus(row.status),
    createdAt: requiredCatalogNumber(row, 'createdAt'),
    updatedAt: requiredCatalogNumber(row, 'updatedAt'),
  }))
  const [revisionRows, pathRows] = await Promise.all([
    Promise.all(offerings.map((offering) => (
      db.query('businessOfferingRevisions')
        .withIndex('by_offeringRef_and_revision', (query) => (
          query.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision)
        ))
        .unique()
    ))),
    Promise.all(offerings.map((offering) => (
      db.query('offeringAccessPaths')
        .withIndex('by_offeringRef_and_status', (query) => query.eq('offeringRef', offering.offeringRef))
        .take(MAX_ACCESS_PATHS_PER_OFFERING + 1)
    ))),
  ])
  if (pathRows.some((rows) => rows.length > MAX_ACCESS_PATHS_PER_OFFERING)) {
    throw new Error('offering_access_path_capacity_exceeded')
  }
  const operationRow = operation === undefined
    ? null
    : await db.query('operationKeys')
      .withIndex('by_actor_operation_key', (query) => (
        query.eq('actorRef', operation.actorRef)
          .eq('operationName', operation.operationName)
          .eq('key', operation.operationKey)
      ))
      .unique()
  const toolRefs = readCatalogOperationRefs(operationRow)
  return {
    offerings,
    revisions: revisionRows.flatMap((row) => row === null ? [] : [readCatalogRevision(row)]),
    accessPaths: pathRows.flat().map(readCatalogAccessPath),
    operations: readCatalogOperation(operationRow, toolRefs),
  }
}

export async function persistOfferingSourceState(
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
  before: OfferingSourceState,
  after: OfferingSourceState,
  actorKind: 'owner' | 'system' = 'owner',
): Promise<{ kind: 'ok' } | { kind: 'error'; code: 'operation_conflict'; reason: string }> {
  // Preflight the entire write set before the first patch/insert. Domain refs are globally
  // addressable, but an owner command may never capture another business's ref.
  for (const item of after.offerings) {
    const existing = await db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', item.offeringRef))
      .unique()
    if (existing !== null && requiredCatalogString(existing, 'businessId') !== businessId) {
      return { kind: 'error', code: 'operation_conflict', reason: 'Offering reference belongs to another business.' }
    }
  }
  for (const item of after.accessPaths) {
    const existing = await db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', item.accessPathRef))
      .unique()
    if (existing !== null && requiredCatalogString(existing, 'businessId') !== businessId) {
      return { kind: 'error', code: 'operation_conflict', reason: 'Access path reference belongs to another business.' }
    }
  }
  for (const item of after.offerings) {
    const existing = await db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', item.offeringRef))
      .unique()
    const value = {
      offeringRef: item.offeringRef,
      businessId,
      currentRevision: item.currentRevision,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }
    if (existing === null) await db.insert('businessOfferings', value)
    else await db.patch(existing._id, value)
  }
  await Promise.all(after.revisions.slice(before.revisions.length).map((revision) => db.insert('businessOfferingRevisions', {
    offeringRef: revision.offeringRef,
    businessId,
    revision: revision.revision,
    name: revision.name,
    category: revision.category,
    summary: revision.summary,
    ...(revision.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: revision.serviceAreaSummary }),
    ...(revision.availabilitySummary === undefined ? {} : { availabilitySummary: revision.availabilitySummary }),
    ...(revision.pricingSummary === undefined ? {} : { pricingSummary: revision.pricingSummary }),
    ...(revision.price === undefined ? {} : { price: revision.price }),
    sourceHash: revision.sourceHash,
    createdAt: revision.createdAt,
  })))
  for (const item of after.accessPaths) {
    const existing = await db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', item.accessPathRef))
      .unique()
    const value = {
      accessPathRef: item.accessPathRef,
      businessId,
      offeringRef: item.offeringRef,
      offeringRevision: item.offeringRevision,
      offeringSourceHash: item.offeringSourceHash,
      status: item.status,
      descriptor: item.descriptor,
      sourceHash: item.sourceHash,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }
    if (existing === null) await db.insert('offeringAccessPaths', value)
    else await db.patch(existing._id, value)
  }
  await Promise.all(after.operations.slice(before.operations.length).map((operation) => db.insert('operationKeys', {
    scope: 'catalog_offering',
    actorKind,
    actorRef: operation.actorRef,
    operationName: operation.operationName,
    key: operation.operationKey,
    requestHash: operation.requestHash,
    status: 'succeeded',
    effectRefs: [operation.resultRef],
    ...(operation.resultHash === undefined ? {} : { resultHash: operation.resultHash }),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })))
  return { kind: 'ok' }
}
