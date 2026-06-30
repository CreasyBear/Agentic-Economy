import {
  readOwnerBillingProjection,
  readPublicPaidActivationProjection,
  type BillingSourceState,
  type OwnerBillingOperationProjection,
  type OwnerBillingProjection,
  type OwnerBillingReceiptProjection,
  type PublicPaidActivationOffer,
  type PublicPaidActivationProjection,
} from '@/modules/billing/public'

export type OwnerBillingRouteContext = 'overview' | 'activate' | 'redirecting' | 'return' | 'cancel'

export type OwnerBillingSummaryKind =
  | 'unavailable'
  | 'offer_available'
  | 'pending_redirect'
  | 'canceled_return'
  | 'pending_provider_readback'
  | 'paid_active'
  | 'provider_unavailable'
  | 'receipt'
  | 'receipt_unavailable'

export type OwnerBillingRouteReadback = {
  publicActivation: PublicPaidActivationProjection
  owner: OwnerBillingProjection
  ownerOffers: PublicPaidActivationOffer[]
  latestOperation?: OwnerBillingOperationProjection
}

export type OwnerBillingRouteInput = {
  state?: BillingSourceState
  businessId?: OwnerBillingProjection['businessId']
  ownerId?: OwnerBillingProjection['ownerId']
  paidActivationEnabled?: boolean
}

export type OwnerBillingAction = {
  label: string
  href: string
  external?: true
}

export type OwnerBillingFact = {
  label: string
  value: string
}

export type OwnerBillingRouteSummary = {
  kind: OwnerBillingSummaryKind
  title: string
  description: string
  facts: readonly OwnerBillingFact[]
  alert?: {
    title: string
    description: string
    variant?: 'destructive'
  }
  primaryAction?: OwnerBillingAction
  offer?: PublicPaidActivationOffer
  operation?: OwnerBillingOperationProjection
  receipt?: OwnerBillingReceiptProjection
}

const defaultBusinessId = 'business:owner-billing' as OwnerBillingProjection['businessId']
const defaultOwnerId = 'owner:billing-owner' as OwnerBillingProjection['ownerId']

const emptyBillingSourceState: BillingSourceState = {
  offers: [],
  operations: [],
  providerEvents: [],
  receipts: [],
  reconciliations: [],
  supportRecords: [],
}

export function readOwnerBillingRouteReadback(input: OwnerBillingRouteInput = {}): OwnerBillingRouteReadback {
  const state = input.state ?? emptyBillingSourceState
  const businessId = input.businessId ?? defaultBusinessId
  const ownerId = input.ownerId ?? defaultOwnerId
  const publicActivation = readPublicPaidActivationProjection(state, businessId, {
    paidActivationEnabled: input.paidActivationEnabled ?? true,
  })
  const owner = readOwnerBillingProjection(state, businessId, ownerId)
  const ownerOffers = state.offers
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
  const latestOperation = latestOwnerOperation(owner.operations)

  if (latestOperation === undefined) {
    return { publicActivation, owner, ownerOffers }
  }

  return { publicActivation, owner, ownerOffers, latestOperation }
}

export function summarizeOwnerBillingRoute(
  readback: OwnerBillingRouteReadback,
  context: OwnerBillingRouteContext = 'overview'
): OwnerBillingRouteSummary {
  const operation = readback.latestOperation

  if (operation !== undefined) {
    return summarizeOwnerBillingOperation(readback, operation, context)
  }

  const offer = readback.ownerOffers[0] ?? readback.publicActivation.offers[0]
  if (offer !== undefined) {
    return {
      kind: 'offer_available',
      title: context === 'activate' ? 'Activation offer is available' : 'Billing offer is available',
      description: readback.publicActivation.available
        ? 'The current offer is published from billing source state and public paid-activation evidence is complete.'
        : 'The owner offer is published from billing source state. Public paid-activation claims remain unavailable until provider, receipt, reconciliation, and support evidence are recorded.',
      offer,
      facts: offerFacts(offer),
      primaryAction: internalAction('Review activation route', '/owner/billing/activate'),
    }
  }

  return {
    kind: 'unavailable',
    title: 'Owner billing is unavailable',
    description: unavailableReason(readback.publicActivation.reason),
    facts: [{ label: 'State', value: 'No source-owned active offer or owner operation readback.' }],
    alert: {
      title: 'No owner charge state granted',
      description: 'The route only reflects billing source state. A missing offer or disabled control cannot create paid access.',
    },
  }
}

export function selectOwnerBillingReceiptState(readback: OwnerBillingRouteReadback, receiptId: string): OwnerBillingRouteSummary {
  const receipt = readback.owner.receipts.find((candidate) => candidate.id === receiptId)

  if (receipt === undefined) {
    return {
      kind: 'receipt_unavailable',
      title: 'Receipt unavailable',
      description: 'No receipt with this ID exists in the owner billing readback.',
      facts: [{ label: 'Receipt ID', value: receiptId }],
      alert: {
        title: 'Receipt not found',
        description: 'Only receipts recorded in source-owned billing state can be shown here.',
        variant: 'destructive',
      },
    }
  }

  const invoiceAction = receipt.invoiceUrl === undefined ? undefined : externalAction('Open receipt', receipt.invoiceUrl)
  const base = {
    kind: 'receipt' as const,
    title: receiptTitle(receipt.status),
    description: 'This receipt is rendered from the owner billing receipt readback.',
    receipt,
    facts: receiptFacts(receipt),
  }

  if (invoiceAction === undefined) {
    return base
  }

  return { ...base, primaryAction: invoiceAction }
}

function summarizeOwnerBillingOperation(
  readback: OwnerBillingRouteReadback,
  operation: OwnerBillingOperationProjection,
  context: OwnerBillingRouteContext
): OwnerBillingRouteSummary {
  if (operation.status === 'provider_unavailable') {
    return operationSummary({
      kind: 'provider_unavailable',
      title: 'Billing provider unavailable',
      description: 'The last owner operation could not reach a provider readback. Operator reconciliation is required before granting access.',
      operation,
      alert: {
        title: 'Provider readback missing',
        description: 'No owner-facing route can turn this into active access without a recorded provider readback.',
        variant: 'destructive',
      },
    })
  }

  if (operation.status === 'billing_cancelled') {
    return operationSummary({
      kind: 'canceled_return',
      title: context === 'cancel' ? 'Activation canceled' : 'Activation was canceled',
      description: 'The source-owned operation is canceled. No paid access is granted by this return.',
      operation,
      alert: {
        title: 'Canceled return recorded',
        description: 'The owner can restart only through a fresh source-owned activation operation.',
      },
    })
  }

  if (operation.status === 'paid_active') {
    const receipt = readback.owner.receipts.find((candidate) => candidate.operationId === operation.id)
    const primaryAction = operation.portalUrl === undefined ? receiptAction(receipt) : externalAction('Open billing portal', operation.portalUrl)
    return operationSummary({
      kind: 'paid_active',
      title: 'Billing is active',
      description: 'A paid-active state is present in source-owned owner billing readback.',
      operation,
      ...(receipt === undefined ? {} : { receipt }),
      ...(primaryAction === undefined ? {} : { primaryAction }),
    })
  }

  if (operation.status === 'pending_provider_redirect' && context !== 'return') {
    const primaryAction = operation.checkoutUrl === undefined ? undefined : externalAction('Continue provider redirect', operation.checkoutUrl)
    return operationSummary({
      kind: 'pending_redirect',
      title: context === 'redirecting' ? 'Provider redirect is pending' : 'Provider handoff is pending',
      description: 'The source-owned operation has a pending provider redirect. Access stays unchanged until a provider readback is recorded.',
      operation,
      ...(primaryAction === undefined ? {} : { primaryAction }),
    })
  }

  return operationSummary({
    kind: 'pending_provider_readback',
    title: 'Waiting for provider readback',
    description: 'The owner returned or the operation needs provider confirmation. No active state is granted until the readback is stored.',
    operation,
    alert: {
      title: 'Provider readback pending',
      description: 'Refresh after reconciliation or ask support to review the source-owned operation.',
    },
  })
}

function operationSummary(input: {
  kind: Exclude<OwnerBillingSummaryKind, 'unavailable' | 'offer_available' | 'receipt' | 'receipt_unavailable'>
  title: string
  description: string
  operation: OwnerBillingOperationProjection
  alert?: OwnerBillingRouteSummary['alert']
  primaryAction?: OwnerBillingAction
  receipt?: OwnerBillingReceiptProjection
}): OwnerBillingRouteSummary {
  return {
    kind: input.kind,
    title: input.title,
    description: input.description,
    operation: input.operation,
    facts: operationFacts(input.operation),
    ...(input.alert === undefined ? {} : { alert: input.alert }),
    ...(input.primaryAction === undefined ? {} : { primaryAction: input.primaryAction }),
    ...(input.receipt === undefined ? {} : { receipt: input.receipt }),
  }
}

function latestOwnerOperation(
  operations: readonly OwnerBillingOperationProjection[]
): OwnerBillingOperationProjection | undefined {
  return [...operations].sort((left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt)[0]
}

function unavailableReason(reason: PublicPaidActivationProjection['reason']): string {
  switch (reason) {
    case 'operator_disabled':
      return 'Operator controls have disabled owner billing activation.'
    case 'degraded':
      return 'Billing readback is degraded, so the owner route will not start activation.'
    case 'stale':
      return 'Billing readback is stale, so the owner route will not start activation.'
    case 'no_active_offer':
    case undefined:
      return 'No active owner billing offer has been published from source-owned state.'
  }
}

function offerFacts(offer: PublicPaidActivationOffer): readonly OwnerBillingFact[] {
  return [
    { label: 'Offer', value: offer.name },
    { label: 'Price', value: offer.priceSummary },
    { label: 'Terms', value: offer.termsSummary },
    { label: 'Updated', value: formatOwnerBillingTime(offer.updatedAt) },
  ]
}

function operationFacts(operation: OwnerBillingOperationProjection): readonly OwnerBillingFact[] {
  return [
    { label: 'Operation', value: operation.id },
    { label: 'Status', value: operation.statusLabel },
    { label: 'Next action', value: operation.nextAction },
    { label: 'Updated', value: formatOwnerBillingTime(operation.updatedAt) },
  ]
}

function receiptFacts(receipt: OwnerBillingReceiptProjection): readonly OwnerBillingFact[] {
  return [
    { label: 'Receipt', value: receipt.id },
    { label: 'Operation', value: receipt.operationId },
    { label: 'Status', value: receipt.status },
    { label: 'Amount', value: receipt.amountSummary ?? 'Amount summary unavailable' },
    { label: 'Issued', value: formatOwnerBillingTime(receipt.issuedAt) },
  ]
}

function receiptTitle(status: OwnerBillingReceiptProjection['status']): string {
  switch (status) {
    case 'paid':
      return 'Paid receipt'
    case 'refunded':
      return 'Refunded receipt'
    case 'disputed':
      return 'Disputed receipt'
    case 'chargeback':
      return 'Chargeback receipt'
  }
}

function receiptAction(receipt: OwnerBillingReceiptProjection | undefined): OwnerBillingAction | undefined {
  if (receipt === undefined) {
    return undefined
  }

  return internalAction('View receipt readback', `/owner/billing/receipts/${receipt.id}`)
}

function internalAction(label: string, href: string): OwnerBillingAction {
  return { label, href }
}

function externalAction(label: string, href: string): OwnerBillingAction {
  return { label, href, external: true }
}

function formatOwnerBillingTime(value: number): string {
  return new Date(value).toISOString()
}
