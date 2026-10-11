import { serviceAssertion } from './serviceAssertion'
import { readPaymentReadinessSourceChecks, paymentReadinessSourceChecksValue } from './lib/money/readiness/sourceChecks'
import { readPaymentsAudience } from './lib/money/treasury/paymentAdmission'
import { v } from 'convex/values'
import { internalMutation, internalQuery, query } from './_generated/server'
import { paymentReadinessEnvironmentValue, paymentReadinessSnapshotValue, paymentReadinessViewValue,
  paymentReadinessServerViewValue, type PaymentReadinessView } from '@/modules/money/payment-readiness'
import { publishPaymentReadiness, publishPaymentReadinessResultValue, readPaymentReadiness, readPaymentReadinessForServer } from './lib/money/readiness/store'

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
  args: { environment: paymentReadinessEnvironmentValue },
  returns: paymentReadinessSourceChecksValue,
  handler: readPaymentReadinessSourceChecks,
})

export const readForServer = query({
  args: { environment: paymentReadinessEnvironmentValue, serviceAuth: serviceAssertion },
  returns: paymentReadinessServerViewValue,
  handler: async (ctx, args) => {
    const view = await readPaymentReadinessForServer(ctx, args)
    return { ...view, paymentsDisabled: await readPaymentsAudience(ctx, args.environment) !== 'everyone' }
  },
})
