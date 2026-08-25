import { makeFunctionReference, type GenericDatabaseReader, type UserIdentity } from 'convex/server'
import { v } from 'convex/values'

import {
  accountRef,
  membershipRef,
  ownershipRef,
  type AccountRef,
  type OwnershipRef,
} from '../src/modules/principal-account/account/public'
import {
  credentialRef,
  externalIdentityBindingRef,
} from '../src/modules/principal-account/external-identity/public'
import {
  principalRef,
  type PrincipalRef,
} from '../src/modules/principal-account/principal/public'
import type {
  InteractiveBusinessAuthorityContext,
} from '../src/modules/business/public'
import type { DataModel, Doc } from './_generated/dataModel'
import { internalAction, internalQuery } from './_generated/server'

const CLERK_USER_PROVIDER_NAMESPACE = 'clerk/user' as const

export type InteractiveAuthorityErrorCode =
  | 'identity_invalid'
  | 'binding_missing'
  | 'binding_ambiguous'
  | 'binding_inactive'
  | 'binding_untrusted'
  | 'credential_missing'
  | 'credential_ambiguous'
  | 'credential_mismatch'
  | 'credential_type_invalid'
  | 'credential_not_current'
  | 'authority_fact_invalid'
  | 'principal_missing'
  | 'principal_ambiguous'
  | 'principal_inactive'
  | 'principal_kind_invalid'
  | 'account_access_missing'
  | 'account_access_ambiguous'
  | 'account_missing'
  | 'account_ambiguous'
  | 'account_inactive'
  | 'ownership_missing'
  | 'ownership_ambiguous'
  | 'ownership_mismatch'
  | 'compatibility_missing'
  | 'compatibility_ambiguous'
  | 'compatibility_mismatch'

export class InteractiveAuthorityError extends Error {
  readonly code: InteractiveAuthorityErrorCode

  constructor(code: InteractiveAuthorityErrorCode) {
    super(code)
    this.name = 'InteractiveAuthorityError'
    this.code = code
  }
}

const interactiveAuthorityContextValue = v.object({
  principalRef: v.string(),
  accountRef: v.string(),
  legacyOwnerId: v.string(),
  legacyOwnerLocator: v.string(),
  displayName: v.optional(v.string()),
  emailHash: v.optional(v.string()),
  revision: v.object({
    binding: v.number(),
    credential: v.number(),
    principal: v.number(),
    account: v.number(),
    access: v.number(),
    currentOwnership: v.number(),
    currentOwnerPrincipal: v.number(),
    compatibilityUpdatedAt: v.number(),
  }),
  provenance: v.object({
    providerNamespace: v.literal(CLERK_USER_PROVIDER_NAMESPACE),
    bindingRef: v.string(),
    credentialRef: v.string(),
    credentialGeneration: v.number(),
    accessKind: v.union(v.literal('ownership'), v.literal('membership')),
    accessRef: v.string(),
    currentOwnershipRef: v.string(),
    resolvedAt: v.number(),
  }),
})

const interactiveAuthorityFactsValue = v.object({
  context: interactiveAuthorityContextValue,
  credentialIssuedAt: v.number(),
  credentialExpiresAt: v.number(),
})

type InteractiveAuthorityFacts = Readonly<{
  context: InteractiveBusinessAuthorityContext
  credentialIssuedAt: number
  credentialExpiresAt: number
}>

const readCurrentInteractiveAuthorityFactsRef = makeFunctionReference<
  'query',
  Record<string, never>,
  InteractiveAuthorityFacts | null
>('interactiveAuthority:readCurrentInteractiveAuthorityFacts')

/**
 * A non-cached authority consequence boundary. Wall clock validity is checked
 * here, after the cached query has returned only current database facts.
 */
export const resolveCurrentInteractiveAuthority = internalAction({
  args: {},
  returns: v.union(interactiveAuthorityContextValue, v.null()),
  handler: async (ctx): Promise<InteractiveBusinessAuthorityContext | null> => {
    const facts = await ctx.runQuery(readCurrentInteractiveAuthorityFactsRef, {})
    if (facts === null) return null
    return currentContextAtTrustedServerTime(facts, Date.now())
  },
})

/**
 * This query deliberately does not read wall-clock time. Its result is safe to
 * cache because every input is a database fact and any fact change invalidates
 * the cache. Only the internal action above may turn these facts into current
 * authority.
 */
export const readCurrentInteractiveAuthorityFacts = internalQuery({
  args: {},
  returns: v.union(interactiveAuthorityFactsValue, v.null()),
  handler: async (ctx): Promise<InteractiveAuthorityFacts | null> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return null
    try {
      return await resolveInteractiveAuthorityFacts(ctx.db, identity)
    } catch {
      // This is an authority read: malformed facts and storage failures both
      // deny rather than exposing a partially resolved identity.
      return null
    }
  },
})

type AuthorityDb = GenericDatabaseReader<DataModel>
type AccessFact =
  | Readonly<{ kind: 'ownership'; row: Doc<'accountOwnerships'> }>
  | Readonly<{ kind: 'membership'; row: Doc<'memberships'> }>

/**
 * Resolve an authenticated human session from canonical, current authority
 * facts. The Clerk token identifier is an external binding locator only.
 */
export async function resolveInteractiveAuthorityContext(
  db: AuthorityDb,
  identity: UserIdentity,
): Promise<InteractiveBusinessAuthorityContext> {
  const now = Date.now()
  const current = currentContextAtTrustedServerTime(
    await resolveInteractiveAuthorityFacts(db, identity),
    now,
  )
  if (current === null) throw new InteractiveAuthorityError('credential_not_current')
  return current
}

async function resolveInteractiveAuthorityFacts(
  db: AuthorityDb,
  identity: UserIdentity,
): Promise<InteractiveAuthorityFacts> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    throw new InteractiveAuthorityError('identity_invalid')
  }

  const binding = requireExactlyOne(
    await db
      .query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) =>
        query
          .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
          .eq('providerIdentifier', tokenIdentifier))
      .take(2),
    'binding_missing',
    'binding_ambiguous',
  )
  if (binding.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('binding_inactive')
  }
  if (binding.providerState.kind !== 'known' || binding.providerState.value !== 'active') {
    throw new InteractiveAuthorityError('binding_untrusted')
  }

  const credential = requireExactlyOne(
    await db
      .query('credentials')
      .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) =>
        query
          .eq('bindingRef', binding.bindingRef)
          .eq('generation', binding.credentialGeneration)
          .eq('lifecycle', 'active'))
      .take(2),
    'credential_missing',
    'credential_ambiguous',
  )
  if (credential.principalRef !== binding.principalRef) {
    throw new InteractiveAuthorityError('credential_mismatch')
  }
  if (credential.type !== 'provider_token') {
    throw new InteractiveAuthorityError('credential_type_invalid')
  }
  const credentialWindowChecks = [
    Number.isSafeInteger(credential.issuedAt),
    Number.isSafeInteger(credential.expiresAt),
    credential.issuedAt >= 0,
    credential.expiresAt > credential.issuedAt,
  ]
  if (!credentialWindowChecks.every(Boolean)) {
    throw new InteractiveAuthorityError('credential_not_current')
  }

  const canonicalPrincipalRef = requireCanonicalRef(binding.principalRef, principalRef)
  const principal = requireExactlyOne(
    await db
      .query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', canonicalPrincipalRef))
      .take(2),
    'principal_missing',
    'principal_ambiguous',
  )
  if (principal.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('principal_inactive')
  }
  if (principal.kind !== 'human') {
    throw new InteractiveAuthorityError('principal_kind_invalid')
  }

  const access = requireSingleAccessFact(
    await db
      .query('accountOwnerships')
      .withIndex('by_ownerPrincipalRef_and_lifecycle', (query) =>
        query.eq('ownerPrincipalRef', canonicalPrincipalRef).eq('lifecycle', 'active'))
      .take(2),
    await db
      .query('memberships')
      .withIndex('by_memberPrincipalRef_and_lifecycle', (query) =>
        query.eq('memberPrincipalRef', canonicalPrincipalRef).eq('lifecycle', 'active'))
      .take(2),
  )
  const canonicalAccountRef = requireCanonicalRef(access.row.accountRef, accountRef)
  const account = requireExactlyOne(
    await db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .take(2),
    'account_missing',
    'account_ambiguous',
  )
  if (account.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('account_inactive')
  }

  const canonicalCurrentOwnershipRef = requireCanonicalRef(
    account.currentOwnershipRef,
    ownershipRef,
  )
  const currentOwnership = requireExactlyOne(
    await db
      .query('accountOwnerships')
      .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', canonicalCurrentOwnershipRef))
      .take(2),
    'ownership_missing',
    'ownership_ambiguous',
  )
  assertCurrentOwnership(account, currentOwnership)
  assertAccessIntegrity(access, canonicalPrincipalRef, canonicalAccountRef, canonicalCurrentOwnershipRef)
  const currentOwner = await requireCurrentOwnerActive(
    db,
    requireCanonicalRef(currentOwnership.ownerPrincipalRef, principalRef),
  )

  const compatibleOwners = await db
    .query('owners')
    .withIndex('by_canonicalPrincipalRef_and_canonicalAccountRef', (query) =>
      query
        .eq('canonicalPrincipalRef', canonicalPrincipalRef)
        .eq('canonicalAccountRef', canonicalAccountRef))
    .take(2)
  if (compatibleOwners.length > 1) {
    throw new InteractiveAuthorityError('compatibility_ambiguous')
  }
  if (compatibleOwners.length === 0) {
    await rejectMismatchedCompatibility(db, canonicalPrincipalRef, canonicalAccountRef)
    throw new InteractiveAuthorityError('compatibility_missing')
  }
  const owner = compatibleOwners[0]!
  assertCanonicalFactNumbers([
    binding.credentialGeneration,
    binding.revision,
    credential.generation,
    credential.revision,
    principal.revision,
    account.revision,
    access.row.revision,
    currentOwnership.revision,
    currentOwner.revision,
  ], owner.updatedAt, owner.clerkUserId)

  const context = freezeInteractiveContext({
    principalRef: canonicalPrincipalRef,
    accountRef: canonicalAccountRef,
    legacyOwnerId: owner._id,
    legacyOwnerLocator: owner.clerkUserId,
    ...(owner.displayName === undefined ? {} : { displayName: owner.displayName }),
    ...(owner.emailHash === undefined ? {} : { emailHash: owner.emailHash }),
    revision: {
      binding: binding.revision,
      credential: credential.revision,
      principal: principal.revision,
      account: account.revision,
      access: access.row.revision,
      currentOwnership: currentOwnership.revision,
      currentOwnerPrincipal: currentOwner.revision,
      compatibilityUpdatedAt: owner.updatedAt,
    },
    provenance: {
      providerNamespace: CLERK_USER_PROVIDER_NAMESPACE,
      bindingRef: requireCanonicalRef(binding.bindingRef, externalIdentityBindingRef),
      credentialRef: requireCanonicalRef(credential.credentialRef, credentialRef),
      credentialGeneration: credential.generation,
      accessKind: access.kind,
      accessRef: access.kind === 'ownership'
        ? requireCanonicalRef(access.row.ownershipRef, ownershipRef)
        : requireCanonicalRef(access.row.membershipRef, membershipRef),
      currentOwnershipRef: canonicalCurrentOwnershipRef,
      // A cached fact query cannot assert wall-clock resolution time. The
      // non-cached consequence boundary replaces this sentinel before release.
      resolvedAt: 0,
    },
  })
  return Object.freeze({
    context,
    credentialIssuedAt: credential.issuedAt,
    credentialExpiresAt: credential.expiresAt,
  })
}

function currentContextAtTrustedServerTime(
  facts: InteractiveAuthorityFacts,
  now: number,
): InteractiveBusinessAuthorityContext | null {
  if (!Number.isSafeInteger(now)
    || now < 0
    || now < facts.credentialIssuedAt
    || now >= facts.credentialExpiresAt) return null
  return freezeInteractiveContext({
    ...facts.context,
    provenance: {
      ...facts.context.provenance,
      resolvedAt: now,
    },
  })
}

function requireCanonicalRef<Value>(
  value: string,
  parse: (candidate: string) => Value,
): Value {
  try {
    return parse(value)
  } catch {
    throw new InteractiveAuthorityError('authority_fact_invalid')
  }
}

function assertCanonicalFactNumbers(
  positiveIntegers: readonly number[],
  compatibilityUpdatedAt: number,
  legacyOwnerLocator: string,
): void {
  const positive = positiveIntegers.every((value) => Number.isSafeInteger(value) && value > 0)
  const compatibilityCurrent = Number.isSafeInteger(compatibilityUpdatedAt)
    && compatibilityUpdatedAt >= 0
  const compatibilityLocatorPresent = legacyOwnerLocator.trim().length > 0
  if (!positive || !compatibilityCurrent || !compatibilityLocatorPresent) {
    throw new InteractiveAuthorityError('authority_fact_invalid')
  }
}

function requireExactlyOne<Value>(
  rows: readonly Value[],
  missingCode: InteractiveAuthorityErrorCode,
  ambiguousCode: InteractiveAuthorityErrorCode,
): Value {
  if (rows.length === 0) throw new InteractiveAuthorityError(missingCode)
  if (rows.length !== 1) throw new InteractiveAuthorityError(ambiguousCode)
  return rows[0]!
}

function requireSingleAccessFact(
  ownerships: readonly Doc<'accountOwnerships'>[],
  memberships: readonly Doc<'memberships'>[],
): AccessFact {
  const facts: AccessFact[] = [
    ...ownerships.map((row) => ({ kind: 'ownership' as const, row })),
    ...memberships.map((row) => ({ kind: 'membership' as const, row })),
  ]
  return requireExactlyOne(facts, 'account_access_missing', 'account_access_ambiguous')
}

function assertCurrentOwnership(
  account: Doc<'accounts'>,
  ownership: Doc<'accountOwnerships'>,
): void {
  if (ownership.ownershipRef !== account.currentOwnershipRef
    || ownership.accountRef !== account.accountRef
    || ownership.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('ownership_mismatch')
  }
}

function assertAccessIntegrity(
  access: AccessFact,
  canonicalPrincipalRef: PrincipalRef,
  canonicalAccountRef: AccountRef,
  currentOwnershipRef: OwnershipRef,
): void {
  const actual = access.kind === 'ownership'
    ? [access.row.accountRef, access.row.lifecycle, access.row.ownerPrincipalRef, access.row.ownershipRef]
    : [access.row.accountRef, access.row.lifecycle, access.row.memberPrincipalRef]
  const expected = access.kind === 'ownership'
    ? [canonicalAccountRef, 'active', canonicalPrincipalRef, currentOwnershipRef]
    : [canonicalAccountRef, 'active', canonicalPrincipalRef]
  if (actual.join('|') !== expected.join('|')) {
    throw new InteractiveAuthorityError('ownership_mismatch')
  }
}

async function requireCurrentOwnerActive(
  db: AuthorityDb,
  ownerPrincipalRef: PrincipalRef,
): Promise<Doc<'principals'>> {
  const owners = await db
    .query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', ownerPrincipalRef))
    .take(2)
  if (owners.length !== 1) throw new InteractiveAuthorityError('ownership_mismatch')
  if (owners[0]!.lifecycle !== 'active') throw new InteractiveAuthorityError('ownership_mismatch')
  return owners[0]!
}

async function rejectMismatchedCompatibility(
  db: AuthorityDb,
  canonicalPrincipalRef: PrincipalRef,
  canonicalAccountRef: AccountRef,
): Promise<void> {
  const [byPrincipal, byAccount] = await Promise.all([
    db
      .query('owners')
      .withIndex('by_canonicalPrincipalRef', (query) =>
        query.eq('canonicalPrincipalRef', canonicalPrincipalRef))
      .take(1),
    db
      .query('owners')
      .withIndex('by_canonicalAccountRef', (query) =>
        query.eq('canonicalAccountRef', canonicalAccountRef))
      .take(1),
  ])
  if (byPrincipal.length > 0 || byAccount.length > 0) {
    throw new InteractiveAuthorityError('compatibility_mismatch')
  }
}

function freezeInteractiveContext(
  context: InteractiveBusinessAuthorityContext,
): InteractiveBusinessAuthorityContext {
  return Object.freeze({
    ...context,
    revision: Object.freeze(context.revision),
    provenance: Object.freeze(context.provenance),
  })
}
