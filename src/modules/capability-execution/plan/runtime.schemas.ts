import { z } from 'zod'
import { brandNonEmpty } from '@/modules/common/ids'
import { callResultSchema } from '../call-contracts'
import type { PlanRunInput, PlanRunResult } from './contracts'

const planRef = z.string().min(1).max(300).transform(value => brandNonEmpty(value, 'PlanRef'))
const units = z.string().regex(/^(?:0|[1-9]\d{0,30})$/u).transform(value => brandNonEmpty(value, 'AudUnits'))
const state = z.enum(['quoted', 'awaiting_approval', 'running', 'succeeded', 'partially_succeeded', 'failed', 'cancelled', 'expired', 'reconciliation_required'])
const refusal = z.strictObject({ kind: z.literal('refused'), code: z.enum([
  'plan_quote_expired', 'plan_changed', 'approved_total_mismatch', 'grant_changed', 'approval_required',
  'total_exceeds_available', 'hold_unavailable', 'idempotency_key_reused', 'plan_not_found', 'plan_access_denied', 'plan_not_cancellable',
  'mfa_reverification_required',
]) })
export const planRunInputSchema: z.ZodType<PlanRunInput> = z.strictObject({
  planRef, approvedTotalAudUnits: units, idempotencyKey: z.string().min(1).max(200),
})
export const planReferenceInputSchema = z.strictObject({ planRef })
export type PlanReferenceInput = z.infer<typeof planReferenceInputSchema>
export const planRunResultSchema: z.ZodType<PlanRunResult> = z.union([refusal, z.strictObject({
  kind: z.enum(['running', 'awaiting_approval', 'replayed']), planRef, state,
})])
const node = z.strictObject({
  nodeId: z.string(), toolRef: z.string(), providerHost: z.string(), dependsOn: z.array(z.string()), ceilingAudUnits: units,
  state: z.enum(['waiting', 'ready', 'admitted', 'succeeded', 'failed', 'skipped']), callRef: z.string().exactOptional(),
  outcome: z.string().exactOptional(), result: callResultSchema.exactOptional(), chargedAudUnits: units.exactOptional(), releasedAudUnits: units.exactOptional(),
})
const progress = z.strictObject({
  kind: z.literal('available'), planRef, planDigest: z.string(), state, approvedTotalAudUnits: units,
  currency: z.literal('AUD'), exponent: z.literal(6), expiresAt: z.number(), runDeadlineAt: z.number(), maximumConcurrentNodes: z.number().int().min(1).max(3),
  terminationIntent: z.enum(['cancelled', 'expired']).exactOptional(), failureCode: z.string().exactOptional(),
  stages: z.array(z.array(z.string())), nodes: z.array(node),
  dataFlows: z.array(z.strictObject({ from: z.string(), to: z.string(), destinationProviderHost: z.string() })),
  hold: z.strictObject({ status: z.enum(['none', 'pending', 'reserved', 'released', 'uncertain']),
    settledAudUnits: units, releasedAudUnits: units, heldAudUnits: units.exactOptional() }),
})
export const planGetResultSchema = z.union([progress, refusal])
export type PlanGetResult = z.infer<typeof planGetResultSchema>

/** Convex preserves arbitrary Provider JSON as a string; public transports return the ordinary Call result. */
export function parsePlanReadback(value: unknown): PlanGetResult {
  const wire = z.union([refusal, progress.extend({ nodes: z.array(node.omit({ result: true }).extend({ resultJson: z.string().exactOptional() })) })]).parse(value)
  if (wire.kind === 'refused') return wire
  return planGetResultSchema.parse({ ...wire, nodes: wire.nodes.map(({ resultJson, ...item }) => ({
    ...item, ...(resultJson === undefined ? {} : { result: JSON.parse(resultJson) }),
  })) })
}
