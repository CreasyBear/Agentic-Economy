import { internalAction, internalQuery } from './_generated/server'
import {
  readAccountCreditBalanceArgs, readAccountCreditBalanceHandler, readAccountCreditBalanceResult,
  readEligiblePromotionalGrantsArgs, readEligiblePromotionalGrantsHandler, readEligiblePromotionalGrantsResult,
} from './lib/money/promotionalCredit/balance'

export const readEligible = internalQuery({
  args: readEligiblePromotionalGrantsArgs,
  returns: readEligiblePromotionalGrantsResult,
  handler: readEligiblePromotionalGrantsHandler,
})

export const read = internalAction({
  args: readAccountCreditBalanceArgs,
  returns: readAccountCreditBalanceResult,
  handler: readAccountCreditBalanceHandler,
})
