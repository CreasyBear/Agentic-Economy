import { internalQuery, mutation, query } from './_generated/server'
import { accountExposureArgs, accountExposureResult } from './lib/money/monthlyBudget/exposureContracts'
import { readAccountExposureHandler } from './lib/money/monthlyBudget/exposure'
import { configureMonthlySpendBudgetArgs, configureMonthlySpendBudgetResult, configureMonthlySpendBudgetHandler } from './lib/money/monthlyBudget/configure'
import { readMonthlySpendBudgetArgs, readMonthlySpendBudgetResult, readMonthlySpendBudgetHandler } from './lib/money/monthlyBudget/read'
import { readOrganizationMonthlySpendBudgetForAccountArgs, readOrganizationMonthlySpendBudgetForAccountResult, readOrganizationMonthlySpendBudgetForAccountHandler } from './lib/money/monthlyBudget/readOrganization'

export const readMonthlySpendBudget = query({
  args: readMonthlySpendBudgetArgs,
  returns: readMonthlySpendBudgetResult,
  handler: readMonthlySpendBudgetHandler,
})

export const configureMonthlySpendBudget = mutation({
  args: configureMonthlySpendBudgetArgs.fields,
  returns: configureMonthlySpendBudgetResult,
  handler: configureMonthlySpendBudgetHandler,
})

export const readOrganizationMonthlySpendBudgetForAccount = internalQuery({
  args: readOrganizationMonthlySpendBudgetForAccountArgs,
  returns: readOrganizationMonthlySpendBudgetForAccountResult,
  handler: readOrganizationMonthlySpendBudgetForAccountHandler,
})

export const readAccountExposure = internalQuery({
  args: accountExposureArgs, returns: accountExposureResult, handler: readAccountExposureHandler,
})
