import { readPaymentReadinessSourceChecks, paymentReadinessSourceChecksValue } from './lib/money/readiness/sourceChecks'
import { v } from 'convex/values'
import { internalMutation, internalQuery } from './_generated/server'
import { paymentReadinessEnvironmentValue, paymentReadinessSnapshotValue, paymentReadinessViewValue,
  type PaymentReadinessView } from '@/modules/money/payment-readiness'
import { publishPaymentReadiness, publishPaymentReadinessResultValue, readPaymentReadiness } from './lib/money/readiness/store'

export const readInternal = internalQuery({
  args: { environment: paymentReadinessEnvironmentValue, now: v.number() },
  returns: paymentReadinessViewValue,
  handler: async (ctx, args): Promise<PaymentReadinessView> => await readPaymentReadiness(ctx, args.environment, args.now),
})
export const publish = internalMutation({
  args: { snapshot: paymentReadinessSnapshotValue }, returns: publishPaymentReadinessResultValue,
  handler: publishPaymentReadiness,
})

export const readSourceChecks = internalQuery({
  args: { environment: paymentReadinessEnvironmentValue, now: v.number() },
  returns: paymentReadinessSourceChecksValue,
  handler: readPaymentReadinessSourceChecks,
})
