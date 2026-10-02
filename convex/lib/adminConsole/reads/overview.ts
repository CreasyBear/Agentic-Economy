import { v, type Infer } from 'convex/values'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { paymentReadinessViewValue } from '@/modules/money/payment-readiness'
import { env, type QueryCtx } from '../../../_generated/server'
import { readPaymentReadiness } from '../../money/readiness/store'

export const adminOverviewValue = v.object({
  paymentReadiness: v.union(v.null(), paymentReadinessViewValue),
})

type AdminOverviewView = Infer<typeof adminOverviewValue>

export async function readAdminOverviewView(
  ctx: QueryCtx,
): Promise<AdminOverviewView> {
  const environment = deploymentPaymentEnvironment(env)
  return {
    paymentReadiness: environment === undefined ? null
      : await readPaymentReadiness(ctx, environment, Date.now()),
  }
}
