import { mutation, query } from './_generated/server'
import { readStripeCustomerBindingArgs, readStripeCustomerBindingHandler, readStripeCustomerBindingResult } from './lib/money/customer/stripeRead'
import { upsertStripeCustomerBindingArgs, upsertStripeCustomerBindingHandler, upsertStripeCustomerBindingResult } from './lib/money/customer/stripeUpsert'
import { observeStripePaymentMandateArgs, observeStripePaymentMandateHandler, observeStripePaymentMandateResult } from './lib/money/customer/stripeMandate'
import { recordBillingPortalStartedArgs, recordBillingPortalStartedHandler, recordBillingPortalStartedResult } from './lib/money/customer/stripePortal'

export const readStripeCustomerBinding = query({
  args: readStripeCustomerBindingArgs,
  returns: readStripeCustomerBindingResult,
  handler: readStripeCustomerBindingHandler,
})

export const upsertStripeCustomerBinding = mutation({
  args: upsertStripeCustomerBindingArgs,
  returns: upsertStripeCustomerBindingResult,
  handler: upsertStripeCustomerBindingHandler,
})

export const observeStripePaymentMandate = mutation({
  args: observeStripePaymentMandateArgs,
  returns: observeStripePaymentMandateResult,
  handler: observeStripePaymentMandateHandler,
})

export const recordBillingPortalStarted = mutation({
  args: recordBillingPortalStartedArgs,
  returns: recordBillingPortalStartedResult,
  handler: recordBillingPortalStartedHandler,
})
