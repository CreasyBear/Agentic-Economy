import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'

/**
 * Requires: chain-verified settlement for an already submitted managed attempt.
 * Ensures: revoked credentials cannot strand an existing payment consequence.
 * Invariant: the original admitted actor, material, reservation and attempt stay
 * fixed; this grants no signing, Provider dispatch, retry or new purchase power.
 * On violation: false, leaving the existing payment unchanged for investigation.
 */
export async function persistedPaidCallConsequenceIsAdmitted(
  ctx: Pick<MutationCtx, 'db'>,
  attempt: Doc<'moneyX402PaymentAttempts'>,
): Promise<boolean> {
  const call = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', q => q.eq('callRef', attempt.dispatchRef)).unique()
  if (call === null || call.authority === undefined || attempt.reservationRef === undefined
    || attempt.submissionStartedAt === undefined) return false
  if (![
    call.sellerOnboardingCanary === undefined,
    call.state === 'reconciliation_required' || call.state === 'completed',
    call.quoteRef !== undefined,
    call.toolRef === attempt.toolRef,
    call.inputDigest === attempt.inputDigest,
    call.attemptRef === attempt.attemptRef,
    call.formanceReservationRefs?.includes(attempt.reservationRef) === true,
    ['possibly_submitted', 'outcome_unknown', 'settled'].includes(call.formanceFinancialState ?? ''),
    attempt.paymentSignatureDigest !== undefined,
    attempt.paymentPayer !== undefined,
    attempt.paymentNonce !== undefined,
    attempt.quarantinedOutputJson !== undefined,
    attempt.quarantinedResponseDigest !== undefined,
  ].every(Boolean)) return false
  const [control, canonicalAttempt] = await Promise.all([
    ctx.db.query('actionExecutionControls').withIndex('by_executionRef', q => q.eq('executionRef', call.callRef)).unique(),
    ctx.db.query('actionExecutionAttempts').withIndex('by_executionRef_and_attemptRef', q => q.eq('executionRef', call.callRef).eq('attemptRef', attempt.attemptRef)).unique(),
  ])
  const binding = control?.authorityBinding
  if (control === null || binding === undefined || canonicalAttempt === null
    || binding.acceptedBasis === undefined || control.control.acceptedAuthority === undefined) return false
  const sameActor = (actor: { principalRef: string; callerRef: string }) =>
    actor.principalRef === call.principalId && actor.callerRef === call.credentialId
  const admittedAt = Date.parse(control.authorityDecisionAt ?? '')
  const expiresAt = Date.parse(binding.expiresAt)
  if (binding.origin.kind !== 'standalone' || control.control.origin.kind !== 'standalone') return false
  return [
    Number.isFinite(admittedAt), Number.isFinite(expiresAt),
    admittedAt >= call.createdAt, admittedAt < expiresAt,
    attempt.submissionStartedAt >= admittedAt, attempt.submissionStartedAt < expiresAt,
    control.sourceRef === `operation-invocation-source:${call.callRef}`,
    control.currentAttemptRef === attempt.attemptRef,
    control.currentEffectGeneration === attempt.effectGeneration,
    control.preparedMaterialDigest === call.inputDigest,
    control.control.executionRef === call.callRef,
    sameActor(control.control.owner), sameActor(binding.actor),
    binding.executionRef === call.callRef,
    binding.reference === control.control.authority?.reference,
    binding.actionId === control.control.action.id,
    binding.contractVersion === control.control.action.contractVersion,
    call.authority.callRef === call.callRef, call.authority.toolRef === call.toolRef,
    call.authority.inputDigest === call.inputDigest,
    call.authority.grantRef === call.grantRef, call.authority.grantGeneration === call.grantGeneration,
    binding.reference === call.authority.reference,
    binding.digest === call.authority.decisionDigest,
    binding.targetDigest === call.authority.targetDigest,
    binding.targetDigest === control.preparedTargetDigest,
    binding.expiresAt === call.authority.expiresAt,
    canonicalDigest(binding.acceptedBasis) === canonicalDigest(call.authority.acceptedBasis),
    canonicalDigest(control.control.acceptedAuthority) === canonicalDigest(call.authority.acceptedBasis),
    sameActor(binding.origin), sameActor(control.control.origin),
    canonicalAttempt.executionRef === call.callRef,
    canonicalAttempt.effectGeneration === attempt.effectGeneration,
    sameActor(canonicalAttempt.actor),
    canonicalAttempt.idempotency.materialInputDigest === call.inputDigest,
  ].every(Boolean)
}
