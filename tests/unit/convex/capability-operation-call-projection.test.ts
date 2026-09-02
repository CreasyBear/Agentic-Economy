/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import { internal } from '../../../convex/_generated/api'
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

describe('Account Call projection', () => {
  it('rebuilds a terminal managed Call exactly once from authoritative invocation evidence', async () => {
    const backend = convexTest(schema, convexModules)
    const operation = buildDevelopmentPublishedOperationEvidence().operation
    const now = Date.UTC(2026, 8, 2, 4, 0, 0)
    const invocationRef = 'operation-invocation:call-projection'
    const result = {
      kind: 'completed' as const,
      invocationRef,
      operationRef: operation.operationId,
      output: { data: { BTC: { symbol: 'BTC', quote: { USD: { price: 1, last_updated: '2026-09-02T04:00:00.000Z' } } } } },
      evidenceHash: 'sha256:call-result',
      receipt: {
        commercialModel: 'account_aud' as const,
        receiptRef: 'receipt:call-projection',
        state: 'settled' as const,
        buyerCharge: { currency: 'AUD', units: '2500000', exponent: 6 },
        serviceFee: { currency: 'AUD', units: '0', exponent: 6 },
        totalBuyerCharge: { currency: 'AUD', units: '2500000', exponent: 6 },
        providerObligation: {
          amount: { currency: 'USDC', units: '1500000', exponent: 6 },
          settlementMethod: 'managed_x402' as const,
          payoutEligible: false as const,
        },
        providerSettlement: {
          amount: { currency: 'USDC', units: '1500000', exponent: 6 },
          network: 'eip155:84532' as const,
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
          transactionHash: '0xsettled',
        },
        priceDigest: operation.priceDigest,
        transactionRef: 'journal:call-reservation:projection',
        accountingTransactionRefs: ['journal:call-reservation:projection'],
        refundState: 'not_applicable' as const,
        lossState: 'none' as const,
        evidenceHash: 'sha256:call-result',
        issuedAt: new Date(now).toISOString(),
      },
    }
    await backend.run(async (ctx) => {
      await ctx.db.insert('capabilityOperationInvocations', {
        commitmentRef: 'operation-commitment:projection',
        invocationRef,
        principalId: 'principal:projection',
        ownerId: 'account:projection',
        credentialId: 'credential:projection',
        applicationRef: 'application:projection',
        operationRef: operation.operationId,
        idempotencyKey: 'idempotency:projection',
        environment: 'sandbox',
        grantRef: 'grant:projection',
        grantGeneration: 1,
        policyDigest: 'sha256:grant',
        grantExpiresAt: now + 60_000,
        operationJson: JSON.stringify(operation),
        inputJson: '{}',
        inputDigest: 'sha256:input',
        requestDigest: 'sha256:request',
        state: 'completed',
        dispatchState: 'completed',
        result,
        evidenceHash: result.evidenceHash,
        attemptRef: 'operation-attempt:projection:1',
        createdAt: now - 250,
        updatedAt: now,
      })
      await ctx.db.insert('moneyProviderObligations', {
        obligationRef: `provider-obligation:${invocationRef}`,
        invocationRef,
        operationRef: operation.operationId,
        providerRef: operation.identity.businessId,
        buyerAccountRef: 'account:projection',
        buyerAsset: 'AUD',
        buyerExponent: 6,
        buyerAmountUnits: '2500000',
        providerAsset: 'USDC',
        providerExponent: 6,
        providerAmountUnits: '1500000',
        settlementMethod: 'managed_x402',
        state: 'settled',
        payoutEligibility: 'ineligible_x402',
        evidenceRefs: ['evidence:projection'],
        createdAt: now - 250,
        updatedAt: now,
        settledAt: now,
      })
    })

    await expect(backend.mutation(internal.capabilityOperationCalls.rebuild, {
      paginationOpts: { numItems: 100, cursor: null },
    })).resolves.toMatchObject({ isDone: true, rebuilt: 1 })
    await expect(backend.mutation(internal.capabilityOperationCalls.rebuild, {
      paginationOpts: { numItems: 100, cursor: null },
    })).resolves.toMatchObject({ isDone: true, rebuilt: 1 })

    const calls = await backend.run(async (ctx) => await ctx.db
      .query('capabilityOperationCallProjections')
      .withIndex('by_accountRef_and_createdAt', (index) => index.eq('accountRef', 'account:projection'))
      .collect())
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      callRef: invocationRef,
      principalRef: 'principal:projection',
      providerRef: operation.identity.businessId,
      operationLabel: operation.contract.name,
      state: 'completed',
      deliveryState: 'delivered',
      paymentState: 'settled',
      providerObligationState: 'settled',
      providerAmountUnits: '1500000',
      audAmountUnits: '2500000',
      receiptRef: 'receipt:call-projection',
      latencyMs: 250,
    })

  })

  it('pages a 10,000-Call fixture through the Account index without exposing another Account', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'call-projection-volume')
    const foreignAccountRef = 'account:foreign-volume'
    await backend.run(async (ctx) => {
      for (let index = 0; index < 10_000; index += 1) {
        const accountRef = index % 2 === 0 ? fixture.canonicalAccountRef : foreignAccountRef
        await ctx.db.insert('capabilityOperationCallProjections', {
          callRef: `call:volume:${index}`,
          accountRef,
          principalRef: index % 4 === 0 ? 'principal:selected' : `principal:${index % 17}`,
          credentialRef: `credential:${index % 23}`,
          applicationRef: `application:${index % 7}`,
          operationRef: `operation:${index % 31}`,
          providerRef: `provider:${index % 11}`,
          operationLabel: `Operation ${index % 31}`,
          state: 'completed',
          deliveryState: 'delivered',
          paymentState: 'settled',
          audAmountUnits: '1000000',
          latencyMs: 25,
          createdAt: index,
          updatedAt: index,
        })
      }
    })

    const listOwnerCalls = anyApi.capabilityOperationCalls?.listOwnerCalls
    if (listOwnerCalls === undefined) throw new Error('Call history query missing')
    const firstPage = await fixture.owner.query(listOwnerCalls, {
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(firstPage.page).toHaveLength(50)
    expect(firstPage.page.every((call: { accountRef: string }) => (
      call.accountRef === fixture.canonicalAccountRef
    ))).toBe(true)

    const selectedAgentPage = await fixture.owner.query(listOwnerCalls, {
      principalRef: 'principal:selected',
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(selectedAgentPage.page).toHaveLength(50)
    expect(selectedAgentPage.page.every((call: { accountRef: string; principalRef: string }) => (
      call.accountRef === fixture.canonicalAccountRef && call.principalRef === 'principal:selected'
    ))).toBe(true)

    const readOwnerUsage = anyApi.capabilityOperationCalls?.readOwnerUsage
    if (readOwnerUsage === undefined) throw new Error('Call usage query missing')
    await expect(fixture.owner.query(readOwnerUsage, {
      dimensionKind: 'account',
      periodStartAt: 0,
      periodEndAt: 10_001,
    })).resolves.toMatchObject({
      kind: 'available',
      dimensionRef: fixture.canonicalAccountRef,
      callCountUnits: '5000',
      completedCountUnits: '5000',
      outcomeUnknownCountUnits: '0',
      source: 'convex_call_evidence',
    })
    await expect(fixture.owner.query(readOwnerUsage, {
      dimensionKind: 'agent',
      dimensionRef: 'principal:selected',
      periodStartAt: 0,
      periodEndAt: 10_001,
    })).resolves.toMatchObject({
      kind: 'available',
      callCountUnits: '2500',
    })

  }, 30_000)
})
