import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { organizationMonthlySpendReserveRefusal } from '../../../convex/lib/capabilityExecution/callLifecycle/admissionRefusal'
import { remainingMonthlyExposure, type MonthlySpendSnapshot } from '../../../convex/lib/money/monthlyBudget/exposureContracts'
import { internal } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { managedCallBuyerSaleReference } from '@/modules/money/public'
import { convexTestWithMarketComponents } from '../../helpers/convex-fixtures'

const now = Date.UTC(2026, 9, 8)
const scope = { accountRef: 'account:a', environment: 'sandbox' as const, organizationMonth: '2026-10' }
type Plan = Omit<Doc<'capabilityPlans'>, '_id' | '_creationTime'>
type Call = Omit<Doc<'capabilityCalls'>, '_id' | '_creationTime'>
type Backend = ReturnType<typeof convexTestWithMarketComponents>
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now) })
afterEach(() => vi.useRealTimers())
function plan(overrides: { [K in keyof Plan]?: Plan[K] | undefined } = {}): Plan {
  const value: Plan = {
    planRef: crypto.randomUUID(), principalId: 'principal:a', ownerId: scope.accountRef, accountRef: scope.accountRef,
    credentialId: 'credential:a', grantRef: 'grant:a', grantGeneration: 1, environment: scope.environment,
    planJson: '{"nodes":[]}', planDigest: 'sha256:plan', nodes: [], stages: [], dataFlows: [],
    approvedTotalAudUnits: '100', state: 'running', organizationMonth: scope.organizationMonth,
    organizationMonthlyExposureUnits: '100', nodeOutcomes: [], expiresAt: now + 100, runDeadlineAt: now + 200,
    createdAt: now, updatedAt: now,
  }
  Object.assign(value, overrides)
  return value
}
function call(overrides: Partial<Call> = {}): Call {
  const callRef = crypto.randomUUID()
  return { callRef, quoteRef: `quote:${callRef}`, principalId: 'principal:a', ownerId: scope.accountRef,
    credentialId: 'credential:a', applicationRef: 'application:a', toolRef: 'tool:a', idempotencyKey: callRef,
    environment: scope.environment, grantRef: 'grant:a', grantGeneration: 1, policyDigest: 'sha256:policy',
    grantExpiresAt: now + 60_000, inputDigest: 'sha256:input', requestDigest: 'sha256:request',
    state: 'pending', formanceFinancialState: 'reserved', formanceReservationRefs: ['reservation:a'],
    createdAt: now, updatedAt: now, ...overrides }
}
async function insertCall(backend: Backend, row: Call, amount = '7') {
  return backend.run(async ctx => {
    await ctx.db.insert('capabilityQuotes', {
      quoteRef: row.quoteRef!, accountRef: row.ownerId, principalId: row.principalId, environment: row.environment,
      credentialId: row.credentialId, applicationRef: row.applicationRef, grantRef: row.grantRef, grantGeneration: 1,
      grantPolicyDigest: row.policyDigest, grantExpiresAt: row.grantExpiresAt, toolRef: row.toolRef, toolVersion: 1,
      toolMaterialDigest: 'sha256:material', currentToolDigest: 'sha256:material', toolJson: '{}', inputDigest: row.inputDigest,
      pricingJson: '{}', pricingDigest: 'sha256:pricing', decisionAudUnits: amount, budgetPolicyRef: 'budget:a',
      budgetGeneration: 1, maximumSpendPerCallUnits: '100', formanceSchemaVersion: 'v1.4.0', policyGeneration: 1,
      legalCustomerRef: 'legal:a', legalCustomerGeneration: 1, buyerRevenueUnits: amount, buyerTaxUnits: '0',
      accountAvailableUnits: '1000', budgetAvailableUnits: '1000', legalExposureAvailableUnits: '1000', balanceUnits: '1000',
      commercialPolicyRefs: [], commercialPolicyDigest: 'sha256:policy', evidenceDigest: 'sha256:quote',
      state: 'consumed', consumedCallRef: row.callRef, expiresAt: now + 30_000, createdAt: row.createdAt, updatedAt: now,
      ...(row.planRef === undefined || row.planNodeId === undefined ? {} : { planRef: row.planRef, planNodeId: row.planNodeId }),
    })
    return ctx.db.insert('capabilityCalls', row)
  })
}
const read = (backend: Backend) => backend.query(internal.moneyMonthlySpendBudget.readAccountExposure, scope)
const sale = (reference: string, units: string) => ({ reference, units, effectiveAt: now - 1 })
const callSale = (row: Call, units = '7') => sale(managedCallBuyerSaleReference({ callRef: row.callRef, quoteRef: row.quoteRef! }), units)
async function snapshot(backend: Backend, sales = [sale('historic:sale', '90')]): Promise<MonthlySpendSnapshot> {
  const held = await read(backend)
  if (held.kind !== 'available') throw new Error('fixture_exposure_unavailable')
  return { enabled: true, ceilingUnits: '100', organizationMonth: scope.organizationMonth, exposureDigest: held.digest,
    monthSpendUnits: sales.reduce((sum, value) => sum + BigInt(value.units), 0n).toString(), sales,
    snapshotAt: now, coverage: 'complete' }
}
async function fixture() {
  const backend = convexTestWithMarketComponents()
  const budgetId = await backend.run(ctx => ctx.db.insert('moneyMonthlySpendBudgets', {
    accountRef: scope.accountRef, enabled: true, currency: 'AUD', exponent: 6, ceilingUnits: '100', revision: 1, createdAt: now, updatedAt: now,
  }))
  const admit = (value: MonthlySpendSnapshot, amount = '7') => backend.run(ctx => organizationMonthlySpendReserveRefusal(ctx,
    { ownerId: scope.accountRef, environment: scope.environment, now: Date.now(), organizationMonthlySpend: value }, { decisionAudUnits: amount }))
  return { backend, budgetId, admit }
}

describe('complete Account Call and Plan exposure', () => {
  it('carries old-month Holds in any state and isolates Account and environment', async () => {
    const { backend } = await fixture()
    await backend.run(async ctx => {
      for (const row of [plan({ organizationMonthlyExposureUnits: '30' }),
        plan({ state: 'quoted', organizationMonth: '2026-09', organizationMonthlyExposureUnits: '70',
          holdReservationAttempt: { generation: 1, leaseUntil: now, ambiguous: true } }),
        plan({ ownerId: 'account:b', accountRef: 'account:b' }), plan({ environment: 'production' })]) await ctx.db.insert('capabilityPlans', row)
    })
    expect(await read(backend)).toMatchObject({ kind: 'available', units: '100' })
    await insertCall(backend, call({ createdAt: Date.UTC(2026, 8, 30), state: 'completed', formanceFinancialState: 'outcome_unknown' }))
    expect(await read(backend)).toMatchObject({ kind: 'available', units: '107' })
  })
  it.each([undefined, '-1', 'bad', '101'])('refuses missing/malformed held Plan exposure %s', async units => {
    const { backend } = await fixture()
    await backend.run(ctx => ctx.db.insert('capabilityPlans', plan({ organizationMonthlyExposureUnits: units })))
    expect(await read(backend)).toEqual({ kind: 'unavailable' })
  })
  it('refuses missing accepted Call price and an over-limit source window', async () => {
    const { backend } = await fixture()
    const id = await backend.run(ctx => ctx.db.insert('capabilityCalls', call()))
    expect(await read(backend)).toEqual({ kind: 'unavailable' })
    await backend.run(ctx => ctx.db.delete(id))
    await backend.run(async ctx => {
      for (let i = 0; i <= 1000; i++) await ctx.db.insert('capabilityCalls', call({ formanceFinancialState: 'settled', state: 'completed' }))
    })
    expect(await read(backend)).toEqual({ kind: 'unavailable' })
  })
  it('does not let old free Calls or another environment exhaust the carry scan', async () => {
    const { backend } = await fixture()
    await backend.run(async ctx => {
      for (let i = 0; i <= 1000; i++) {
        const { formanceFinancialState: _state, ...free } = call({ state: 'completed', buyerAmountUnits: '0', createdAt: Date.UTC(2026, 8, 1) })
        await ctx.db.insert('capabilityCalls', free)
        await ctx.db.insert('capabilityPlans', plan({ environment: 'production' }))
      }
    })
    expect(await read(backend)).toMatchObject({ kind: 'available', units: '0' })
    await insertCall(backend, call({ buyerAmountUnits: '8' }), '7')
    expect(await read(backend)).toEqual({ kind: 'unavailable' })
  })
  it('subtracts a native Node sale once, only while that Node remains in its Plan Hold', async () => {
    const { backend } = await fixture()
    const parent = plan({ approvedTotalAudUnits: '10', organizationMonthlyExposureUnits: '10', nodes: [{
      nodeId: 'one', inputMode: 'literal', validation: 'typed', toolRef: 'tool:a', toolMaterialDigest: 'sha256:tool',
      inputTemplateDigest: 'sha256:input', pricingDigest: 'sha256:price', providerHost: 'example.com', priceClass: 'fixed',
      ceilingAudUnits: '3', dependsOn: [],
    }] })
    const planId = await backend.run(ctx => ctx.db.insert('capabilityPlans', parent))
    const node = call({ planRef: parent.planRef, planNodeId: 'one' })
    const callId = await insertCall(backend, node, '3')
    const value = await snapshot(backend, [callSale(node, '3')])
    expect(remainingMonthlyExposure(await read(backend), value)).toEqual({ kind: 'known', units: '7' })
    await backend.run(async ctx => {
      await ctx.db.patch(callId, { formanceFinancialState: 'settled', state: 'completed' })
      await ctx.db.patch(planId, { organizationMonthlyExposureUnits: '7', concludedNodeIds: ['one'] })
    })
    expect(remainingMonthlyExposure(await read(backend), value)).toEqual({ kind: 'known', units: '7' })
  })
})

describe('monthly cap transaction and native handoff', () => {
  it.each(['call', 'plan'] as const)('stale snapshots cannot admit a second 7 after a %s reserved 7 against settled 90/cap 100', async kind => {
    const { backend, admit } = await fixture()
    const before = await snapshot(backend)
    expect(await admit(before)).toBeNull()
    if (kind === 'call') await insertCall(backend, call({ principalId: 'principal:other' }))
    else await backend.run(ctx => ctx.db.insert('capabilityPlans', plan({ approvedTotalAudUnits: '7', organizationMonthlyExposureUnits: '7' })))
    expect(await admit(before)).toMatchObject({ kind: 'refused', retryable: true })
    expect(await admit(await snapshot(backend))).toMatchObject({ kind: 'refused', retryable: false })
  })
  it('closes ABA when a whole new Call settles during the external read', async () => {
    const { backend, admit } = await fixture()
    const before = await snapshot(backend)
    await insertCall(backend, call({ formanceFinancialState: 'settled', state: 'completed' }))
    expect(await read(backend)).toMatchObject({ kind: 'available', units: '0' })
    expect(await admit(before)).toMatchObject({ kind: 'refused', retryable: true })
  })
  it('covers a native success before attachment, then preserves gross consumption after a refund', async () => {
    const { backend, admit } = await fixture()
    const row = call()
    const id = await insertCall(backend, row)
    expect(await admit(await snapshot(backend), '3')).toBeNull()
    const attachedLate = await snapshot(backend, [sale('historic:sale', '90'), callSale(row)])
    expect(await admit(attachedLate, '3')).toBeNull()
    expect(await admit(attachedLate, '4')).toMatchObject({ kind: 'refused' })
    await backend.run(ctx => ctx.db.patch(id, { formanceFinancialState: 'settled', state: 'completed', buyerSaleTransactionRef: callSale(row).reference }))
    expect(await admit(attachedLate, '3')).toMatchObject({ retryable: true })
    await backend.run(ctx => ctx.db.patch(id, { formanceFinancialState: 'released' }))
    expect(await admit(await snapshot(backend, [sale('historic:sale', '90'), callSale(row)]), '4')).toMatchObject({ kind: 'refused' })
  })
  it('uses the live cap and server month, and refuses incomplete or mismatched sale evidence', async () => {
    const { backend, budgetId, admit } = await fixture()
    const row = call()
    await insertCall(backend, row)
    const value = await snapshot(backend, [sale('historic:sale', '90'), callSale(row)])
    await backend.run(ctx => ctx.db.patch(budgetId, { ceilingUnits: '99', revision: 2 }))
    expect(await admit(value, '3')).toMatchObject({ kind: 'refused' })
    const { coverage: _coverage, ...incomplete } = value
    expect(await admit(incomplete, '1')).toMatchObject({ kind: 'refused' })
    expect(await admit(await snapshot(backend, [callSale(row, '6')]), '1')).toMatchObject({ kind: 'refused' })
    vi.setSystemTime(Date.UTC(2026, 10, 1))
    expect(await admit(value, '1')).toMatchObject({ retryable: true })
  })
})
