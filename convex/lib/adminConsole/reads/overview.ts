import { v, type Infer } from 'convex/values'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { paymentReadinessViewValue } from '@/modules/money/payment-readiness'
import { env, type QueryCtx } from '../../../_generated/server'
import { readPaymentReadiness } from '../../money/readiness/store'
import { adminPurchaseRowValue, purchaseRow } from './activity'

export const adminOverviewValue = v.object({
  paymentReadiness: v.union(v.null(), paymentReadinessViewValue),
  attention: v.object({ purchases: v.array(adminPurchaseRowValue), complete: v.boolean() }),
})

type AdminOverviewView = Infer<typeof adminOverviewValue>

export async function readAdminOverviewView(
  ctx: QueryCtx,
): Promise<AdminOverviewView> {
  const environment = deploymentPaymentEnvironment(env)
  const unresolved = environment === undefined ? [] : await ctx.db.query('capabilityCalls')
    .withIndex('by_environment_and_state_and_createdAt', q => q.eq('environment', environment).eq('state', 'reconciliation_required'))
    .take(7)
  return {
    attention: { purchases: await Promise.all(unresolved.slice(0, 6).map(call => purchaseRow(ctx, call))),
      complete: environment !== undefined && unresolved.length <= 6 },
    paymentReadiness: environment === undefined ? null
      : await readPaymentReadiness(ctx, environment, Date.now()),
  }
}
