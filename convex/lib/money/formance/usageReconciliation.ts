"use node"

import { formanceAccountMetadataDigest, configuredContext, readFormanceUsageReconciliation } from './gateway'
import type { FinancialUsageRead } from '@/modules/money/public'
import { usageReadSourceDigest } from '@/modules/money/usage-read-source'

export async function readUsageReconciliationHandler(_ctx: unknown, args: {
  accountRef: string; periodStartAt: number; periodEndAt: number; snapshotAt?: number; expectedSourceDigest?: string
}): Promise<FinancialUsageRead> {
  const accountDigest = formanceAccountMetadataDigest(args.accountRef)
  if (accountDigest === undefined) return { kind: 'setup_required', code: 'formance_reconciliation_query_invalid' }
  const context = configuredContext()
  if (context.kind === 'configured' && args.expectedSourceDigest !== undefined && args.expectedSourceDigest !== usageReadSourceDigest(context.context.configuration)) return {kind: 'unavailable', code: 'monthly_draft_ledger_source_changed'}
  return context.kind === 'setup_required' ? context : await readFormanceUsageReconciliation(context.context, { ...args, accountDigest, ...(args.snapshotAt === undefined ? {} : { now: args.snapshotAt }) })
}
