import type { BillingOperationId, BusinessId, OwnerId } from '@/modules/common/ids'
import type {
  BillingAdminAuthority,
  BillingOffer,
  BillingOperation,
  BillingOperationStatus,
  BillingReceipt,
  BillingReconciliation,
  BillingSourceState,
} from './schema'

export type PublicPaidActivationProjection = {
  businessId: BusinessId
  available: boolean
  offers: PublicPaidActivationOffer[]
  reason?: 'no_active_offer' | 'operator_disabled' | 'degraded' | 'stale'
}

export type PublicPaidActivationOffer = {
  id: BillingOffer['id']
  name: string
  description: string
  ctaLabel: string
  priceSummary: string
  termsSummary: string
  updatedAt: number
}

export type OwnerBillingProjection = {
  businessId: BusinessId
  ownerId: OwnerId
  operations: OwnerBillingOperationProjection[]
  receipts: OwnerBillingReceiptProjection[]
}

export type OwnerBillingOperationProjection = {
  id: BillingOperationId
  offerId: BillingOffer['id']
  status: BillingOperationStatus
  statusLabel: string
  nextAction: string
  checkoutUrl?: string
  portalUrl?: string
  createdAt: number
  updatedAt: number
}

export type OwnerBillingReceiptProjection = {
  id: BillingReceipt['id']
  operationId: BillingOperationId
  status: BillingReceipt['status']
  invoiceUrl?: string
  amountSummary?: string
  issuedAt: number
}

export type AdminBillingProjection = {
  businessId: BusinessId
  operations: AdminBillingOperationProjection[]
  reconciliations: BillingReconciliation[]
}

export type AdminBillingOperationProjection = OwnerBillingOperationProjection & {
  providerRefs: BillingOperation['providerRefs']
  evidenceRefs: BillingOperation['evidenceRefs']
  retryCount: number
  supportRecordIds: BillingOperation['supportRecordIds']
}

export function readPublicPaidActivationProjection(
  state: BillingSourceState,
  businessId: BusinessId,
  controls: { paidActivationEnabled: boolean } = { paidActivationEnabled: true }
): PublicPaidActivationProjection {
  if (!controls.paidActivationEnabled) {
    return { businessId, available: false, offers: [], reason: 'operator_disabled' }
  }

  const offers = state.offers
    .filter((offer) => offer.businessId === businessId && offer.status === 'active')
    .map((offer) => ({
      id: offer.id,
      name: offer.publicName,
      description: offer.publicDescription,
      ctaLabel: offer.publicCtaLabel,
      priceSummary: offer.priceSummary,
      termsSummary: offer.termsSummary,
      updatedAt: offer.updatedAt,
    }))

  if (offers.length === 0) {
    return { businessId, available: false, offers: [], reason: 'no_active_offer' }
  }

  return { businessId, available: true, offers }
}

export function readOwnerBillingProjection(
  state: BillingSourceState,
  businessId: BusinessId,
  ownerId: OwnerId
): OwnerBillingProjection {
  const operations = state.operations
    .filter((operation) => operation.businessId === businessId && operation.ownerId === ownerId)
    .map((operation) => ownerOperation(operation))
  const operationIds = new Set(operations.map((operation) => operation.id))
  const receipts = state.receipts
    .filter((receipt) => receipt.businessId === businessId && operationIds.has(receipt.operationId))
    .map((receipt) => ({
      id: receipt.id,
      operationId: receipt.operationId,
      status: receipt.status,
      issuedAt: receipt.issuedAt,
      ...(receipt.invoiceUrl === undefined ? {} : { invoiceUrl: receipt.invoiceUrl }),
      ...(receipt.amountSummary === undefined ? {} : { amountSummary: receipt.amountSummary }),
    }))

  return { businessId, ownerId, operations, receipts }
}

export function readAdminBillingProjection(
  state: BillingSourceState,
  businessId: BusinessId,
  authority: BillingAdminAuthority | undefined
): AdminBillingProjection {
  if (authority === undefined) {
    return { businessId, operations: [], reconciliations: [] }
  }

  const operations = state.operations
    .filter((operation) => operation.businessId === businessId)
    .map((operation) => ({
      ...ownerOperation(operation),
      providerRefs: operation.providerRefs,
      evidenceRefs: operation.evidenceRefs,
      retryCount: operation.retryCount,
      supportRecordIds: operation.supportRecordIds,
    }))
  const reconciliations = state.reconciliations.filter((reconciliation) => reconciliation.businessId === businessId)

  return { businessId, operations, reconciliations }
}

function ownerOperation(operation: BillingOperation): OwnerBillingOperationProjection {
  return {
    id: operation.id,
    offerId: operation.offerId,
    status: operation.status,
    statusLabel: statusLabel(operation.status),
    nextAction: nextAction(operation.status),
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    ...(operation.checkoutUrl === undefined ? {} : { checkoutUrl: operation.checkoutUrl }),
    ...(operation.portalUrl === undefined ? {} : { portalUrl: operation.portalUrl }),
  }
}

function statusLabel(status: BillingOperationStatus): string {
  switch (status) {
    case 'pending_provider_redirect':
      return 'Checkout pending'
    case 'paid_active':
      return 'Paid active'
    case 'payment_failed':
      return 'Payment failed'
    case 'past_due':
      return 'Past due'
    case 'required_action':
      return 'Action required'
    case 'refunded':
      return 'Refunded'
    case 'dispute_hold':
      return 'Dispute hold'
    case 'chargeback_recorded':
      return 'Chargeback recorded'
    case 'billing_cancelled':
      return 'Cancelled'
    case 'provider_unavailable':
      return 'Provider unavailable'
    case 'reconciliation_stale':
      return 'Reconciliation stale'
    case 'reconciliation_missing':
      return 'Reconciliation missing'
    case 'no_repair':
      return 'No repair'
    case 'paid_activation_disabled':
      return 'Paid activation disabled'
  }
}

function nextAction(status: BillingOperationStatus): string {
  switch (status) {
    case 'pending_provider_redirect':
      return 'Complete secure checkout'
    case 'paid_active':
      return 'Manage billing'
    case 'payment_failed':
    case 'past_due':
    case 'required_action':
      return 'Review provider readback and retry payment'
    case 'refunded':
    case 'dispute_hold':
    case 'chargeback_recorded':
    case 'billing_cancelled':
      return 'Review receipts and support notes'
    case 'provider_unavailable':
    case 'reconciliation_stale':
    case 'reconciliation_missing':
      return 'Operator reconciliation required'
    case 'no_repair':
      return 'No automated repair available'
    case 'paid_activation_disabled':
      return 'Paid activation is disabled'
  }
}
