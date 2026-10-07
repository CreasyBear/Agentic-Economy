import { brandedStringSchema } from '@/modules/common/branded-string-schema'
import { z } from 'zod'
import { brandNonEmpty } from '@/modules/common/ids'
import { callResultSchema, parseCallRef } from '../call-contracts'
import type { PlanPrimaryNext, PlanRunInput, PlanRunResult } from './contracts'

const planRef = brandedStringSchema(z.string().min(1).max(300), value => brandNonEmpty(value, 'PlanRef'))
const units = brandedStringSchema(z.string().regex(/^(?:0|[1-9]\d{0,30})$/u), value => brandNonEmpty(value, 'AudUnits'))
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
const node = z.strictObject({
  nodeId: z.string(), toolRef: z.string(), providerHost: z.string(), dependsOn: z.array(z.string()), ceilingAudUnits: units,
  state: z.enum(['waiting', 'ready', 'admitted', 'succeeded', 'failed', 'skipped']), callRef: z.string().exactOptional(),
  outcome: z.string().exactOptional(), result: callResultSchema.exactOptional(), chargedAudUnits: units.exactOptional(), releasedAudUnits: units.exactOptional(),
})
export const planReferenceNextSchema = z.strictObject({
  action: z.enum(['tool.plan.get', 'tool.plan.cancel']), args: planReferenceInputSchema,
  authority: z.literal('same_principal'),
})
export type PlanReferenceNext = z.infer<typeof planReferenceNextSchema>
export const planPrimaryNextSchema: z.ZodType<PlanPrimaryNext> = z.union([
  planReferenceNextSchema.extend({ action: z.literal('tool.plan.get') }),
  z.strictObject({ action: z.literal('call.status'), authority: z.literal('same_principal'), args: z.strictObject({
    callRef: brandedStringSchema(z.string().regex(/^operation-invocation:v1:[0-9a-f]{64}$/u), value => brandNonEmpty(value, 'CallRef')),
  }) }),
])
const primaryNext = z.array(planPrimaryNextSchema).max(1)
export const planRunResultSchema: z.ZodType<PlanRunResult> = z.union([refusal, z.strictObject({
  kind: z.enum(['running', 'awaiting_approval', 'replayed']), planRef, state, next: primaryNext.exactOptional(),
})])
const ownerHandoff = z.strictObject({
  kind: z.literal('attention_required'), reason: z.enum(['owner_approval_required', 'plan_recovery_required']),
  planRef, path: z.string().startsWith('/'), detail: z.string(),
}).refine(value => value.path === (value.reason === 'owner_approval_required'
  ? `/plans/${encodeURIComponent(value.planRef)}` : '/support'), 'Use the existing owner destination for this Plan.')
const progress = z.strictObject({
  kind: z.literal('available'), planRef, planDigest: z.string(), state, approvedTotalAudUnits: units,
  currency: z.literal('AUD'), exponent: z.literal(6), expiresAt: z.number(), runDeadlineAt: z.number(), maximumConcurrentNodes: z.number().int().min(1).max(3),
  terminationIntent: z.enum(['cancelled', 'expired']).exactOptional(), failureCode: z.string().exactOptional(),
  stages: z.array(z.array(z.string())), nodes: z.array(node),
  next: primaryNext.exactOptional(),
  cancellation: planReferenceNextSchema.extend({ action: z.literal('tool.plan.cancel') }).exactOptional(), ownerHandoff: ownerHandoff.exactOptional(),
  dataFlows: z.array(z.strictObject({ from: z.string(), to: z.string(), destinationProviderHost: z.string() })),
  hold: z.strictObject({ status: z.enum(['none', 'pending', 'reserved', 'released', 'uncertain']),
    settledAudUnits: units, releasedAudUnits: units, heldAudUnits: units.exactOptional() }),
})
export const planGetResultSchema = z.union([progress, refusal])
export type PlanGetResult = z.infer<typeof planGetResultSchema>

/** Convex preserves arbitrary Provider JSON as a string; public transports return the ordinary Call result. */
export function parsePlanReadback(value: unknown): PlanGetResult {
  const wire = z.union([refusal, progress.omit({ next: true, cancellation: true, ownerHandoff: true }).extend({ nodes: z.array(node.omit({ result: true }).extend({ resultJson: z.string().exactOptional() })) })]).parse(value)
  if (wire.kind === 'refused') return wire
  const result = planGetResultSchema.parse({ ...wire, nodes: wire.nodes.map(({ resultJson, ...item }) => ({
    ...item, ...(resultJson === undefined ? {} : { result: JSON.parse(resultJson) }),
  })) })
  return result.kind === 'available' ? { ...result, next: [...projectPlanNext(result)], ...projectPlanControls(result) } : result
}

const terminalStates = new Set(['succeeded', 'partially_succeeded', 'failed', 'cancelled', 'expired'])

/** Existing controls only: a suggested read never resumes or creates a purchase. */
export function projectPlanNext(result: PlanGetResult | PlanRunResult): readonly PlanPrimaryNext[] {
  if (result.kind === 'refused' || terminalStates.has(result.state) || result.state === 'quoted') return []
  if (result.kind === 'available' && result.state === 'reconciliation_required') {
    const unresolved = result.nodes.find(item => item.state === 'admitted' && item.callRef !== undefined)
    const call = unresolved?.callRef === undefined ? undefined : parseCallRef(unresolved.callRef)
    if (call?.kind === 'valid') return [{ action: 'call.status', args: { callRef: call.ref }, authority: 'same_principal' }]
  }
  return [{ action: 'tool.plan.get', args: { planRef: result.planRef }, authority: 'same_principal' }]
}

/** Cancellation is an explicit control; owner attention is never an API approval or fabricated evidence. */
export function projectPlanControls(result: Extract<PlanGetResult, { kind: 'available' }>): Pick<typeof result, 'cancellation' | 'ownerHandoff'> {
  const cancellation = terminalStates.has(result.state) || result.terminationIntent !== undefined ? {}
    : { cancellation: { action: 'tool.plan.cancel' as const, args: { planRef: result.planRef }, authority: 'same_principal' as const } }
  if (result.state === 'awaiting_approval') return { ...cancellation, ownerHandoff: {
    kind: 'attention_required', reason: 'owner_approval_required', planRef: result.planRef,
    path: `/plans/${encodeURIComponent(result.planRef)}`,
    detail: 'The Account owner must review this exact Plan in AE. No Agent API approval action is available.',
  } }
  // Hold preparation and release also use reconciliation_required while work continues.
  // Only a recorded failure without an unresolved Call requires Plan-level attention.
  if (result.state === 'reconciliation_required' && result.failureCode !== undefined
    && !result.nodes.some(item => item.state === 'admitted' && item.callRef !== undefined && parseCallRef(item.callRef).kind === 'valid')) return { ...cancellation, ownerHandoff: {
    kind: 'attention_required', reason: 'plan_recovery_required', planRef: result.planRef, path: '/support',
    detail: 'Contact support with this Plan reference. No Plan reconciliation API is available; do not submit another run or invent Call reconciliation evidence.',
  } }
  return cancellation
}

/** Shared source boundary for run, cancellation and owner decisions; projection performs no work. */
export function parsePlanRunReadback(value: unknown): PlanRunResult {
  const result = planRunResultSchema.parse(value)
  return result.kind === 'refused' ? result : { ...result, next: [...projectPlanNext(result)] }
}
