import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'

import type { MutationCtx } from './_generated/server'
import type { DataModel, Doc, Id } from './_generated/dataModel'

import { brandNonEmpty } from '../src/modules/common/ids'
import {
  readActiveAdminMembership,
  readCanonicalCompatibilityOwner,
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
  MAX_OFFERINGS_PER_BUSINESS,
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
import { compareExactAmounts, exactAmountSchema, rescaleExactAmount } from '../src/modules/money/public'
import {
  accountRef,
  principalRef,
  WorkloadContextAdmission,
  type Account,
  type AccountOwnership,
  type AccountRef,
  type Membership,
  type Principal,
  type PrincipalRef,
  type WorkloadContextStore,
} from '../src/modules/principal-account/public'
import {
  DelegationService,
  delegationGrantRef,
  type DelegationAuthoritySnapshot,
} from '../src/modules/authority/delegation/public'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from './lib/delegationPersistence'

export const DEV_SEED_CATALOG_PRINCIPAL_REF = 'prn_d2000000000000000000000000000001' as PrincipalRef
export const DEV_SEED_CATALOG_ACCOUNT_REF = 'acc_d2000000000000000000000000000001' as AccountRef
export const DEV_SEED_CATALOG_SCOPE = 'catalog:dev_seed' as const
export const DEV_SEED_CATALOG_RESOURCE = 'catalog:dev-seed' as const
const DEV_SEED_CATALOG_PRINCIPAL_NAME = 'Agentic Economy development catalog seed workload'
const DEV_SEED_CATALOG_ACCOUNT_NAME = 'Agentic Economy development catalog seed account'

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
  return runSystemOfferingSourceCommand(ctx, { ...command, operationName: 'reviseOffering' }, (state, authority) => reviseOfferingInState(state, {
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
  return runSystemOfferingSourceCommand(ctx, { ...command, operationName: 'upsertAccessPath' }, (state, authority) => upsertAccessPathInState(state, {
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
  return runSystemOfferingSourceCommand(ctx, { ...command, operationName: 'withdrawAccessPath' }, (state, authority) => (
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
  mutate: (
    state: OfferingSourceState,
    authority: { actorRef?: string; ownerRef: string; businessOwnerRef: string },
    now: number,
  ) => OfferingSourceResult<unknown>,
  now: number,
  actorKind: 'owner' | 'system',
): Promise<OfferingCommandResult> {
  const state = await loadOfferingSourceState(db, businessId, {
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
  mutate: (
    state: OfferingSourceState,
    authority: { actorRef?: string; ownerRef: string; businessOwnerRef: string },
  ) => OfferingSourceResult<unknown>,
  now: number,
): Promise<OfferingCommandResult> {
  let snapshot: DelegationAuthoritySnapshot
  try {
    snapshot = await admitDevSeedCatalogAuthority(ctx, command.operationKey, command.businessId)
  } catch {
    return {
      kind: 'error',
      code: 'authority_denied',
      reason: 'Declared development seed workload authority is not current.',
    }
  }
  return runOfferingSourceCore(
    ctx.db,
    command.businessId,
    snapshot.actorPrincipalRef,
    snapshot.actorPrincipalRef,
    command.operationName,
    command.operationKey,
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
    return row === null ? undefined : row as unknown as Principal
  }

  async getAccount(ref: AccountRef): Promise<Account | undefined> {
    const row = await this.ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', ref))
      .unique()
    return row === null ? undefined : row as unknown as Account
  }

  async getOwnership(account: Account): Promise<AccountOwnership | undefined> {
    const row = await this.ctx.db.query('accountOwnerships')
      .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
      .unique()
    return row === null ? undefined : row as unknown as AccountOwnership
  }

  async getActiveMembership(ref: AccountRef, principal: PrincipalRef): Promise<Membership | undefined> {
    const row = await this.ctx.db.query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', ref)
        .eq('memberPrincipalRef', principal)
        .eq('lifecycle', 'active'))
      .unique()
    return row === null ? undefined : row as unknown as Membership
  }
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
    .collect()
  const matching = candidates.filter((grant) => grant.accountRef === DEV_SEED_CATALOG_ACCOUNT_REF
    && grant.expiresAt > consequenceNow
    && Number.isSafeInteger(grant.generation)
    && grant.generation > 0
    && grant.scopes.includes(DEV_SEED_CATALOG_SCOPE)
    && resources.every((resource) => grant.resourceRefs.includes(resource)))
  if (matching.length !== 1) throw new DevSeedCatalogAuthorityError()
  const grant = matching[0]!
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
    const owner = business === null ? null : await ctx.db.get(business.ownerId)
    if (owner?.canonicalPrincipalRef !== snapshot.actorPrincipalRef
      || owner.canonicalAccountRef !== snapshot.accountRef) {
      throw new DevSeedCatalogAuthorityError()
    }
  }
  return snapshot
}

export async function createBusinessOfferingHandler(ctx: MutationCtx, args: CreateBusinessOfferingArgs) {
  return runOfferingSourceMutation(ctx, args, 'createOffering', (state, authority, now) => createOfferingInState(state, {
    authority,
    operationKey: args.operationKey,
    businessId: brandNonEmpty(args.businessId, 'BusinessId'),
    offeringRef: brandNonEmpty(args.offeringRef, 'OfferingRef'),
    facts: args.facts,
    now,
  }))
}

export async function reviseBusinessOfferingHandler(ctx: MutationCtx, args: ReviseBusinessOfferingArgs) {
  return runOfferingSourceMutation(ctx, args, 'reviseOffering', (state, authority, now) => reviseOfferingInState(state, {
    authority,
    operationKey: args.operationKey,
    offeringRef: brandNonEmpty(args.offeringRef, 'OfferingRef'),
    expectedRevision: args.expectedRevision,
    facts: args.facts,
    now,
  }))
}

export async function changeBusinessOfferingStatusHandler(ctx: MutationCtx, args: ChangeBusinessOfferingStatusArgs) {
  return runOfferingSourceMutation(ctx, args, 'changeOfferingStatus', (state, authority, now) => changeOfferingStatusInState(state, {
    authority,
    operationKey: args.operationKey,
    offeringRef: brandNonEmpty(args.offeringRef, 'OfferingRef'),
    expectedRevision: args.expectedRevision,
    status: args.status,
    now,
  }))
}

export async function upsertOfferingAccessPathHandler(ctx: MutationCtx, args: UpsertOfferingAccessPathArgs) {
  return runOfferingSourceMutation(ctx, args, 'upsertAccessPath', (state, authority, now) => upsertAccessPathInState(state, {
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
  return runOfferingSourceMutation(ctx, args, 'withdrawAccessPath', (state, authority, now) => withdrawAccessPathInState(state, {
    authority,
    operationKey: args.operationKey,
    accessPathRef: brandNonEmpty(args.accessPathRef, 'AccessPathRef'),
    expectedRevision: args.expectedRevision,
    now,
  }))
}

async function runOfferingSourceMutation(
  ctx: MutationCtx,
  args: OfferingSourceMutationArgs,
  operationName: string,
  mutate: (state: OfferingSourceState, authority: { actorRef?: string; ownerRef: string; businessOwnerRef: string }, now: number) => OfferingSourceResult<unknown>,
): Promise<OfferingCommandResult> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'error', code: 'unauthenticated', reason: 'Authentication is required.' }
  const canonicalOwner = await readCanonicalCompatibilityOwner(ctx.db, actor)
  if (canonicalOwner === null) return { kind: 'error', code: 'wrong_owner', reason: 'Canonical owner context is invalid.' }
  const business = await ctx.db.get(args.businessId)
  if (business === null) return { kind: 'error', code: 'wrong_owner', reason: 'Business was not found.' }
  if (business.ownerId !== canonicalOwner._id) {
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
    mutate,
    now,
    'owner',
  )
  if (core.kind === 'error') return core
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
    membership?.clerkUserId === actor.clerkUserId ? membership : undefined,
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

export async function loadOfferingSourceState(
  db: GenericDatabaseReader<DataModel>,
  businessId: Id<'businesses'>,
  operation?: Readonly<{ actorRef: string; operationName: string; operationKey: string }>,
): Promise<OfferingSourceState> {
  const offeringRows = await db.query('businessOfferings').withIndex('by_businessId_and_status', (query) => query.eq('businessId', businessId)).take(MAX_OFFERINGS_PER_BUSINESS + 1)
  if (offeringRows.length > MAX_OFFERINGS_PER_BUSINESS) {
    throw new Error('business_offering_capacity_exceeded')
  }
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
  const operationRefs = operationRow === null || operationRow.scope !== 'catalog_offering'
    ? []
    : (() => {
        const value = operationRow.effectRefs
        if (!Array.isArray(value) || value.some((ref) => typeof ref !== 'string')) {
          throw new Error('catalog_invalid_operation_effect_refs')
        }
        return value
      })()
  return {
    offerings,
    revisions: revisionRows.flatMap((row) => row === null ? [] : [readCatalogRevision(row)]),
    accessPaths: pathRows.flat().map(readCatalogAccessPath),
    operations: operationRefs[0] === undefined || operationRow === null
      ? []
      : [{
          actorRef: requiredCatalogString(operationRow, 'actorRef'),
          operationName: requiredCatalogString(operationRow, 'operationName'),
          operationKey: requiredCatalogString(operationRow, 'key'),
          requestHash: brandNonEmpty(requiredCatalogString(operationRow, 'requestHash'), 'SourceHash'),
          resultRef: operationRefs[0],
          ...(operationRow.resultHash === undefined
            ? {}
            : { resultHash: brandNonEmpty(requiredCatalogString(operationRow, 'resultHash'), 'SourceHash') }),
        }],
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
