import { describe, expect, it } from 'vitest'
import {
  operationInvokeReceiptAsset,
  operationInvokeReceiptSchema,
  operationInvokeResultSchema,
  type OperationInvokeReceipt,
} from '@/modules/capability-execution/operation-invoke-contracts'
import { buildBrokeredX402Receipt } from '@/modules/capability-execution/invocation-worker/brokeredX402'
import {
  projectPureOperationInvocationStatus,
  reconciliationResult,
} from '../../../convex/capabilityOperationInvocationProjection'
import type { RecoveryRow } from '../../../convex/capabilityOperationInvocationProjection'
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { PublishedOperation } from '@/modules/capability-supply/public'
import type { PricingConfig } from '@/modules/money/public'

const amount = (units: string) => ({ currency: 'USD', units, exponent: 2 })

const receipt = (): OperationInvokeReceipt => ({
  receiptRef: 'receipt:opaque-digest',
  state: 'settled',
  network: 'eip155:8453',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  providerQuotedAmount: amount('100'),
  agenticEconomyFee: amount('10'),
  totalBuyerAuthorization: amount('110'),
  priceDigest: 'sha256:price',
  transactionRef: 'operation-money:opaque',
  settlementTransactionHash: '0xsettlement',
  paymentIdentifier: 'payment:opaque',
  accountingTransactionRefs: ['operation-money:opaque'],
  refundState: 'not_applicable',
  lossState: 'none',
  externalSettlementRef: '0xsettlement',
  evidenceHash: 'sha256:evidence',
  issuedAt: '2026-08-20T00:00:00.000Z',
})

function pricedOperation(pricingConfig: PricingConfig): PublishedOperation {
  const fixture = buildDevelopmentPublishedOperationEvidence().operation
  const price = { kind: 'fixed' as const, amount: pricingConfig.paidAmount }
  const priceDigest = canonicalDigest(pricingConfig as StableHashValue)
  const identity = {
    ...fixture.identity,
    pricingConfig,
    priceDigest,
    price,
    payment: {
      kind: 'x402' as const,
      network: 'eip155:8453',
      asset: operationInvokeReceiptAsset,
      payTo: '0xprovider',
      currency: 'USD',
      routeAmountExponent: 2,
      assetAmountExponent: 6,
    },
  }
  return {
    ...fixture,
    identity,
    pricingConfig,
    priceDigest,
    materialDigest: canonicalDigest(identity as StableHashValue),
    offering: { ...fixture.offering, presentation: { ...fixture.offering.presentation, price } },
  }
}

describe('operation invocation receipts', () => {
  it('round-trips only the safe fixed receipt contract', () => {
    const candidate = receipt()
    expect(operationInvokeReceiptSchema.parse(candidate)).toEqual(candidate)
    const serialized = JSON.stringify(candidate)
    for (const sensitiveName of [
      'signature',
      'authorization',
      'paymentBody',
      'challenge',
      'selectedRequirement',
      'reservationRef',
      'credentialRef',
      'custodyRef',
      'payTo',
      'providerEndpoint',
      'principalId',
      'grantRef',
      'budgetId',
      'providerReceipt',
    ]) expect(serialized).not.toContain(sensitiveName)
    expect(operationInvokeReceiptSchema.safeParse({ ...candidate, providerReceipt: 'raw-provider-receipt' }).success).toBe(false)
  })

  it('accepts additive receipts on terminal result variants', () => {
    const candidate = receipt()
    expect(operationInvokeResultSchema.parse({
      kind: 'completed',
      invocationRef: 'invocation:opaque',
      operationRef: 'operation:opaque',
      output: { ok: true },
      evidenceHash: candidate.evidenceHash,
      usage: {
        usageRef: 'usage:opaque',
        observedAt: 1,
        chargeState: 'paid',
        amount: candidate.totalBuyerAuthorization,
        priceDigest: candidate.priceDigest,
        transactionRef: candidate.transactionRef,
      },
      receipt: candidate,
    })).toMatchObject({ kind: 'completed', receipt: candidate })
    expect(operationInvokeResultSchema.parse({
      kind: 'refused',
      operationRef: 'operation:opaque',
      code: 'provider_output_invalid',
      retryable: false,
      receipt: { ...candidate, state: 'refunded' },
    })).toMatchObject({ kind: 'refused', receipt: { state: 'refunded' } })
    expect(operationInvokeReceiptSchema.parse({
      ...candidate,
      state: 'refunded',
      refundState: 'released',
      lossState: 'provider_output_invalid',
    })).toMatchObject({ state: 'refunded', refundState: 'released', lossState: 'provider_output_invalid' })
    expect(operationInvokeResultSchema.parse({
      kind: 'reconciliation_required',
      invocationRef: 'invocation:opaque',
      operationRef: 'operation:opaque',
      evidence: {
        attemptRef: 'attempt:opaque',
        effectGeneration: 1,
        requiredAt: candidate.issuedAt,
        retry: 'reconcile_before_retry',
        evidenceSource: 'operation:opaque',
      },
      receipt: { ...candidate, state: 'reconciliation_required' },
    })).toMatchObject({ kind: 'reconciliation_required', receipt: { state: 'reconciliation_required' } })
  })

  it('builds a stable receipt only for pinned explicit brokered pricing', () => {
    const operation = pricedOperation({
      version: 'pricing:v2',
      unit: 'call',
      paidAmount: amount('110'),
      providerAmount: amount('100'),
      platformFee: amount('10'),
    })
    const input = {
      operation,
      invocationRef: 'invocation:opaque',
      operationRef: operation.operationId,
      state: 'settled' as const,
      evidenceHash: 'sha256:evidence',
      issuedAt: '2026-08-20T00:00:00.000Z',
      transactionRef: 'operation-money:opaque',
      settlementTransactionHash: '0xsettlement',
      paymentIdentifier: 'payment:opaque',
      accountingTransactionRefs: ['operation-money:opaque'],
      refundState: 'not_applicable' as const,
      lossState: 'none' as const,
      externalSettlementRef: '0xsettlement',
    }
    const first = buildBrokeredX402Receipt(input)
    const second = buildBrokeredX402Receipt({ ...input, state: 'refunded', evidenceHash: 'sha256:other' })
    expect(first).toBeDefined()
    expect(second).toMatchObject({ receiptRef: first?.receiptRef })
    expect(first).toMatchObject({
      state: 'settled',
      providerQuotedAmount: amount('100'),
      agenticEconomyFee: amount('10'),
      totalBuyerAuthorization: amount('110'),
      network: 'eip155:8453',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      settlementTransactionHash: '0xsettlement',
      paymentIdentifier: 'payment:opaque',
      accountingTransactionRefs: ['operation-money:opaque'],
    })
    const legacy = pricedOperation({ version: 'pricing:v2', unit: 'call', paidAmount: amount('110') })
    expect(buildBrokeredX402Receipt({ ...input, operation: legacy })).toBeUndefined()
    expect(buildBrokeredX402Receipt({ ...input, operation: { ...operation, priceDigest: 'sha256:wrong' } })).toBeUndefined()
  })

  it('round-trips receipts through terminal and reconciliation projections', () => {
    const candidate = receipt()
    const row: RecoveryRow = {
      invocationRef: 'invocation:opaque',
      principalId: 'principal:opaque',
      ownerId: 'owner:opaque',
      credentialId: 'credential:opaque',
      applicationRef: 'application:opaque',
      environment: 'production',
      state: 'refused',
      operationRef: 'operation:opaque',
      inputDigest: 'sha256:input',
      requestDigest: 'sha256:request',
      grantGeneration: 1,
      operationJson: '{}',
      inputJson: '{}',
      result: {
        kind: 'refused',
        operationRef: 'operation:opaque',
        code: 'provider_output_invalid',
        retryable: false,
        receipt: { ...candidate, state: 'refunded' },
      },
    }
    const status = { control: 'terminal', attempts: [] } as never
    expect(projectPureOperationInvocationStatus(row, status)).toMatchObject({
      receipt: { state: 'refunded' },
      result: { receipt: { state: 'refunded' } },
    })
    expect(reconciliationResult(row, status, [], 'operation:opaque', { ...candidate, state: 'reconciliation_required' }))
      .toMatchObject({ receipt: { state: 'reconciliation_required' } })
  })
})
