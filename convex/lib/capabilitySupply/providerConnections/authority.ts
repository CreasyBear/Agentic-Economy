import type { MutationCtx } from '../../../_generated/server'
import type { Id } from '../../../_generated/dataModel'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { type ProviderConnectionAuthorityProvenance } from '../../../../src/modules/capability-supply/provider-connection'
import {
  DelegationService,
  delegationGrantRef,
  type DelegationGrantRef,
} from '../../../../src/modules/authority/delegation/public'
import {
  accountRef,
  principalRef,
  type AccountRef,
  type PrincipalRef,
} from '../../../../src/modules/principal-account/public'
import { validateCanonicalAgentDelegation } from '../../authority/canonicalAgent/authority'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from '../../authority/delegation/persistence'

type ProviderConnectionOperation = 'install' | 'refresh' | 'revoke'

const OWNER_CONNECTION_SCOPES = Object.freeze([
  'connection:install',
  'connection:refresh',
  'connection:revoke',
  'secret:rotate',
] as const)

const OWNER_CONNECTION_GRANT_RENEWAL_MS = 30 * 24 * 60 * 60 * 1_000

function deterministicGrantUuid(seed: string): string {
  const hex = seed.replace(/^sha256:/u, '').slice(0, 32).padEnd(32, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`
}

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
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'canonicalActor', reason: 'invalid_response' })
  }
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

export async function resolveExpectedProviderConnectionGrant(
  ctx: MutationCtx,
  actor: CanonicalActor,
  operation: ProviderConnectionOperation,
  resourceRefs: readonly string[],
  expectedGrantRef: string,
): Promise<{ grantRef: DelegationGrantRef; generation: number; expiresAt: number } | null> {
  const now = Date.now()
  let canonicalGrantRef: DelegationGrantRef
  try {
    canonicalGrantRef = delegationGrantRef(expectedGrantRef)
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'resolveExpectedProviderConnectionGrant', reason: 'invalid_response' })
  }
  const candidate = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', canonicalGrantRef))
    .unique()
  return candidate === null
    ? null
    : await admitProviderConnectionGrantCandidate(
        ctx, candidate, actor, operation, resourceRefs, now,
      )
}

export async function resolveProviderConnectionProvenance(
  ctx: MutationCtx,
  actor: CanonicalActor,
  operation: ProviderConnectionOperation,
  resourceRefs: readonly string[],
  credentialRef: string | null,
  expectedGrantRef: string,
): Promise<ProviderConnectionAuthorityProvenance | null> {
  const grant = await resolveExpectedProviderConnectionGrant(
    ctx, actor, operation, resourceRefs, expectedGrantRef,
  )
  if (grant === null) return null
  return Object.freeze({
    owningAccountRef: actor.accountRef,
    installedByPrincipalRef: actor.principalRef,
    authorityGrantRef: grant.grantRef,
    authorityGrantGeneration: grant.generation,
    ...(credentialRef === null ? {} : { secretRef: credentialRef }),
  })
}

/**
 * A human owner acts as the root authority for supplier infrastructure. Issue
 * one finite, endpoint-scoped grant through the canonical delegation service
 * so normal onboarding does not depend on a test-only pre-seeded grant.
 * A stable renewal window makes retries replay the same grant while a later
 * refresh rotates onto a new grant before the previous one expires.
 */
export async function ensureOwnerProviderConnectionGrant(
  ctx: MutationCtx,
  actor: CanonicalActor,
  input: Readonly<{
    connectionRef: string
    providerResourceRefs: readonly string[]
  }>,
): Promise<{ grantRef: DelegationGrantRef; generation: number; expiresAt: number }> {
  const now = Date.now()
  const renewalWindow = Math.floor(now / OWNER_CONNECTION_GRANT_RENEWAL_MS)
  const expiresAt = (renewalWindow + 2) * OWNER_CONNECTION_GRANT_RENEWAL_MS
  const resourceRefs = [
    ...input.providerResourceRefs,
    `connection:${input.connectionRef}`,
  ]
  const identity = canonicalDigest({
    format: 'owner-provider-connection-grant:v2',
    accountRef: actor.accountRef,
    principalRef: actor.principalRef,
    connectionRef: input.connectionRef,
    renewalWindow,
    resourceRefs: [...resourceRefs].sort(),
  } as never)
  const grant = await new DelegationService(
    createConvexDelegationStore(ctx),
    createConvexDelegationContextPort(ctx, actor.principalRef),
    {
      now: () => now,
      randomUuid: () => deterministicGrantUuid(identity),
    },
  ).issueRoot({
    context: {
      actorPrincipalRef: actor.principalRef,
      activeAccountRef: actor.accountRef,
      correlationRef: identity,
      idempotencyRef: identity,
    },
    subjectPrincipalRef: actor.principalRef,
    scopes: OWNER_CONNECTION_SCOPES,
    resourceRefs,
    budgetLimit: 1,
    expiresAt,
  })
  return Object.freeze({
    grantRef: grant.grantRef,
    generation: grant.generation,
    expiresAt: grant.expiresAt,
  })
}
