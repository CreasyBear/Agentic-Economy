import { describe, expect, it } from 'vitest'
import { organizationMonthlySpendReserveRefusal } from '../../../convex/lib/capabilityExecution/callLifecycle/admissionRefusal'
import { internal } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { convexTestWithMarketComponents } from '../../helpers/convex-fixtures'

type Plan = Omit<Doc<'capabilityPlans'>, '_id' | '_creationTime'>
function plan(overrides: { [Key in keyof Plan]?: Plan[Key] | undefined } = {}): Plan {
  const row: Plan = {
    planRef: crypto.randomUUID(), principalId: 'principal:a', ownerId: 'account:a', accountRef: 'account:a',
    credentialId: 'credential:a', grantRef: 'grant:a', grantGeneration: 1, environment: 'sandbox',
    planJson: '{"nodes":[]}', planDigest: 'sha256:plan', nodes: [], stages: [], dataFlows: [],
    approvedTotalAudUnits: '100', state: 'running', organizationMonth: '2026-10',
    organizationMonthlyExposureUnits: '100', nodeOutcomes: [], expiresAt: 100, runDeadlineAt: 200,
    createdAt: 1, updatedAt: 1,
  }
  Object.assign(row, overrides)
  return row
}
async function read(rows: Plan[]) {
  const backend = convexTestWithMarketComponents()
  await backend.run(async (ctx) => { for (const row of rows) await ctx.db.insert('capabilityPlans', row) })
  return backend.query(internal.capabilityPlans.readOutstandingPlanExposure, { accountRef: 'account:a', organizationMonth: '2026-10' })
}
describe('outstanding Plan exposure', () => {
  it('sums held and uncertain amounts for only the exact Account and original month', async () => {
    expect(await read([
      plan({ organizationMonthlyExposureUnits: '30' }),
      plan({ state: 'reconciliation_required', organizationMonthlyExposureUnits: '70' }),
      plan({ ownerId: 'account:b', accountRef: 'account:b' }),
      plan({ organizationMonth: '2026-09' }),
    ])).toEqual({ kind: 'available', units: '100', digest: expect.any(String) })
  })
  it('excludes untouched Quotes and approval requests but includes terminal unreleased exposure', async () => {
    expect(await read([
      plan({ state: 'quoted', organizationMonthlyExposureUnits: undefined }),
      plan({ state: 'awaiting_approval', organizationMonthlyExposureUnits: undefined }),
      plan({ state: 'failed', organizationMonthlyExposureUnits: '20', holdReservationRefs: ['reserve:one'] }),
      plan({ state: 'succeeded', organizationMonthlyExposureUnits: '0', holdReleaseRefs: ['release:one'] }),
    ])).toEqual({ kind: 'available', units: '20', digest: expect.any(String) })
  })
  it('returns known zero for an empty Account', async () => {
    expect(await read([])).toEqual({ kind: 'available', units: '0', digest: expect.any(String) })
  })
  it.each([undefined, '-1', 'bad', '101'])('never treats invalid exposure %s as zero', async (units) => {
    expect(await read([plan({ organizationMonthlyExposureUnits: units })])).toEqual({ kind: 'unavailable' })
  })
  it('refuses an active Hold whose month is missing', async () => {
    expect(await read([plan({ organizationMonth: undefined })])).toEqual({ kind: 'unavailable' })
  })
})


describe('monthly cap consistency at Call admission', () => {
  it('refuses a stale held snapshot after settlement and uses the current cap', async () => {
    const backend = convexTestWithMarketComponents()
    const now = Date.UTC(2026, 9, 6)
    const { planId, budgetId } = await backend.run(async ctx => ({
      planId: await ctx.db.insert('capabilityPlans', plan({ planRef: 'plan:race' })),
      budgetId: await ctx.db.insert('moneyMonthlySpendBudgets', {
        accountRef: 'account:a', enabled: true, currency: 'AUD', exponent: 6,
        ceilingUnits: '200', revision: 1, createdAt: now, updatedAt: now,
      }),
    }))
    const held = await backend.query(internal.capabilityPlans.readOutstandingPlanExposure,
      { accountRef: 'account:a', organizationMonth: '2026-10' })
    expect(held.kind).toBe('available')
    if (held.kind !== 'available') throw new Error('missing fixture exposure')
    const args = { ownerId: 'account:a', now, organizationMonthlySpend: {
      enabled: true, ceilingUnits: '200', monthSpendUnits: '0', organizationMonth: '2026-10', planExposureDigest: held.digest,
    } }
    expect(await backend.run(ctx => organizationMonthlySpendReserveRefusal(ctx, args, { decisionAudUnits: '100' }))).toBeNull()
    await backend.run(ctx => ctx.db.patch(planId, { organizationMonthlyExposureUnits: '0', concludedNodeIds: ['node:paid'] }))
    expect(await backend.run(ctx => organizationMonthlySpendReserveRefusal(ctx, args, { decisionAudUnits: '150' })))
      .toMatchObject({ kind: 'refused', code: 'budget_exceeded', retryable: true })
    const fresh = await backend.query(internal.capabilityPlans.readOutstandingPlanExposure,
      { accountRef: 'account:a', organizationMonth: '2026-10' })
    if (fresh.kind !== 'available') throw new Error('missing fixture exposure')
    args.organizationMonthlySpend.planExposureDigest = fresh.digest
    args.organizationMonthlySpend.monthSpendUnits = '100'
    expect(await backend.run(ctx => organizationMonthlySpendReserveRefusal(ctx, args, { decisionAudUnits: '100' }))).toBeNull()
    await backend.run(ctx => ctx.db.patch(budgetId, { ceilingUnits: '150', revision: 2 }))
    expect(await backend.run(ctx => organizationMonthlySpendReserveRefusal(ctx, args, { decisionAudUnits: '100' })))
      .toMatchObject({ kind: 'refused', code: 'budget_exceeded', retryable: false })
    args.organizationMonthlySpend.organizationMonth = '2026-09'
    expect(await backend.run(ctx => organizationMonthlySpendReserveRefusal(ctx, args, { decisionAudUnits: '1' })))
      .toMatchObject({ kind: 'refused', code: 'budget_exceeded', retryable: true })
  })
})
