import type { BusinessId, OwnerId } from '@/modules/common/ids'
import type { BillingAdminAuthority, BillingOperatorControls, BillingOwnerAuthority } from './schema'

export type BillingAuthorityResult =
  | { kind: 'allowed' }
  | { kind: 'denied'; reason: 'missing_authority' | 'wrong_owner' | 'action_not_allowed' | 'control_disabled' }

export function requireBillingOwner(
  authority: BillingOwnerAuthority | undefined,
  businessId: BusinessId,
  controls: Pick<BillingOperatorControls, 'paidActivationEnabled'>
): BillingAuthorityResult {
  if (!controls.paidActivationEnabled) {
    return { kind: 'denied', reason: 'control_disabled' }
  }

  if (authority === undefined) {
    return { kind: 'denied', reason: 'missing_authority' }
  }

  if (authority.businessId !== businessId) {
    return { kind: 'denied', reason: 'wrong_owner' }
  }

  return { kind: 'allowed' }
}

export function requireBillingOperator(
  authority: BillingAdminAuthority | undefined,
  action: 'read' | 'reconcile' | 'disable' | 'mark_no_repair',
  controls: Pick<BillingOperatorControls, 'billingReconciliationEnabled'>
): BillingAuthorityResult {
  if ((action === 'reconcile' || action === 'mark_no_repair') && !controls.billingReconciliationEnabled) {
    return { kind: 'denied', reason: 'control_disabled' }
  }

  if (authority === undefined) {
    return { kind: 'denied', reason: 'missing_authority' }
  }

  if (authority.role === 'reviewer' && action !== 'read') {
    return { kind: 'denied', reason: 'action_not_allowed' }
  }

  if (authority.role === 'support' && action === 'disable') {
    return { kind: 'denied', reason: 'action_not_allowed' }
  }

  return { kind: 'allowed' }
}

export function assertOwnerBusiness(authority: BillingOwnerAuthority, ownerId: OwnerId, businessId: BusinessId): boolean {
  return authority.ownerId === ownerId && authority.businessId === businessId
}
