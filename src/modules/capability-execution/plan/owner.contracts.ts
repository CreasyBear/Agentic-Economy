import type { PublicCallStatusRead } from '../call-receipt-view'
import type { PlanJson } from './contracts'
import { z } from 'zod'
import { planQuoteResultSchema } from './parse'
import { planGetResultSchema } from './runtime.schemas'

export const ownerPlanSummarySchema = z.strictObject({
  planRef: z.string(), state: z.enum(['quoted', 'awaiting_approval', 'running', 'succeeded', 'partially_succeeded', 'failed', 'cancelled', 'expired', 'reconciliation_required']),
  approvedTotalAudUnits: z.string().regex(/^(?:0|[1-9]\d{0,30})$/u), nodeCount: z.number().int().min(1).max(10), createdAt: z.number(),
})
export type OwnerPlanSummary = z.infer<typeof ownerPlanSummarySchema>
export type OwnerPlanRead = Readonly<{ kind: 'available'; plan: PlanJson; quote: z.infer<typeof planQuoteResultSchema>; progress: Extract<z.infer<typeof planGetResultSchema>, { kind: 'available' }> }>
  | Extract<z.infer<typeof planGetResultSchema>, { kind: 'refused' }>
export const ownerPlanDecisionSchema = z.strictObject({
  planRef: z.string().min(1).max(300), planDigest: z.string().min(1).max(200),
  approvedTotalAudUnits: z.string().regex(/^(?:0|[1-9]\d{0,30})$/u), decision: z.enum(['approve', 'deny']),
})
export type OwnerPlanDecision = z.infer<typeof ownerPlanDecisionSchema>

export type OwnerPlanPageRead = Exclude<OwnerPlanRead, { kind: 'available' }>
  | (Extract<OwnerPlanRead, { kind: 'available' }> & Readonly<{ callStatuses: readonly PublicCallStatusRead[] }>)
