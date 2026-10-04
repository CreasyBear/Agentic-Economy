"use node"

import { formanceAccountMetadataDigest, configuredContext, readFormanceUsageReconciliation } from './gateway'
import type { FinancialUsageRead } from '@/modules/money/public'

export async function readUsageReconciliationHandler(_ctx: unknown, args: {
  accountRef: string; periodStartAt: number; periodEndAt: number
}): Promise<FinancialUsageRead> {
  const accountDigest = formanceAccountMetadataDigest(args.accountRef)
  if (accountDigest === undefined) return { kind: 'setup_required', code: 'formance_reconciliation_query_invalid' }
  const context = configuredContext()
  return context.kind === 'setup_required' ? context : await readFormanceUsageReconciliation(context.context, { ...args, accountDigest })
}
