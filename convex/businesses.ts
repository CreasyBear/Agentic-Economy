import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'

import { businessSuppressionSpec } from './lib/adminConsole/actions/businessSuppression'
import { runAdminCommand } from './lib/adminConsole/commands/commandEnvelope'
import { adminCommandArgsValue, adminCommandReceiptValue } from './lib/adminConsole/commands/contracts'

const action = v.literal('set_business_suppression')
export const setBusinessSuppression = mutationGeneric({
  args: adminCommandArgsValue(
    action,
    v.object({
      businessId: v.id('businesses'),
      intent: v.union(v.literal('suppress'), v.literal('unsuppress')),
    }),
    v.union(
      v.literal('policy_violation'),
      v.literal('legal_notice'),
      v.literal('provider_request'),
      v.literal('fraud_suspected'),
      v.literal('suppression_lifted_after_review'),
    ),
  ).fields,
  returns: adminCommandReceiptValue(
    action,
    v.union(v.literal('business_suppressed'), v.literal('business_unsuppressed')),
    v.string(),
  ),
  handler: async (ctx, args) =>
    await runAdminCommand(ctx, args, businessSuppressionSpec(ctx, args.input)),
})
