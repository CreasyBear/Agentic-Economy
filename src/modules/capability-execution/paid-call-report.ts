import { v, type Infer } from 'convex/values'
import { z } from 'zod'

export const paidCallReportInputSchema = z.strictObject({ callRef: z.string().trim().min(1).max(256) })
export const paidCallReportReason = 'answer_not_useful' as const
const amountFields = { amountUnits: v.string(), expiredPromotionalUnits: v.string() }
const amountSchemas = { amountUnits: z.string(), expiredPromotionalUnits: z.string() }
const refusedCodes = ['owner_required', 'call_not_eligible', 'report_limit_reached', 'rate_limited', 'source_unavailable'] as const
export const paidCallReportViewValue = v.union(
  v.object({ kind: v.literal('eligible'), callRef: v.string(), ...amountFields, remainingToday: v.number() }),
  v.object({ kind: v.literal('pending'), callRef: v.string(), reportRef: v.string(), ...amountFields }),
  v.object({ kind: v.literal('posted'), callRef: v.string(), reportRef: v.string(), ...amountFields }),
  v.object({ kind: v.literal('refused'), callRef: v.string(), code: v.union(...refusedCodes.map(code => v.literal(code))), retryable: v.boolean(), resetAt: v.optional(v.number()) }),
)
export const paidCallReportViewSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('eligible'), callRef: z.string(), ...amountSchemas, remainingToday: z.number() }),
  z.strictObject({ kind: z.literal('pending'), callRef: z.string(), reportRef: z.string(), ...amountSchemas }),
  z.strictObject({ kind: z.literal('posted'), callRef: z.string(), reportRef: z.string(), ...amountSchemas }),
  z.strictObject({ kind: z.literal('refused'), callRef: z.string(), code: z.enum(refusedCodes), retryable: z.boolean(), resetAt: z.number().optional() }),
]).transform(value => {
  if (value.kind !== 'refused') return value
  const { resetAt, ...rest } = value
  return resetAt === undefined ? rest : { ...rest, resetAt }
})
export type PaidCallReportView = Infer<typeof paidCallReportViewValue>
