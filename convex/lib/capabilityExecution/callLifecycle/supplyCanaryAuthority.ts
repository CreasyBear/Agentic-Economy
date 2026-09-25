import type { Infer } from 'convex/values'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { readExactSellerOnboardingCanaryPlatformGrantHandler } from '../../../capabilitySupplyCanaryFunding'
import { reconciledCallAuthorityResult, type ReconciledCallAuthority } from './contracts'
import { reconcilePersistedCallAuthority, refuseCallBeforeEffectForInvalidAuthority } from './persistedCallAuthority'

export async function reconcileCallWorkloadAuthorityHandler(
  ctx: MutationCtx,
  args: Readonly<{ callRef: string }>,
): Promise<Infer<typeof reconciledCallAuthorityResult>> {
  const now = Date.now()
  const sellerCanaryAuthority = await reconcilePersistedSellerCanaryAuthority(
    ctx,
    args.callRef,
    now,
  )
  const authority = sellerCanaryAuthority === undefined
    ? await reconcilePersistedCallAuthority(ctx, args.callRef, now)
    : sellerCanaryAuthority
  if (authority === null) {
    await refuseCallBeforeEffectForInvalidAuthority(ctx, args.callRef)
    return { kind: 'refused' }
  }
  return { kind: 'authorized', authority }
}

function sellerCanaryDispatchAuthorityMatches(
  row: Doc<'capabilityCalls'>,
  canary: NonNullable<Doc<'capabilityCalls'>['sellerOnboardingCanary']>,
): boolean {
  return [
    row.environment === 'sandbox' || row.environment === 'production',
    canary.funding.grantRef === row.grantRef,
    canary.funding.principalId === row.principalId,
    canary.funding.ownerId === row.ownerId,
    canary.funding.credentialId === row.credentialId,
    canary.funding.applicationRef === row.applicationRef,
    canary.funding.grantGeneration === row.grantGeneration,
    canary.funding.policyDigest === row.policyDigest,
  ].every(Boolean)
}

/**
 * Seller canaries are platform-owned synthetic workloads, not external agent
 * credentials. They therefore reconcile against the exact sealed platform
 * grant/principal pair instead of the ordinary external identity/delegation
 * chain. `undefined` means the invocation is not a seller canary and must use
 * the generic authority path; `null` means a canary was present but stale.
 */
async function reconcilePersistedSellerCanaryAuthority(
  ctx: MutationCtx,
  callRef: string,
  now: number,
): Promise<ReconciledCallAuthority | null | undefined> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
    .unique()
  if (row === null || row.sellerOnboardingCanary === undefined) return undefined
  const canary = row.sellerOnboardingCanary
  if (!sellerCanaryDispatchAuthorityMatches(row, canary)) return null

  const grant = await readExactSellerOnboardingCanaryPlatformGrantHandler(ctx, {
    sellerOwnerId: canary.ownerId,
    expected: {
      kind: 'persisted_dispatch',
      grantRef: row.grantRef,
      principalId: row.principalId,
      ownerId: row.ownerId,
      credentialId: row.credentialId,
      applicationRef: row.applicationRef,
      environment: row.environment,
      generation: row.grantGeneration,
      spendingPolicyDigest: row.policyDigest,
      expiresAt: row.grantExpiresAt,
    },
    now,
  })
  return grant === null
    ? null
    : Object.freeze({
        principalId: grant.principalId,
        accountRef: grant.ownerId,
        credentialId: grant.credentialId,
        grantRef: grant.grantRef,
        grantGeneration: grant.generation,
        policyDigest: grant.spendingPolicyDigest,
        expiresAt: grant.expiresAt,
      })
}

