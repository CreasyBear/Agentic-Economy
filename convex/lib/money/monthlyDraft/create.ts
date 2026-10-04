import type { Infer } from 'convex/values'
import type { ActionCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { monthlyDraftPeriod } from '@/modules/capability-execution/monthly-usage-draft'
import { draftResult } from './contracts'

export async function createOwnerDraftHandler(ctx: ActionCtx, args: { month: string; revision: number }): Promise<Infer<typeof draftResult>> {
  const admission = await ctx.runMutation(internal.moneyMonthlyUsageDraft.admitOwnerDraft, args)
  if (admission.kind !== 'admitted') return admission
  if (admission.snapshotJson !== null) return await ctx.runQuery(internal.moneyMonthlyUsageDraft.readOwnerDraftInternal, { draftRef: admission.draftRef })
  if (admission.financialSnapshotJson === null) {
    const financial = await ctx.runAction(internal.moneyFormance.readUsageReconciliation, { ...monthlyDraftPeriod(admission.month), accountRef: admission.accountRef, snapshotAt: admission.ledgerSnapshotAt, expectedSourceDigest: admission.sourceDigest })
    if (financial.kind !== 'available') return financial
    const captured = await ctx.runMutation(internal.moneyMonthlyUsageDraft.captureFinancial, { draftRef: admission.draftRef, financial })
    if (captured.kind !== 'captured') return captured
  }
  return await ctx.runMutation(internal.moneyMonthlyUsageDraft.freezeOwnerDraft, { draftRef: admission.draftRef })
}
