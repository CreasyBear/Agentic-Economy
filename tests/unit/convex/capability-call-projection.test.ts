/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import { api, internal } from '../../../convex/_generated/api'
import { buildDevelopmentPublishedToolEvidence } from '../capability-supply/fixtures/development-published-tool-evidence'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

describe('Account Call projection', () => {
  it('observes pending work before a terminal projection, without exposing private input or another Account', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = await publishedBusinessOwner(backend, 'live-call-owner')
    const stranger = await publishedBusinessOwner(backend, 'live-call-stranger')
    const now = Date.now()
    const principalRef = 'principal:live-call'
    const row = {
      quoteRef: 'quote:live', callRef: 'call:live', principalId: principalRef, ownerId: owner.canonicalAccountRef,
      credentialId: 'credential:live', applicationRef: 'agentic-economy', toolRef: 'tool:live', idempotencyKey: 'live-purchase', environment: 'sandbox' as const,
      grantRef: 'grant:live', grantGeneration: 1, policyDigest: 'sha256:policy', grantExpiresAt: now + 60_000,
      toolJson: '{}', inputJson: '{"private":"must stay private"}', inputDigest: 'sha256:input', requestDigest: 'sha256:request',
      state: 'pending' as const, dispatchState: 'enqueued' as const, createdAt: now - 10, updatedAt: now,
    }
    const id = await backend.run(async ctx => {
      await ctx.db.insert('capabilityCalls', { ...row, callRef: 'call:foreign', ownerId: stranger.canonicalAccountRef, createdAt: now })
      return await ctx.db.insert('capabilityCalls', row)
    })
    const read = async () => await owner.owner.query(api.capabilityCallProjections.readOwnerAgentReadback, {
      principalRef, periodStartAt: now - 1_000, periodEndAt: now + 1_000, paginationOpts: { numItems: 50, cursor: null },
    })
    expect(await read()).toMatchObject({ activity: { page: [] }, liveCalls: [{ callRef: row.callRef, phase: 'queued' }] })
    await backend.run(async ctx => { await ctx.db.patch('capabilityCalls', id, { dispatchState: 'running' }) })
    const running = await read()
    expect(running.liveCalls).toEqual([{ callRef: row.callRef, credentialRef: row.credentialId, toolRef: row.toolRef,
      phase: 'running', createdAt: row.createdAt, updatedAt: row.updatedAt }])
    expect(JSON.stringify(running)).not.toContain('must stay private')
    expect(JSON.stringify(running)).not.toContain('call:foreign')
    await backend.run(async ctx => { await ctx.db.patch('capabilityCalls', id, { result: {
      kind: 'needs_authority', callRef: row.callRef, toolRef: row.toolRef,
      authorityRequest: { kind: 'approval_required', toolRef: row.toolRef, consequence: 'read_only', retryClass: 'replayable', dataFields: [] },
    } }) })
    expect((await read()).liveCalls).toMatchObject([{ callRef: row.callRef, phase: 'awaiting_authority' }])
    await backend.run(async ctx => { await ctx.db.patch('capabilityCalls', id, { state: 'reconciliation_required' }) })
    expect((await read()).liveCalls).toMatchObject([{ callRef: row.callRef, phase: 'recovery_required' }])
    // Newer completed Calls cannot displace older unresolved work.
    await backend.run(async ctx => {
      for (let i = 0; i < 60; i++) await ctx.db.insert('capabilityCalls', { ...row, callRef: `call:newer:${i}`, state: 'completed', createdAt: now + i })
    })
    expect((await read()).liveCalls).toEqual(expect.arrayContaining([expect.objectContaining({ callRef: row.callRef, phase: 'recovery_required' })]))
    const older = now - 40 * 24 * 60 * 60 * 1_000
    await backend.run(async ctx => {
      await ctx.db.patch('capabilityCalls', id, { state: 'completed', createdAt: older })
      await ctx.db.insert('capabilityCallProjections', { callRef: row.callRef, accountRef: owner.canonicalAccountRef, principalRef,
        credentialRef: row.credentialId, applicationRef: row.applicationRef, toolRef: row.toolRef, toolLabel: 'Delivered lookup', providerRef: 'provider:lookup',
        state: 'completed', deliveryState: 'delivered', paymentState: 'settled', receiptRef: 'receipt:previous-month', latencyMs: 1, createdAt: older, updatedAt: now })
    })
    const watchedArgs = { principalRef, callRef: row.callRef, periodStartAt: now - 1_000, periodEndAt: now + 1_000, paginationOpts: { numItems: 50, cursor: null } }
    const watched = await owner.owner.query(api.capabilityCallProjections.readOwnerAgentReadback, watchedArgs)
    expect(watched.activity.page).toEqual([])
    expect(watched.watchedCall).toMatchObject({ kind: 'observed', live: { callRef: row.callRef, phase: 'finished' }, activity: { receiptRef: 'receipt:previous-month' } })
    expect(JSON.stringify(watched)).not.toContain('must stay private')
    expect((await stranger.owner.query(api.capabilityCallProjections.readOwnerAgentReadback, watchedArgs)).watchedCall).toEqual({ kind: 'missing' })
    expect((await owner.owner.query(api.capabilityCallProjections.readOwnerAgentReadback, { ...watchedArgs, principalRef: 'principal:other' })).watchedCall).toEqual({ kind: 'missing' })
    await expect(backend.query(api.capabilityCallProjections.readOwnerAgentReadback, {
      principalRef, periodStartAt: now - 1_000, periodEndAt: now + 1_000, paginationOpts: { numItems: 50, cursor: null },
    })).rejects.toThrow('call_history_authentication_required')
  })

  it('keeps provider payload and arbitrary evidence strings outside measurement and projection',async()=>{
    const backend=convexTest(schema,convexModules),operation=buildDevelopmentPublishedToolEvidence().tool
    const sentinel='sk-SENTINEL-PRIVATE-MEASUREMENT',now=Date.UTC(2026,8,2)
    const callRef=`operation-invocation:v1:${'f'.repeat(64)}`
    await backend.run(async ctx=>await ctx.db.insert('capabilityCalls',{
      callRef,ownerId:'account:sentinel',principalId:'principal:sentinel',credentialId:'credential:sentinel',applicationRef:'application:sentinel',toolRef:operation.operationId,
      idempotencyKey:'key:sentinel',environment:'sandbox',grantRef:'grant:sentinel',grantGeneration:1,policyDigest:'sha256:sentinel',grantExpiresAt:Date.now()+10000,
      inputJson:JSON.stringify({Authorization:`Bearer ${sentinel}`}),inputDigest:'sha256:input',requestDigest:'sha256:request',toolJson:JSON.stringify(operation),
      state:'completed',dispatchState:'completed',createdAt:now,updatedAt:now+1000,
      result:{kind:'completed',callRef,toolRef:operation.operationId,evidenceHash:`Authorization: Bearer ${sentinel}`,
        output:{privateText:sentinel,nested:{signedUrl:`https://signed.example?token=${sentinel}`,api_key:sentinel}}},
      usage:{usageRef:'usage:sentinel',observedAt:now,chargeState:'free_tier',amount:{currency:'AUD',units:'0',exponent:6},priceDigest:`api_key=${sentinel}`},
    }))
    await backend.mutation(internal.capabilityCallProjections.rebuild,{paginationOpts:{numItems:100,cursor:null}})
    const measured=await backend.run(async ctx=>await ctx.db.query('capabilityServiceUsageRecords').collect())
    const projected=await backend.run(async ctx=>await ctx.db.query('capabilityCallProjections').collect())
    expect(JSON.stringify(measured)).not.toContain(sentinel)
    expect(JSON.stringify(projected)).not.toContain(sentinel)
    expect(measured[0]?.priceDigest).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(measured[0]).not.toHaveProperty('sourceEvidenceHash')
  })

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
        receiptRef: `receipt:sha256:${'a'.repeat(64)}`,
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
      receiptRef: `receipt:sha256:${'a'.repeat(64)}`,
      latencyMs: 250,
      deliveredRequestUnits: '1',
    })
    const measured = await backend.run(async (ctx) => await ctx.db.query('capabilityServiceUsageRecords')
      .withIndex('by_callRef', (index) => index.eq('callRef', callRef)).unique())
    expect(measured).toMatchObject({ callRef, quantityUnits: '1', quantityExponent: 0,
      unitDefinitionRef: 'delivered_request:v1', occurredAt: now, timeBasis: 'receipt_issued',
      accountRef: 'account:projection', credentialRef: 'credential:projection', environment: 'sandbox' })
    await backend.run(async (ctx) => {
      const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', (index) => index.eq('callRef', callRef)).unique()
      if (call === null) throw new Error('fixture Call missing')
      await ctx.db.patch(call._id, { result: { ...result, receipt: { ...result.receipt, state: 'refunded' } }, updatedAt: now + 86_400_000 })
    })
    await backend.mutation(internal.capabilityCallProjections.rebuild, { paginationOpts: { numItems: 100, cursor: null } })
    expect(await backend.run(async (ctx) => await ctx.db.query('capabilityServiceUsageRecords')
      .withIndex('by_callRef', (index) => index.eq('callRef', callRef)).unique())).toEqual(measured)
    expect(await backend.run(async (ctx) => await ctx.db.query('capabilityCallProjections')
      .withIndex('by_callRef', (index) => index.eq('callRef', callRef)).unique()))
      .toMatchObject({ paymentState: 'released', deliveredRequestUnits: '1', serviceUsageRef: measured?.usageRef })
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

  it.each([
    ['refused', 'not_delivered', 'complete'],
    ['refused', 'unknown', 'incomplete'],
    ['completed', 'delivered', 'incomplete'],
    ['outcome_unknown', 'unknown', 'incomplete'],
  ] as const)('keeps %s / %s without a payment receipt at %s coverage', async (state, deliveryState, amountCoverage) => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, `no-charge-${state}-${deliveryState}`)
    await backend.run(async (ctx) => {
      await ctx.db.insert('capabilityCallProjections', {
        callRef: 'call:no-charge-evidence', accountRef: fixture.canonicalAccountRef,
        principalRef: 'principal:no-charge', credentialRef: 'credential:no-charge', applicationRef: 'application:no-charge',
        toolRef: 'tool:no-charge', providerRef: 'provider:no-charge', toolLabel: 'No-charge evidence',
        state, deliveryState, paymentState: 'not_applicable', audAmountUnits: '3000000',
        latencyMs: 1, createdAt: 10, updatedAt: 11,
      })
    })
    const usageQuery = anyApi.capabilityCallProjections?.readOwnerUsage
    const agentQuery = anyApi.capabilityCallProjections?.readOwnerAgentReadback
    if (usageQuery === undefined || agentQuery === undefined) throw new Error('Owner usage queries missing')
    const usage = await fixture.owner.query(usageQuery, {
      dimensionKind: 'agent', dimensionRef: 'principal:no-charge', periodStartAt: 0, periodEndAt: 100,
    })
    const agent = await fixture.owner.query(agentQuery, { principalRef: 'principal:no-charge', periodStartAt: 0, periodEndAt: 100,
      paginationOpts: { numItems: 50, cursor: null } })
    expect(usage).toMatchObject({ deliveredRequestUnits: '0',
      serviceUnitCoverage: deliveryState === 'not_delivered' ? 'complete' : 'incomplete' })
    for (const result of [usage, agent.usage]) {
      expect(result).toMatchObject({ kind: 'available', callCountUnits: '1', amountCoverage })
      if (amountCoverage === 'complete') expect(result.settledSpendUnits).toBe('0')
      else expect(result).not.toHaveProperty('settledSpendUnits')
    }
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

    const listOwnerCalls = anyApi.capabilityCallProjections?.listOwnerCalls
    const readOwnerUsage = anyApi.capabilityCallProjections?.readOwnerUsage
    if (listOwnerCalls === undefined || readOwnerUsage === undefined) throw new Error('Owner reporting queries missing')
    const scope = { principalRef, periodStartAt: periodStartAt + 1, periodEndAt: periodStartAt + 50 }
    const bounded = await fixture.owner.query(listOwnerCalls, { ...scope, paginationOpts: { numItems: 25, cursor: null } })
    const remaining = await fixture.owner.query(listOwnerCalls, { ...scope, paginationOpts: { numItems: 25, cursor: bounded.continueCursor } })
    const rows = [...bounded.page, ...remaining.page]
    expect(rows).toHaveLength(49)
    expect(rows.every((row: { createdAt: number; principalRef: string; accountRef: string }) => row.createdAt >= scope.periodStartAt
      && row.createdAt < scope.periodEndAt && row.principalRef === principalRef && row.accountRef === fixture.canonicalAccountRef)).toBe(true)
    expect(new Set(rows.map((row: { callRef: string }) => row.callRef)).size).toBe(49)
    await expect(fixture.owner.query(readOwnerUsage, { dimensionKind: 'agent', dimensionRef: principalRef,
      periodStartAt: scope.periodStartAt, periodEndAt: scope.periodEndAt })).resolves.toMatchObject({
      callCountUnits: '49', settledSpendUnits: '49000000', amountCoverage: 'complete',
    })
    await expect(fixture.owner.query(listOwnerCalls, { periodStartAt, paginationOpts: { numItems: 50, cursor: null } }))
      .rejects.toThrow('usage_period_invalid')
    await expect(fixture.owner.query(listOwnerCalls, { ...scope, periodEndAt: scope.periodStartAt,
      paginationOpts: { numItems: 50, cursor: null } })).rejects.toThrow('usage_period_invalid')
    const stranger = await publishedBusinessOwner(backend, 'call-projection-period-stranger')
    await expect(stranger.owner.query(listOwnerCalls, { ...scope, paginationOpts: { numItems: 50, cursor: null } }))
      .resolves.toMatchObject({ page: [], isDone: true })
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
    await expect(fixture.owner.query(listOwnerCalls, {
      periodStartAt: 0, periodEndAt: 400 * 86_400_000, paginationOpts: { numItems: 50, cursor: null },
    })).resolves.toMatchObject({ isDone: false, page: expect.any(Array) })
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
      periodEndAt: 2_000,
    })).resolves.toMatchObject({
      kind: 'available',
      dimensionRef: fixture.canonicalAccountRef,
      callCountUnits: '1000',
      completedCountUnits: '1000',
      outcomeUnknownCountUnits: '0',
      source: 'convex_call_evidence',
    })
    await expect(fixture.owner.query(readOwnerUsage, {
      dimensionKind: 'agent',
      dimensionRef: 'principal:selected',
      periodStartAt: 0,
      periodEndAt: 2_000,
    })).resolves.toMatchObject({
      kind: 'available',
      callCountUnits: '500',
    })

    await backend.run(async (ctx) => {
      for (let index = 0; index < 5_001; index += 1) {
        await ctx.db.insert('capabilityCallProjections', {
          callRef: `call:overflow:${index}`, accountRef: fixture.canonicalAccountRef,
          principalRef: 'principal:overflow', credentialRef: 'credential:overflow', applicationRef: 'application:overflow',
          toolRef: 'tool:overflow', providerRef: 'provider:overflow', toolLabel: 'Overflow Tool',
          state: 'completed', deliveryState: 'delivered', paymentState: 'settled', audAmountUnits: '1',
          latencyMs: 1, createdAt: 1, updatedAt: 1,
        })
      }
    })
    await expect(fixture.owner.query(readOwnerUsage, { dimensionKind: 'account', periodStartAt: 0, periodEndAt: 10_001 }))
      .resolves.toEqual({ kind: 'unavailable', code: 'usage_window_too_large' })
    await expect(fixture.owner.query(listOwnerCalls, {
      periodStartAt: 0, periodEndAt: 10_001, paginationOpts: { numItems: 50, cursor: null },
    })).resolves.toMatchObject({ isDone: false, page: expect.any(Array) })

  }, 30_000)

  it('reconciles Call records across Operator Logs, Usage, Spend, and Provider obligations without drift', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'cross-surface-reconcile')
    const operation = buildDevelopmentPublishedToolEvidence().tool
    const principalRef = 'principal:cross-surface-reconcile'
    const periodStartAt = Date.UTC(2026, 8, 10)
    const periodEndAt = Date.UTC(2026, 8, 11)
    const settledAt = periodStartAt + 100
    const uncertainAt = periodStartAt + 200
    const settledCallRef = 'operation-invocation:cross-surface-settled'
    const uncertainCallRef = 'operation-invocation:cross-surface-uncertain'
    const settledReceipt = {
      commercialModel: 'account_aud' as const,
      receiptRef: 'receipt:cross-surface-settled',
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
        transactionHash: '0xsettled-cross-surface',
      },
      priceDigest: operation.priceDigest,
      transactionRef: 'journal:call-reservation:cross-surface-settled',
      accountingTransactionRefs: ['journal:call-reservation:cross-surface-settled'],
      refundState: 'not_applicable' as const,
      lossState: 'none' as const,
      evidenceHash: 'sha256:cross-surface-settled',
      issuedAt: new Date(settledAt).toISOString(),
    }
    const uncertainProviderAmount = { currency: 'USDC', units: '1000000', exponent: 6 }
    const uncertainReceipt = {
      commercialModel: 'account_aud' as const,
      receiptRef: 'receipt:cross-surface-uncertain',
      state: 'reconciliation_required' as const,
      buyerCharge: { currency: 'AUD', units: '1000000', exponent: 6 },
      serviceFee: { currency: 'AUD', units: '0', exponent: 6 },
      totalBuyerCharge: { currency: 'AUD', units: '1000000', exponent: 6 },
      providerObligation: {
        amount: uncertainProviderAmount,
        settlementMethod: 'managed_x402' as const,
        payoutEligible: false as const,
      },
      providerSettlement: {
        amount: uncertainProviderAmount,
        network: 'eip155:84532' as const,
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
      },
      priceDigest: operation.priceDigest,
      transactionRef: 'journal:call-reservation:cross-surface-uncertain',
      accountingTransactionRefs: ['journal:call-reservation:cross-surface-uncertain'],
      refundState: 'unknown' as const,
      lossState: 'unknown' as const,
      evidenceHash: 'sha256:cross-surface-uncertain',
      issuedAt: new Date(uncertainAt).toISOString(),
    }
    const callBase = {
      principalId: principalRef,
      ownerId: fixture.canonicalAccountRef,
      credentialId: 'credential:cross-surface-reconcile',
      applicationRef: 'application:cross-surface-reconcile',
      toolRef: operation.operationId,
      environment: 'sandbox' as const,
      grantRef: 'grant:cross-surface-reconcile',
      grantGeneration: 1,
      policyDigest: 'sha256:grant-cross-surface',
      grantExpiresAt: periodEndAt + 60_000,
      toolJson: JSON.stringify(operation),
      inputJson: '{}',
      inputDigest: 'sha256:input-cross-surface',
      requestDigest: 'sha256:request-cross-surface',
      quoteRef: 'operation-commitment:cross-surface',
    }
    await backend.run(async (ctx) => {
      await ctx.db.insert('capabilityCalls', {
        ...callBase,
        callRef: settledCallRef,
        idempotencyKey: 'idempotency:cross-surface-settled',
        state: 'completed',
        dispatchState: 'completed',
        result: {
          kind: 'completed',
          callRef: settledCallRef,
          toolRef: operation.operationId,
          output: { ok: true },
          evidenceHash: settledReceipt.evidenceHash,
          receipt: settledReceipt,
        },
        evidenceHash: settledReceipt.evidenceHash,
        attemptRef: 'operation-attempt:cross-surface-settled',
        createdAt: settledAt - 50,
        updatedAt: settledAt,
      })
      await ctx.db.insert('capabilityCalls', {
        ...callBase,
        callRef: uncertainCallRef,
        idempotencyKey: 'idempotency:cross-surface-uncertain',
        state: 'reconciliation_required',
        dispatchState: 'reconciliation_required',
        result: {
          kind: 'reconciliation_required',
          callRef: uncertainCallRef,
          toolRef: operation.operationId,
          evidence: {
            attemptRef: 'operation-attempt:cross-surface-uncertain',
            effectGeneration: 1,
            requiredAt: uncertainReceipt.issuedAt,
            retry: 'reconcile_before_retry',
            evidenceSource: 'test:cross-surface-reconcile',
          },
          receipt: uncertainReceipt,
        },
        evidenceHash: uncertainReceipt.evidenceHash,
        attemptRef: 'operation-attempt:cross-surface-uncertain',
        createdAt: uncertainAt - 50,
        updatedAt: uncertainAt,
      })
      await ctx.db.insert('moneyProviderObligations', {
        obligationRef: `provider-obligation:${settledCallRef}`,
        callRef: settledCallRef,
        toolRef: operation.operationId,
        providerRef: operation.identity.businessId,
        buyerAccountRef: fixture.canonicalAccountRef,
        buyerAsset: 'AUD',
        buyerExponent: 6,
        buyerAmountUnits: '2500000',
        providerAsset: 'USDC',
        providerExponent: 6,
        providerAmountUnits: '1500000',
        settlementMethod: 'managed_x402',
        state: 'settled',
        payoutEligibility: 'ineligible_x402',
        evidenceRefs: ['evidence:cross-surface-settled'],
        createdAt: settledAt - 50,
        updatedAt: settledAt,
        settledAt,
      })
    })

    await expect(backend.mutation(internal.capabilityCallProjections.rebuild, {
      paginationOpts: { numItems: 100, cursor: null },
    })).resolves.toMatchObject({ isDone: true, rebuilt: 2 })

    const listOwnerCalls = anyApi.capabilityCallProjections?.listOwnerCalls
    if (listOwnerCalls === undefined) throw new Error('Call history query missing')
    const activityPage = await fixture.owner.query(listOwnerCalls, {
      principalRef,
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(activityPage.page).toHaveLength(2)
    expect(activityPage.page.find((call: { callRef: string }) => call.callRef === settledCallRef))
      .toMatchObject({
        paymentState: 'settled',
        deliveryState: 'delivered',
        audAmountUnits: '2500000',
        providerAmountUnits: '1500000',
      })
    expect(activityPage.page.find((call: { callRef: string }) => call.callRef === uncertainCallRef))
      .toMatchObject({
        paymentState: 'unknown',
        deliveryState: 'unknown',
        audAmountUnits: '1000000',
        recoveryRef: uncertainCallRef,
      })

    const readOwnerAgentReadback = anyApi.capabilityCallProjections?.readOwnerAgentReadback
    if (readOwnerAgentReadback === undefined) throw new Error('Owner Agent readback query missing')
    const combinedReadback = await fixture.owner.query(readOwnerAgentReadback, {
      principalRef,
      periodStartAt,
      periodEndAt,
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(combinedReadback.usage).toMatchObject({
      kind: 'available',
      callCountUnits: '2',
      completedCountUnits: '1',
      outcomeUnknownCountUnits: '1',
      amountCoverage: 'incomplete',
    })
    expect(combinedReadback.usage).not.toHaveProperty('settledSpendUnits')

    const settledOnlyReadback = await fixture.owner.query(readOwnerAgentReadback, {
      principalRef,
      periodStartAt,
      periodEndAt: settledAt + 1,
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(settledOnlyReadback.usage).toMatchObject({
      kind: 'available',
      callCountUnits: '1',
      amountCoverage: 'complete',
      settledSpendUnits: '2500000',
    })

    const obligations = await backend.run(async (ctx) => {
      const settled = await ctx.db.query('moneyProviderObligations')
        .withIndex('by_callRef', (index) => index.eq('callRef', settledCallRef))
        .unique()
      const uncertain = await ctx.db.query('moneyProviderObligations')
        .withIndex('by_callRef', (index) => index.eq('callRef', uncertainCallRef))
        .unique()
      return { settled, uncertain }
    })
    expect(obligations.settled).toEqual(expect.objectContaining({
      obligationRef: `provider-obligation:${settledCallRef}`,
      state: 'settled',
      buyerAmountUnits: '2500000',
      providerAmountUnits: '1500000',
      payoutEligibility: 'ineligible_x402',
      settledAt,
    }))
    expect(obligations.uncertain).toBeNull()

    const projectionsBeforeRebuild = await backend.run(async (ctx) => await ctx.db
      .query('capabilityCallProjections')
      .withIndex('by_accountRef_and_createdAt', (index) => index.eq('accountRef', fixture.canonicalAccountRef))
      .collect())
    expect(projectionsBeforeRebuild).toHaveLength(2)

    await expect(backend.mutation(internal.capabilityCallProjections.rebuild, {
      paginationOpts: { numItems: 100, cursor: null },
    })).resolves.toMatchObject({ isDone: true, rebuilt: 2 })
    await expect(backend.mutation(internal.capabilityCallProjections.rebuild, {
      paginationOpts: { numItems: 100, cursor: null },
    })).resolves.toMatchObject({ isDone: true, rebuilt: 2 })

    const projectionsAfterRebuild = await backend.run(async (ctx) => await ctx.db
      .query('capabilityCallProjections')
      .withIndex('by_accountRef_and_createdAt', (index) => index.eq('accountRef', fixture.canonicalAccountRef))
      .collect())
    expect(projectionsAfterRebuild).toHaveLength(2)
    expect(projectionsAfterRebuild.map((row) => ({
      callRef: row.callRef,
      audAmountUnits: row.audAmountUnits,
      providerAmountUnits: row.providerAmountUnits,
      paymentState: row.paymentState,
      deliveryState: row.deliveryState,
      recoveryRef: row.recoveryRef,
    }))).toEqual(projectionsBeforeRebuild.map((row) => ({
      callRef: row.callRef,
      audAmountUnits: row.audAmountUnits,
      providerAmountUnits: row.providerAmountUnits,
      paymentState: row.paymentState,
      deliveryState: row.deliveryState,
      recoveryRef: row.recoveryRef,
    })))
  })
})
