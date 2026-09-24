import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { StableHashValue } from '../../../../src/modules/common/stable-hash'
import { delegationGrantRef, DelegationService, type DelegationStore } from '../../../../src/modules/authority/delegation/public'
import { accountRef, principalRef } from '../../../../src/modules/principal-account/public'
import { createConvexDelegationContextPort, createConvexDelegationStore } from '../../authority/delegation/persistence'
import { ACCOUNT_REF_PATTERN, qualifiedUseAuthorityFailure, type CanonicalPayoutAuthority, type CanonicalQualifiedUseAuthority } from './contracts'

function activeGrantMatchesRequest(
  grant: Doc<'authorityDelegationGrants'>,
  input: Readonly<{
    grantRef: string
    generation: number
    expectedAccountRef?: string
    expectedPrincipalRef?: string
    expectedExpiresAt?: number
  }>,
  now: number,
): boolean {
  const expectedExpiry = input.expectedExpiresAt === undefined
    ? true : grant.expiresAt === input.expectedExpiresAt
  const expectedPrincipal = input.expectedPrincipalRef === undefined
    ? true : grant.subjectPrincipalRef === input.expectedPrincipalRef
  const expectedAccount = input.expectedAccountRef === undefined
    ? true : grant.accountRef === input.expectedAccountRef
  return [
    grant.grantRef === input.grantRef, grant.generation === input.generation,
    grant.lifecycle === 'active', grant.expiresAt > now, expectedExpiry,
    expectedPrincipal, expectedAccount,
    grant.createdBy.activeAccountRef === grant.accountRef,
    ACCOUNT_REF_PATTERN.test(grant.accountRef),
  ].every(Boolean)
}

function admittedAuthorityMatchesGrant(
  snapshot: Readonly<{
    accountRef: string
    actorPrincipalRef: string
    subjectPrincipalRef: string
    grantRef: string
    generation: number
  }>,
  grant: Doc<'authorityDelegationGrants'>,
): boolean {
  return [
    snapshot.accountRef === grant.accountRef,
    snapshot.actorPrincipalRef === grant.subjectPrincipalRef,
    snapshot.subjectPrincipalRef === grant.subjectPrincipalRef,
    snapshot.grantRef === grant.grantRef,
    snapshot.generation === grant.generation,
  ].every(Boolean)
}

async function resolveCurrentGrantAuthority(
  ctx: MutationCtx,
  input: Readonly<{
    grantRef: string
    generation: number
    expectedAccountRef?: string
    expectedPrincipalRef?: string
    expectedExpiresAt?: number
    requiredResourceRefs: readonly string[]
  }>,
): Promise<CanonicalPayoutAuthority> {
  if (![
    /^grt_[0-9a-f]{32}$/u.test(input.grantRef),
    Number.isSafeInteger(input.generation), input.generation >= 0,
  ].every(Boolean))
    return qualifiedUseAuthorityFailure()
  const grant = await ctx.db
    .query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', input.grantRef))
    .unique()
  const consequenceNow = Date.now()
  if (grant === null) return qualifiedUseAuthorityFailure()
  if (!Number.isFinite(consequenceNow)) return qualifiedUseAuthorityFailure()
  if (!activeGrantMatchesRequest(grant, input, consequenceNow))
    return qualifiedUseAuthorityFailure()
  const account = await ctx.db
    .query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', grant.accountRef))
    .unique()
  if (account === null || account.accountRef !== grant.accountRef ||
    account.lifecycle !== 'active') return qualifiedUseAuthorityFailure()
  const trustedPrincipalRef = grant.subjectPrincipalRef
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
    const evidenceRef = canonicalDigest({
      format: 'qualified-use-authority-validation:v1',
      grantRef: grant.grantRef,
      generation: grant.generation,
      accountRef: grant.accountRef,
      principalRef: trustedPrincipalRef,
      resourceRefs: [...input.requiredResourceRefs],
    } as StableHashValue)
    const snapshot = await new DelegationService(
      readOnlyStore,
      createConvexDelegationContextPort(ctx, principalRef(trustedPrincipalRef)),
      { randomUuid: () => '00000000-0000-4000-8000-000000000001' },
    ).admitConsequence({
      grantRef: delegationGrantRef(grant.grantRef),
      expectedGeneration: grant.generation,
      context: {
        actorPrincipalRef: principalRef(trustedPrincipalRef),
        activeAccountRef: accountRef(grant.accountRef),
        correlationRef: evidenceRef,
        idempotencyRef: evidenceRef,
      },
      requiredScopes: grant.scopes,
      resourceRefs: input.requiredResourceRefs,
      budgetAmount: 0,
    })
    if (!admittedAuthorityMatchesGrant(snapshot, grant))
      return qualifiedUseAuthorityFailure()
  } catch (error) {
    void error
    return qualifiedUseAuthorityFailure()
  }
  return {
    owningAccountRef: grant.accountRef,
    authorityPrincipalRef: trustedPrincipalRef,
    authorityGrantRef: grant.grantRef,
    authorityGrantGeneration: grant.generation,
  }
}

/** Resolve Account provenance only from the durable Call's pinned grant. */
export async function resolveCanonicalCallAuthority(
  ctx: MutationCtx,
  callRef: string,
): Promise<CanonicalQualifiedUseAuthority> {
  if (callRef.trim().length === 0) return qualifiedUseAuthorityFailure()
  const call = await ctx.db
    .query('capabilityCalls')
    .withIndex('by_callRef', (query) =>
      query.eq('callRef', callRef),
    )
    .unique()
  if (call === null || call.callRef !== callRef ||
    call.environment !== 'production') return qualifiedUseAuthorityFailure()
  return await resolveCurrentGrantAuthority(ctx, {
    grantRef: call.grantRef,
    generation: call.grantGeneration,
    expectedPrincipalRef: call.principalId,
    expectedExpiresAt: call.grantExpiresAt,
    requiredResourceRefs: [call.toolRef],
  }).then((authority) => ({
    ...authority,
    authorityResourceRef: call.toolRef,
  }))
}
