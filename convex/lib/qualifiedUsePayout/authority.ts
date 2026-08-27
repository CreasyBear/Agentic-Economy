import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import type { StableHashValue } from '../../../src/modules/common/stable-hash'
import { DELEGATION_MAX_RESOURCES, delegationGrantRef, DelegationService, type DelegationStore } from '../../../src/modules/authority/delegation/public'
import { accountRef, principalRef } from '../../../src/modules/principal-account/public'
import { createConvexDelegationContextPort, createConvexDelegationStore } from '../delegationPersistence'
import { ACCOUNT_REF_PATTERN, DAILY_PAYOUT_ALLOCATION_READ_LIMIT, qualifiedUseAuthorityFailure, type CanonicalPayoutAuthority, type CanonicalPayoutSettlementAuthority, type CanonicalQualifiedUseAuthority, type PinnedAuthorityFields, type PinnedResourceFields } from './contracts'

export function pinnedAuthorityFromRow(
  row: PinnedAuthorityFields,
): CanonicalPayoutAuthority | undefined {
  return typeof row.owningAccountRef === 'string' &&
    /^acc_[0-9a-f]{32}$/u.test(row.owningAccountRef) &&
    typeof row.authorityPrincipalRef === 'string' &&
    /^prn_[0-9a-f]{32}$/u.test(row.authorityPrincipalRef) &&
    typeof row.authorityGrantRef === 'string' &&
    /^grt_[0-9a-f]{32}$/u.test(row.authorityGrantRef) &&
    Number.isSafeInteger(row.authorityGrantGeneration) &&
    (row.authorityGrantGeneration ?? -1) >= 0
    ? {
        owningAccountRef: row.owningAccountRef,
        authorityPrincipalRef: row.authorityPrincipalRef,
        authorityGrantRef: row.authorityGrantRef,
        authorityGrantGeneration: row.authorityGrantGeneration as number,
      }
    : undefined
}

export function samePinnedAuthority(
  row: PinnedAuthorityFields,
  authority: CanonicalPayoutAuthority,
): boolean {
  return row.owningAccountRef === authority.owningAccountRef &&
    row.authorityPrincipalRef === authority.authorityPrincipalRef &&
    row.authorityGrantRef === authority.authorityGrantRef &&
    row.authorityGrantGeneration === authority.authorityGrantGeneration
}

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

/** Resolve Account provenance only from the durable invocation's pinned grant. */
export async function resolveCanonicalInvocationAuthority(
  ctx: MutationCtx,
  invocationRef: string,
): Promise<CanonicalQualifiedUseAuthority> {
  if (invocationRef.trim().length === 0) return qualifiedUseAuthorityFailure()
  const invocation = await ctx.db
    .query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) =>
      query.eq('invocationRef', invocationRef),
    )
    .unique()
  if (invocation === null || invocation.invocationRef !== invocationRef ||
    invocation.environment !== 'production') return qualifiedUseAuthorityFailure()
  return await resolveCurrentGrantAuthority(ctx, {
    grantRef: invocation.grantRef,
    generation: invocation.grantGeneration,
    expectedPrincipalRef: invocation.principalId,
    expectedExpiresAt: invocation.grantExpiresAt,
    requiredResourceRefs: [invocation.operationRef],
  }).then((authority) => ({
    ...authority,
    authorityResourceRef: invocation.operationRef,
  }))
}

/**
 * Consequence-time seam for payout settlement. Legacy rows and mixed authority
 * compositions are held instead of becoming transferable.
 */
export async function requireCanonicalPayoutAuthority(
  ctx: MutationCtx,
  payout: Pick<Doc<'moneyPayouts'>, '_id' | 'payoutRef'> &
    PinnedAuthorityFields & PinnedResourceFields,
): Promise<CanonicalPayoutSettlementAuthority> {
  const pinned = pinnedAuthorityFromRow(payout)
  if (pinned === undefined) return qualifiedUseAuthorityFailure()
  const allocations = await ctx.db
    .query('moneyPayoutAllocations')
    .withIndex('by_payoutRef_and_qualifiedAt', (query) =>
      query.eq('payoutRef', payout.payoutRef),
    )
    .take(DAILY_PAYOUT_ALLOCATION_READ_LIMIT + 1)
  const resourceRefs = canonicalAuthorityResourceRefs(
    allocations.map((allocation) =>
      (allocation as typeof allocation & PinnedResourceFields)
        .authorityResourceRef,
    ),
  )
  const pinnedResourceRefs = canonicalAuthorityResourceRefs(
    payout.authorityResourceRefs ?? [],
  )
  if (allocations.length === 0 ||
    allocations.length > DAILY_PAYOUT_ALLOCATION_READ_LIMIT ||
    resourceRefs === undefined || pinnedResourceRefs === undefined ||
    resourceRefs.length !== pinnedResourceRefs.length ||
    resourceRefs.some((resourceRef, index) =>
      resourceRef !== pinnedResourceRefs[index]) ||
    allocations.some((allocation) => !samePinnedAuthority(
      allocation as typeof allocation & PinnedAuthorityFields,
      pinned,
    ))) return qualifiedUseAuthorityFailure()
  const authority = await resolveCurrentGrantAuthority(ctx, {
    grantRef: pinned.authorityGrantRef,
    generation: pinned.authorityGrantGeneration,
    expectedAccountRef: pinned.owningAccountRef,
    expectedPrincipalRef: pinned.authorityPrincipalRef,
    requiredResourceRefs: resourceRefs,
  })
  return { ...authority, authorityResourceRefs: resourceRefs }
}

export function canonicalAuthorityResourceRefs(
  values: readonly unknown[],
): readonly string[] | undefined {
  if (values.length === 0 || values.length > DELEGATION_MAX_RESOURCES ||
    values.some((value) => typeof value !== 'string' ||
      !/^[A-Za-z0-9*][A-Za-z0-9._:/*-]{0,199}$/u.test(value))) return undefined
  const sorted = [...new Set(values as readonly string[])].sort()
  return sorted.length === values.length ? sorted : undefined
}
