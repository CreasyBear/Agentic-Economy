import { v } from 'convex/values'
import { internalAction, internalMutation, internalQuery, mutation } from './_generated/server'
import { adminCommandArgsValue, adminCommandReceiptValue } from './lib/adminConsole/commands/contracts'
import { runAdminCommand } from './lib/adminConsole/commands/commandEnvelope'
import { promotionalCreditSpec } from './lib/adminConsole/actions/promotionalCredit'
import {
  grantRefArgs, claimWorkResult, claimWorkHandler,
  finishWorkArgs, finishWorkResult, finishWorkHandler,
  dueArgs, dueResult, dueHandler,
  processResult, processHandler,
  sweepArgs, sweepResult, sweepHandler,
} from './lib/money/promotionalCredit/lifecycle'

const grantArgs = adminCommandArgsValue(
  v.literal('grant_promotional_credit'),
  v.object({
    accountRef: v.string(), environment: v.union(v.literal('sandbox'), v.literal('production')),
    amountUnits: v.string(), expiresAt: v.number(),
  }),
  v.union(v.literal('onboarding'), v.literal('correction')),
)
export const grant = mutation({
  args: grantArgs.fields,
  returns: adminCommandReceiptValue(v.literal('grant_promotional_credit'), v.literal('promotional_credit_granted'), v.string()),
  handler: (ctx, args) => runAdminCommand(ctx, args, promotionalCreditSpec(ctx, args)),
})
export const claimWork = internalMutation({ args: grantRefArgs.fields, returns: claimWorkResult, handler: claimWorkHandler })
export const finishWork = internalMutation({ args: finishWorkArgs.fields, returns: finishWorkResult, handler: finishWorkHandler })
export const due = internalQuery({ args: dueArgs.fields, returns: dueResult, handler: dueHandler })
export const process = internalAction({ args: grantRefArgs.fields, returns: processResult, handler: processHandler })
export const sweep = internalAction({ args: sweepArgs.fields, returns: sweepResult, handler: sweepHandler })
