"use node"

import { financialEnvironmentMatches, type FinancialEnvironment } from './contracts'

import {
  createFormanceContext,
  installPackage4FormanceSchema,
  readFormanceConfiguration,
  readFormanceHealth,
  type FormanceContext,
} from '../../../../src/modules/money/formance'
export {
  createFormanceContext,
  readFormanceConfiguration,
  readFormanceHealth,
  executeFormanceMoneyCommand,
  readFormanceAccountHistory,
  readFormanceUsageReconciliation,
  readFormancePeriodSpend,
  readFormanceStatementPage,
  type FormanceContext,
} from '../../../../src/modules/money/formance'
export { readFormanceTreasurySnapshot, type FormanceTreasurySnapshotResult } from '../../../../src/modules/money/formance-treasury-snapshot'
export { readFormanceTreasuryAudit, matchTreasuryProviderSettlement, matchTreasuryFunding,
  matchTreasuryCallCash, matchTreasuryBatch, treasuryAuditCashAddresses, treasuryAuditCallDigest,
  isTreasuryFundingAuditTransaction, treasuryFundingPrincipalDelta,
  type FormanceTreasuryAuditResult, type FormanceTreasuryAuditTransaction,
} from '../../../../src/modules/money/formance-treasury-audit'
export { bookFormanceTreasuryBatch } from '../../../../src/modules/money/formance-treasury'
export {
  readFormanceAccountCreditBalance,
  grantFormancePromotionalCredit,
  expireFormancePromotionalCredit,
  type FormancePromotionalCreditBooking,
  adjustFormanceSpendingPeriod,
  bookFormanceFundingReversal,
  bookFormanceFundingSettlement,
  bookFormanceBuyerAdjustment,
  formanceAccountMetadataDigest,
  readFormanceDisplayBalance,
  readFormanceSpendingPeriod,
  releaseFormanceManagedCall,
  reverseFormanceProviderSettlement,
  reserveFormanceManagedCall,
  settleFormanceManagedCall,
  readFormanceManagedCallSettlement,
  readFormanceManagedCallReservation,
  readFormanceManagedCallRelease,
  remedyFormancePaidCall,
  refundFormanceSettledSale,
  type FormanceSettledSaleRefund,
  syncFormanceCapacity,
  type FormanceBuyerAdjustment,
  type FormanceCapacitySync,
  type FormanceFundingBooking,
  type FormanceManagedCallBooking,
  type FormanceManagedCallFinalization,
  type FormanceManagedCallRelease,
  type FormanceProviderReversal,
  type FormanceSpendingPeriodAdjustment,
} from '../../../../src/modules/money/formance-workflows'

export function configuredContext(expectedEnvironment?: FinancialEnvironment) {
  if (expectedEnvironment !== undefined && !financialEnvironmentMatches(expectedEnvironment)) {
    return { kind: 'setup_required' as const, code: 'environment_mismatch' }
  }
  const result = readFormanceConfiguration()
  return result.kind === 'setup_required'
    ? result
    : Object.freeze({ kind: 'configured' as const, context: createFormanceContext(result.configuration) })
}

export async function withFormanceContext<T>(
  run: (context: FormanceContext) => Promise<T>,
): Promise<T | { kind: 'setup_required'; code: string }> {
  const context = configuredContext()
  return context.kind === 'setup_required' ? context : await run(context.context)
}

export async function healthHandler() {
  return await withFormanceContext((context) => readFormanceHealth(context))
}

export async function installSchemaHandler() {
  return await withFormanceContext((context) => installPackage4FormanceSchema(context))
}
