/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../../convex/_generated/api'
import { perthDayWindow } from '../../../convex/lib/adminConsole/metrics/dayWindow'
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
      if (includeUsage) {
        await ctx.db.insert('moneyUsageEvents', {
          usageRef: `usage:${day}:${index}`,
          principalId: principalRef,
          accountId: workspaceRef,
          credentialId: `credential:${day}:${index}`,
          currency: 'AUD',
          exponent: 2,
          serviceRef: `service:${day}:${index}`,
          offeringRef: toolRef,
          businessId: `provider:${day}:${index}`,
          callRef,
          attemptRef: `attempt:${day}:${index}`,
          operationKey: `operation:${day}:${index}`,
          priceDigest: `digest:price:${day}:${index}`,
          chargeState: 'paid',
          amountUnits: index === 0 ? '1500' : '2500',
          observedAt: createdAt + index,
        })
      }
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

    await expect(snapshot(backend, FIRST_DAY)).resolves.toEqual({ kind: 'written', day: FIRST_DAY })
    await expect(snapshot(backend, FIRST_DAY)).resolves.toEqual({ kind: 'written', day: FIRST_DAY })

    const state = await backend.run(async (ctx) => ({
      days: await ctx.db.query('marketplaceMetricDays').collect(),
      entities: await ctx.db.query('marketplaceEntityDays').collect(),
    }))
    expect(state.days).toHaveLength(1)
    expect(state.days[0]).toMatchObject({
      settledCallValue: { units: '4000', exponent: 2, currency: 'AUD' },
      completedCalls: 2,
      uncertainCalls: 1,
      quotesCreated: 2,
      quotesConvertedAtClose: 1,
      transactingWorkspaces: 2,
    })
    expect(state.entities).toHaveLength(8)
  })

  it('records not_configured when no paid usage exists', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDay(backend, FIRST_DAY, ['workspace:one'], false)
    await snapshot(backend, FIRST_DAY)
    const row = await backend.run(async (ctx) => await ctx.db.query('marketplaceMetricDays').first())
    expect(row).toMatchObject({ settledCallValue: null, money: 'not_configured' })
  })

  it('refuses malformed days and mixed money scales before writing', async () => {
    const backend = convexTestWithMarketComponents()
    await expect(snapshot(backend, '2026-02-31')).resolves.toEqual({
      kind: 'refused',
      code: 'malformed_day',
    })
    await seedDay(backend, FIRST_DAY, ['workspace:one', 'workspace:two'], true)
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('moneyUsageEvents')
        .withIndex('by_usageRef', (query) => query.eq('usageRef', `usage:${FIRST_DAY}:1`))
        .unique()
      if (row === null) throw new Error('usage fixture missing')
      await ctx.db.patch(row._id, { currency: 'USD' })
    })
    await expect(snapshot(backend, FIRST_DAY)).resolves.toEqual({
      kind: 'refused',
      code: 'multiple_currencies',
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

  it('returns ratios to an owner admin and refuses a non-admin', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDay(backend, FIRST_DAY, ['workspace:one', 'workspace:two'], true)
    await snapshot(backend, FIRST_DAY)
    const admin = await ownerAdmin(backend, 'user_admin-metrics-owner')
    const outsider = await nonAdmin(backend, 'user_admin-metrics-outsider')
    const report = await admin.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' })
    expect(report).toMatchObject({ headline: { settledCalls: 2 }, ratios: { takeRate: null } })
    await expect(outsider.query(api.adminConsoleMetrics.readMarketplaceMetrics, { range: 'last_7' }))
      .resolves.toEqual({ kind: 'refused', code: 'missing_membership' })
  })
})
