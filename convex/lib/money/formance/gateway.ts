"use node"

import {
  createFormanceContext,
  installPackage4FormanceSchema,
  readFormanceConfiguration,
  readFormanceHealth,
  type FormanceContext,
} from '../../../../src/modules/money/formance'
export {
  readFormanceAccountHistory,
  readFormancePeriodSpend,
  readFormanceStatementPage,
} from '../../../../src/modules/money/formance'
export {
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
  remedyFormancePaidCall,
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

export function configuredContext() {
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
