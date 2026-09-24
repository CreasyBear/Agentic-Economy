import { mutation, query } from './_generated/server'
import { configureAutoRechargeArgs, configureAutoRechargeResult, configureAutoRechargeHandler } from './lib/money/autoRecharge/configure'
import { readAutoRechargeSettingsArgs, readAutoRechargeSettingsResult, readAutoRechargeSettingsHandler } from './lib/money/autoRecharge/read'

export const readAutoRechargeSettings = query({
  args: readAutoRechargeSettingsArgs,
  returns: readAutoRechargeSettingsResult,
  handler: readAutoRechargeSettingsHandler,
})

export const configureAutoRecharge = mutation({
  args: configureAutoRechargeArgs.fields,
  returns: configureAutoRechargeResult,
  handler: configureAutoRechargeHandler,
})
