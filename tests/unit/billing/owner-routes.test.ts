import { describe, expect, it } from 'vitest'

import {
  readOwnerBillingRouteReadback,
  selectOwnerBillingReceiptState,
  summarizeOwnerBillingRoute,
  type OwnerBillingRouteContext,
} from '@/future-phases/05-paid-activation-money-rails/routes/owner.billing'
import {
  type BillingOperation,
  type BillingOperationStatus,
  type BillingReceipt,
  type BillingSourceState,
} from '@/modules/billing/public'

type BillingOffer = BillingSourceState['offers'][number]

const businessId = 'business:billing-route' as BillingOffer['businessId']
const ownerId = 'owner:billing-route' as BillingOperation['ownerId']
const offerId = 'offer:billing-route' as BillingOffer['id']
const operationKey = 'operation-key:billing-route' as BillingOperation['operationKey']
const correlationId = 'correlation:billing-route' as BillingOperation['correlationId']
const sourceHash = 'hash:billing-route' as BillingOffer['sourceHash']

const emptyBillingSourceState: BillingSourceState = {
  offers: [],
  operations: [],
  providerEvents: [],
  receipts: [],
  reconciliations: [],
  supportRecords: [],
}

const activeOffer: BillingOffer = {
  id: offerId,
  businessId,
  status: 'active',
  publicName: 'Owner activation offer',
  publicDescription: 'Source-owned offer for an owner-controlled billing activation.',
  publicCtaLabel: 'Start activation',
  planId: 'plan-owner-activation',
  provider: 'autumn_cloud',
  priceSummary: 'A$29 monthly',
  termsSummary: 'Renews monthly until canceled by the owner.',
  sourceHash,
  updatedAt: 20,
}

describe('owner billing route helpers', () => {
  it('renders unavailable and offer states from source-owned projections', () => {
    const unavailable = summarizeOwnerBillingRoute(readback(emptyBillingSourceState))

    expect(unavailable).toMatchObject({
      kind: 'unavailable',
      title: 'Owner billing is unavailable',
    })

    const offer = summarizeOwnerBillingRoute(readback({ ...emptyBillingSourceState, offers: [activeOffer] }))

    expect(offer).toMatchObject({
      kind: 'offer_available',
      offer: { id: offerId, name: 'Owner activation offer', priceSummary: 'A$29 monthly' },
      primaryAction: { href: '/owner/billing/activate' },
    })
  })

  it('maps owner operation readbacks to route states without fake provider-status proof', () => {
    expect(summaryFor('pending_provider_redirect', 'redirecting', { checkoutUrl: 'https://provider.example/session' })).toMatchObject({
      kind: 'pending_redirect',
      primaryAction: { href: 'https://provider.example/session', external: true },
    })
    expect(summaryFor('pending_provider_redirect', 'return', { checkoutUrl: 'https://provider.example/session' })).toMatchObject({
      kind: 'pending_provider_readback',
      title: 'Waiting for provider readback',
    })
    expect(summaryFor('billing_cancelled', 'cancel')).toMatchObject({
      kind: 'canceled_return',
      title: 'Activation canceled',
    })
    expect(summaryFor('paid_active', 'overview')).toMatchObject({
      kind: 'paid_active',
      title: 'Billing is active',
    })
    expect(summaryFor('provider_unavailable', 'overview')).toMatchObject({
      kind: 'provider_unavailable',
      alert: { variant: 'destructive' },
    })
  })

  it('selects paid, refunded, disputed, and chargeback receipts from the owner readback', () => {
    const receipts = receiptStatuses.map((status, index) => ownerReceipt(status, index))
    const operation = ownerOperation('paid_active', { receiptIds: receipts.map((receipt) => receipt.id) })
    const ownerReadback = readback({ ...emptyBillingSourceState, offers: [activeOffer], operations: [operation], receipts })

    for (const receipt of receipts) {
      expect(selectOwnerBillingReceiptState(ownerReadback, receipt.id)).toMatchObject({
        kind: 'receipt',
        receipt: { id: receipt.id, status: receipt.status },
      })
    }

    expect(selectOwnerBillingReceiptState(ownerReadback, 'receipt:missing')).toMatchObject({
      kind: 'receipt_unavailable',
      alert: { variant: 'destructive' },
    })
  })

  it('loads every owner billing route surface module', async () => {
    const modules = await Promise.all([
      import('@/future-phases/05-paid-activation-money-rails/routes/owner.billing.activate'),
      import('@/future-phases/05-paid-activation-money-rails/routes/owner.billing.redirecting'),
      import('@/future-phases/05-paid-activation-money-rails/routes/owner.billing.return'),
      import('@/future-phases/05-paid-activation-money-rails/routes/owner.billing.cancel'),
      import('@/future-phases/05-paid-activation-money-rails/routes/owner.billing.receipts.$receiptId'),
    ])

    expect(modules.every((module) => module.Route !== undefined)).toBe(true)
  })

  it('keeps route-local summaries free of disallowed money-rail claims', () => {
    const summaries = [
      summarizeOwnerBillingRoute(readback(emptyBillingSourceState)),
      summarizeOwnerBillingRoute(readback({ ...emptyBillingSourceState, offers: [activeOffer] })),
      summaryFor('paid_active', 'overview'),
      summaryFor('provider_unavailable', 'overview'),
    ]
    const copy = summaries
      .flatMap((summary) => [summary.title, summary.description, summary.alert?.title, summary.alert?.description, summary.primaryAction?.label])
      .filter((value): value is string => typeof value === 'string')
      .join(' ')

    expect(copy).not.toMatch(/wallet|Connect|x402|custody|direct Stripe|Stripe subscription authority/i)
  })
})

function readback(state: BillingSourceState) {
  return readOwnerBillingRouteReadback({ state, businessId, ownerId })
}

function summaryFor(status: BillingOperationStatus, context: OwnerBillingRouteContext, extra: Partial<BillingOperation> = {}) {
  return summarizeOwnerBillingRoute(
    readback({ ...emptyBillingSourceState, offers: [activeOffer], operations: [ownerOperation(status, extra)] }),
    context
  )
}

function ownerOperation(status: BillingOperationStatus, extra: Partial<BillingOperation> = {}): BillingOperation {
  return {
    id: `operation:${status}` as BillingOperation['id'],
    businessId,
    ownerId,
    offerId,
    operationKey,
    correlationId,
    operationKind: 'checkout',
    provider: 'autumn_cloud',
    status,
    providerCustomerId: 'provider-customer:billing-route',
    providerRefs: [{ provider: 'autumn_cloud', objectId: 'provider-object:billing-route', payloadHash: sourceHash, readAt: 30 }],
    receiptIds: [],
    supportRecordIds: [],
    returnPath: '/owner/billing/return',
    cancelPath: '/owner/billing/cancel',
    retryCount: 0,
    evidenceRefs: ['hash:billing-route'],
    sourceHash,
    createdAt: 30,
    updatedAt: 40,
    ...extra,
  }
}

const receiptStatuses = ['paid', 'refunded', 'disputed', 'chargeback'] as const satisfies readonly BillingReceipt['status'][]

function ownerReceipt(status: BillingReceipt['status'], index: number): BillingReceipt {
  return {
    id: `receipt:${status}` as BillingReceipt['id'],
    operationId: 'operation:paid_active' as BillingReceipt['operationId'],
    businessId,
    provider: 'stripe_psp',
    providerReceiptId: `provider-receipt:${status}`,
    invoiceUrl: `https://provider.example/receipts/${status}`,
    amountSummary: `A$${29 + index}.00`,
    status,
    payloadHash: sourceHash,
    providerEvidenceRefs: [`provider:receipt:${status}`, `hash:${sourceHash}`],
    paidStateTransition: status === 'paid' ? 'pending_provider_redirect->paid_active' : `paid_active->${status}`,
    refundReversalDisputeRefs: status === 'paid' ? [] : [`provider:receipt:${status}`],
    correlationId,
    issuedAt: 50 + index,
    recordedAt: 60 + index,
  }
}
