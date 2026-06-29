import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'
import * as billing from '@/modules/billing/public'
import type { AutumnProvider, BillingOffer, BillingSourceState } from '@/modules/billing/public'
import convexSchema from '../../../convex/schema'

const businessId = brandNonEmpty('business:demo', 'BusinessId')
const ownerId = brandNonEmpty('owner:demo', 'OwnerId')
const offerId = brandNonEmpty('billing_offer:basic', 'BillingOfferId')
const secondOfferId = brandNonEmpty('billing_offer:pro', 'BillingOfferId')
const operationKey = brandNonEmpty('billing:checkout:1', 'OperationKey')
const correlationId = brandNonEmpty('correlation:billing:1', 'CorrelationId')
const now = 1_800_000_000_000

const ownerAuthority = { ownerId, businessId }
const adminAuthority = { role: 'owner_admin' as const, clerkUserId: 'admin_1' }

function offer(id: BillingOffer['id'] = offerId, planId = 'autumn-plan-basic'): BillingOffer {
  return {
    id,
    businessId,
    status: 'active',
    publicName: 'Paid activation',
    publicDescription: 'Source-owned paid activation.',
    publicCtaLabel: 'Activate',
    planId,
    provider: 'autumn_cloud',
    priceSummary: 'AUD 99',
    termsSummary: 'Monthly subscription',
    sourceHash: stableHash({ offer: id, planId }),
    updatedAt: now,
  }
}

function state(overrides: Partial<BillingSourceState> = {}): BillingSourceState {
  return {
    offers: [offer()],
    operations: [],
    providerEvents: [],
    receipts: [],
    reconciliations: [],
    supportRecords: [],
    ...overrides,
  }
}

function provider(): AutumnProvider & { attachCalls: unknown[] } {
  const attachCalls: unknown[] = []

  return {
    attachCalls,
    async attach(request) {
      attachCalls.push(request)
      return {
        customerId: request.customerId,
        paymentUrl: 'https://billing.example/checkout/session_1',
        payloadHash: stableHash({ kind: 'attach', request }),
      }
    },
    async openCustomerPortal(request) {
      return {
        customerId: request.customerId,
        url: 'https://billing.example/portal/session_1',
        payloadHash: stableHash({ kind: 'portal', request }),
      }
    },
    async getCustomer(customerId) {
      return {
        customerId,
        subscriptions: [{ planId: 'autumn-plan-basic', status: 'active' }],
        purchases: [],
        invoices: [],
        payloadHash: stableHash({ kind: 'customer', customerId }),
      }
    },
  }
}

async function startedOperation(inputState = state()) {
  const deterministicProvider = provider()
  const result = await billing.startPaidActivation(inputState, {
    authority: ownerAuthority,
    businessId,
    ownerId,
    offerId,
    operationKey,
    correlationId,
    appBaseUrl: 'https://agentic.example',
    now,
  }, deterministicProvider)

  expect(result.kind).toBe('ok')
  if (result.kind !== 'ok') {
    throw new Error(result.code)
  }

  return { result, deterministicProvider }
}

describe('billing rail contract', () => {
  it('exports only the route-facing billing functions', () => {
    const exportedFunctions = Object.entries(billing)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
      .sort()

    expect(exportedFunctions).toEqual([
      'disablePaidActivation',
      'ingestBillingProviderEvent',
      'markBillingNoRepair',
      'readAdminBillingProjection',
      'readBillingReconciliation',
      'readBillingStatus',
      'readOwnerBillingProjection',
      'readPublicPaidActivationProjection',
      'readReceipt',
      'recordBillingEvidence',
      'retryBillingReconciliation',
      'startCustomerPortal',
      'startPaidActivation',
    ].sort())
  })

  it('registers the six billing Convex tables', () => {
    const exportSchema = Reflect.get(convexSchema, 'export')
    expect(typeof exportSchema).toBe('function')
    const exported = JSON.parse(String(exportSchema.call(convexSchema))) as { tables: { tableName: string }[] }
    expect(exported.tables.map((table) => table.tableName)).toEqual(expect.arrayContaining([
      'billingOffers',
      'billingOperations',
      'billingProviderEvents',
      'billingReceipts',
      'billingReconciliations',
      'capabilityLaunchSupportRecords',
    ]))
  })

  it('does not accept env vars as provider connection readiness proof', () => {
    const result = billing.recordBillingEvidence(state(), {
      authority: adminAuthority,
      businessId,
      provider: 'autumn_cloud',
      connectionStatus: 'ready',
      evidenceSource: 'env',
      operatorNextAction: 'capture provider readback',
      operationKey,
      correlationId,
      now,
    })

    expect(result).toMatchObject({
      kind: 'error',
      code: 'billing_event_rejected',
      reason: 'env_vars_are_not_provider_readback',
    })
  })

  it('rejects client supplied money, provider, URL, paid state, and business authority fields', async () => {
    const rejectedFields = [
      'amount',
      'currency',
      'providerCustomerId',
      'providerObjectId',
      'paidState',
      'returnUrl',
      'cancelUrl',
      'businessAuthority',
    ] as const

    for (const field of rejectedFields) {
      const result = await billing.startPaidActivation(state(), {
        authority: ownerAuthority,
        businessId,
        ownerId,
        offerId,
        operationKey: brandNonEmpty(`billing:checkout:${field}`, 'OperationKey'),
        correlationId,
        appBaseUrl: 'https://agentic.example',
        now,
        unsafeClientFields: { [field]: 'client supplied' },
      }, provider())

      expect(result).toMatchObject({ kind: 'error', code: 'billing_client_field_rejected', reason: field })
    }
  })

  it('replays the same start idempotency body and rejects a different body conflict', async () => {
    const deterministicProvider = provider()
    const sourceState = state({ offers: [offer(), offer(secondOfferId, 'autumn-plan-pro')] })
    const first = await billing.startPaidActivation(sourceState, {
      authority: ownerAuthority,
      businessId,
      ownerId,
      offerId,
      operationKey,
      correlationId,
      appBaseUrl: 'https://agentic.example',
      now,
    }, deterministicProvider)
    expect(first.kind).toBe('ok')
    if (first.kind !== 'ok') throw new Error(first.code)

    const replay = await billing.startPaidActivation(first.state, {
      authority: ownerAuthority,
      businessId,
      ownerId,
      offerId,
      operationKey,
      correlationId: brandNonEmpty('correlation:billing:replay', 'CorrelationId'),
      appBaseUrl: 'https://agentic.example',
      now: now + 1,
    }, deterministicProvider)
    expect(replay.kind).toBe('ok')
    if (replay.kind !== 'ok') throw new Error(replay.code)
    expect(replay.operation).toEqual(first.operation)
    expect(deterministicProvider.attachCalls).toHaveLength(1)

    const conflict = await billing.startPaidActivation(first.state, {
      authority: ownerAuthority,
      businessId,
      ownerId,
      offerId: secondOfferId,
      operationKey,
      correlationId: brandNonEmpty('correlation:billing:conflict', 'CorrelationId'),
      appBaseUrl: 'https://agentic.example',
      now: now + 2,
    }, deterministicProvider)
    expect(conflict).toMatchObject({ kind: 'error', code: 'billing_operation_conflict', reason: 'operation_key_conflict' })
  })

  it('does not grant paid state from an unsigned provider event', async () => {
    const { result } = await startedOperation()
    const eventResult = billing.ingestBillingProviderEvent(result.state, {
      operationKey: brandNonEmpty('billing:webhook:unsigned', 'OperationKey'),
      correlationId,
      provider: 'autumn_cloud',
      providerEventId: 'evt_unsigned',
      eventType: 'checkout.completed',
      payloadHash: stableHash({ event: 'unsigned' }),
      redactedPayloadJson: JSON.stringify({ eventType: 'checkout.completed' }),
      signatureVerified: false,
      receivedAt: now + 10,
      operationId: result.operation.id,
      providerCustomerId: result.operation.providerCustomerId,
      providerStatus: 'active',
      receipt: {
        providerReceiptId: 'in_unsigned',
        invoiceUrl: 'https://billing.example/invoices/in_unsigned',
        amountSummary: 'AUD 99',
        issuedAt: now + 10,
        status: 'paid',
      },
    })

    expect(eventResult.kind).toBe('ok')
    if (eventResult.kind !== 'ok') throw new Error(eventResult.code)
    expect(eventResult.code).toBe('billing_provider_event_rejected')
    expect(eventResult.state.operations[0]?.status).toBe('pending_provider_redirect')
    expect(eventResult.state.receipts).toHaveLength(0)
  })

  it('records redacted signed provider evidence, moves a bound operation to paid, and stores one receipt', async () => {
    const { result } = await startedOperation()
    const payloadHash = stableHash({ event: 'signed paid' })
    const eventResult = billing.ingestBillingProviderEvent(result.state, {
      operationKey: brandNonEmpty('billing:webhook:signed', 'OperationKey'),
      correlationId,
      provider: 'autumn_cloud',
      providerEventId: 'evt_paid',
      eventType: 'checkout.completed',
      payloadHash,
      redactedPayloadJson: JSON.stringify({ eventType: 'checkout.completed', status: 'active' }),
      signatureVerified: true,
      receivedAt: now + 20,
      operationId: result.operation.id,
      providerCustomerId: result.operation.providerCustomerId,
      providerStatus: 'active',
      receipt: {
        providerReceiptId: 'in_paid',
        invoiceUrl: 'https://billing.example/invoices/in_paid',
        amountSummary: 'AUD 99',
        issuedAt: now + 20,
        status: 'paid',
      },
    })

    expect(eventResult.kind).toBe('ok')
    expect(eventResult.code).toBe('billing_provider_event_ingested')
    if (eventResult.kind !== 'ok') throw new Error(eventResult.code)
    expect(eventResult.operation?.status).toBe('paid_active')
    expect(eventResult.state.receipts).toHaveLength(1)
    expect(eventResult.providerEvent).toMatchObject({ payloadHash, redactedPayloadJson: expect.any(String) })
    expect(Object.keys(eventResult.providerEvent)).not.toEqual(expect.arrayContaining(['rawBody', 'rawProviderBody', 'providerBody']))

    const status = billing.readBillingStatus(eventResult.state, {
      authority: ownerAuthority,
      businessId,
      ownerId,
      operationId: result.operation.id,
    })
    expect(status).toMatchObject({ kind: 'ok', code: 'billing_status_read', status: 'paid_active' })

    const receiptId = eventResult.operation?.receiptIds[0]
    expect(receiptId).toBeDefined()
    const receipt = billing.readReceipt(eventResult.state, {
      authority: ownerAuthority,
      businessId,
      ownerId,
      receiptId: receiptId!,
    })
    expect(receipt).toMatchObject({ kind: 'ok', code: 'billing_receipt_read', receipt: { status: 'paid' } })
  })
})
