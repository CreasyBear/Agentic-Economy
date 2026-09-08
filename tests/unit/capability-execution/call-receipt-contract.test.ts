import { describe, expect, it } from 'vitest'
import {
  callReceiptAsset,
  callReceiptBaseSepoliaAsset,
  callReceiptPaymentProfile,
  callReceiptSchema,
  callResultSchema,
  type CallReceipt,
} from '@/modules/capability-execution/call-contracts'
import { buildBrokeredX402Receipt } from '@/modules/capability-execution/call-worker/brokeredX402'
import {
  projectPureCallStatus,
  reconciliationResult,
} from '../../../convex/capabilityCallProjection'
import type { RecoveryRow } from '../../../convex/capabilityCallProjection'
import { buildDevelopmentPublishedToolEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-tool-evidence'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { publishedToolIdentityDigest, type PublishedTool } from '@/modules/capability-supply/public'
import type { PricingConfig } from '@/modules/money/public'

const amount = (units: string) => ({ currency: 'USDC', units, exponent: 6 })

const managedPricing = (
  atomicUnits: string,
  network = 'eip155:8453',
  asset: string = callReceiptAsset,
): PricingConfig => ({
  version: 'pricing:v3',
  kind: 'managed_x402',
  effectTiming: 'payment_required_before_effect',
  sourceRequirement: { network, asset, atomicUnits },
  pricingPolicyRef: 'pricing-policy:sandbox-managed-x402:v1',
  publicDisplay: 'on_request',
})

type AccountAudReceipt = Extract<CallReceipt, { commercialModel: 'account_aud' }>

const receipt = (): AccountAudReceipt => ({
  commercialModel: 'account_aud',
  receiptRef: 'receipt:opaque-digest',
  state: 'settled',
  buyerCharge: { currency: 'AUD', units: '2500000', exponent: 6 },
  serviceFee: { currency: 'AUD', units: '0', exponent: 6 },
  totalBuyerCharge: { currency: 'AUD', units: '2500000', exponent: 6 },
  providerObligation: {
    amount: amount('100'),
    settlementMethod: 'managed_x402',
    payoutEligible: false,
  },
  providerSettlement: {
    network: 'eip155:8453',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    amount: amount('100'),
    transactionHash: '0xsettlement',
    paymentIdentifier: 'payment:opaque',
  },
  priceDigest: 'sha256:price',
  transactionRef: 'operation-money:opaque',
  accountingTransactionRefs: ['operation-money:opaque'],
  refundState: 'not_applicable',
  lossState: 'none',
  externalSettlementRef: '0xsettlement',
  evidenceHash: 'sha256:evidence',
  issuedAt: '2026-08-20T00:00:00.000Z',
})

function pricedOperation(
  pricingConfig: PricingConfig,
  profile: Readonly<{
    environment: 'sandbox' | 'production'
    network: 'eip155:8453' | 'eip155:84532'
    asset: typeof callReceiptAsset | typeof callReceiptBaseSepoliaAsset
  }> = {
    environment: 'production',
    network: 'eip155:8453',
    asset: callReceiptAsset,
  },
): PublishedTool {
  const fixture = buildDevelopmentPublishedToolEvidence().tool
  const price = pricingConfig.kind === 'fixed_aud'
    ? { kind: 'fixed' as const, amount: { currency: 'AUD', units: pricingConfig.amountUnits, exponent: 6 as const } }
    : { kind: 'on_request' as const }
  const priceDigest = canonicalDigest(pricingConfig as StableHashValue)
  const identity = {
    ...fixture.identity,
    runtimeEnvironment: profile.environment,
    pricingConfig,
    priceDigest,
    price,
    payment: {
      kind: 'x402' as const,
      network: profile.network,
      asset: profile.asset,
      payTo: '0xprovider',
      currency: 'USD',
      routeAmountExponent: 2,
      assetAmountExponent: 6,
    },
  }
  return {
    ...fixture,
    runtimeEnvironment: profile.environment,
    identity,
    pricingConfig,
    priceDigest,
    materialDigest: publishedToolIdentityDigest(identity),
    offering: { ...fixture.offering, presentation: { ...fixture.offering.presentation, price } },
  }
}

describe('Call receipts', () => {
  it('round-trips only the safe fixed receipt contract', () => {
    const candidate = receipt()
    expect(callReceiptSchema.parse(candidate)).toEqual(candidate)
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
    expect(callReceiptSchema.safeParse({ ...candidate, providerReceipt: 'raw-provider-receipt' }).success).toBe(false)
  })

  it('accepts only the two exact network and USDC receipt pairs', () => {
    const baseSepolia = {
      ...receipt(),
      providerSettlement: {
        ...receipt().providerSettlement,
        network: 'eip155:84532' as const,
        asset: callReceiptBaseSepoliaAsset,
      },
    }
    expect(callReceiptSchema.parse(baseSepolia)).toEqual(baseSepolia)
    expect(callReceiptSchema.safeParse({
      ...baseSepolia,
      providerSettlement: { ...baseSepolia.providerSettlement, asset: callReceiptAsset },
    }).success).toBe(false)
    expect(callReceiptSchema.safeParse({
      ...receipt(),
      providerSettlement: { ...receipt().providerSettlement, asset: callReceiptBaseSepoliaAsset },
    }).success).toBe(false)
    expect(callReceiptPaymentProfile(
      'production',
      baseSepolia.providerSettlement.network,
      baseSepolia.providerSettlement.asset,
    )).toBeUndefined()
    expect(callReceiptPaymentProfile(
      'sandbox',
      'eip155:8453',
      callReceiptAsset,
    )).toBeUndefined()
  })

  it('accepts additive receipts on terminal result variants', () => {
    const candidate = receipt()
    expect(callResultSchema.parse({
      kind: 'completed',
      callRef: 'invocation:opaque',
      toolRef: 'operation:opaque',
      output: { ok: true },
      evidenceHash: candidate.evidenceHash,
      usage: {
        usageRef: 'usage:opaque',
        observedAt: 1,
        chargeState: 'paid',
        amount: candidate.totalBuyerCharge,
        priceDigest: candidate.priceDigest,
        transactionRef: candidate.transactionRef,
      },
      receipt: candidate,
    })).toMatchObject({ kind: 'completed', receipt: candidate })
    expect(callResultSchema.parse({
      kind: 'refused',
      toolRef: 'operation:opaque',
      code: 'provider_output_invalid',
      retryable: false,
      receipt: { ...candidate, state: 'refunded' },
    })).toMatchObject({ kind: 'refused', receipt: { state: 'refunded' } })
    expect(callReceiptSchema.parse({
      ...candidate,
      state: 'refunded',
      refundState: 'released',
      lossState: 'provider_output_invalid',
    })).toMatchObject({ state: 'refunded', refundState: 'released', lossState: 'provider_output_invalid' })
    expect(callResultSchema.parse({
      kind: 'reconciliation_required',
      callRef: 'invocation:opaque',
      toolRef: 'operation:opaque',
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

  it('keeps ordinary public completions usage-bound', () => {
    expect(callResultSchema.safeParse({
      kind: 'completed',
      callRef: 'invocation:ordinary',
      toolRef: 'operation:ordinary',
      output: { ok: true },
      evidenceHash: 'sha256:evidence',
      receipt: receipt(),
    }).success).toBe(false)
  })

  it('builds a stable receipt only for pinned explicit brokered pricing', () => {
    const operation = pricedOperation(managedPricing('100'))
    const input = {
      operation,
      callRef: 'invocation:opaque',
      toolRef: operation.operationId,
      state: 'settled' as const,
      evidenceHash: 'sha256:evidence',
      issuedAt: '2026-08-20T00:00:00.000Z',
      transactionRef: 'operation-money:opaque',
      settlementTransactionHash: '0xsettlement',
      paymentIdentifier: 'payment:opaque',
      buyerCharge: { currency: 'AUD' as const, units: '2500000', exponent: 6 as const },
      accountingTransactionRefs: ['operation-money:opaque'],
      refundState: 'not_applicable' as const,
      lossState: 'none' as const,
      externalSettlementRef: '0xsettlement',
    }
    const first = buildBrokeredX402Receipt(input)
    const second = buildBrokeredX402Receipt({ ...input, state: 'refunded', evidenceHash: 'sha256:other' })
    expect(buildBrokeredX402Receipt({ ...input, sourceUsdcUnits: '250' })).toMatchObject({
      providerObligation: { amount: { currency: 'USDC', units: '250', exponent: 6 } },
      providerSettlement: { amount: { currency: 'USDC', units: '250', exponent: 6 } },
    })
    expect(first).toBeDefined()
    expect(second).toMatchObject({ receiptRef: first?.receiptRef })
    expect(first).toMatchObject({
      commercialModel: 'account_aud',
      state: 'settled',
      buyerCharge: { currency: 'AUD', units: '2500000', exponent: 6 },
      serviceFee: { currency: 'AUD', units: '0', exponent: 6 },
      totalBuyerCharge: { currency: 'AUD', units: '2500000', exponent: 6 },
      providerObligation: { amount: amount('100'), settlementMethod: 'managed_x402', payoutEligible: false },
      providerSettlement: {
        network: 'eip155:8453',
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        amount: amount('100'),
        transactionHash: '0xsettlement',
        paymentIdentifier: 'payment:opaque',
      },
      accountingTransactionRefs: ['operation-money:opaque'],
    })
    const fixed = pricedOperation({ version: 'pricing:v3', kind: 'fixed_aud', currency: 'AUD', exponent: 6, amountUnits: '110' })
    expect(buildBrokeredX402Receipt({ ...input, operation: fixed })).toBeUndefined()
    expect(buildBrokeredX402Receipt({ ...input, operation: { ...operation, priceDigest: 'sha256:wrong' } })).toBeUndefined()
  })

  it('builds Base Sepolia receipts only for sandbox operations', () => {
    const pricingConfig = managedPricing(
      '100',
      'eip155:84532',
      callReceiptBaseSepoliaAsset,
    )
    const sandboxOperation = pricedOperation(pricingConfig, {
      environment: 'sandbox',
      network: 'eip155:84532',
      asset: callReceiptBaseSepoliaAsset,
    })
    const receiptInput = {
      operation: sandboxOperation,
      callRef: 'invocation:sandbox',
      toolRef: sandboxOperation.operationId,
      state: 'settled' as const,
      evidenceHash: 'sha256:sandbox-evidence',
      issuedAt: '2026-08-30T00:00:00.000Z',
      buyerCharge: { currency: 'AUD' as const, units: '2500000', exponent: 6 as const },
    }
    expect(buildBrokeredX402Receipt(receiptInput)).toMatchObject({
      providerSettlement: {
        network: 'eip155:84532',
        asset: callReceiptBaseSepoliaAsset,
      },
    })
    expect(buildBrokeredX402Receipt({
      ...receiptInput,
      operation: { ...sandboxOperation, runtimeEnvironment: 'production' },
    })).toBeUndefined()
    if (sandboxOperation.identity.payment.kind !== 'x402') throw new Error('expected_x402_payment')
    expect(buildBrokeredX402Receipt({
      ...receiptInput,
      operation: {
        ...sandboxOperation,
        identity: {
          ...sandboxOperation.identity,
          payment: {
            ...sandboxOperation.identity.payment,
            asset: callReceiptAsset,
          },
        },
      },
    })).toBeUndefined()
  })

  it('round-trips receipts through terminal and reconciliation projections', () => {
    const candidate = receipt()
    const row: RecoveryRow = {
      callRef: 'invocation:opaque',
      principalId: 'principal:opaque',
      ownerId: 'owner:opaque',
      credentialId: 'credential:opaque',
      applicationRef: 'application:opaque',
      environment: 'production',
      state: 'refused',
      toolRef: 'operation:opaque',
      inputDigest: 'sha256:input',
      requestDigest: 'sha256:request',
      grantGeneration: 1,
      toolJson: '{}',
      inputJson: '{}',
      updatedAt: 1_700_000_000_000,
      result: {
        kind: 'refused',
        toolRef: 'operation:opaque',
        code: 'provider_output_invalid',
        retryable: false,
        receipt: { ...candidate, state: 'refunded' },
      },
    }
    const status = { control: 'terminal', attempts: [] } as never
    expect(projectPureCallStatus(row, status)).toMatchObject({
      receipt: { state: 'refunded' },
      result: { receipt: { state: 'refunded' } },
    })
    expect(reconciliationResult(row, status, [], 'operation:opaque', { ...candidate, state: 'reconciliation_required' }))
      .toMatchObject({ receipt: { state: 'reconciliation_required' } })
  })
})
