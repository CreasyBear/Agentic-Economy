import { type Infer } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { creditActivityResultValue, keyUsageResultValue, type FormanceStatementPageRead, type FormancePeriodSpendRead } from './contracts'

/** The current UTC-month window `AeOwnerCredit`'s own copy already promises. */
function currentUtcMonthWindow(): { periodStartAt: number; periodEndAt: number } {
  const now = new Date()
  return {
    periodStartAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    periodEndAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  }
}

export async function listCreditActivityHandler(ctx: ActionCtx, args: { principalId: string; credentialId: string; currency: string; paginationOpts: Infer<typeof paginationOptsValidator> }): Promise<Infer<typeof creditActivityResultValue>> {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'unauthenticated', items: [] }
    if (args.principalId !== actor.canonicalAccountRef) {
      return { kind: 'refused' as const, code: 'billing_identity_mismatch', items: [] }
    }
    const { periodStartAt, periodEndAt } = currentUtcMonthWindow()
    const page: FormanceStatementPageRead = await ctx.runAction(internal.moneyFormance.readStatementPage, {
      accountRef: actor.canonicalAccountRef,
      periodStartAt,
      periodEndAt,
      snapshotCutoffAt: Date.now(),
      ...(args.paginationOpts.cursor === null ? {} : { cursor: args.paginationOpts.cursor }),
    })
    if (page.kind !== 'available') return { kind: 'refused' as const, code: 'source_unavailable', items: [] }
    // Formance's statement page returns bare transaction references. It does
    // not carry the per-credential service/offering/charge-state detail this
    // view needs, and nothing else in the source tracks that breakdown per
    // credential today. Report unavailable rather than fabricate it.
    return { kind: 'refused' as const, code: 'credential_activity_unavailable', items: [] }
}

export async function readKeyUsageHandler(ctx: ActionCtx, args: { principalId: string; credentialId: string; currency: string }): Promise<Infer<typeof keyUsageResultValue>> {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'unauthenticated', items: [] }
    if (args.principalId !== actor.canonicalAccountRef) {
      return { kind: 'refused' as const, code: 'billing_identity_mismatch', items: [] }
    }
    const { periodStartAt, periodEndAt } = currentUtcMonthWindow()
    const spend: FormancePeriodSpendRead = await ctx.runAction(internal.moneyFormance.readPeriodSpend, {
      accountRef: actor.canonicalAccountRef,
      periodStartAt,
      periodEndAt,
    })
    if (spend.kind === 'setup_required' || spend.kind === 'unavailable') {
      return { kind: 'refused' as const, code: 'source_unavailable', items: [] }
    }
    // Formance's period spend is scoped to the whole Account, not a single
    // credential; there is no per-credential ledger to attribute a call
    // count or spend split to `args.credentialId`. Report unavailable rather
    // than fabricate a credential-level breakdown.
    return { kind: 'refused' as const, code: 'credential_usage_unavailable', items: [] }
}
