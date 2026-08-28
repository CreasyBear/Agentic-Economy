import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'
import {
  canonicalProviderConnectionProjectionIsCurrent,
  canonicalProviderConnectionProjectionMatches,
  type ProviderConnection,
} from '../../../src/modules/capability-supply/provider-connection'
import {
  DELEGATION_MAX_ANCESTRY_GRANTS,
  DelegationError,
  DelegationService,
  parsePersistedDelegationGrant,
  type DelegationGrant,
  type DelegationGrantRef,
} from '../../../src/modules/authority/delegation/public'
import {
  ConnectionLifecycleError,
  ConnectionLifecycleService,
  parsePersistedConnection,
  type Connection,
  type ConnectionOperation,
} from '../../../src/modules/connections/lifecycle/public'
import {
  accountRef,
  principalRef,
  type AccountRef,
  type PrincipalRef,
} from '../../../src/modules/principal-account/public'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import {
  createDelegationBackedConnectionAuthority,
  createConvexConnectionLifecycleStore,
} from '../connectionLifecyclePersistence'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from '../delegationPersistence'
import type { CleanupResourceAuthority } from './contracts'

export type CanonicalActor = Readonly<{
  principalRef: PrincipalRef
  accountRef: AccountRef
}>

function withoutSystemFields<Value extends { _id: unknown; _creationTime: number }>(value: Value) {
  const { _id, _creationTime, ...domain } = value
  void _id
  void _creationTime
  return domain
}

export async function readCanonicalConnectionForProjection(
  ctx: Pick<QueryCtx, 'db'>,
  legacy: ProviderConnection,
  requireUsable = false,
): Promise<Connection | null> {
  if (legacy.canonicalConnectionRef === undefined) return null
  const row = await ctx.db.query('connections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', legacy.canonicalConnectionRef as never))
    .unique()
  if (row === null) return null
  try {
    const canonical = parsePersistedConnection(withoutSystemFields(row))
    const valid = requireUsable
      ? canonicalProviderConnectionProjectionIsCurrent(legacy, canonical)
      : canonicalProviderConnectionProjectionMatches(legacy, canonical)
    return valid ? canonical : null
  } catch {
    return null
  }
}

export async function resolveCanonicalBusinessOwner(
  ctx: Pick<MutationCtx, 'db'>,
  businessId: Id<'businesses'>,
): Promise<CanonicalActor | null> {
  const business = await ctx.db.get(businessId)
  if (business === null) return null
  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', business.owningAccountRef))
    .unique()
  if (account === null || account.lifecycle !== 'active') return null
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
    .unique()
  if (ownership === null) return null
  if (![ownership.lifecycle === 'active', ownership.accountRef === account.accountRef].every(Boolean))
    return null
  const principal = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', ownership.ownerPrincipalRef))
    .unique()
  if (principal === null || principal.lifecycle !== 'active') return null
  return canonicalActor(principal.principalRef, account.accountRef)
}

function canonicalActor(principal: string, account: string): CanonicalActor | null {
  try {
    return Object.freeze({ principalRef: principalRef(principal), accountRef: accountRef(account) })
  } catch {
    return null
  }
}

function authorityValuesNarrowed(child: readonly string[], parent: readonly string[]): boolean {
  return child.every((value) => parent.includes(value))
}

function parseGrantRow(
  row: (Readonly<{ _id: unknown; _creationTime: number }> & Record<string, unknown>) | null,
): DelegationGrant | null {
  if (row === null) return null
  try {
    const { _id, _creationTime, ...stored } = row
    void _id
    void _creationTime
    return parsePersistedDelegationGrant(stored as never)
  } catch {
    return null
  }
}

function grantMatchesChainPosition(
  grant: DelegationGrant,
  expectedRef: string,
  expectedGeneration: number,
  input: Readonly<{ accountRef: string; now: number }>,
): boolean {
  return [
    grant.grantRef === expectedRef, grant.generation === expectedGeneration,
    grant.lifecycle === 'active', grant.accountRef === input.accountRef,
    grant.expiresAt > input.now,
  ].every(Boolean)
}

function childAuthorityIsNarrower(
  child: DelegationGrant,
  parent: DelegationGrant,
): boolean {
  return [
    child.actorPrincipalRef === parent.subjectPrincipalRef,
    authorityValuesNarrowed(child.scopes, parent.scopes),
    authorityValuesNarrowed(child.resourceRefs, parent.resourceRefs),
    child.budgetLimit <= parent.budgetLimit,
    child.expiresAt < parent.expiresAt,
  ].every(Boolean)
}

function rootAdmitsCleanup(
  leaf: DelegationGrant,
  input: Readonly<{ actorPrincipalRef: string; resourceRef: string }>,
): boolean {
  return [
    leaf.subjectPrincipalRef === input.actorPrincipalRef,
    leaf.scopes.includes('connection:revoke'),
    leaf.resourceRefs.includes(input.resourceRef),
  ].every(Boolean)
}

async function readCurrentCleanupGrantChain(
  ctx: Pick<QueryCtx, 'db'>,
  input: Readonly<{
    grantRef: string
    grantGeneration: number
    accountRef: string
    actorPrincipalRef: string
    resourceRef: string
    now: number
  }>,
): Promise<{ leaf: DelegationGrant; expiresAt: number } | null> {
  let expectedRef = input.grantRef
  let expectedGeneration = input.grantGeneration
  let child: DelegationGrant | undefined
  let leaf: DelegationGrant | undefined
  let expiresAt = Number.MAX_SAFE_INTEGER
  const seen = new Set<string>()
  for (let position = 0; position < DELEGATION_MAX_ANCESTRY_GRANTS; position += 1) {
    if (seen.has(expectedRef)) return null
    seen.add(expectedRef)
    const row = await ctx.db.query('authorityDelegationGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', expectedRef as never))
      .unique()
    const grant = parseGrantRow(row as never)
    if (grant === null) return null
    if (!grantMatchesChainPosition(
      grant, expectedRef, expectedGeneration, input,
    )) return null
    if (child !== undefined && !childAuthorityIsNarrower(child, grant)) return null
    leaf ??= grant
    expiresAt = Math.min(expiresAt, grant.expiresAt)
    if (grant.parentGrantRef === undefined) {
      return rootAdmitsCleanup(leaf, input) ? { leaf, expiresAt } : null
    }
    child = grant
    expectedRef = grant.parentGrantRef
    // The persisted-grant parser rejects unpaired parent refs/generations.
    expectedGeneration = grant.parentGeneration as number
  }
  return null
}

export async function readCurrentCleanupResourceAuthority(
  ctx: Pick<QueryCtx, 'db'>,
  legacy: ProviderConnection,
  now = Date.now(),
): Promise<CleanupResourceAuthority | null> {
  const canonical = await readCanonicalConnectionForProjection(ctx, legacy)
  if (canonical === null) return null
  if (![
    canonical.lifecycle === 'revoked', canonical.action.operation === 'revoke',
    legacy.canonicalConnectionRef === canonical.connectionRef,
    legacy.canonicalConnectionGeneration === canonical.generation,
    legacy.owningAccountRef === canonical.owningAccountRef,
    legacy.installedByPrincipalRef === canonical.installedByPrincipalRef,
    legacy.authorityGrantRef === canonical.action.grantRef,
    legacy.authorityGrantGeneration === canonical.action.grantGeneration,
  ].every(Boolean)) return null
  const [principal, account] = await Promise.all([
    ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', canonical.action.actorPrincipalRef as never))
      .unique(),
    ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonical.owningAccountRef as never))
      .unique(),
  ])
  if ([principal, account].some((row) => row === null)) return null
  const activePrincipal = principal as NonNullable<typeof principal>
  const activeAccount = account as NonNullable<typeof account>
  if (![
    activePrincipal.lifecycle === 'active', activeAccount.lifecycle === 'active',
    Number.isSafeInteger(activeAccount.revision), activeAccount.revision > 0,
  ].every(Boolean)) return null
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', activeAccount.currentOwnershipRef))
    .unique()
  if (ownership === null) return null
  if (![
    ownership.lifecycle === 'active',
    ownership.accountRef === canonical.owningAccountRef,
    ownership.ownerPrincipalRef === canonical.action.actorPrincipalRef,
  ].every(Boolean)) return null
  const resourceRef = `connection:${canonical.connectionRef}`
  const chain = await readCurrentCleanupGrantChain(ctx, {
    grantRef: canonical.action.grantRef,
    grantGeneration: canonical.action.grantGeneration,
    accountRef: canonical.owningAccountRef,
    actorPrincipalRef: canonical.action.actorPrincipalRef,
    resourceRef,
    now,
  })
  if (chain === null) return null
  if (![
    canonical.action.activeAccountRef === canonical.owningAccountRef,
    canonical.action.resourceRefs.includes(resourceRef),
  ].every(Boolean)) return null
  return Object.freeze({
    canonicalConnectionRef: canonical.connectionRef,
    connectionGeneration: canonical.generation,
    owningAccountRef: canonical.owningAccountRef,
    actorPrincipalRef: canonical.action.actorPrincipalRef,
    accountRevision: activeAccount.revision,
    ownershipRef: ownership.ownershipRef,
    grantRef: chain.leaf.grantRef,
    grantGeneration: chain.leaf.generation,
    authorityExpiresAt: chain.expiresAt,
  })
}

export function cleanupResourceAuthorityMatches(
  left: CleanupResourceAuthority,
  right: CleanupResourceAuthority,
): boolean {
  return left.canonicalConnectionRef === right.canonicalConnectionRef
    && left.connectionGeneration === right.connectionGeneration
    && left.owningAccountRef === right.owningAccountRef
    && left.actorPrincipalRef === right.actorPrincipalRef
    && left.accountRevision === right.accountRevision
    && left.ownershipRef === right.ownershipRef
    && left.grantRef === right.grantRef
    && left.grantGeneration === right.grantGeneration
    && left.authorityExpiresAt === right.authorityExpiresAt
}

export async function resolveUniqueCanonicalGrant(
  ctx: Pick<MutationCtx, 'db'>,
  actor: CanonicalActor,
  operation: ConnectionOperation,
  resourceRefs: readonly string[],
): Promise<{ grantRef: DelegationGrantRef; generation: number; expiresAt: number } | null> {
  const now = Date.now()
  const candidates = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_subjectPrincipalRef_and_lifecycle', (query) => query
      .eq('subjectPrincipalRef', actor.principalRef)
      .eq('lifecycle', 'active'))
    .take(DELEGATION_MAX_ANCESTRY_GRANTS + 1)
  if (candidates.length > DELEGATION_MAX_ANCESTRY_GRANTS) return null
  const matching = candidates.filter((grant) => grant.accountRef === actor.accountRef
    && grant.expiresAt > now
    && Number.isSafeInteger(grant.generation)
    && grant.generation > 0
    && grant.scopes.includes(`connection:${operation}`)
    && resourceRefs.every((resource) => grant.resourceRefs.includes(resource)))
  if (matching.length !== 1) return null
  const grant = matching[0] as (typeof matching)[number]
  return { grantRef: grant.grantRef as DelegationGrantRef, generation: grant.generation, expiresAt: grant.expiresAt }
}

export function createCanonicalConnectionLifecycleService(ctx: MutationCtx, actor: CanonicalActor): ConnectionLifecycleService {
  const delegation = new DelegationService(
    createConvexDelegationStore(ctx),
    createConvexDelegationContextPort(ctx, actor.principalRef),
  )
  const authority = createDelegationBackedConnectionAuthority(delegation)
  return new ConnectionLifecycleService(
    createConvexConnectionLifecycleStore(ctx),
    {
      withCurrentAuthority: async (request, consequence) => await authority.withCurrentAuthority(
        request,
        async (snapshot) => await consequence(Object.freeze({
          ...snapshot,
          // Delegation persists canonical set order; Connection actions retain
          // their operation-defined order after the same set was admitted.
          resourceRefs: Object.freeze([...request.resourceRefs]),
        })),
      ),
    },
  )
}

export function canonicalConnectionActionContext(actor: CanonicalActor, operation: ConnectionOperation, commandId: string) {
  const requestRef = canonicalDigest({ operation, commandId, accountRef: actor.accountRef, principalRef: actor.principalRef })
  return {
    actorPrincipalRef: actor.principalRef,
    activeAccountRef: actor.accountRef,
    correlationRef: `provider-connection:${requestRef}`,
    idempotencyRef: `provider-connection:${operation}:${requestRef}`,
  }
}

export function failClosedCanonicalLifecycleError(error: unknown): null {
  if (error instanceof ConnectionLifecycleError || error instanceof DelegationError) return null
  throw error
}
