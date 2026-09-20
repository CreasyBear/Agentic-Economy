import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import type {
  ProviderOffboardingBlocker,
  ProviderOffboardingStatus,
} from '@/modules/capability-supply/provider-offboarding'
import { canonicalDigest } from '@/modules/common/canonical-digest'

export async function requireCase(ctx: MutationCtx, caseRef: string): Promise<Doc<'capabilityProviderOffboardingCases'>> {
  const row = await ctx.db.query('capabilityProviderOffboardingCases')
    .withIndex('by_caseRef', (index) => index.eq('caseRef', caseRef))
    .unique()
  if (row === null) throw new Error('provider_offboarding_case_missing')
  return row
}

export async function advance(
  ctx: MutationCtx,
  row: Doc<'capabilityProviderOffboardingCases'>,
  currentStep: Doc<'capabilityProviderOffboardingCases'>['currentStep'],
  state: Doc<'capabilityProviderOffboardingCases'>['state'],
  patch: Partial<Doc<'capabilityProviderOffboardingCases'>> = {},
): Promise<void> {
  await ctx.db.patch(row._id, {
    ...patch,
    currentStep,
    state,
    blockerCodes: [],
    revision: row.revision + 1,
    updatedAt: Date.now(),
  })
}

export async function block(
  ctx: MutationCtx,
  row: Doc<'capabilityProviderOffboardingCases'>,
  currentStep: Doc<'capabilityProviderOffboardingCases'>['currentStep'],
  blocker: ProviderOffboardingBlocker,
): Promise<{ ready: false }> {
  await ctx.db.patch(row._id, {
    currentStep,
    state: 'action_required',
    blockerCodes: [blocker],
    revision: row.revision + 1,
    updatedAt: Date.now(),
  })
  return { ready: false }
}

export async function readTargetPage(
  ctx: MutationCtx,
  caseRef: string,
  kind: 'tool' | 'offering' | 'connection',
  afterTargetRef?: string,
): Promise<Array<Doc<'capabilityProviderOffboardingTargets'>>> {
  return await ctx.db.query('capabilityProviderOffboardingTargets')
    .withIndex('by_caseRef_and_kind_and_targetRef', (index) => {
      const caseTargets = index.eq('caseRef', caseRef).eq('kind', kind)
      return afterTargetRef === undefined ? caseTargets : caseTargets.gt('targetRef', afterTargetRef)
    })
    .take(100)
}

export async function hasActiveCall(ctx: MutationCtx, toolRef: string): Promise<boolean> {
  for (const state of ['pending', 'reconciliation_required'] as const) {
    if ((await ctx.db.query('capabilityCalls')
      .withIndex('by_toolRef_and_state', (index) => index.eq('toolRef', toolRef).eq('state', state))
      .take(1)).length > 0) return true
  }
  return false
}

export async function hasUnresolvedObligations(ctx: MutationCtx, providerRef: string): Promise<boolean> {
  for (const state of ['accrued', 'held', 'payable', 'disputed'] as const) {
    if ((await ctx.db.query('moneyProviderObligations')
      .withIndex('by_providerRef_and_state', (index) => index.eq('providerRef', providerRef).eq('state', state))
      .take(1)).length > 0) return true
  }
  return false
}

export async function hasUnresolvedPayouts(ctx: MutationCtx, businessId: string): Promise<boolean> {
  for (const state of ['review', 'held_kyc', 'held_threshold', 'transfer_pending', 'failed', 'outcome_unknown'] as const) {
    if ((await ctx.db.query('moneyPayouts')
      .withIndex('by_businessId_and_currency_and_state', (index) => index.eq('businessId', businessId).eq('currency', 'AUD').eq('state', state))
      .take(1)).length > 0) return true
  }
  return false
}

export async function countActiveConnections(
  ctx: MutationCtx,
  businessId: Doc<'capabilityProviderOffboardingCases'>['businessId'],
): Promise<number> {
  let count = 0
  for (const lifecycle of ['active', 'reauthorization_required', 'revocation_pending', 'cleanup_required'] as const) {
    const connection = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_businessId_and_lifecycle', (index) => index
        .eq('businessId', businessId)
        .eq('lifecycle', lifecycle))
      .take(1)
    count += connection.length
  }
  return count
}

export function offeringOffboardingAuthorityDigest(
  businessId: Doc<'capabilityProviderOffboardingCases'>['businessId'],
  offering: Pick<Doc<'businessOfferings'>, 'offeringRef' | 'currentRevision' | 'status'>,
): string {
  return canonicalDigest({
    version: 'provider-offboarding-offering-authority:v1',
    businessId,
    offeringRef: offering.offeringRef,
    revision: offering.currentRevision,
    status: offering.status,
  })
}

export function stateForStep(step: Doc<'capabilityProviderOffboardingCases'>['currentStep']): Doc<'capabilityProviderOffboardingCases'>['state'] {
  if (step === 'freeze-routeability') return 'freezing'
  if (step === 'drain-calls') return 'draining'
  if (step === 'settle-obligations') return 'waiting_for_obligations'
  if (step === 'revoke-connections') return 'revoking_connections'
  return 'verifying_cleanup'
}

export function projectStatus(row: Doc<'capabilityProviderOffboardingCases'>, now: number) {
  const state: ProviderOffboardingStatus['state'] = row.state === 'freezing'
    ? 'Freezing'
    : row.state === 'draining'
      ? 'Draining'
      : row.state === 'waiting_for_obligations'
        ? 'Waiting for obligations'
        : row.state === 'revoking_connections'
          ? 'Revoking connections'
          : row.state === 'verifying_cleanup'
            ? 'Verifying cleanup'
            : row.state === 'retired'
              ? 'Retired'
              : row.state === 'cancelled'
                ? 'Cancelled'
                : 'Action required'
  return {
    schemaVersion: 'provider_offboarding:v1' as const,
    caseRef: row.caseRef,
    businessRef: String(row.businessId),
    providerRef: row.providerRef,
    revision: row.revision,
    state,
    routeabilityFrozen: row.routeabilityFrozenAt !== undefined,
    blockerCodes: [...row.blockerCodes],
    observedAt: now,
    retentionPolicyVersion: row.retentionPolicyVersion,
    ...(state === 'Retired' || state === 'Cancelled'
      ? {}
      : { continuation: { action: state === 'Action required' ? 'supply.offboarding.resume' as const : 'supply.offboarding.status' as const } }),
  }
}
