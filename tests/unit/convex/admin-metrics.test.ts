/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../../convex/_generated/api'
import { perthDayWindow, shiftPerthDay } from '../../../convex/lib/adminConsole/metrics/dayWindow'
import { recordMarketEvidenceFact } from '../../../convex/marketEvidence'
import {
  convexTestWithMarketComponents,
  nonAdmin,
  ownerAdmin,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'

const FIRST_DAY = '2026-09-20'
const SECOND_DAY = '2026-09-21'
const FIRST_DAY_UTC_START = Date.parse('2026-09-19T16:00:00.000Z')
const SECOND_DAY_UTC_START = Date.parse('2026-09-20T16:00:00.000Z')

const DAY_UTC_START = {
  [FIRST_DAY]: FIRST_DAY_UTC_START,
  [SECOND_DAY]: SECOND_DAY_UTC_START,
}

async function seedDay(
  backend: ConvexFixtureBackend,
  day: typeof FIRST_DAY | typeof SECOND_DAY,
  workspaces: readonly string[],
  includeUsage: boolean,
  createdAt = DAY_UTC_START[day] + 60_000,
): Promise<void> {
  await backend.run(async (ctx) => {
    for (const [index, workspaceRef] of workspaces.entries()) {
      const callRef = `call:${day}:${index}`
      const quoteRef = `quote:${day}:${index}`
      const principalRef = `principal:${day}:${index}`
      const toolRef = `tool:${day}:${index}`
      await ctx.db.insert('capabilityQuotes', {
        quoteRef,
        principalId: principalRef,
        accountRef: workspaceRef,
        credentialId: `credential:${day}:${index}`,
        applicationRef: `application:${day}:${index}`,
        environment: 'sandbox',
        grantRef: `grant:${day}:${index}`,
        grantGeneration: 1,
        grantPolicyDigest: `digest:grant:${day}:${index}`,
        grantExpiresAt: createdAt + 60_000,
        toolRef,
        toolVersion: 1,
        toolMaterialDigest: `digest:tool:${day}:${index}`,
        currentToolDigest: `digest:current:${day}:${index}`,
        toolJson: '{}',
        normalizedInputJson: '{}',
        inputDigest: `digest:input:${day}:${index}`,
        pricingJson: '{}',
        pricingDigest: `digest:pricing:${day}:${index}`,
        decisionAudUnits: '1000',
        budgetPolicyRef: `budget:${day}:${index}`,
        budgetGeneration: 1,
        maximumSpendPerCallUnits: '1000',
        formanceSchemaVersion: 'v1',
        policyGeneration: 1,
        legalCustomerRef: `customer:${day}:${index}`,
        legalCustomerGeneration: 1,
        buyerRevenueUnits: '909',
        buyerTaxUnits: '91',
        accountAvailableUnits: '10000',
        budgetAvailableUnits: '10000',
        legalExposureAvailableUnits: '10000',
        balanceUnits: '10000',
        commercialPolicyRefs: ['policy:sandbox'],
        commercialPolicyDigest: `digest:commercial:${day}:${index}`,
        evidenceDigest: `digest:evidence:${day}:${index}`,
        state: index === 0 ? 'consumed' : 'issued',
        ...(index === 0 ? { consumedCallRef: callRef } : {}),
        expiresAt: createdAt + 60_000,
        createdAt: createdAt + index,
        updatedAt: createdAt + index,
      })
      await ctx.db.insert('capabilityCalls', {
        quoteRef,
        callRef,
        principalId: principalRef,
        ownerId: workspaceRef,
        credentialId: `credential:${day}:${index}`,
        applicationRef: `application:${day}:${index}`,
        toolRef,
        idempotencyKey: `idempotency:${day}:${index}`,
        environment: 'sandbox',
        grantRef: `grant:${day}:${index}`,
        grantGeneration: 1,
        policyDigest: `digest:grant:${day}:${index}`,
        grantExpiresAt: createdAt + 60_000,
        inputDigest: `digest:input:${day}:${index}`,
        requestDigest: `digest:request:${day}:${index}`,
        state: 'completed',
        ...(includeUsage ? { usage: {
          usageRef: `usage:${day}:${index}`,
          observedAt: createdAt + index,
          chargeState: 'paid',
          amount: { units: index === 0 ? '1500' : '2500', exponent: 2, currency: 'AUD' },
          priceDigest: `digest:price:${day}:${index}`,
        } } : {}),
        createdAt: createdAt + index,
        updatedAt: createdAt + index,
      })
      await ctx.db.insert('capabilityCallProjections', {
        callRef,
        accountRef: workspaceRef,
        principalRef,
        credentialRef: `credential:${day}:${index}`,
        applicationRef: `application:${day}:${index}`,
        toolRef,
        providerRef: `provider:${day}:${index}`,
        toolLabel: `Tool ${index}`,
        state: 'completed',
        deliveryState: 'delivered',
        paymentState: 'settled',
        latencyMs: 10,
        createdAt: createdAt + index,
        updatedAt: createdAt + index,
      })
      await recordMarketEvidenceFact(ctx, 'ae_invocation', callRef, createdAt + index)
      await recordMarketEvidenceFact(ctx, 'ae_invocation_completed', callRef, createdAt + index)
      await recordMarketEvidenceFact(ctx, 'ae_settlement', callRef, createdAt + index)
    }
    if (workspaces.length === 2) {
      const callRef = `call:${day}:uncertain`
      await ctx.db.insert('capabilityCalls', {
        callRef,
        principalId: `principal:${day}:uncertain`,
        ownerId: `workspace:${day}:uncertain`,
        credentialId: `credential:${day}:uncertain`,
        applicationRef: `application:${day}:uncertain`,
        toolRef: `tool:${day}:uncertain`,
        idempotencyKey: `idempotency:${day}:uncertain`,
        environment: 'sandbox',
        grantRef: `grant:${day}:uncertain`,
        grantGeneration: 1,
        policyDigest: `digest:grant:${day}:uncertain`,
        grantExpiresAt: createdAt + 60_000,
        inputDigest: `digest:input:${day}:uncertain`,
        requestDigest: `digest:request:${day}:uncertain`,
        state: 'reconciliation_required',
        reconciliation: {
          reason: 'unknown_settlement',
          disposition: 'manual_review',
          attemptCount: 1,
          nextAttemptAt: createdAt + 60_000,
        },
        createdAt: createdAt + 2,
        updatedAt: createdAt + 2,
      })
      await recordMarketEvidenceFact(ctx, 'ae_invocation', callRef, createdAt + 2)
      await recordMarketEvidenceFact(ctx, 'ae_reconciliation_required', callRef, createdAt + 2)
    }
  })
}

async function snapshot(backend: ConvexFixtureBackend, day: string) {
  return await backend.action(internal.adminConsoleMetrics.snapshotMarketplaceMetricsDay, { day })
}

describe('admin marketplace metrics', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T04:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('assigns Calls on either side of Perth midnight to their respective days', async () => {
    expect(perthDayWindow(FIRST_DAY)).toEqual({
      kind: 'valid', from: FIRST_DAY_UTC_START, toExclusive: SECOND_DAY_UTC_START,
    })
    const backend = convexTestWithMarketComponents()
    await seedDay(backend, FIRST_DAY, ['workspace:before-midnight'], false, SECOND_DAY_UTC_START - 1)
    await seedDay(backend, SECOND_DAY, ['workspace:at-midnight'], false, SECOND_DAY_UTC_START)

    await snapshot(backend, FIRST_DAY)
    await snapshot(backend, SECOND_DAY)
    const days = await backend.run(async (ctx) => await ctx.db.query('marketplaceMetricDays').collect())
    expect(days.map(({ day, attemptedCalls, quotesCreated }) => ({ day, attemptedCalls, quotesCreated })))
      .toEqual([
        { day: FIRST_DAY, attemptedCalls: 1, quotesCreated: 1 },
        { day: SECOND_DAY, attemptedCalls: 1, quotesCreated: 1 },
      ])
  })

  it('uses the selected period for totals and deduplicates Accounts across days', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDay(backend, FIRST_DAY, ['workspace:repeat'], true)
    await seedDay(backend, SECOND_DAY, ['workspace:repeat'], true)
    vi.setSystemTime(new Date('2026-10-15T04:00:00Z'))
    for (let offset = 0; offset < 30; offset += 1) {
      const day = shiftPerthDay('2026-10-14', -offset)
      if (day === null) throw new Error('invalid fixture day')
      await snapshot(backend, day)
    }
    const admin = await ownerAdmin(backend, 'user_admin-range')
    const monthly = await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_30' })
    expect(monthly).toMatchObject({ coverageComplete: true, headline: {
      settledCalls: 2, transactingWorkspaces: 1, successRate: 1,
      settledCallValue: { units: '3000', exponent: 2, currency: 'AUD' },
    } })
    const weekly = await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })
    expect(weekly).toMatchObject({ coverageComplete: true, headline: { settledCalls: 0, transactingWorkspaces: 0 } })
  })

  it('withholds growth when the previous week has incomplete coverage', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDay(backend, FIRST_DAY, ['workspace:prior'], true)
    await snapshot(backend, FIRST_DAY)
    vi.setSystemTime(new Date('2026-09-29T04:00:00Z'))
    for (let offset = 0; offset < 7; offset += 1) {
      const day = shiftPerthDay('2026-09-28', -offset)
      if (day === null) throw new Error('invalid fixture day')
      await snapshot(backend, day)
    }
    const admin = await ownerAdmin(backend, 'user_admin-incomplete-prior')
    expect(await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' }))
      .toMatchObject({ coverageComplete: true, wow: { settledCalls: null, attemptedCalls: null,
        completedCalls: null, transactingWorkspaces: null, quotesCreated: null } })
  })

  it('writes exact daily metrics and replaces the same day idempotently', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDay(backend, FIRST_DAY, ['workspace:one', 'workspace:two'], true)
    await backend.run(async (ctx) => await recordMarketEvidenceFact(ctx, 'ae_invocation', 'orphan', FIRST_DAY_UTC_START + 60_000))

    await expect(snapshot(backend, FIRST_DAY)).resolves.toEqual({ kind: 'written', day: FIRST_DAY })
    await expect(snapshot(backend, FIRST_DAY)).resolves.toEqual({ kind: 'written', day: FIRST_DAY })
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    await backend.finishInProgressScheduledFunctions()

    const state = await backend.run(async (ctx) => ({
      days: await ctx.db.query('marketplaceMetricDays').collect(),
      entities: await ctx.db.query('marketplaceEntityDays').collect(),
    }))
    expect(state.days).toHaveLength(1)
    expect(state.days[0]).toMatchObject({
      complete: true,
      settledCallValue: { units: '4000', exponent: 2, currency: 'AUD' },
      settledCalls: 2,
      attemptedCalls: 3,
      completedCalls: 2,
      uncertainCalls: 1,
      uncertainCallsOpenAtClose: 1,
      terminalCalls: 3,
      quotesCreated: 2,
      quotesConvertedAtClose: 1,
      transactingWorkspaces: 2,
    })
    expect(state.entities).toHaveLength(8)
  })

  it('records no_settled_usage when no paid Call usage exists', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDay(backend, FIRST_DAY, ['workspace:one'], false)
    await snapshot(backend, FIRST_DAY)
    const row = await backend.run(async (ctx) => await ctx.db.query('marketplaceMetricDays').first())
    expect(row).toMatchObject({ complete: true, settledCallValue: null, money: 'no_settled_usage' })
    if (row === null) throw new Error('metrics fixture missing')
    await backend.run(async (ctx) => await ctx.db.patch(row._id, { complete: undefined, money: 'not_configured' }))
    const admin = await ownerAdmin(backend, 'user_admin-metrics-legacy')
    expect(await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' }))
      .toMatchObject({ days: [{ complete: true, money: 'no_settled_usage' }], partialDays: [] })
  })

  it('refuses malformed days, mixed scales and unsupported currency before writing', async () => {
    const backend = convexTestWithMarketComponents()
    await expect(snapshot(backend, '2026-02-31')).resolves.toEqual({
      kind: 'refused',
      code: 'malformed_day',
    })
    await seedDay(backend, FIRST_DAY, ['workspace:one', 'workspace:two'], true)
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityCalls')
        .withIndex('by_callRef', (query) => query.eq('callRef', `call:${FIRST_DAY}:1`)).unique()
      if (row?.usage === undefined) throw new Error('usage fixture missing')
      await ctx.db.patch(row._id, { usage: { ...row.usage, amount: { ...row.usage.amount, exponent: 6 } } })
    })
    await expect(snapshot(backend, FIRST_DAY)).resolves.toEqual({
      kind: 'refused',
      code: 'multiple_currencies',
    })
    await backend.run(async (ctx) => {
      for (const index of [0, 1]) {
        const row = await ctx.db.query('capabilityCalls')
          .withIndex('by_callRef', (query) => query.eq('callRef', `call:${FIRST_DAY}:${index}`)).unique()
        if (row?.usage === undefined) throw new Error('usage fixture missing')
        await ctx.db.patch(row._id, { usage: { ...row.usage, amount: { ...row.usage.amount, currency: 'USD', exponent: 2 } } })
      }
    })
    await expect(snapshot(backend, FIRST_DAY)).resolves.toEqual({
      kind: 'refused',
      code: 'unsupported_currency',
    })
    const rows = await backend.run(async (ctx) => await ctx.db.query('marketplaceMetricDays').collect())
    expect(rows).toEqual([])
  })

  it('counts a Workspace as returning on its next transacting day', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDay(backend, FIRST_DAY, ['workspace:one'], false)
    await snapshot(backend, FIRST_DAY)
    await seedDay(backend, SECOND_DAY, ['workspace:one'], false)
    await snapshot(backend, SECOND_DAY)
    const row = await backend.run(async (ctx) => await ctx.db.query('marketplaceMetricDays')
      .withIndex('by_day', (query) => query.eq('day', SECOND_DAY)).unique())
    expect(row).toMatchObject({ returningWorkspaces: 1, newTransactingWorkspaces: 0 })
  })

  it('keeps a completed snapshot authoritative when a new generation stops after a partial entity batch', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDay(backend, FIRST_DAY, ['workspace:one'], true)
    await snapshot(backend, FIRST_DAY)
    const admin = await ownerAdmin(backend, 'user_admin-metrics-partial')
    const before = await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })
    if ('kind' in before) throw new Error('unexpected_refusal')
    expect(before.headline).toBeNull()
    expect(before.coverageComplete).toBe(false)
    const entityDay = `${FIRST_DAY}#interrupted`
    await backend.mutation(internal.adminConsoleMetrics.startMarketplaceMetricsBuild, { day: FIRST_DAY, entityDay })
    await backend.mutation(internal.adminConsoleMetrics.advanceMarketplaceMetricsBuild, {
      day: FIRST_DAY, entityDay, phase: 'calls', expectedCursor: null,
      nextCursor: 'pending-next-page', done: false,
      calls: [{
        callRef: 'call:interrupted', state: 'completed', openAtSnapshot: false,
        paidAmount: null, workspaceRef: 'workspace:phantom',
        agentRef: 'principal:phantom', providerRef: null, toolRef: 'tool:phantom',
      }],
    })
    const during = await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })
    if ('kind' in during) throw new Error('unexpected_refusal')
    expect(during.days).toEqual(before.days)
    expect(during.days).toEqual([expect.objectContaining({ day: FIRST_DAY, settledCalls: 1 })])
    expect(during.headline).toEqual(before.headline)
    expect(during.partialDays).toEqual([])
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(60 * 60 * 1_000))
    await backend.finishInProgressScheduledFunctions()
    const orphan = await backend.run(async (ctx) => await ctx.db.query('marketplaceEntityDays')
      .withIndex('by_day_and_entityKind', (query) => query.eq('day', `${FIRST_DAY}#interrupted`).eq('entityKind', 'workspace'))
      .first())
    expect(orphan).toBeNull()
    await snapshot(backend, FIRST_DAY)
    const after = await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })
    if ('kind' in after) throw new Error('unexpected_refusal')
    expect(after.headline).toEqual(before.headline)
  })

  it('continues a day past its action page budget without losing the previous exact snapshot', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDay(backend, FIRST_DAY, ['workspace:one'], true)
    await snapshot(backend, FIRST_DAY)
    for (let offset = 0; offset < 205; offset += 25) {
      await backend.run(async (ctx) => {
        for (let index = offset; index < Math.min(offset + 25, 205); index += 1) {
          await ctx.db.insert('capabilityCalls', {
            callRef: `call:bulk:${index}`,
            principalId: `principal:bulk:${index % 2}`,
            ownerId: `workspace:bulk:${index % 3}`,
            credentialId: 'credential:bulk',
            applicationRef: 'application:bulk',
            toolRef: `tool:bulk:${index % 4}`,
            idempotencyKey: `idempotency:bulk:${index}`,
            environment: 'sandbox',
            grantRef: 'grant:bulk',
            grantGeneration: 1,
            policyDigest: 'digest:bulk',
            grantExpiresAt: FIRST_DAY_UTC_START + 120_000,
            inputDigest: 'digest:input',
            requestDigest: `digest:request:${index}`,
            state: 'completed',
            usage: {
              usageRef: `usage:bulk:${index}`,
              observedAt: FIRST_DAY_UTC_START + 60_000 + index,
              chargeState: 'paid',
              amount: { units: '1', exponent: 2, currency: 'AUD' },
              priceDigest: 'digest:price',
            },
            createdAt: FIRST_DAY_UTC_START + 60_000 + index,
            updatedAt: FIRST_DAY_UTC_START + 60_000 + index,
          })
        }
      })
    }
    expect(await snapshot(backend, FIRST_DAY)).toEqual({ kind: 'queued', day: FIRST_DAY })
    const admin = await ownerAdmin(backend, 'user_admin-metrics-bulk')
    const pending = await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })
    if ('kind' in pending) throw new Error('unexpected_refusal')
    expect(pending.days).toEqual([expect.objectContaining({
      day: FIRST_DAY, attemptedCalls: 1, settledCallValue: { units: '1500', exponent: 2, currency: 'AUD' },
    })])
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    await backend.finishInProgressScheduledFunctions()
    const finished = await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })
    if ('kind' in finished) throw new Error('unexpected_refusal')
    expect(finished.days).toEqual([expect.objectContaining({
      day: FIRST_DAY, attemptedCalls: 206, completedCalls: 206, settledCalls: 206,
      transactingWorkspaces: 4, transactingAgents: 3, transactingTools: 5,
      settledCallValue: { units: '1705', exponent: 2, currency: 'AUD' },
    })])
  })

  it('clears more than 1000 stale entity rows in bounded batches on resnapshot', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.run(async (ctx) => {
      for (let index = 0; index < 1001; index += 1) {
        await ctx.db.insert('marketplaceEntityDays', {
          day: FIRST_DAY, entityKind: 'workspace', entityRef: `stale:${index}`,
        })
      }
    })
    await expect(snapshot(backend, FIRST_DAY)).resolves.toEqual({ kind: 'written', day: FIRST_DAY })
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    await backend.finishInProgressScheduledFunctions()
    const state = await backend.run(async (ctx) => ({
      rows: await ctx.db.query('marketplaceEntityDays').collect(),
      metric: await ctx.db.query('marketplaceMetricDays').first(),
    }))
    expect(state.rows).toEqual([])
    expect(state.metric).toMatchObject({ complete: true, attemptedCalls: 0 })
  })

  it('returns ratios to an owner admin and refuses a non-admin', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDay(backend, FIRST_DAY, ['workspace:one', 'workspace:two'], true)
    await snapshot(backend, FIRST_DAY)
    for (const day of ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', SECOND_DAY]) {
      await snapshot(backend, day)
    }
    const admin = await ownerAdmin(backend, 'user_admin-metrics-owner')
    const outsider = await nonAdmin(backend, 'user_admin-metrics-outsider')
    const report = await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })
    expect(report).toMatchObject({ coverageComplete: true, headline: { settledCalls: 2 }, ratios: { successRate: 2 / 3 }, partialDays: [] })
    await expect(outsider.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' }))
      .resolves.toEqual({ kind: 'refused', code: 'missing_membership' })
  })

  it('counts repeat buying Accounts once and keeps promotional-only and foreign-environment activity separate', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDay(backend, FIRST_DAY, ['account:buyer', 'account:promo', 'account:foreign'], true)
    await seedDay(backend, SECOND_DAY, ['account:buyer'], true)
    await backend.run(async ctx => {
      const calls = await ctx.db.query('capabilityCalls').collect()
      for (const call of calls) {
        const promo = call.ownerId === 'account:promo'
        await ctx.db.patch(call._id, {
          environment: call.ownerId === 'account:foreign' ? 'production' : 'sandbox',
          usage: { ...call.usage!, amount: { currency: 'AUD', exponent: 6, units: '1000000' } },
          promotionalCreditAllocation: {
            version: 'ae.promotional-credit-allocation:v1', purchasedUnits: promo ? '0' : '750000',
            grants: [{ grantRef: 'grant:promo', amountUnits: promo ? '1000000' : '250000', expiresAt: SECOND_DAY_UTC_START + 86_400_000 }],
          },
        })
        if (call.ownerId === 'account:foreign') {
          const quote = await ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', call.quoteRef!)).unique()
          await ctx.db.patch(quote!._id, { environment: 'production' })
        }
      }
    })
    for (const day of ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', FIRST_DAY, SECOND_DAY]) await snapshot(backend, day)
    // Rebuilding a day must not duplicate purchased activity or repeat buyers.
    await snapshot(backend, SECOND_DAY)
    const admin = await ownerAdmin(backend, 'user_admin-funded-metrics')
    expect(await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })).toMatchObject({
      environment: 'sandbox', coverageComplete: true,
      funding: { purchasedUnits: '1500000', promotionalUnits: '1500000', customerFundedCalls: 2,
        promotionalOnlyCalls: 1, completedCustomerFundedCalls: 2, buyingAccounts: 1,
        repeatBuyingAccounts: 1, unclassifiedCalls: 0, accountCoverageComplete: true },
      headline: { settledCalls: 3 },
    })
  })

  it('withholds historical snapshots whose environment was never recorded', async () => {
    const backend = convexTestWithMarketComponents()
    await snapshot(backend, FIRST_DAY)
    await backend.run(async ctx => {
      const row = await ctx.db.query('marketplaceMetricDays').first()
      await ctx.db.patch(row!._id, { funding: undefined })
    })
    const admin = await ownerAdmin(backend, 'user_admin-legacy-metrics')
    expect(await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })).toMatchObject({
      coverageComplete: false, days: [], partialDays: [FIRST_DAY], headline: null, funding: null,
    })
  })
  it('replays generation creation and refuses an older generation overwriting a newer publication', async () => {
    const backend = convexTestWithMarketComponents()
    const day = FIRST_DAY
    const older = `${day}#older`
    await backend.mutation(internal.adminConsoleMetrics.startMarketplaceMetricsBuild, { day, entityDay: older })
    await backend.mutation(internal.adminConsoleMetrics.startMarketplaceMetricsBuild, { day, entityDay: older })
    expect(await backend.run(async ctx => (await ctx.db.query('marketplaceMetricBuilds').collect()).length)).toBe(1)
    vi.advanceTimersByTime(1)
    await snapshot(backend, day)
    const current = await backend.run(async ctx => await ctx.db.query('marketplaceMetricDays').first())
    for (const phase of ['calls', 'quotes', 'resolutions'] as const) await backend.mutation(internal.adminConsoleMetrics.advanceMarketplaceMetricsBuild, {
      day, entityDay: older, phase, expectedCursor: null, nextCursor: '', done: true,
    })
    const after = await backend.run(async ctx => await ctx.db.query('marketplaceMetricDays').first())
    expect(after?.entityDay).toBe(current?.entityDay)
    expect(after?.sourceStartedAt).toBe(current?.sourceStartedAt)
  })

})
