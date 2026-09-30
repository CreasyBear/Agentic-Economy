/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import { materializePurchaseResolutionRecord } from '../../../convex/lib/capabilityExecution/callLifecycle/purchaseResolutionMaterialize'
import { buildDevelopmentPublishedToolEvidence } from '../capability-supply/fixtures/development-published-tool-evidence'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

describe('purchaseResolutionRecords materialization', () => {
  it.each([
    { purchased: undefined, amount: '6000000', revenue: '5454545', gst: '545455' },
    { purchased: '3000000', amount: '3000000', revenue: '2727273', gst: '272727' },
    { purchased: '0', amount: '0', revenue: '0', gst: '0' },
  ])('materializes purchased consideration once without promotional GST: $purchased', async ({ purchased, amount, revenue, gst }) => {
    const backend = convexTest(schema, convexModules)
    const operation = buildDevelopmentPublishedToolEvidence().tool
    const now = Date.UTC(2026, 8, 17, 4, 0, 0)
    const callRef = 'operation-invocation:purchase-resolution-materialize'
    const quoteRef = 'operation-commitment:purchase-resolution-materialize'
    const projection = {
      kind: 'completed' as const,
      callRef,
      toolRef: operation.operationId,
      output: { ok: true },
      evidenceHash: 'sha256:call-result',
      receipt: {
        commercialModel: 'account_aud' as const,
        receiptRef: 'receipt:purchase-resolution',
        state: 'settled' as const,
        buyerCharge: { currency: 'AUD', units: '6000000', exponent: 6 },
        serviceFee: { currency: 'AUD', units: '0', exponent: 6 },
        totalBuyerCharge: { currency: 'AUD', units: '6000000', exponent: 6 },
        providerObligation: {
          amount: { currency: 'USDC', units: '1500000', exponent: 6 },
          settlementMethod: 'managed_x402' as const,
          payoutEligible: false as const,
        },
        providerSettlement: {
          amount: { currency: 'USDC', units: '1500000', exponent: 6 },
          network: 'eip155:84532' as const,
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
        },
        priceDigest: operation.priceDigest,
        refundState: 'not_applicable' as const,
        lossState: 'none' as const,
        evidenceHash: 'sha256:call-result',
        issuedAt: new Date(now).toISOString(),
      },
    }
    await backend.run(async (ctx) => {
      await ctx.db.insert('capabilityQuotes', {
        quoteRef,
        principalId: 'principal:agent',
        accountRef: 'account:customer',
        credentialId: 'credential:agent',
        applicationRef: 'application:agent',
        environment: 'sandbox',
        grantRef: 'grant:agent',
        grantGeneration: 1,
        grantPolicyDigest: 'sha256:grant',
        grantExpiresAt: now + 60_000,
        toolRef: operation.operationId,
        toolVersion: 1,
        toolMaterialDigest: 'sha256:tool',
        currentToolDigest: 'sha256:current',
        toolJson: JSON.stringify(operation),
        normalizedInputJson: '{}',
        inputDigest: 'sha256:input',
        pricingJson: '{}',
        pricingDigest: 'sha256:pricing',
        decisionAudUnits: '6000000',
        sourceUsdcUnits: '1500000',
        budgetPolicyRef: 'budget:agent',
        budgetGeneration: 1,
        maximumSpendPerCallUnits: '6000000',
        formanceSchemaVersion: 'v1',
        policyGeneration: 1,
        legalCustomerRef: 'legal-customer:buyer',
        legalCustomerGeneration: 1,
        buyerRevenueUnits: '5454545',
        buyerTaxUnits: '545455',
        accountAvailableUnits: '10000000',
        budgetAvailableUnits: '10000000',
        legalExposureAvailableUnits: '10000000',
        balanceUnits: '10000000',
        commercialPolicyRefs: ['policy:sandbox'],
        commercialPolicyDigest: 'sha256:policy',
        evidenceDigest: 'sha256:evidence',
        state: 'consumed',
        consumedCallRef: callRef,
        expiresAt: now + 60_000,
        createdAt: now - 1_000,
        updatedAt: now - 500,
      })
      await ctx.db.insert('capabilityCalls', {
        ...(purchased === undefined ? {} : { promotionalCreditAllocation: {
          version: 'ae.promotional-credit-allocation:v1' as const,
          purchasedUnits: purchased,
          grants: [{ grantRef: 'promo:test', amountUnits: (6000000n - BigInt(purchased)).toString(), expiresAt: now + 60_000 }],
        } }),
        quoteRef,
        callRef,
        principalId: 'principal:agent',
        ownerId: 'account:customer',
        credentialId: 'credential:agent',
        applicationRef: 'application:agent',
        toolRef: operation.operationId,
        idempotencyKey: 'idempotency:purchase-resolution',
        environment: 'sandbox',
        grantRef: 'grant:agent',
        grantGeneration: 1,
        policyDigest: 'sha256:grant',
        grantExpiresAt: now + 60_000,
        toolJson: JSON.stringify(operation),
        inputJson: '{}',
        inputDigest: 'sha256:input',
        requestDigest: 'sha256:request',
        state: 'completed',
        dispatchState: 'completed',
        result: projection,
        evidenceHash: projection.evidenceHash,
        createdAt: now - 250,
        updatedAt: now,
      })
      await ctx.db.insert('moneyProviderObligations', {
        obligationRef: `provider-obligation:${callRef}`,
        callRef,
        toolRef: operation.operationId,
        providerRef: operation.identity.businessId,
        buyerAccountRef: 'account:customer',
        buyerAsset: 'AUD',
        buyerExponent: 6,
        buyerAmountUnits: '6000000',
        providerAsset: 'USDC',
        providerExponent: 6,
        providerAmountUnits: '1500000',
        settlementMethod: 'managed_x402',
        state: 'settled',
        payoutEligibility: 'ineligible_x402',
        evidenceRefs: ['evidence:purchase-resolution'],
        createdAt: now - 250,
        updatedAt: now,
        settledAt: now,
      })
      const row = await ctx.db.query('capabilityCalls')
        .withIndex('by_callRef', (index) => index.eq('callRef', callRef))
        .unique()
      if (row === null) throw new Error('call_missing')
      await materializePurchaseResolutionRecord(ctx, row, {
        state: 'completed',
        result: projection,
        dispatchState: 'completed',
      }, now)
      await materializePurchaseResolutionRecord(ctx, row, {
        state: 'completed',
        result: projection,
        dispatchState: 'completed',
      }, now)
    })

    const records = await backend.run(async (ctx) => await ctx.db
      .query('purchaseResolutionRecords')
      .withIndex('by_callRef', (index) => index.eq('callRef', callRef))
      .collect())
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      callRef,
      quoteRef,
      accountRef: 'account:customer',
      customerRef: 'legal-customer:buyer',
      agentPrincipalRef: 'principal:agent',
      providerRef: operation.identity.businessId,
      paymentRecipientRef: operation.identity.paymentRecipient,
      terminalState: 'completed',
      considerationAmount: { currency: 'AUD', units: amount, exponent: 6 },
      considerationNetUnits: revenue,
      considerationGstUnits: gst,
      providerObligationAmount: { currency: 'USDC', units: '1500000', exponent: 6 },
    })
    expect(records[0]?.sellerRef).toMatch(/^ae\.seller:/)
    expect(records[0]?.sellerRef).not.toBe(records[0]?.providerRef)
    expect(records[0]?.providerRef).not.toBe(records[0]?.paymentRecipientRef)
  })
})
