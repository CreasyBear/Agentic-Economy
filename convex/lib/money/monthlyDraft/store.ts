import type { Infer } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { resolveBusinessActor } from '../../../authz'
import { env } from '../../../_generated/server'
import { usageReadSourceDigest } from '@/modules/money/usage-read-source'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import { monthlyDraftIntentSchema, monthlyDraftRef, monthlyDraftPeriod, MAX_MONTHLY_DRAFT_ROWS, MAX_MONTHLY_DRAFT_BYTES, readFrozenMonthlyDraft } from '@/modules/capability-execution/monthly-usage-draft'
import { financialUsageReadSchema, type FinancialUsageRead } from '@/modules/money/public'
import { captureResult, draftAdmissionResult, draftResult } from './contracts'

export async function ownedDraft(ctx: Pick<QueryCtx, 'db' | 'auth'>, draftRef: string): Promise<Doc<'moneyMonthlyUsageDrafts'> | null> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  const row = await ctx.db.query('moneyMonthlyUsageDrafts').withIndex('by_draftRef', q => q.eq('draftRef', draftRef)).unique()
  return row?.accountRef === actor.canonicalAccountRef ? row : null
}
export function presentDraft(row: Doc<'moneyMonthlyUsageDrafts'>): Infer<typeof draftResult> {
  if (row.snapshotJson === undefined || row.snapshotDigest === undefined) return { kind: 'unavailable', code: 'monthly_draft_pending' }
  readFrozenMonthlyDraft(row.snapshotJson, row.snapshotDigest)
  return { kind: 'available', draftRef: row.draftRef, snapshotJson: row.snapshotJson, snapshotDigest: row.snapshotDigest, issuedInvoice: false, authoritativeForConsequences: false }
}
export async function readOwnerDraftHandler(ctx: QueryCtx, args: { draftRef: string }): Promise<Infer<typeof draftResult>> {
  const row = await ownedDraft(ctx, args.draftRef)
  return row === null ? { kind: 'refused', code: 'monthly_draft_not_found' } : presentDraft(row)
}
export async function admitOwnerDraftHandler(ctx: MutationCtx, args: { month: string; revision: number }): Promise<Infer<typeof draftAdmissionResult>> {
  const actor = await resolveBusinessActor(ctx), now = Date.now()
  if (actor.kind !== 'authenticated_owner') return { kind: 'refused', code: 'owner_required' }
  if (!monthlyDraftIntentSchema.safeParse(args).success || monthlyDraftPeriod(args.month).periodEndAt > now) return { kind: 'refused', code: 'closed_month_required' }
  const draftRef = monthlyDraftRef(actor.canonicalAccountRef, args.month, args.revision)
  let row = await ctx.db.query('moneyMonthlyUsageDrafts').withIndex('by_draftRef', q => q.eq('draftRef', draftRef)).unique()
  if (row === null) {
    const environment = env.AE_FORMANCE_ENVIRONMENT, ledger = env.AE_FORMANCE_LEDGER?.trim(), gatewayUrl = env.AE_FORMANCE_GATEWAY_URL?.trim()
    if ((environment !== 'sandbox' && environment !== 'production') || !ledger || !gatewayUrl) return {kind: 'setup_required', code: 'monthly_draft_source_unconfigured'}
    let sourceDigest: string
    try { sourceDigest = usageReadSourceDigest({environment, ledger, gatewayUrl}) } catch { return {kind: 'setup_required', code: 'monthly_draft_source_unconfigured'} }
    const sourceIdentity: {environment: 'sandbox' | 'production'; sourceDigest: string} = {environment, sourceDigest}
    const priorDraftRef = args.revision === 1 ? null : monthlyDraftRef(actor.canonicalAccountRef, args.month, args.revision - 1)
    if (priorDraftRef !== null) {
      const prior = await ownedDraft(ctx, priorDraftRef)
      if (prior?.snapshotDigest === undefined) return { kind: 'refused', code: 'prior_draft_required' }
    }
    const id = await ctx.db.insert('moneyMonthlyUsageDrafts', { draftRef, accountRef: actor.canonicalAccountRef, month: args.month, revision: args.revision,
      priorDraftRef, ledgerSnapshotAt: now, createdAt: now, sourceIdentity, requestedByPrincipalRef: actor.canonicalPrincipalRef, authorityRevisionAccount: actor.authorityRevision.account })
    row = await ctx.db.get(id)
  }
  if (row === null || row.accountRef !== actor.canonicalAccountRef) return { kind: 'refused', code: 'monthly_draft_identity_conflict' }
  return { kind: 'admitted', draftRef, accountRef: row.accountRef, month: row.month, revision: row.revision, ledgerSnapshotAt: row.ledgerSnapshotAt,
    sourceDigest: row.sourceIdentity.sourceDigest,
    financialSnapshotJson: row.financialSnapshotJson ?? null, snapshotJson: row.snapshotJson ?? null }
}
export async function captureFinancialHandler(ctx: MutationCtx, args: { draftRef: string; financial: FinancialUsageRead }): Promise<Infer<typeof captureResult>> {
  const row = await ownedDraft(ctx, args.draftRef)
  if (row === null) return { kind: 'refused', code: 'monthly_draft_not_found' }
  if (args.financial.kind !== 'available') return args.financial
  const read = financialUsageReadSchema.parse(args.financial)
  if (read.kind !== 'available' || read.snapshotAt !== row.ledgerSnapshotAt || read.entries.length > MAX_MONTHLY_DRAFT_ROWS) return { kind: 'unavailable', code: 'monthly_draft_snapshot_invalid' }
  const period = monthlyDraftPeriod(row.month)
  if (read.entries.some(entry => entry.occurredAt < period.periodStartAt || entry.occurredAt >= period.periodEndAt || entry.recordedAt === null || entry.recordedAt > row.ledgerSnapshotAt)) return { kind: 'unavailable', code: 'monthly_draft_snapshot_invalid' }
  const financialSnapshotJson = stableStringify(read)
  if (new TextEncoder().encode(financialSnapshotJson).length > MAX_MONTHLY_DRAFT_BYTES) return { kind: 'unavailable', code: 'monthly_draft_too_large' }
  const financialSnapshotDigest = canonicalDigest(read)
  if (row.financialSnapshotDigest !== undefined) return row.financialSnapshotDigest === financialSnapshotDigest ? { kind: 'captured' } : { kind: 'refused', code: 'monthly_draft_financial_conflict' }
  await ctx.db.patch(row._id, { financialSnapshotJson, financialSnapshotDigest })
  return { kind: 'captured' }
}
