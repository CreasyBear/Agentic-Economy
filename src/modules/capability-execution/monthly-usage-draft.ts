import { z } from 'zod'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import { serviceUsageEvidenceSchema, measurementSupportSchema, supportDigest } from '@/modules/capability-execution/service-usage-evidence'
import { financialUsageReadSchema, reconciliationCallSchema, reconcileUsage } from '@/modules/money/public'

/** This is a bounded evidence draft, never an issued invoice or money command. */
export const MAX_MONTHLY_DRAFT_ROWS = 300
export const MAX_MONTHLY_DRAFT_BYTES = 250_000
export const monthlyDraftIntentSchema = z.strictObject({ month: z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])$/u), revision: z.number().int().min(1).max(100) })
export function monthlyDraftPeriod(month: string) {
  monthlyDraftIntentSchema.shape.month.parse(month)
  const year = Number(month.slice(0, 4)), index = Number(month.slice(5)) - 1
  return { periodStartAt: Date.UTC(year, index, 1), periodEndAt: Date.UTC(year, index + 1, 1) }
}
export function monthlyDraftRef(accountRef: string, month: string, revision: number) {
  monthlyDraftIntentSchema.parse({ month, revision })
  return `monthly-usage-draft:${canonicalDigest({ format: 'ae.monthly-usage-draft-identity:v1', accountRef, month, revision }).slice(7)}`
}
const financial = financialUsageReadSchema.options[0]
export const monthlyDraftSnapshotSchema = z.strictObject({
  format: z.literal('ae.monthly-usage-draft:v1'), draftRef: z.string(), accountRef: z.string(), month: z.string(), revision: z.number().int(),
  priorDraftDigest: z.string().nullable(), ledgerSnapshotAt: z.number().int().nonnegative(), sourcesCapturedAt: z.number().int().nonnegative(),
  sourceIdentity: z.strictObject({environment: z.enum(['sandbox', 'production']), sourceDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u)}),
  requestedByPrincipalRef: z.string(), authorityRevisionAccount: z.number().int().nonnegative(),
  financial, calls: z.array(reconciliationCallSchema).max(MAX_MONTHLY_DRAFT_ROWS), sources: z.array(z.string().nullable()).max(MAX_MONTHLY_DRAFT_ROWS),
  measurements: z.array(z.strictObject({ credentialRef: z.string(), principalRef: z.string(), evidence: serviceUsageEvidenceSchema })).max(MAX_MONTHLY_DRAFT_ROWS),
  canonicalSupport: z.array(z.strictObject({ callRef: z.string(), updatedAt: z.number(), support: measurementSupportSchema, supportDigest: z.string() })).max(MAX_MONTHLY_DRAFT_ROWS),
  authoritativeForConsequences: z.literal(false), issuedInvoice: z.literal(false),
})
export type MonthlyDraftSnapshot = z.infer<typeof monthlyDraftSnapshotSchema>
export function freezeMonthlyDraft(input: MonthlyDraftSnapshot) {
  const snapshot = monthlyDraftSnapshotSchema.parse(input), period = monthlyDraftPeriod(snapshot.month)
  if (snapshot.draftRef !== monthlyDraftRef(snapshot.accountRef, snapshot.month, snapshot.revision) || snapshot.financial.snapshotAt !== snapshot.ledgerSnapshotAt
    || snapshot.ledgerSnapshotAt < period.periodEndAt || snapshot.sourcesCapturedAt < snapshot.ledgerSnapshotAt
    || snapshot.financial.entries.length > MAX_MONTHLY_DRAFT_ROWS || snapshot.financial.entries.some(entry => entry.recordedAt === null)
    || snapshot.measurements.some(row => row.evidence.kind !== 'available')
    || snapshot.canonicalSupport.some(row => row.supportDigest !== supportDigest(row.support))) throw new Error('monthly_draft_snapshot_invalid')
  // Validate all joins and periods before persisting the complete source facts.
  reconcileUsage({ ...period, financial: snapshot.financial, calls: snapshot.calls, sources: snapshot.sources })
  const snapshotJson = stableStringify(snapshot)
  if (new TextEncoder().encode(snapshotJson).length > MAX_MONTHLY_DRAFT_BYTES) throw new Error('monthly_draft_too_large')
  return { snapshot, snapshotJson, snapshotDigest: canonicalDigest(snapshot) }
}
export function readFrozenMonthlyDraft(snapshotJson: string, snapshotDigest: string) {
  const frozen = freezeMonthlyDraft(monthlyDraftSnapshotSchema.parse(JSON.parse(snapshotJson)))
  if (frozen.snapshotDigest !== snapshotDigest) throw new Error('monthly_draft_digest_conflict')
  return { ...frozen, reconciliation: reconcileUsage({ ...monthlyDraftPeriod(frozen.snapshot.month), financial: frozen.snapshot.financial, calls: frozen.snapshot.calls, sources: frozen.snapshot.sources }) }
}
