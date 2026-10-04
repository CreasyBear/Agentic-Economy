import type { Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { financialUsageReadSchema } from '@/modules/money/public'
import { freezeMonthlyDraft, monthlyDraftPeriod, MAX_MONTHLY_DRAFT_ROWS, type MonthlyDraftSnapshot } from '@/modules/capability-execution/monthly-usage-draft'
import { measurementSupport, supportDigest } from '@/modules/capability-execution/service-usage-evidence'
import { readMeasurementEvidence } from '../../capabilityExecution/serviceUsage/lineage'
import { readProviderUnitEvidence } from '../../capabilityExecution/serviceUsage/providerObservations'
import { readFactsForAccount } from '../usageReconciliation/facts'
import { draftResult } from './contracts'
import { ownedDraft, presentDraft } from './store'

/** A separate draft boundary: no adjustment policy, finalizer, invoice renderer,
 * signature, settlement or financial write command is reachable from this flow. */
export async function freezeOwnerDraftHandler(ctx: MutationCtx, args: { draftRef: string }): Promise<Infer<typeof draftResult>> {
  const row = await ownedDraft(ctx, args.draftRef)
  if (row === null) return { kind: 'refused', code: 'monthly_draft_not_found' }
  if (row.snapshotJson !== undefined) return presentDraft(row)
  if (row.financialSnapshotJson === undefined || row.financialSnapshotDigest === undefined) return { kind: 'unavailable', code: 'monthly_draft_financial_pending' }
  const financial = financialUsageReadSchema.parse(JSON.parse(row.financialSnapshotJson))
  if (financial.kind !== 'available' || canonicalDigest(financial) !== row.financialSnapshotDigest) return { kind: 'unavailable', code: 'monthly_draft_financial_conflict' }
  const period = monthlyDraftPeriod(row.month), sourcesCapturedAt = Date.now()
  const facts = await readFactsForAccount(ctx, { ...period, entries: financial.entries }, row.accountRef)
  if (facts.kind !== 'available') return facts
  if (facts.calls.length > MAX_MONTHLY_DRAFT_ROWS) return { kind: 'unavailable', code: 'monthly_draft_too_large' }
  const measured = await ctx.db.query('capabilityServiceUsageRecords').withIndex('by_accountRef_and_occurredAt', q => q.eq('accountRef', row.accountRef).gte('occurredAt', period.periodStartAt).lt('occurredAt', period.periodEndAt)).take(MAX_MONTHLY_DRAFT_ROWS + 1)
  if (measured.length > MAX_MONTHLY_DRAFT_ROWS) return { kind: 'unavailable', code: 'monthly_draft_too_large' }
  const measurements: MonthlyDraftSnapshot['measurements'] = []
  const callRefs = new Set(facts.calls.map(call => call.callRef))
  for (const usage of measured) {
    const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', usage.callRef)).unique()
    if (call === null || usage.observedAt > sourcesCapturedAt) return { kind: 'unavailable', code: 'monthly_draft_measurement_source_changed' }
    const evidence = await readMeasurementEvidence(ctx, usage, sourcesCapturedAt, sourcesCapturedAt, call)
    if (evidence.kind !== 'available') return { kind: 'unavailable', code: 'monthly_draft_measurement_source_changed' }
    measurements.push({ credentialRef: usage.credentialRef, principalRef: usage.principalRef, evidence })
    callRefs.add(call.callRef)
  }
  if (callRefs.size > MAX_MONTHLY_DRAFT_ROWS) return { kind: 'unavailable', code: 'monthly_draft_too_large' }
  const canonicalSupport: MonthlyDraftSnapshot['canonicalSupport'] = []
  const providerUnitEvidence: NonNullable<MonthlyDraftSnapshot['providerUnitEvidence']> = []
  for (const callRef of [...callRefs].sort()) {
    const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique()
    if (call?.ownerId !== row.accountRef) return { kind: 'unavailable', code: 'monthly_draft_source_changed' }
    providerUnitEvidence.push({callRef, evidence: await readProviderUnitEvidence(ctx, call, sourcesCapturedAt, sourcesCapturedAt)})
    const support = measurementSupport(call)
    canonicalSupport.push({ callRef, updatedAt: call.updatedAt, support, supportDigest: supportDigest(support) })
  }
  const prior = row.priorDraftRef === null ? null : await ownedDraft(ctx, row.priorDraftRef)
  if (row.priorDraftRef !== null && prior?.snapshotDigest === undefined) return { kind: 'unavailable', code: 'monthly_draft_prior_changed' }
  const snapshot: MonthlyDraftSnapshot = { format: 'ae.monthly-usage-draft:v1', draftRef: row.draftRef, accountRef: row.accountRef, month: row.month, revision: row.revision,
    sourceIdentity: row.sourceIdentity, requestedByPrincipalRef: row.requestedByPrincipalRef, authorityRevisionAccount: row.authorityRevisionAccount,
    priorDraftDigest: prior?.snapshotDigest ?? null, ledgerSnapshotAt: row.ledgerSnapshotAt, sourcesCapturedAt, financial,
    calls: facts.calls.sort((a,b) => a.callRef.localeCompare(b.callRef)), sources: facts.sources, measurements, canonicalSupport, providerUnitEvidence,
    authoritativeForConsequences: false, issuedInvoice: false }
  let frozen: ReturnType<typeof freezeMonthlyDraft>
  try { frozen = freezeMonthlyDraft(snapshot) } catch { return { kind: 'unavailable', code: 'monthly_draft_snapshot_invalid_or_too_large' } }
  await ctx.db.patch(row._id, { snapshotJson: frozen.snapshotJson, snapshotDigest: frozen.snapshotDigest, sourcesCapturedAt })
  const saved = await ctx.db.get(row._id)
  return saved === null ? { kind: 'unavailable', code: 'monthly_draft_source_changed' } : presentDraft(saved)
}
