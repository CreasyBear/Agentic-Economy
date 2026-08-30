import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'
import {
  providerConnectionAuthorityProvenanceIsValid,
  type ProviderConnection,
  type ProviderConnectionAuthorityProvenance,
} from '../../../src/modules/capability-supply/provider-connection'
import {
  DELEGATION_MAX_ANCESTRY_GRANTS,
  parsePersistedDelegationGrant,
  type DelegationGrant,
  type DelegationGrantRef,
} from '../../../src/modules/authority/delegation/public'
import {
  accountRef,
  principalRef,
  type AccountRef,
  type PrincipalRef,
} from '../../../src/modules/principal-account/public'
import type { CleanupResourceAuthority } from './contracts'
import { validateCanonicalAgentDelegation } from '../canonicalAgentAuthority'

type ProviderConnectionOperation = 'install' | 'refresh' | 'revoke' | 'delete'

export type CanonicalActor = Readonly<{
  principalRef: PrincipalRef
  accountRef: AccountRef
}>

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
  return parent.includes('*') || child.every((value) => parent.includes(value))
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
    leaf.resourceRefs.includes('*') || leaf.resourceRefs.includes(input.resourceRef),
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

async function actorHasCurrentAccountAuthority(
  ctx: Pick<QueryCtx, 'db'>,
  input: Readonly<{
    actorPrincipalRef: string
    accountRef: string
    ownership: Readonly<{
      lifecycle: string
      accountRef: string
      ownerPrincipalRef: string
    }>
  }>,
): Promise<boolean> {
  if (input.ownership.lifecycle !== 'active' || input.ownership.accountRef !== input.accountRef) return false
  if (input.ownership.ownerPrincipalRef === input.actorPrincipalRef) return true
  const memberships = await ctx.db.query('memberships')
    .withIndex('by_memberPrincipalRef_and_lifecycle', (query) => query
      .eq('memberPrincipalRef', input.actorPrincipalRef as never)
      .eq('lifecycle', 'active'))
    .take(2)
  return memberships.length === 1 && memberships[0]?.accountRef === input.accountRef
}

export async function readCurrentCleanupResourceAuthority(
  ctx: Pick<QueryCtx, 'db'>,
  connection: ProviderConnection,
  now = Date.now(),
): Promise<CleanupResourceAuthority | null> {
  if (!providerConnectionAuthorityProvenanceIsValid(connection)
    || !['revocation_pending', 'cleanup_required', 'revoked'].includes(connection.lifecycle)) return null
  const [principal, account] = await Promise.all([
    ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', connection.installedByPrincipalRef as never))
      .unique(),
    ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', connection.owningAccountRef as never))
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
  const hasAccountAuthority = await actorHasCurrentAccountAuthority(ctx, {
    actorPrincipalRef: connection.installedByPrincipalRef,
    accountRef: connection.owningAccountRef,
    ownership,
  })
  if (!hasAccountAuthority) return null
  const resourceRef = `connection:${connection.connectionRef}`
  const chain = await readCurrentCleanupGrantChain(ctx, {
    grantRef: connection.authorityGrantRef,
    grantGeneration: connection.authorityGrantGeneration,
    accountRef: connection.owningAccountRef,
    actorPrincipalRef: connection.installedByPrincipalRef,
    resourceRef,
    now,
  })
  if (chain === null) return null
  return Object.freeze({
    connectionRef: connection.connectionRef,
    authorityGeneration: connection.authorityGeneration,
    owningAccountRef: connection.owningAccountRef,
    actorPrincipalRef: connection.installedByPrincipalRef,
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
  return left.connectionRef === right.connectionRef
    && left.authorityGeneration === right.authorityGeneration
    && left.owningAccountRef === right.owningAccountRef
    && left.actorPrincipalRef === right.actorPrincipalRef
    && left.accountRevision === right.accountRevision
    && left.ownershipRef === right.ownershipRef
    && left.grantRef === right.grantRef
    && left.grantGeneration === right.grantGeneration
    && left.authorityExpiresAt === right.authorityExpiresAt
}

type ProviderConnectionGrantCandidate = Readonly<{
  grantRef: string
  generation: number
  accountRef: string
  subjectPrincipalRef: string
  scopes: readonly string[]
  resourceRefs: readonly string[]
}>

function grantCandidateCouldAdmit(
  candidate: ProviderConnectionGrantCandidate,
  actor: CanonicalActor,
  operation: ProviderConnectionOperation,
  resourceRefs: readonly string[],
): boolean {
  return candidate.accountRef === actor.accountRef
    && candidate.subjectPrincipalRef === actor.principalRef
    && Number.isSafeInteger(candidate.generation)
    && candidate.generation >= 1
    && candidate.scopes.includes(`connection:${operation}`)
    && (candidate.resourceRefs.includes('*')
      || resourceRefs.every((resource) => candidate.resourceRefs.includes(resource)))
}

async function admitProviderConnectionGrantCandidate(
  ctx: MutationCtx,
  candidate: ProviderConnectionGrantCandidate,
  actor: CanonicalActor,
  operation: ProviderConnectionOperation,
  resourceRefs: readonly string[],
  now: number,
): Promise<{ grantRef: DelegationGrantRef; generation: number; expiresAt: number } | null> {
  if (!grantCandidateCouldAdmit(candidate, actor, operation, resourceRefs)) return null
  const snapshot = await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: 'provider-connection-provenance',
    evidenceRef: `connection:${operation}`,
    principalRef: actor.principalRef,
    accountRef: actor.accountRef,
    grantRef: candidate.grantRef,
    grantGeneration: candidate.generation,
    requiredScopes: [`connection:${operation}`],
    resourceRefs,
    now,
  })
  if (snapshot === null
    || snapshot.grantRef !== candidate.grantRef
    || snapshot.generation !== candidate.generation
    || snapshot.accountRef !== actor.accountRef
    || snapshot.actorPrincipalRef !== actor.principalRef) return null
  return {
    grantRef: candidate.grantRef as DelegationGrantRef,
    generation: candidate.generation,
    expiresAt: snapshot.expiresAt,
  }
}

export async function resolveUniqueProviderConnectionGrant(
  ctx: MutationCtx,
  actor: CanonicalActor,
  operation: ProviderConnectionOperation,
  resourceRefs: readonly string[],
): Promise<{ grantRef: DelegationGrantRef; generation: number; expiresAt: number } | null> {
  const now = Date.now()
  const candidates = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_subjectPrincipalRef_and_lifecycle', (query) => query
      .eq('subjectPrincipalRef', actor.principalRef)
      .eq('lifecycle', 'active'))
    .take(DELEGATION_MAX_ANCESTRY_GRANTS + 1)
  if (candidates.length > DELEGATION_MAX_ANCESTRY_GRANTS) return null
  const matching: Array<{ grantRef: DelegationGrantRef; generation: number; expiresAt: number }> = []
  for (const candidate of candidates) {
    const admitted = await admitProviderConnectionGrantCandidate(
      ctx, candidate, actor, operation, resourceRefs, now,
    )
    if (admitted !== null) matching.push(admitted)
  }
  if (matching.length !== 1) return null
  return matching[0] ?? null
}

export async function resolveProviderConnectionProvenance(
  ctx: MutationCtx,
  actor: CanonicalActor,
  operation: ProviderConnectionOperation,
  resourceRefs: readonly string[],
  credentialRef: string | null,
): Promise<ProviderConnectionAuthorityProvenance | null> {
  const grant = await resolveUniqueProviderConnectionGrant(ctx, actor, operation, resourceRefs)
  if (grant === null) return null
  return Object.freeze({
    owningAccountRef: actor.accountRef,
    installedByPrincipalRef: actor.principalRef,
    authorityGrantRef: grant.grantRef,
    authorityGrantGeneration: grant.generation,
    ...(credentialRef === null ? {} : { secretRef: credentialRef }),
  })
}
