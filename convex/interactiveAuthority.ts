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
import { internalAction, internalQuery, mutation, type MutationCtx } from './_generated/server'
import {
  armInteractiveCredentialExpiryHandler,
  interactiveCredentialExpiryNonce,
} from './interactiveCredentialLifecycle'

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

export const interactiveAuthorityContextValue = v.object({
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
  authorityMaterializedAt: v.number(),
})

type InteractiveAuthorityFacts = Readonly<{
  context: InteractiveBusinessAuthorityContext
  credentialIssuedAt: number
  credentialExpiresAt: number
  authorityMaterializedAt: number
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
  source: AuthorityDb | Pick<MutationCtx, 'db' | 'scheduler'>,
  identity: UserIdentity,
): Promise<InteractiveBusinessAuthorityContext> {
  const db = 'db' in source ? source.db : source
  const now = Date.now()
  let facts: InteractiveAuthorityFacts
  try {
    facts = await resolveInteractiveAuthorityFacts(db, identity)
  } catch (error) {
    if (!('scheduler' in source)
      || !(error instanceof InteractiveAuthorityError)
      || error.code !== 'credential_not_current') throw error
    await materializeInteractiveCredentialExpiry(source, identity)
    facts = await resolveInteractiveAuthorityFacts(db, identity)
  }
  const current = currentContextAtTrustedServerTime(facts, now)
  if (current === null) throw new InteractiveAuthorityError('credential_not_current')
  return current
}

/**
 * Session bootstrap for cache-safe authenticated reads. The verified Clerk
 * token is only a binding locator; the lifecycle handler loads and validates
 * the canonical binding and credential before it schedules exact expiry.
 */
export const materializeCurrentInteractiveAuthority = mutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return false
    try {
      await resolveInteractiveAuthorityContext(ctx, identity)
      return true
    } catch (error) {
      if (error instanceof InteractiveAuthorityError) return false
      throw error
    }
  },
})

async function materializeInteractiveCredentialExpiry(
  ctx: Pick<MutationCtx, 'db' | 'scheduler'>,
  identity: UserIdentity,
): Promise<void> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) return
  const bindings = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', tokenIdentifier))
    .take(2)
  if (bindings.length !== 1) return
  const [binding] = bindings
  if (binding === undefined) return
  const credentials = await ctx.db.query('credentials')
    .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
      .eq('bindingRef', binding.bindingRef)
      .eq('generation', binding.credentialGeneration)
      .eq('lifecycle', 'active'))
    .take(2)
  if (credentials.length !== 1) return
  const [credential] = credentials
  if (credential === undefined) return
  if (credential.type !== 'provider_token'
    || credential.principalRef !== binding.principalRef
    || typeof identity.exp !== 'number'
    || !Number.isSafeInteger(identity.exp)
    || identity.exp * 1_000 !== credential.expiresAt) return
  const result = await armInteractiveCredentialExpiryHandler(ctx as MutationCtx, {
    bindingRef: binding.bindingRef,
    credentialRef: credential.credentialRef,
    expectedGeneration: credential.generation,
  })
  if (result.kind === 'refused') throw new InteractiveAuthorityError('credential_not_current')
}

/**
 * Cache-safe query projection. Current validity comes exclusively from the
 * generation-bound scheduled lifecycle materialized on the credential row.
 */
export async function resolveMaterializedInteractiveAuthorityContext(
  db: AuthorityDb,
  identity: UserIdentity,
): Promise<InteractiveBusinessAuthorityContext> {
  const facts = await resolveInteractiveAuthorityFacts(db, identity)
  return freezeInteractiveContext({
    ...facts.context,
    provenance: {
      ...facts.context.provenance,
      resolvedAt: facts.authorityMaterializedAt,
    },
  })
}

async function resolveInteractiveAuthorityFacts(
  db: AuthorityDb,
  identity: UserIdentity,
): Promise<InteractiveAuthorityFacts> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    throw new InteractiveAuthorityError('identity_invalid')
  }

  return await resolveInteractiveAuthorityFactsForToken(
    db,
    tokenIdentifier,
    typeof identity.exp === 'number' ? identity.exp : Number.NaN,
  )
}

async function resolveInteractiveAuthorityFactsForToken(
  db: AuthorityDb,
  tokenIdentifier: string,
  verifiedTokenExpirySeconds: number | undefined,
): Promise<InteractiveAuthorityFacts> {
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
  // `exp` is the actual JWT expiry verified by Convex before it exposes the
  // identity. It is used only to bind the credential's time window; canonical
  // Principal, Account, access, and ownership come exclusively from DB facts.
  if (verifiedTokenExpirySeconds !== undefined
    && (!Number.isSafeInteger(verifiedTokenExpirySeconds)
      || verifiedTokenExpirySeconds < 1
      || verifiedTokenExpirySeconds * 1_000 !== credential.expiresAt)) {
    throw new InteractiveAuthorityError('credential_not_current')
  }
  const materialization = credential.expiryMaterialization
  if (materialization === undefined
    || materialization.state !== 'scheduled'
    || materialization.credentialGeneration !== credential.generation
    || materialization.credentialExpiresAt !== credential.expiresAt
    || materialization.scheduleNonce !== interactiveCredentialExpiryNonce(credential)
    || materialization.scheduleRef === undefined
    || materialization.scheduleRef.trim().length === 0
    || materialization.scheduleNonce.trim().length === 0
    || !Number.isSafeInteger(materialization.materializedAt)
    || materialization.materializedAt < 0) {
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
  const [owner] = compatibleOwners
  if (owner === undefined) throw new InteractiveAuthorityError('compatibility_missing')
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
    authorityMaterializedAt: materialization.materializedAt,
  })
}

/**
 * Re-derives a previously admitted interactive context from canonical records.
 * The binding reference is only a locator: every Principal, Account, access,
 * revision and current-time fact is loaded again and must exactly match.
 */
export async function resolveScheduledInteractiveAuthorityContext(
  db: AuthorityDb,
  expectedInput: typeof interactiveAuthorityContextValue.type,
): Promise<InteractiveBusinessAuthorityContext | null> {
  try {
    const expected = interactiveAuthorityContextFromValue(expectedInput)
    const bindingRefValue = externalIdentityBindingRef(expected.provenance.bindingRef)
    const bindings = await db.query('externalIdentityBindings')
      .withIndex('by_bindingRef', (query) => query.eq('bindingRef', bindingRefValue))
      .take(2)
    const binding = requireExactlyOne(bindings, 'binding_missing', 'binding_ambiguous')
    const facts = await resolveInteractiveAuthorityFactsForToken(
      db,
      binding.providerIdentifier,
      undefined,
    )
    const current = currentContextAtTrustedServerTime(facts, Date.now())
    if (current === null || !sameScheduledAuthority(current, expected)) return null
    return current
  } catch {
    return null
  }
}

export const reconcileScheduledInteractiveAuthority = internalQuery({
  args: { authority: interactiveAuthorityContextValue },
  returns: v.union(interactiveAuthorityContextValue, v.null()),
  handler: async (ctx, args) =>
    await resolveScheduledInteractiveAuthorityContext(ctx.db, args.authority),
})

function sameScheduledAuthority(
  current: InteractiveBusinessAuthorityContext,
  expected: InteractiveBusinessAuthorityContext,
): boolean {
  return current.principalRef === expected.principalRef
    && current.accountRef === expected.accountRef
    && current.legacyOwnerId === expected.legacyOwnerId
    && current.legacyOwnerLocator === expected.legacyOwnerLocator
    && current.provenance.providerNamespace === expected.provenance.providerNamespace
    && current.provenance.bindingRef === expected.provenance.bindingRef
    && current.provenance.credentialRef === expected.provenance.credentialRef
    && current.provenance.credentialGeneration === expected.provenance.credentialGeneration
    && current.provenance.accessKind === expected.provenance.accessKind
    && current.provenance.accessRef === expected.provenance.accessRef
    && current.provenance.currentOwnershipRef === expected.provenance.currentOwnershipRef
    && current.revision.binding === expected.revision.binding
    && current.revision.credential === expected.revision.credential
    && current.revision.principal === expected.revision.principal
    && current.revision.account === expected.revision.account
    && current.revision.access === expected.revision.access
    && current.revision.currentOwnership === expected.revision.currentOwnership
    && current.revision.currentOwnerPrincipal === expected.revision.currentOwnerPrincipal
    && current.revision.compatibilityUpdatedAt === expected.revision.compatibilityUpdatedAt
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
  const [row] = rows
  if (row === undefined) throw new InteractiveAuthorityError(missingCode)
  return row
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
  const [owner] = owners
  if (owner === undefined || owner.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('ownership_mismatch')
  }
  return owner
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

function interactiveAuthorityContextFromValue(
  input: typeof interactiveAuthorityContextValue.type,
): InteractiveBusinessAuthorityContext {
  const accessRef = input.provenance.accessKind === 'ownership'
    ? ownershipRef(input.provenance.accessRef)
    : membershipRef(input.provenance.accessRef)
  return freezeInteractiveContext({
    principalRef: principalRef(input.principalRef),
    accountRef: accountRef(input.accountRef),
    legacyOwnerId: input.legacyOwnerId,
    legacyOwnerLocator: input.legacyOwnerLocator,
    ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
    ...(input.emailHash === undefined ? {} : { emailHash: input.emailHash }),
    revision: { ...input.revision },
    provenance: {
      ...input.provenance,
      accessRef,
      currentOwnershipRef: ownershipRef(input.provenance.currentOwnershipRef),
    },
  })
}
