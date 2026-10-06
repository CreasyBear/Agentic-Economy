"use node"

import { financialReadResult, financialPageReadResult,credentialFinancialPageResult, periodArgs } from './lib/money/usageReconciliation/contracts'
import { readUsageReconciliationHandler,readUsageReconciliationPageHandler,readCredentialActivityPageHandler } from './lib/money/formance/usageReconciliation'

import { v } from 'convex/values'
import { internalAction } from './_generated/server'
import {
  accountHistoryResultValue, buyerAdjustmentArgs,
  capacitySyncArgs, displayBalanceArgs, displayBalanceResult, finalizeManagedCallArgs,
  fundingBookingArgs, financialEnvironmentValue, healthResult, installationResult,
  managedCallBookingArgs, managedCallSettlementReadResult, managedCallReservationReadResult, managedCallReleaseReadResult, moneyResult, periodSpendResult,
  readAccountHistoryArgs, readPeriodSpendArgs, readStatementPageArgs,
  releaseExpiredUnusedCallArgs, releaseManagedCallArgs, reverseProviderSettlementArgs,
  spendingPeriodAdjustmentValue, spendingPeriodArgs, spendingPeriodResult,
  promotionalCreditArgs, readCreditBalanceArgs, accountCreditBalanceValue,
  statementPageResult,
} from './lib/money/formance/contracts'
import { healthHandler, installSchemaHandler } from './lib/money/formance/gateway'
import {
  readAccountHistoryHandler, readCreditBalanceHandler,
  readDisplayBalanceHandler, readPeriodSpendHandler, readSpendingPeriodHandler,
  readStatementPageHandler, readManagedCallSettlementHandler, readManagedCallReservationHandler, readManagedCallReleaseHandler,
} from './lib/money/formance/reads'
import {
  adjustSpendingPeriodHandler, bookBuyerAdjustmentHandler, bookFundingReversalHandler,
  bookFundingSettlementHandler, releaseExpiredUnusedCallHandler, releaseManagedCallHandler,
  refundSettledSaleHandler, remedyPaidCallHandler, reserveManagedCallHandler, reverseProviderSettlementHandler,
  settleManagedCallHandler, syncCapacityHandler,
  grantPromotionalCreditHandler, expirePromotionalCreditHandler,
} from './lib/money/formance/postings'

import { planHoldArgs, planRemainderResult, planReleaseArgs, reservePlanHoldHandler, readPlanRemainderHandler, releasePlanRemainderHandler } from './lib/money/formance/planPostings'

export const reservePlanHold = internalAction({ args: planHoldArgs, returns: moneyResult, handler: reservePlanHoldHandler })
export const readPlanRemainder = internalAction({ args: planHoldArgs, returns: planRemainderResult, handler: readPlanRemainderHandler })
export const releasePlanRemainder = internalAction({ args: planReleaseArgs, returns: moneyResult, handler: releasePlanRemainderHandler })

export const health = internalAction({ args: {}, returns: healthResult, handler: healthHandler })
export const installSchema = internalAction({ args: {}, returns: installationResult, handler: installSchemaHandler })
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
  args: { ...buyerAdjustmentArgs, expectedEnvironment: financialEnvironmentValue }, returns: moneyResult, handler: bookBuyerAdjustmentHandler,
})
export const bookFundingSettlement = internalAction({
  args: { ...fundingBookingArgs, expectedEnvironment: financialEnvironmentValue }, returns: moneyResult, handler: bookFundingSettlementHandler,
})
export const bookFundingReversal = internalAction({
  args: { ...fundingBookingArgs, expectedEnvironment: financialEnvironmentValue }, returns: moneyResult, handler: bookFundingReversalHandler,
})
export const syncCapacity = internalAction({
  args: { ...capacitySyncArgs, expectedEnvironment: financialEnvironmentValue }, returns: moneyResult, handler: syncCapacityHandler,
})
export const adjustSpendingPeriod = internalAction({
  args: spendingPeriodAdjustmentValue.extend({ expectedEnvironment: financialEnvironmentValue }), returns: moneyResult, handler: adjustSpendingPeriodHandler,
})
export const readSpendingPeriod = internalAction({
  args: spendingPeriodArgs, returns: spendingPeriodResult, handler: readSpendingPeriodHandler,
})
export const readDisplayBalance = internalAction({
  args: displayBalanceArgs, returns: displayBalanceResult, handler: readDisplayBalanceHandler,
})
export const reserveManagedCall = internalAction({
  args: { ...managedCallBookingArgs, expectedEnvironment: financialEnvironmentValue }, returns: moneyResult, handler: reserveManagedCallHandler,
})
export const readManagedCallSettlement = internalAction({
  args: managedCallBookingArgs, returns: managedCallSettlementReadResult, handler: readManagedCallSettlementHandler,
})
export const readManagedCallReservation = internalAction({
  args: managedCallBookingArgs, returns: managedCallReservationReadResult, handler: readManagedCallReservationHandler,
})
export const readManagedCallRelease = internalAction({
  args: managedCallBookingArgs, returns: managedCallReleaseReadResult, handler: readManagedCallReleaseHandler,
})
export const releaseManagedCall = internalAction({
  args: { ...releaseManagedCallArgs, expectedEnvironment: financialEnvironmentValue }, returns: moneyResult, handler: releaseManagedCallHandler,
})
export const releaseExpiredUnusedCall = internalAction({
  args: { ...releaseExpiredUnusedCallArgs, expectedEnvironment: financialEnvironmentValue }, returns: moneyResult, handler: releaseExpiredUnusedCallHandler,
})
export const settleManagedCall = internalAction({
  args: { ...finalizeManagedCallArgs, expectedEnvironment: financialEnvironmentValue }, returns: moneyResult, handler: settleManagedCallHandler,
})
export const remedyPaidCall = internalAction({
  args: { ...finalizeManagedCallArgs, expectedEnvironment: financialEnvironmentValue }, returns: moneyResult, handler: remedyPaidCallHandler,
})
export const reverseProviderSettlement = internalAction({
  args: { ...reverseProviderSettlementArgs, expectedEnvironment: financialEnvironmentValue }, returns: moneyResult, handler: reverseProviderSettlementHandler,
})

export const grantPromotionalCredit = internalAction({
  args: { ...promotionalCreditArgs, expectedEnvironment: financialEnvironmentValue }, returns: moneyResult, handler: grantPromotionalCreditHandler,
})
export const expirePromotionalCredit = internalAction({
  args: { ...promotionalCreditArgs, expectedEnvironment: financialEnvironmentValue }, returns: moneyResult, handler: expirePromotionalCreditHandler,
})

export const readCreditBalance = internalAction({
  args: readCreditBalanceArgs, returns: accountCreditBalanceValue, handler: readCreditBalanceHandler,
})

export const refundSettledSale = internalAction({
  args: { expectedEnvironment: financialEnvironmentValue, booking: v.object(managedCallBookingArgs), originalSettlementRefs: v.array(v.string()), reportDigest: v.string() },
  returns: moneyResult, handler: refundSettledSaleHandler,
})

export const readUsageReconciliation = internalAction({
  args: { ...periodArgs, accountRef: v.string(), snapshotAt: v.optional(v.number()), expectedSourceDigest: v.optional(v.string()) }, returns: financialReadResult, handler: readUsageReconciliationHandler,
})

export const readUsageReconciliationPage=internalAction({args:{...periodArgs,accountRef:v.string(),snapshotAt:v.number(),expectedSourceDigest:v.string(),cursor:v.union(v.string(),v.null()),lastTransactionId:v.union(v.string(),v.null())},returns:financialPageReadResult,handler:readUsageReconciliationPageHandler})

export const readCredentialActivityPage=internalAction({args:{accountRef:v.string(),credentialRef:v.string(),cursor:v.optional(v.string())},returns:credentialFinancialPageResult,handler:readCredentialActivityPageHandler})
