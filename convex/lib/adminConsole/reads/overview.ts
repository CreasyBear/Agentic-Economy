import type { UserIdentity } from 'convex/server'
import { v, type Infer } from 'convex/values'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { paymentReadinessViewValue } from '@/modules/money/payment-readiness'
import { env, type QueryCtx } from '../../../_generated/server'
import { readPaymentReadiness } from '../../money/readiness/store'

export const adminOverviewValue = v.object({
  paymentReadiness: v.union(v.null(), paymentReadinessViewValue),
  // The action sheet uses this session claim for MFA guidance, not service health.
  clerkFva: v.union(v.literal('present'), v.literal('absent')),
})

type AdminOverviewView = Infer<typeof adminOverviewValue>

export async function readAdminOverviewView(
  ctx: QueryCtx,
  identity: UserIdentity | null,
): Promise<AdminOverviewView> {
  const environment = deploymentPaymentEnvironment(env)
  return {
    paymentReadiness: environment === undefined ? null
      : await readPaymentReadiness(ctx, environment, Date.now()),
    clerkFva: identity?.fva === undefined ? 'absent' : 'present',
  }
}
