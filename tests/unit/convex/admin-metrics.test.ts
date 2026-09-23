/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../../convex/_generated/api'
import { perthDayWindow } from '../../../convex/lib/adminConsole/metrics/dayWindow'
import type { MarketplaceMetricCounts } from '../../../convex/lib/adminConsole/metrics/write'
import { recordMarketEvidenceFact } from '../../../convex/marketEvidence'
import {
  convexTestWithMarketComponents,
  nonAdmin,
  ownerAdmin,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'

const FIRST_DAY = '2026-09-20'
const SECOND_DAY = '2026-09-21'

function timestampFor(day: string, offsetMs = 60_000): number {
  const window = perthDayWindow(day)
  if (window.kind === 'refused') throw new Error('invalid test day')
  return window.from + offsetMs
}

async function seedDay(
  backend: ConvexFixtureBackend,
  day: string,
  workspaces: readonly string[],
  includeUsage: boolean,
): Promise<void> {
  const createdAt = timestampFor(day)
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
  beforeEach(() => vi.setSystemTime(new Date('2026-09-22T04:00:00.000Z')))
  afterEach(() => vi.useRealTimers())

  it('writes exact daily metrics and replaces the same day idempotently', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDay(backend, FIRST_DAY, ['workspace:one', 'workspace:two'], true)
    await backend.run(async (ctx) => await recordMarketEvidenceFact(ctx, 'ae_invocation', 'orphan', timestampFor(FIRST_DAY)))

    await expect(snapshot(backend, FIRST_DAY)).resolves.toEqual({ kind: 'written', day: FIRST_DAY })
    await expect(snapshot(backend, FIRST_DAY)).resolves.toEqual({ kind: 'written', day: FIRST_DAY })

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

  it('hides incomplete snapshots, then reveals them only after the final write', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_admin-metrics-partial')
    const counts: MarketplaceMetricCounts = {
      settledCallValue: null, money: 'no_settled_usage',
      settledCalls: 0, attemptedCalls: 0, completedCalls: 0, uncertainCalls: 0,
      uncertainCallsOpenAtClose: 0, quotesCreated: 0, quotesConvertedAtClose: 0,
      transactingWorkspaces: 0, transactingAgents: 0, transactingProviders: 0,
      transactingTools: 0, terminalCalls: 0, terminalCallsWithResolution: 0,
    }
    await backend.mutation(internal.adminConsoleMetrics.writeMarketplaceMetricsDay, {
      day: FIRST_DAY, counts, entities: [], replace: true, complete: false,
    })
    const partial = await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })
    expect(partial).toMatchObject({ days: [], partialDays: [FIRST_DAY], latestDay: null })
    await backend.mutation(internal.adminConsoleMetrics.writeMarketplaceMetricsDay, {
      day: FIRST_DAY, entities: [], replace: false, complete: true,
    })
    const complete = await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })
    expect(complete).toMatchObject({ days: [{ complete: true, day: FIRST_DAY }], partialDays: [] })
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
    const admin = await ownerAdmin(backend, 'user_admin-metrics-owner')
    const outsider = await nonAdmin(backend, 'user_admin-metrics-outsider')
    const report = await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })
    expect(report).toMatchObject({ headline: { settledCalls: 2 }, ratios: { successRate: 2 / 3 }, partialDays: [] })
    await expect(outsider.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' }))
      .resolves.toEqual({ kind: 'refused', code: 'missing_membership' })
  })
})
