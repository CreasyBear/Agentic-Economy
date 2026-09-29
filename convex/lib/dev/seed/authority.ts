import type { MutationCtx } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
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
} from '../../../../src/modules/principal-account/public'
import {
  DELEGATION_MAX_ANCESTRY_GRANTS,
  DelegationService,
  delegationGrantRef,
  type DelegationAuthoritySnapshot,
} from '../../../../src/modules/authority/delegation/public'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from '../../authority/delegation/persistence'
import { resolveActiveAccountRefForPrincipal } from '../../principalAccount/interactiveAuthority/accountResolution'

export const DEV_SEED_CATALOG_PRINCIPAL_REF = 'prn_d2000000000000000000000000000001' as PrincipalRef
export const DEV_SEED_CATALOG_ACCOUNT_REF = 'acc_d2000000000000000000000000000001' as AccountRef
export const DEV_SEED_CATALOG_GRANT_REF = 'grt_d2000000000000000000000000000001'
export const DEV_SEED_CATALOG_MEMBERSHIP_REF = 'mem_d2000000000000000000000000000001'
export const DEV_SEED_CATALOG_PUBLISHER_REF = 'system:dev-seed'
export const DEV_SEED_CATALOG_SCOPE = 'catalog:dev_seed' as const
export const DEV_SEED_CATALOG_RESOURCE = 'catalog:dev-seed' as const
export const DEV_SEED_CATALOG_PRINCIPAL_NAME = 'Agentic Economy development catalog seed workload'
export const DEV_SEED_CATALOG_ACCOUNT_NAME = 'Agentic Economy development catalog seed account'

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

/**
 * Resolves an opt-in local owner Account through the same active-account
 * selection helper used by signed-in interactive surfaces. The caller remains
 * responsible for the existing local-dev deployment guard.
 */
export async function resolveDevSeedOwningAccountRef(
  ctx: MutationCtx,
  requestedAccountRef: string | undefined,
  fallbackAccountRef: string,
): Promise<string> {
  const candidate = requestedAccountRef?.trim()
  if (candidate === undefined || candidate.length === 0) return fallbackAccountRef
  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', candidate))
    .unique()
  if (account === null || account.lifecycle !== 'active') throw new DevSeedCatalogAuthorityError()
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
    .unique()
  if (ownership === null || ownership.lifecycle !== 'active' || ownership.accountRef !== candidate) {
    throw new DevSeedCatalogAuthorityError()
  }
  const resolved = await resolveActiveAccountRefForPrincipal(
    ctx.db,
    principalRef(ownership.ownerPrincipalRef),
    undefined,
    'require',
  )
  if (resolved.activeAccountRef !== candidate) throw new DevSeedCatalogAuthorityError()
  return candidate
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
