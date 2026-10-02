import type { UserIdentity } from 'convex/server'

import {
  accountRef,
  membershipRef,
  ownershipRef,
} from '../../../../src/modules/principal-account/account/public'
import type { InteractiveBusinessAuthorityContext } from '../../../../src/modules/business/public'
import { interactiveCredentialExpiryNonce } from '../interactiveCredential/nonce'
import { requireAccessFactForAccount } from './accessFacts'
import { resolveActiveAccountRefForPrincipal } from './accountResolution'
import { CLERK_USER_PROVIDER_NAMESPACE } from './constants'
import { materializeInteractiveCredentialExpiry } from './credentialExpirySideEffect'
import { InteractiveAuthorityError } from './errors'
import {
  assertAccessIntegrity,
  assertCanonicalFactNumbers,
  assertCurrentOwnership,
  credentialRef,
  currentContextAtTrustedServerTime,
  externalIdentityBindingRef,
  freezeInteractiveContext,
  principalRef,
  requireCanonicalRef,
  requireCurrentOwnerActive,
  requireExactlyOne,
  type AuthorityDb,
  type AuthorityMutationSource,
} from './shared'
import type { InteractiveAuthorityFacts } from './contracts'
import { readCurrentClerkSessionCreation } from './clerk'

export async function resolveInteractiveAuthorityContext(
  source: AuthorityMutationSource,
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

export async function resolveInteractiveAuthorityFacts(
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
    typeof identity.exp === 'number' ? identity.exp : undefined,
    identity,
  )
}

export async function resolveInteractiveAuthorityFactsForToken(
  db: AuthorityDb,
  tokenIdentifier: string,
  verifiedTokenExpirySeconds: number | undefined,
  identity?: UserIdentity,
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
  if (identity !== undefined) {
    await readCurrentClerkSessionCreation(db, identity, canonicalPrincipalRef)
  }

  const activeAccountResolution = await resolveActiveAccountRefForPrincipal(db, canonicalPrincipalRef, identity)
  const canonicalAccountRef = requireCanonicalRef(activeAccountResolution.activeAccountRef, accountRef)
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
  const access = await requireAccessFactForAccount(db, canonicalPrincipalRef, canonicalAccountRef)

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
  ])

  const context = freezeInteractiveContext({
    principalRef: canonicalPrincipalRef,
    accountRef: canonicalAccountRef,
    revision: {
      binding: binding.revision,
      credential: credential.revision,
      principal: principal.revision,
      account: account.revision,
      access: access.row.revision,
      currentOwnership: currentOwnership.revision,
      currentOwnerPrincipal: currentOwner.revision,
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
