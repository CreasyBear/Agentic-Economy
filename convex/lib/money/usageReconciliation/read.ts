import type { ActionCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { reconcileUsage, usageReconciliationSchema, type FinancialUsageRead, type UsageReconciliation } from '@/modules/money/public'
import type { Infer } from 'convex/values'
import { factsResult } from './contracts'

export async function readOwnerReconciliationHandler(ctx: ActionCtx, args: { periodStartAt: number; periodEndAt: number }): Promise<UsageReconciliation> {
  const admission: { kind: 'allowed'; accountRef: string } | { kind: 'refused'; code: string } = await ctx.runQuery(internal.capabilityCallProjections.prepareOwnerSpendRead, args)
  if (admission.kind === 'refused') return admission
  const financial: FinancialUsageRead = await ctx.runAction(internal.moneyFormance.readUsageReconciliation, { ...args, accountRef: admission.accountRef })
  if (financial.kind !== 'available') return financial
  const facts: Infer<typeof factsResult> = await ctx.runQuery(internal.moneyUsageReconciliation.readFacts, { ...args, entries: financial.entries })
  if (facts.kind !== 'available') return facts
  if (facts.accountRef !== admission.accountRef) return { kind: 'refused', code: 'reconciliation_account_changed' }
  return usageReconciliationSchema.parse(reconcileUsage({ ...args, financial, calls: facts.calls, sources: facts.sources }))
}
