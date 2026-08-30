import type { MutationCtx } from '../_generated/server'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import type { StableHashValue } from '../../src/modules/common/stable-hash'
import {
  DelegationService,
  delegationGrantRef,
  type DelegationAuthoritySnapshot,
  type DelegationStore,
} from '../../src/modules/authority/delegation/public'
import { accountRef, principalRef } from '../../src/modules/principal-account/public'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from './delegationPersistence'

export type CanonicalAgentContext = Readonly<{
  principalRef: string
  accountRef: string
  credentialRef: string
  credentialLocator: string
  credentialGeneration: number
  credentialExpiresAt: number
}>

type CanonicalAgentDelegationInput = Readonly<{
  evidenceKind: string
  evidenceRef: string
  principalRef: string
  accountRef: string
  grantRef: string
  grantGeneration: number
  requiredScopes: readonly string[]
  resourceRefs: readonly string[]
  now: number
}>

/**
 * Resolve an agent API-key locator through durable identity facts. The locator
 * is never a Principal or Account: exactly one active access row establishes
 * the sole current Principal + Account context.
 */
export async function resolveCanonicalAgentContext(
  ctx: Pick<MutationCtx, 'db'>,
  credentialLocator: string,
  now: number,
): Promise<CanonicalAgentContext | null> {
  if (credentialLocator.trim().length === 0 || !Number.isSafeInteger(now) || now < 0) return null

  const bindings = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', 'clerk/api-key')
      .eq('providerIdentifier', credentialLocator))
    .take(2)
  if (bindings.length !== 1) return null
  const [binding] = bindings
  if (binding === undefined) return null
  if (binding.lifecycle !== 'active'
    || binding.providerState.kind !== 'known'
    || binding.providerState.value !== 'active'
    || !Number.isSafeInteger(binding.credentialGeneration)
    || binding.credentialGeneration < 1) return null

  const credentials = await ctx.db.query('credentials')
    .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
      .eq('bindingRef', binding.bindingRef)
      .eq('generation', binding.credentialGeneration)
      .eq('lifecycle', 'active'))
    .take(2)
  if (credentials.length !== 1) return null
  const [credential] = credentials
  if (credential === undefined) return null
  if (credential.principalRef !== binding.principalRef
    || credential.type !== 'api_key'
    || credential.generation !== binding.credentialGeneration
    || !Number.isSafeInteger(credential.issuedAt)
    || !Number.isSafeInteger(credential.expiresAt)
    || credential.issuedAt < 0
    || credential.expiresAt <= credential.issuedAt
    || credential.expiresAt <= now) return null

  const principals = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .take(2)
  if (principals.length !== 1) return null
  const [principal] = principals
  if (principal === undefined) return null
  if (principal.kind !== 'agent' || principal.lifecycle !== 'active') return null

  const [ownerships, memberships] = await Promise.all([
    ctx.db.query('accountOwnerships')
      .withIndex('by_ownerPrincipalRef_and_lifecycle', (query) => query
        .eq('ownerPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .take(2),
    ctx.db.query('memberships')
      .withIndex('by_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('memberPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .take(2),
  ])
  if (ownerships.length + memberships.length !== 1) return null
  const access = ownerships[0] ?? memberships[0]
  if (access === undefined) return null

  const accounts = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', access.accountRef))
    .take(2)
  if (accounts.length !== 1) return null
  const [account] = accounts
  if (account === undefined) return null
  if (account.lifecycle !== 'active'
    || !Number.isSafeInteger(account.revision)
    || account.revision < 1) return null

  const currentOwnerships = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
    .take(2)
  if (currentOwnerships.length !== 1) return null
  const [currentOwnership] = currentOwnerships
  if (currentOwnership === undefined) return null
  const [directOwnership] = ownerships
  if (currentOwnership.lifecycle !== 'active'
    || currentOwnership.accountRef !== account.accountRef
    || (directOwnership !== undefined && currentOwnership.ownershipRef !== directOwnership.ownershipRef)) return null

  const currentOwners = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', currentOwnership.ownerPrincipalRef))
    .take(2)
  if (currentOwners.length !== 1) return null
  const [currentOwner] = currentOwners
  if (currentOwner === undefined || currentOwner.lifecycle !== 'active') return null

  return Object.freeze({
    principalRef: principal.principalRef,
    accountRef: account.accountRef,
    credentialRef: credential.credentialRef,
    credentialLocator,
    credentialGeneration: credential.generation,
    credentialExpiresAt: credential.expiresAt,
  })
}

/** Validate the complete live delegation ancestry without committing a snapshot. */
export async function validateCanonicalAgentDelegation(
  ctx: MutationCtx,
  input: CanonicalAgentDelegationInput,
): Promise<DelegationAuthoritySnapshot | null> {
  if (!Number.isSafeInteger(input.now) || input.now < 0) return null
  try {
    const baseStore = createConvexDelegationStore(ctx)
    const readOnlyStore: DelegationStore = {
      transact: async (operation) => await baseStore.transact(
        async (transaction) => await operation({
          ...transaction,
          getSnapshotByAdmissionIdempotency: async () => undefined,
          getSnapshot: async () => undefined,
          commit: async () => undefined,
        }),
      ),
    }
    const authorityEvidenceRef = canonicalDigest({
      format: 'canonical-agent-delegation-validation:v1',
      evidenceKind: input.evidenceKind,
      evidenceRef: input.evidenceRef,
      principalRef: input.principalRef,
      accountRef: input.accountRef,
      grantRef: input.grantRef,
      grantGeneration: input.grantGeneration,
      requiredScopes: [...input.requiredScopes].sort(),
      resourceRefs: [...input.resourceRefs].sort(),
    } as StableHashValue)
    const snapshot = await new DelegationService(
      readOnlyStore,
      createConvexDelegationContextPort(ctx, principalRef(input.principalRef)),
      {
        now: () => input.now,
        randomUuid: () => '00000000-0000-4000-8000-000000000001',
      },
    ).admitConsequence({
      grantRef: delegationGrantRef(input.grantRef),
      expectedGeneration: input.grantGeneration,
      context: {
        actorPrincipalRef: principalRef(input.principalRef),
        activeAccountRef: accountRef(input.accountRef),
        correlationRef: authorityEvidenceRef,
        idempotencyRef: authorityEvidenceRef,
      },
      requiredScopes: input.requiredScopes,
      resourceRefs: input.resourceRefs,
      budgetAmount: 0,
    })
    return snapshot
  } catch {
    return null
  }
}
