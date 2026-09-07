/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import { internal } from '../../../convex/_generated/api'
import { buildDevelopmentPublishedToolEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-tool-evidence'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

describe('Account Call projection', () => {
  it('rebuilds a terminal managed Call exactly once from authoritative invocation evidence', async () => {
    const backend = convexTest(schema, convexModules)
    const operation = buildDevelopmentPublishedToolEvidence().tool
    const now = Date.UTC(2026, 8, 2, 4, 0, 0)
    const callRef = 'operation-invocation:call-projection'
    const result = {
      kind: 'completed' as const,
      callRef,
      toolRef: operation.operationId,
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
      await ctx.db.insert('capabilityCalls', {
        quoteRef: 'operation-commitment:projection',
        callRef,
        principalId: 'principal:projection',
        ownerId: 'account:projection',
        credentialId: 'credential:projection',
        applicationRef: 'application:projection',
        toolRef: operation.operationId,
        idempotencyKey: 'idempotency:projection',
        environment: 'sandbox',
        grantRef: 'grant:projection',
        grantGeneration: 1,
        policyDigest: 'sha256:grant',
        grantExpiresAt: now + 60_000,
        toolJson: JSON.stringify(operation),
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
        obligationRef: `provider-obligation:${callRef}`,
        callRef,
        toolRef: operation.operationId,
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

    await expect(backend.mutation(internal.capabilityCallProjections.rebuild, {
      paginationOpts: { numItems: 100, cursor: null },
    })).resolves.toMatchObject({ isDone: true, rebuilt: 1 })
    await expect(backend.mutation(internal.capabilityCallProjections.rebuild, {
      paginationOpts: { numItems: 100, cursor: null },
    })).resolves.toMatchObject({ isDone: true, rebuilt: 1 })

    const calls = await backend.run(async (ctx) => await ctx.db
      .query('capabilityCallProjections')
      .withIndex('by_accountRef_and_createdAt', (index) => index.eq('accountRef', 'account:projection'))
      .collect())
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      callRef,
      principalRef: 'principal:projection',
      providerRef: operation.identity.businessId,
      toolLabel: operation.contract.name,
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

  it('reads owner Agent Calls for the created UTC period and keeps settled spend evidence explicit', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'call-projection-owner-readback')
    const foreignAccountRef = 'account:foreign-owner-readback'
    const principalRef = 'principal:owner-readback'
    const completePrincipalRef = 'principal:complete-readback'
    const periodStartAt = Date.UTC(2026, 8, 1)
    const periodEndAt = Date.UTC(2026, 9, 1)
    const base = {
      accountRef: fixture.canonicalAccountRef,
      applicationRef: 'application:owner-readback',
      toolRef: 'tool:owner-readback',
      providerRef: 'provider:owner-readback',
      toolLabel: 'Owner readback Tool',
      latencyMs: 10,
      updatedAt: periodStartAt + 10,
    }
    await backend.run(async (ctx) => {
      const rows = [
        {
          ...base, callRef: 'call:owner-settled', principalRef, credentialRef: 'credential:old',
          state: 'completed' as const, deliveryState: 'delivered' as const, paymentState: 'settled' as const,
          audAmountUnits: '2000000', createdAt: periodStartAt,
        },
        {
          ...base, callRef: 'call:owner-released', principalRef, credentialRef: 'credential:old',
          state: 'completed' as const, deliveryState: 'delivered' as const, paymentState: 'released' as const,
          audAmountUnits: '8000000', createdAt: periodStartAt + 1,
        },
        {
          ...base, callRef: 'call:owner-unknown', principalRef, credentialRef: 'credential:new',
          state: 'outcome_unknown' as const, deliveryState: 'unknown' as const, paymentState: 'unknown' as const,
          audAmountUnits: '7000000', recoveryRef: 'call:owner-unknown', createdAt: periodStartAt + 2,
        },
        {
          ...base, callRef: 'call:owner-fallback-usage', principalRef, credentialRef: 'credential:new',
          state: 'completed' as const, deliveryState: 'delivered' as const, paymentState: 'not_applicable' as const,
          audAmountUnits: '3000000', createdAt: periodStartAt + 3,
        },
        {
          ...base, callRef: 'call:owner-missing-amount', principalRef, credentialRef: 'credential:new',
          state: 'completed' as const, deliveryState: 'delivered' as const, paymentState: 'settled' as const,
          createdAt: periodStartAt + 4,
        },
        {
          ...base, callRef: 'call:owner-at-end', principalRef, credentialRef: 'credential:new',
          state: 'completed' as const, deliveryState: 'delivered' as const, paymentState: 'settled' as const,
          audAmountUnits: '9000000', createdAt: periodEndAt,
        },
        {
          ...base, accountRef: foreignAccountRef, callRef: 'call:foreign', principalRef, credentialRef: 'credential:foreign',
          state: 'completed' as const, deliveryState: 'delivered' as const, paymentState: 'settled' as const,
          audAmountUnits: '11000000', createdAt: periodStartAt + 5,
        },
        {
          ...base, callRef: 'call:complete-settled', principalRef: completePrincipalRef, credentialRef: 'credential:complete-old',
          state: 'completed' as const, deliveryState: 'delivered' as const, paymentState: 'settled' as const,
          audAmountUnits: '2000000', createdAt: periodStartAt + 6,
        },
        {
          ...base, callRef: 'call:complete-released', principalRef: completePrincipalRef, credentialRef: 'credential:complete-new',
          state: 'completed' as const, deliveryState: 'delivered' as const, paymentState: 'released' as const,
          audAmountUnits: '8000000', createdAt: periodStartAt + 7,
        },
      ]
      for (const row of rows) await ctx.db.insert('capabilityCallProjections', row)
    })

    const readOwnerAgentReadback = anyApi.capabilityCallProjections?.readOwnerAgentReadback
    if (readOwnerAgentReadback === undefined) throw new Error('Owner Agent readback query missing')
    const readback = await fixture.owner.query(readOwnerAgentReadback, {
      principalRef,
      periodStartAt,
      periodEndAt,
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(readback.activity.page.map((call: { callRef: string }) => call.callRef)).toEqual([
      'call:owner-missing-amount',
      'call:owner-fallback-usage',
      'call:owner-unknown',
      'call:owner-released',
      'call:owner-settled',
    ])
    expect(readback.activity.page.every((call: { accountRef: string; principalRef: string; createdAt: number }) => (
      call.accountRef === fixture.canonicalAccountRef
      && call.principalRef === principalRef
      && call.createdAt >= periodStartAt
      && call.createdAt < periodEndAt
    ))).toBe(true)
    expect(readback.activity.page.find((call: { callRef: string }) => call.callRef === 'call:owner-unknown'))
      .toMatchObject({ paymentState: 'unknown', recoveryRef: 'call:owner-unknown' })
    expect(readback.usage).toMatchObject({
      kind: 'available',
      dimensionKind: 'agent',
      dimensionRef: principalRef,
      periodStartAt,
      periodEndAt,
      callCountUnits: '5',
      completedCountUnits: '4',
      outcomeUnknownCountUnits: '1',
      amountCoverage: 'incomplete',
    })
    expect(readback.usage).not.toHaveProperty('settledSpendUnits')

    await expect(fixture.owner.query(readOwnerAgentReadback, {
      principalRef: completePrincipalRef,
      periodStartAt,
      periodEndAt,
      paginationOpts: { numItems: 50, cursor: null },
    })).resolves.toMatchObject({
      usage: {
        kind: 'available',
        callCountUnits: '2',
        completedCountUnits: '2',
        outcomeUnknownCountUnits: '0',
        amountCoverage: 'complete',
        settledSpendUnits: '2000000',
      },
    })

    const stranger = await publishedBusinessOwner(backend, 'call-projection-stranger-readback')
    await expect(stranger.owner.query(readOwnerAgentReadback, {
      principalRef,
      periodStartAt,
      periodEndAt,
      paginationOpts: { numItems: 50, cursor: null },
    })).resolves.toMatchObject({
      activity: { page: [] },
      usage: { kind: 'empty', dimensionKind: 'agent', dimensionRef: principalRef, periodStartAt, periodEndAt },
    })
    await expect(backend.query(readOwnerAgentReadback, {
      principalRef,
      periodStartAt,
      periodEndAt,
      paginationOpts: { numItems: 50, cursor: null },
    })).rejects.toThrow('call_history_authentication_required')
    await expect(fixture.owner.query(readOwnerAgentReadback, {
      principalRef,
      periodStartAt,
      periodEndAt,
      paginationOpts: { numItems: 51, cursor: null },
    })).rejects.toThrow('call_history_page_size_invalid')
  })

  it('keeps Agent activity at 50 rows with an opaque continuation separate from directory paging', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'call-projection-agent-page')
    const principalRef = 'principal:page-readback'
    const periodStartAt = Date.UTC(2026, 8, 1)
    const periodEndAt = Date.UTC(2026, 9, 1)
    await backend.run(async (ctx) => {
      for (let index = 0; index < 51; index += 1) {
        await ctx.db.insert('capabilityCallProjections', {
          callRef: `call:page:${index}`,
          accountRef: fixture.canonicalAccountRef,
          principalRef,
          credentialRef: index < 25 ? 'credential:page-old' : 'credential:page-new',
          applicationRef: 'application:page',
          toolRef: 'tool:page',
          providerRef: 'provider:page',
          toolLabel: 'Page Tool',
          state: 'completed',
          deliveryState: 'delivered',
          paymentState: 'settled',
          audAmountUnits: '1000000',
          latencyMs: 1,
          createdAt: periodStartAt + index,
          updatedAt: periodStartAt + index,
        })
      }
    })
    const readOwnerAgentReadback = anyApi.capabilityCallProjections?.readOwnerAgentReadback
    if (readOwnerAgentReadback === undefined) throw new Error('Owner Agent readback query missing')
    const firstPage = await fixture.owner.query(readOwnerAgentReadback, {
      principalRef,
      periodStartAt,
      periodEndAt,
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(firstPage.activity.page).toHaveLength(50)
    expect(firstPage.activity.isDone).toBe(false)
    expect(firstPage.activity.continueCursor).toBeTruthy()
    expect(firstPage.activity.page[0]?.createdAt).toBe(periodStartAt + 50)
    expect(firstPage.usage).toMatchObject({ callCountUnits: '51', settledSpendUnits: '51000000', amountCoverage: 'complete' })

    const secondPage = await fixture.owner.query(readOwnerAgentReadback, {
      principalRef,
      periodStartAt,
      periodEndAt,
      paginationOpts: { numItems: 50, cursor: firstPage.activity.continueCursor },
    })
    expect(secondPage.activity.page).toHaveLength(1)
    expect(secondPage.activity.isDone).toBe(true)
    expect(secondPage.activity.page[0]?.createdAt).toBe(periodStartAt)
  })

  it('pages a 10,000-Call fixture through the Account index without exposing another Account', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'call-projection-volume')
    const foreignAccountRef = 'account:foreign-volume'
    await backend.run(async (ctx) => {
      for (let index = 0; index < 10_000; index += 1) {
        const accountRef = index % 2 === 0 ? fixture.canonicalAccountRef : foreignAccountRef
        await ctx.db.insert('capabilityCallProjections', {
          callRef: `call:volume:${index}`,
          accountRef,
          principalRef: index % 4 === 0 ? 'principal:selected' : `principal:${index % 17}`,
          credentialRef: `credential:${index % 23}`,
          applicationRef: `application:${index % 7}`,
          toolRef: `operation:${index % 31}`,
          providerRef: `provider:${index % 11}`,
          toolLabel: `Tool ${index % 31}`,
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

    const listOwnerCalls = anyApi.capabilityCallProjections?.listOwnerCalls
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

    const readOwnerUsage = anyApi.capabilityCallProjections?.readOwnerUsage
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
