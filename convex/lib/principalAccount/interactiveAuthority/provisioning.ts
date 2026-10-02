import type { UserIdentity } from 'convex/server'

import {
  generateAccountRef,
  generateOwnershipRef,
} from '../../../../src/modules/principal-account/account/public'
import {
  generateCredentialRef,
  generateExternalIdentityBindingRef,
} from '../../../../src/modules/principal-account/external-identity/public'
import { generatePrincipalRef } from '../../../../src/modules/principal-account/principal/public'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { armInteractiveCredentialExpiryHandler } from '../interactiveCredential/arm'
import {
  CLERK_USER_PROVIDER_NAMESPACE,
  INTERACTIVE_OWNER_SESSION_WINDOW_MS,
  OWNER_DISPLAY_NAME_MAX_LENGTH,
} from './constants'
import { InteractiveAuthorityError } from './errors'
import {
  interactiveCredentialRevokedAt,
  readInteractiveSessionRevocationCutoff,
  requireCurrentInteractiveSession,
} from './sessionProof'

function interactiveOwnerDigest(kind: string, tokenIdentifier: string): string {
  return canonicalDigest({ kind, tokenIdentifier }).slice('sha256:'.length, 'sha256:'.length + 32)
}

function provisionedOwnerDisplayName(identity: UserIdentity): string {
  const claimedName = typeof identity.name === 'string' ? identity.name.trim() : ''
  const displayName = claimedName.length > 0 ? claimedName : identity.subject
  return displayName.slice(0, OWNER_DISPLAY_NAME_MAX_LENGTH)
}

// Operational refusal log for the fail-closed provisioning paths. A silent
// `false` here was undiagnosable on the live stack (the 401 reached the page
// while no server-side reason was observable), so every refusal carries a
// structured reason code.
function logProvisionRefusal(reason: string, detail: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ kind: 'IA_PROVISION_REFUSAL', reason, ...detail }))
}

export type OwnerIdentityProvisioningRefs = Readonly<{
  bindingRef: string
  principalRef: string
  accountRef?: string
  ownershipRef?: string
}>

/**
 * Idempotent owner-identity provisioning for a verified Clerk session. A real
 * sign-up previously produced no authority rows: this creates the canonical
 * binding, human principal, account, and creation ownership once, mirroring
 * the canonical fixture shapes, and issues the provider-token credential
 * generation bound to the verified token window when the identity carries the
 * JWT `exp` claim, and to one Clerk session-token lifetime from the observed
 * presentation otherwise. Identity rows are never duplicated or re-keyed;
 * only the credential generation rotates when the verified window no longer
 * matches the current credential (token refresh) or the current generation
 * expired. Revoked credentials require signed evidence of a new Clerk session;
 * drifted or ambiguous credentials fail closed.
 */
export async function ensureOwnerIdentityForAuthenticatedIdentity(
  ctx: Pick<MutationCtx, 'db' | 'scheduler'>,
  identity: UserIdentity,
): Promise<OwnerIdentityProvisioningRefs | null> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    logProvisionRefusal('identity_token_identifier_missing')
    return null
  }
  const verifiedTokenExpirySeconds = typeof identity.exp === 'number'
    && Number.isSafeInteger(identity.exp)
    && identity.exp >= 1
    ? identity.exp
    : undefined
  const expiresAt = verifiedTokenExpirySeconds === undefined
    ? Date.now() + INTERACTIVE_OWNER_SESSION_WINDOW_MS
    : verifiedTokenExpirySeconds * 1_000

  const bindings = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', tokenIdentifier))
    .take(2)
  if (bindings.length > 1) {
    logProvisionRefusal('binding_ambiguous', { count: bindings.length, tokenIdentifierSuffix: tokenIdentifier.slice(-8) })
    return null
  }
  const [binding] = bindings
  if (binding === undefined) {
    return await provisionOwnerIdentity(
      ctx,
      tokenIdentifier,
      expiresAt,
      provisionedOwnerDisplayName(identity),
    )
  }
  if (binding.lifecycle !== 'active'
    || binding.providerState.kind !== 'known'
    || binding.providerState.value !== 'active') {
    logProvisionRefusal('binding_not_current', { lifecycle: binding.lifecycle, providerState: binding.providerState })
    return null
  }
  return await ensureCurrentOwnerCredentialGeneration(
    ctx,
    binding,
    identity,
    expiresAt,
    verifiedTokenExpirySeconds !== undefined,
    await readInteractiveSessionRevocationCutoff(ctx.db, binding),
  )
}

async function ensureCurrentOwnerCredentialGeneration(
  ctx: Pick<MutationCtx, 'db' | 'scheduler'>,
  binding: Doc<'externalIdentityBindings'>,
  identity: UserIdentity,
  expiresAt: number,
  hasVerifiedTokenWindow: boolean,
  sessionRevocationCutoff: number,
): Promise<OwnerIdentityProvisioningRefs | null> {
  const tokenIdentifier = binding.providerIdentifier
  const active = await credentialsForOwnerGeneration(ctx, binding, 'active')
  if (active.length > 1) {
    logProvisionRefusal('credential_ambiguous', { activeCount: active.length, generation: binding.credentialGeneration })
    return null
  }
  let current: Doc<'credentials'> | undefined = active[0]
  if (current === undefined) {
    const staleCredentials = await credentialsForOwnerGeneration(ctx, binding, 'stale')
    const [stale] = staleCredentials
    const revokedCredentials = await credentialsForOwnerGeneration(ctx, binding, 'revoked')
    if (stale !== undefined) {
      if (staleCredentials.length !== 1 || revokedCredentials.length > 0) {
        logProvisionRefusal('credential_generation_revoked_present', {
          generation: binding.credentialGeneration,
          activeCount: active.length,
        })
        return null
      }
      current = stale
    } else if (revokedCredentials.length === 0) {
      logProvisionRefusal('credential_generation_drift_stale_missing', {
        generation: binding.credentialGeneration,
        activeCount: active.length,
      })
      return null
    } else if (revokedCredentials.length !== 1) {
      logProvisionRefusal('credential_generation_revoked_present', {
        generation: binding.credentialGeneration,
        activeCount: active.length,
      })
      return null
    } else {
      const [latestRevoked] = revokedCredentials
      if (latestRevoked === undefined) {
        logProvisionRefusal('credential_generation_revoked_present', {
          generation: binding.credentialGeneration,
          activeCount: active.length,
        })
        return null
      }
      if (latestRevoked.type !== 'provider_token' || latestRevoked.principalRef !== binding.principalRef) {
        throw new InteractiveAuthorityError('credential_mismatch')
      }
      // A manual/generic credential revocation may predate the binding cutoff
      // writer. It still establishes a floor; token expiry cannot bypass it.
      const cutoff = Math.max(sessionRevocationCutoff, interactiveCredentialRevokedAt(latestRevoked))
      await requireCurrentInteractiveSession(ctx.db, identity, binding, cutoff)
      return await issueOwnerCredentialGeneration(
        ctx,
        binding,
        tokenIdentifier,
        expiresAt,
        latestRevoked.credentialRef,
        cutoff,
      )
    }
  }
  if (current.type !== 'provider_token' || current.principalRef !== binding.principalRef) {
    logProvisionRefusal('credential_type_or_principal_mismatch', { type: current.type })
    return null
  }
  await requireCurrentInteractiveSession(ctx.db, identity, binding, sessionRevocationCutoff)
  if (current.expiresAt === expiresAt) {
    await initializeOwnerSessionCutoff(ctx, binding, sessionRevocationCutoff)
    return { bindingRef: binding.bindingRef, principalRef: binding.principalRef }
  }
  // A current verified presentation may renew the server-anchored fallback
  // window before it lapses. Keep ample windows unchanged (including duplicate
  // renewals); rotate through the existing generation/expiry controls near expiry.
  // Revoked and conflicting generations have already been refused above.
  if (!hasVerifiedTokenWindow
    && current.expiresAt - Date.now() > INTERACTIVE_OWNER_SESSION_WINDOW_MS / 2) {
    await initializeOwnerSessionCutoff(ctx, binding, sessionRevocationCutoff)
    return { bindingRef: binding.bindingRef, principalRef: binding.principalRef }
  }
  // A still-active generation whose window no longer matches the verified
  // token is an ordinary refresh: supersede it with the next generation.
  return await issueOwnerCredentialGeneration(ctx, binding, tokenIdentifier, expiresAt, current.credentialRef, sessionRevocationCutoff)
}

async function initializeOwnerSessionCutoff(
  ctx: Pick<MutationCtx, 'db'>,
  binding: Doc<'externalIdentityBindings'>,
  cutoff: number,
): Promise<void> {
  if (binding.interactiveSessionsRevokedBefore !== undefined) return
  await ctx.db.patch(binding._id, {
    interactiveSessionsRevokedBefore: cutoff,
    revision: binding.revision + 1,
    updatedAt: Date.now(),
  })
}

async function credentialsForOwnerGeneration(
  ctx: Pick<MutationCtx, 'db'>,
  binding: Doc<'externalIdentityBindings'>,
  lifecycle: 'active' | 'stale' | 'revoked',
): Promise<Doc<'credentials'>[]> {
  return await ctx.db.query('credentials')
    .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
      .eq('bindingRef', binding.bindingRef)
      .eq('generation', binding.credentialGeneration)
      .eq('lifecycle', lifecycle))
    .take(2)
}

async function issueOwnerCredentialGeneration(
  ctx: Pick<MutationCtx, 'db' | 'scheduler'>,
  binding: Doc<'externalIdentityBindings'>,
  tokenIdentifier: string,
  expiresAt: number,
  predecessorCredentialRef: string,
  sessionRevocationCutoff: number,
): Promise<OwnerIdentityProvisioningRefs> {
  const now = Date.now()
  const generation = binding.credentialGeneration + 1
  const credentialRef = generateCredentialRef()
  await ctx.db.insert('credentials', {
    credentialRef,
    bindingRef: binding.bindingRef,
    principalRef: binding.principalRef,
    type: 'provider_token',
    lifecycle: 'active',
    generation,
    issueIdempotencyRef: `issue:interactive-owner:${interactiveOwnerDigest('interactive_owner_credential_issue:v1', tokenIdentifier)}:${generation}`,
    revision: 1,
    issuedAt: now,
    expiresAt,
    predecessorCredentialRef,
    updatedAt: now,
  })
  const predecessor = await ctx.db.query('credentials')
    .withIndex('by_credentialRef', (query) => query.eq('credentialRef', predecessorCredentialRef))
    .unique()
  if (predecessor !== null && predecessor.lifecycle === 'active') {
    await ctx.db.patch(predecessor._id, {
      lifecycle: 'stale',
      staleAt: now,
      revision: predecessor.revision + 1,
      updatedAt: now,
    })
  }
  await ctx.db.patch(binding._id, {
    credentialGeneration: generation,
    interactiveSessionsRevokedBefore: sessionRevocationCutoff,
    revision: binding.revision + 1,
    updatedAt: now,
  })
  await armOwnerCredentialExpiry(ctx, binding.bindingRef, credentialRef, generation)
  return { bindingRef: binding.bindingRef, principalRef: binding.principalRef }
}

async function provisionOwnerIdentity(
  ctx: Pick<MutationCtx, 'db' | 'scheduler'>,
  tokenIdentifier: string,
  expiresAt: number,
  displayName: string,
): Promise<OwnerIdentityProvisioningRefs> {
  const now = Date.now()
  const principalRef = generatePrincipalRef()
  const accountRef = generateAccountRef()
  const ownershipRef = generateOwnershipRef()
  const bindingRef = generateExternalIdentityBindingRef()
  const credentialRef = generateCredentialRef()
  await ctx.db.insert('principals', {
    principalRef,
    kind: 'human',
    displayName,
    lifecycle: 'active',
    revision: 1,
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.insert('accountOwnerships', {
    ownershipRef,
    accountRef,
    ownerPrincipalRef: principalRef,
    lifecycle: 'active',
    changeKind: 'creation',
    revision: 1,
    createdAt: now,
    createdBy: {
      actorPrincipalRef: principalRef,
      activeAccountRef: accountRef,
      correlationRef: `create:${ownershipRef}`,
      idempotencyRef: `create:${ownershipRef}`,
    },
  })
  await ctx.db.insert('accounts', {
    accountRef,
    displayName,
    lifecycle: 'active',
    recoveryPolicy: { kind: 'no_transfer', revision: 1 },
    creationActorPrincipalRef: principalRef,
    creationIdempotencyRef: `create:${accountRef}`,
    initialOwnershipRef: ownershipRef,
    currentOwnershipRef: ownershipRef,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    lastAction: {
      actorPrincipalRef: principalRef,
      activeAccountRef: accountRef,
      correlationRef: `create:${accountRef}`,
      idempotencyRef: `create:${accountRef}`,
    },
  })
  await ctx.db.insert('externalIdentityBindings', {
    bindingRef,
    principalRef,
    providerNamespace: CLERK_USER_PROVIDER_NAMESPACE,
    providerIdentifier: tokenIdentifier,
    providerState: { kind: 'known', value: 'active' },
    lifecycle: 'active',
    credentialGeneration: 1,
    interactiveSessionsRevokedBefore: 0,
    bindIdempotencyRef: `bind:interactive-owner:${interactiveOwnerDigest('interactive_owner_binding:v1', tokenIdentifier)}`,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.insert('credentials', {
    credentialRef,
    bindingRef,
    principalRef,
    type: 'provider_token',
    lifecycle: 'active',
    generation: 1,
    issueIdempotencyRef: `issue:interactive-owner:${interactiveOwnerDigest('interactive_owner_credential_issue:v1', tokenIdentifier)}:1`,
    revision: 1,
    issuedAt: now,
    expiresAt,
    updatedAt: now,
  })
  await armOwnerCredentialExpiry(ctx, bindingRef, credentialRef, 1)
  return { bindingRef, principalRef, accountRef, ownershipRef }
}

async function armOwnerCredentialExpiry(
  ctx: Pick<MutationCtx, 'db' | 'scheduler'>,
  bindingRef: string,
  credentialRef: string,
  expectedGeneration: number,
): Promise<void> {
  const result = await armInteractiveCredentialExpiryHandler(ctx as MutationCtx, {
    bindingRef,
    credentialRef,
    expectedGeneration,
  })
  if (result.kind === 'refused') throw new InteractiveAuthorityError('credential_not_current')
}

export { logProvisionRefusal }
