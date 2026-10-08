import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import { currentUtcMonthBounds } from '@/modules/common/freshness'
import { type MonthlySpendSnapshot, remainingMonthlyExposure } from './exposureContracts'

/** Read local commitments BEFORE the external native snapshot. A later local
 * transition must invalidate admission, including a whole completed purchase.
 */
export async function readAccountMonthlySnapshot(
  ctx: Pick<ActionCtx, 'runQuery' | 'runAction'>,
  accountRef: string,
  environment: 'sandbox' | 'production',
): Promise<{ snapshot?: MonthlySpendSnapshot; heldExposure: { kind: 'known'; units: string } | { kind: 'unavailable' } }> {
  const budget = await ctx.runQuery(internal.moneyMonthlySpendBudget.readOrganizationMonthlySpendBudgetForAccount, { accountRef })
  if (!budget.enabled) return { heldExposure: { kind: 'known', units: '0' } }
  const readStartedAt = Date.now()
  const { periodStartAt, periodEndAt } = currentUtcMonthBounds(readStartedAt)
  const organizationMonth = new Date(periodStartAt).toISOString().slice(0, 7)
  const held = await ctx.runQuery(internal.moneyMonthlySpendBudget.readAccountExposure, { accountRef, environment, organizationMonth })
  const unavailable = { snapshot: { enabled: true, ceilingUnits: budget.ceilingUnits, organizationMonth }, heldExposure: { kind: 'unavailable' as const } }
  if (held.kind !== 'available') return unavailable
  const native = await ctx.runAction(internal.moneyFormance.readPeriodSpend, {
    accountRef, periodStartAt, periodEndAt, expectedEnvironment: environment,
  })
  if ((native.kind !== 'available' && native.kind !== 'empty') || native.coverage !== 'complete'
    || native.periodStartAt !== periodStartAt || native.periodEndAt !== periodEndAt || native.snapshotAt < readStartedAt) return unavailable
  const snapshot: MonthlySpendSnapshot = {
    enabled: true, ceilingUnits: budget.ceilingUnits, organizationMonth, exposureDigest: held.digest,
    monthSpendUnits: native.kind === 'empty' ? '0' : native.spendUnits,
    snapshotAt: native.snapshotAt, coverage: native.coverage, sales: native.sales,
  }
  return { snapshot, heldExposure: remainingMonthlyExposure(held, snapshot) }
}
