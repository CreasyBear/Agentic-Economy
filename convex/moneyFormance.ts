"use node"

import { internalAction } from './_generated/server'
import {
  accountHistoryResultValue, accountResult, buyerAdjustmentArgs,
  capacitySyncArgs, displayBalanceArgs, displayBalanceResult, finalizeManagedCallArgs,
  fundingBookingArgs, healthResult, installationResult, legalCustomerRebindResult,
  managedCallBookingArgs, moneyResult, periodSpendResult, readAccountArgs,
  readAccountHistoryArgs, readPeriodSpendArgs, readStatementPageArgs,
  readTransactionByReferenceArgs, rebindLegalCustomerArgs, referenceResult,
  releaseExpiredUnusedCallArgs, releaseManagedCallArgs, reverseProviderSettlementArgs,
  spendingPeriodAdjustmentValue, spendingPeriodArgs, spendingPeriodResult,
  statementPageResult,
} from './lib/money/formance/contracts'
import { healthHandler, installSchemaHandler } from './lib/money/formance/gateway'
import {
  canRebindLegalCustomerHandler, readAccountHandler, readAccountHistoryHandler,
  readDisplayBalanceHandler, readPeriodSpendHandler, readSpendingPeriodHandler,
  readStatementPageHandler, readTransactionByReferenceHandler,
} from './lib/money/formance/reads'
import {
  adjustSpendingPeriodHandler, bookBuyerAdjustmentHandler, bookFundingReversalHandler,
  bookFundingSettlementHandler, releaseExpiredUnusedCallHandler, releaseManagedCallHandler,
  remedyPaidCallHandler, reserveManagedCallHandler, reverseProviderSettlementHandler,
  settleManagedCallHandler, syncCapacityHandler,
} from './lib/money/formance/postings'

export const health = internalAction({ args: {}, returns: healthResult, handler: healthHandler })
export const installSchema = internalAction({ args: {}, returns: installationResult, handler: installSchemaHandler })
export const readAccount = internalAction({ args: readAccountArgs, returns: accountResult, handler: readAccountHandler })
export const readTransactionByReference = internalAction({
  args: readTransactionByReferenceArgs, returns: referenceResult, handler: readTransactionByReferenceHandler,
})
export const readPeriodSpend = internalAction({
  args: readPeriodSpendArgs, returns: periodSpendResult, handler: readPeriodSpendHandler,
})
export const readAccountHistory = internalAction({
  args: readAccountHistoryArgs, returns: accountHistoryResultValue, handler: readAccountHistoryHandler,
})
export const readStatementPage = internalAction({
  args: readStatementPageArgs, returns: statementPageResult, handler: readStatementPageHandler,
})
export const bookBuyerAdjustment = internalAction({
  args: buyerAdjustmentArgs, returns: moneyResult, handler: bookBuyerAdjustmentHandler,
})
export const bookFundingSettlement = internalAction({
  args: fundingBookingArgs, returns: moneyResult, handler: bookFundingSettlementHandler,
})
export const bookFundingReversal = internalAction({
  args: fundingBookingArgs, returns: moneyResult, handler: bookFundingReversalHandler,
})
export const syncCapacity = internalAction({
  args: capacitySyncArgs, returns: moneyResult, handler: syncCapacityHandler,
})
export const adjustSpendingPeriod = internalAction({
  args: spendingPeriodAdjustmentValue, returns: moneyResult, handler: adjustSpendingPeriodHandler,
})
export const readSpendingPeriod = internalAction({
  args: spendingPeriodArgs, returns: spendingPeriodResult, handler: readSpendingPeriodHandler,
})
export const readDisplayBalance = internalAction({
  args: displayBalanceArgs, returns: displayBalanceResult, handler: readDisplayBalanceHandler,
})
export const canRebindLegalCustomer = internalAction({
  args: rebindLegalCustomerArgs, returns: legalCustomerRebindResult, handler: canRebindLegalCustomerHandler,
})
export const reserveManagedCall = internalAction({
  args: managedCallBookingArgs, returns: moneyResult, handler: reserveManagedCallHandler,
})
export const releaseManagedCall = internalAction({
  args: releaseManagedCallArgs, returns: moneyResult, handler: releaseManagedCallHandler,
})
export const releaseExpiredUnusedCall = internalAction({
  args: releaseExpiredUnusedCallArgs, returns: moneyResult, handler: releaseExpiredUnusedCallHandler,
})
export const settleManagedCall = internalAction({
  args: finalizeManagedCallArgs, returns: moneyResult, handler: settleManagedCallHandler,
})
export const remedyPaidCall = internalAction({
  args: finalizeManagedCallArgs, returns: moneyResult, handler: remedyPaidCallHandler,
})
export const reverseProviderSettlement = internalAction({
  args: reverseProviderSettlementArgs, returns: moneyResult, handler: reverseProviderSettlementHandler,
})
