import { v } from 'convex/values'
import { mutation } from './_generated/server'
import { adminCommandArgsValue, adminCommandReceiptValue } from './lib/adminConsole/commands/contracts'
import { runAdminCommand } from './lib/adminConsole/commands/commandEnvelope'
import { paymentsAudienceSpec, paymentsPausedSpec, treasuryThresholdsSpec } from './lib/adminConsole/actions/treasury'
import { treasuryEnvironmentValue } from '@/modules/money/treasury'

const pauseArgs = adminCommandArgsValue(
  v.literal('set_payments_paused'),
  v.object({ environment: treasuryEnvironmentValue, paused: v.boolean() }),
  v.union(v.literal('operational_pause'), v.literal('operational_resume'), v.literal('correction')),
)
export const setPaymentsPaused = mutation({
  args: pauseArgs.fields,
  returns: adminCommandReceiptValue(v.literal('set_payments_paused'), v.union(v.literal('payments_paused'), v.literal('payments_resumed')), v.string()),
  handler: (ctx, args) => runAdminCommand(ctx, args, paymentsPausedSpec(ctx, args)),
})

const audienceArgs = adminCommandArgsValue(
  v.literal('set_payments_audience'),
  v.object({ environment: treasuryEnvironmentValue, audience: v.union(v.literal('admins'), v.literal('everyone')) }),
  v.union(v.literal('launch_open'), v.literal('launch_close'), v.literal('correction')),
)
export const setPaymentsAudience = mutation({
  args: audienceArgs.fields,
  returns: adminCommandReceiptValue(v.literal('set_payments_audience'), v.literal('payments_audience_changed'), v.string()),
  handler: (ctx, args) => runAdminCommand(ctx, args, paymentsAudienceSpec(ctx, args)),
})

const thresholdsArgs = adminCommandArgsValue(
  v.literal('change_treasury_thresholds'),
  v.object({ environment: treasuryEnvironmentValue, lowWaterUnits: v.string(), targetFloatUnits: v.string() }),
  v.union(v.literal('threshold_update'), v.literal('correction')),
)
export const changeThresholds = mutation({
  args: thresholdsArgs.fields,
  returns: adminCommandReceiptValue(v.literal('change_treasury_thresholds'), v.literal('treasury_thresholds_changed'), v.string()),
  handler: (ctx, args) => runAdminCommand(ctx, args, treasuryThresholdsSpec(ctx, args)),
})
