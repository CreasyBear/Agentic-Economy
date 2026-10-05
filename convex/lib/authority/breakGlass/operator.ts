import type { MutationCtx } from '../../../_generated/server'
import { resolveAdminAuthority } from '../../../authz'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import {
  RecoveryError,
  type RecoveryApprovalVerificationRequest,
} from '../../../../src/modules/authority/recovery/public'
import { accountRef, principalRef, type PrincipalRef } from '../../../../src/modules/principal-account/public'

type RecoveryOperator = Readonly<{
  principalRef: PrincipalRef
  credentialRef: string
  credentialGeneration: number
  membershipRef: string
  membershipRevision: number
}>

export async function resolveRecoveryOperator(
  ctx: MutationCtx,
  selectedAccountRef: string,
  now: number,
): Promise<RecoveryOperator> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null || typeof identity.tokenIdentifier !== 'string'
    || identity.tokenIdentifier.length === 0) {
    throw new RecoveryError('recovery_approval_unavailable')
  }
  const adminAuthority = await resolveAdminAuthority(ctx, 'use_break_glass')
  if (adminAuthority.kind !== 'allowed') {
    throw new RecoveryError('recovery_approval_unavailable')
  }
  const selected = accountRef(selectedAccountRef)
  const binding = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', 'clerk/user')
      .eq('providerIdentifier', identity.tokenIdentifier))
    .unique()
  if (binding === null || binding.lifecycle !== 'active'
    || binding.providerState.kind !== 'known' || binding.providerState.value !== 'active'
    || !Number.isSafeInteger(binding.credentialGeneration)
    || binding.credentialGeneration < 1) {
    throw new RecoveryError('recovery_approval_unavailable')
  }
  const [credential, principal, membership] = await Promise.all([
    ctx.db.query('credentials')
      .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
        .eq('bindingRef', binding.bindingRef)
        .eq('generation', binding.credentialGeneration)
        .eq('lifecycle', 'active'))
      .unique(),
    ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
      .unique(),
    ctx.db.query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', selected)
        .eq('memberPrincipalRef', binding.principalRef)
        .eq('lifecycle', 'active'))
      .unique(),
  ])
  if (credential === null || principal === null || membership === null
    || credential.principalRef !== binding.principalRef
    || credential.type !== 'provider_token'
    || credential.expiresAt <= now
    || credential.expiryMaterialization?.state !== 'scheduled'
    || credential.expiryMaterialization.credentialGeneration !== credential.generation
    || credential.expiryMaterialization.credentialExpiresAt !== credential.expiresAt
    || principal.lifecycle !== 'active'
    || !Number.isSafeInteger(membership.revision) || membership.revision < 1) {
    throw new RecoveryError('recovery_approval_unavailable')
  }
  return Object.freeze({
    principalRef: principalRef(principal.principalRef),
    credentialRef: credential.credentialRef,
    credentialGeneration: credential.generation,
    membershipRef: membership.membershipRef,
    membershipRevision: membership.revision,
  })
}

export function trustedRecoveryApprovalAttestation(
  request: RecoveryApprovalVerificationRequest,
  operator: RecoveryOperator,
) {
  return Object.freeze({
    operatorPrincipalRef: operator.principalRef,
    verificationRef: `recovery-verification:${canonicalDigest({
      domain: 'ae/recovery-approval/v1',
      approvalRef: request.approvalRef,
      accountRef: request.accountRef,
      subjectPrincipalRef: request.subjectPrincipalRef,
      operatorPrincipalRef: operator.principalRef,
      credentialRef: operator.credentialRef,
      credentialGeneration: operator.credentialGeneration,
      membershipRef: operator.membershipRef,
      membershipRevision: operator.membershipRevision,
      action: request.action,
      recoveryPolicyRevision: request.recoveryPolicyRevision,
      frozenAccountRevision: request.frozenAccountRevision,
      verifiedAt: request.verifiedAt,
      expiresAt: request.expiresAt,
    })}`,
  })
}
