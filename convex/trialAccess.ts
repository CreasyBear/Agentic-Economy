import { v } from 'convex/values'
import { internalMutation, mutation, query } from './_generated/server'
import { trialRecipientValue, trialClaimResultValue } from '@/modules/money/public'
import { adminCommandArgsValue, adminCommandReceiptValue } from './lib/adminConsole/commands/contracts'
import { runAdminCommand } from './lib/adminConsole/commands/commandEnvelope'
import { trialSpec } from './lib/adminConsole/actions/trial'
import { prepareClaimHandler, preparedClaimValue, verifiedClaimArgs, finishClaimHandler, readCurrentTrialHandler } from './lib/money/trials/claims'
import { offerRefArgs, deliveryWorkValue, claimDeliveryHandler, finishDeliveryArgs, finishDeliveryHandler } from './lib/money/trials/delivery'
import { adminTrialArgs, adminTrialResultValue, readAdminTrialsHandler } from './lib/money/trials/reads'

const issueArgs = adminCommandArgsValue(v.literal('issue_trial'), v.object({
  environment: v.union(v.literal('sandbox'), v.literal('production')), recipient: trialRecipientValue,
}), v.literal('onboarding'))

export const issue = mutation({
  args: issueArgs.fields,
  returns: adminCommandReceiptValue(v.literal('issue_trial'), v.literal('trial_approved'), v.string()),
  handler: (ctx, args) => runAdminCommand(ctx, args, trialSpec(ctx, args)),
})
export const readAdmin = query({ args: adminTrialArgs, returns: adminTrialResultValue, handler: readAdminTrialsHandler })
export const readCurrent = query({ args: {}, returns: trialClaimResultValue, handler: readCurrentTrialHandler })
export const prepareClaim = internalMutation({ args: {}, returns: preparedClaimValue, handler: prepareClaimHandler })
export const finishClaim = internalMutation({ args: verifiedClaimArgs.fields, returns: trialClaimResultValue, handler: finishClaimHandler })
export const claimDelivery = internalMutation({ args: offerRefArgs, returns: deliveryWorkValue, handler: claimDeliveryHandler })
export const finishDelivery = internalMutation({ args: finishDeliveryArgs, returns: v.boolean(), handler: finishDeliveryHandler })
