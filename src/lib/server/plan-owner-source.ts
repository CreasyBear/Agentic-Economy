import { z } from 'zod'
import { callSourceMutation, callSourceQuery, callSourceAction, sourceAction, sourceMutation, sourceQuery } from './convex-source'
import { readClerkMfaConsequenceProof, type ClerkMfaConsequenceProofInput } from './clerk-consequence-proof'
import { sourceWriteAdmissionFromContext, sourceWriteRequestFromAdmission } from './source-write-admission'
import type { SourceWriteAdmission, SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'
import { planQuoteResultSchema, parsePlan } from '@/modules/capability-execution/plan/parse'
import { parsePlanReadback, planGetResultSchema, parsePlanRunReadback } from '@/modules/capability-execution/plan/runtime.schemas'
import { ownerPlanSummarySchema, type OwnerPlanDecision, type OwnerPlanRead, type OwnerPlanPageRead, type OwnerPlanSummary } from '@/modules/capability-execution/plan/owner.contracts'
import { ownerCallStatusResultSchema } from '@/modules/capability-execution/call-recovery.actions'
import type { PublicCallStatusRead } from '@/modules/capability-execution/call-receipt-view'
import type { PlanRunResult } from '@/modules/capability-execution/plan/contracts'

const readOwner = sourceQuery<{ planRef: string }, unknown>('capabilityPlans:readOwner')
const listOwner = sourceQuery<Record<string, never>, unknown>('capabilityPlans:listOwner')
const decideOwner = sourceMutation<OwnerPlanDecision & {
  operationKey: string; correlationId: string; proof?: ClerkMfaConsequenceProofInput;
  sourceWrite: SourceWriteAdmission; sourceWriteRequest: SourceWriteAdmissionRequest;
}, unknown>('capabilityPlans:decideOwner')

export async function readOwnerPlanThroughSource(planRef: string): Promise<OwnerPlanRead> {
  const result = await callSourceQuery(readOwner, { planRef })
  const available = z.strictObject({ kind: z.literal('available'), quote: planQuoteResultSchema, progress: z.unknown(), planJson: z.string() }).safeParse(result)
  if (!available.success) {
    const refused = planGetResultSchema.parse(result)
    if (refused.kind !== 'refused') throw new Error('owner_plan_result_invalid')
    return refused
  }
  const progress = parsePlanReadback(available.data.progress)
  if (progress.kind !== 'available' || progress.planRef !== planRef) throw new Error('owner_plan_identity_mismatch')
  const plan = parsePlan(JSON.parse(available.data.planJson))
  if ('kind' in plan) throw new Error('owner_plan_material_invalid')
  return { kind: 'available', quote: available.data.quote, progress, plan }
}
export async function listOwnerPlansThroughSource(): Promise<OwnerPlanSummary[]> {
  return z.array(ownerPlanSummarySchema).max(50).parse(await callSourceQuery(listOwner, {}))
}
export async function decideOwnerPlanThroughSource(data: OwnerPlanDecision, context: unknown): Promise<PlanRunResult> {
  const operationKey = `plan-approval:${data.planRef}:${data.decision}`
  const proof = data.decision === 'approve' ? await readClerkMfaConsequenceProof() : undefined
  const command = { ...data, operationKey, correlationId: operationKey, ...(proof === undefined ? {} : { proof }) }
  const sourceWrite = await sourceWriteAdmissionFromContext({ context, command, scope: 'protected_action', operationKey, correlationId: operationKey })
  return parsePlanRunReadback(await callSourceMutation(decideOwner, { ...command, sourceWrite, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite) }))
}

const readOwnerCall = sourceAction<{ callRef: string }, unknown>('capabilityCalls:readOwnerCallStatus')
export async function readOwnerPlanPageThroughSource(planRef: string): Promise<OwnerPlanPageRead> {
  const result = await readOwnerPlanThroughSource(planRef)
  if (result.kind !== 'available') return result
  const callRefs = result.progress.nodes.flatMap(node => node.callRef === undefined ? [] : [node.callRef])
  const callStatuses = await Promise.all(callRefs.map(async (callRef): Promise<PublicCallStatusRead> => {
    try {
      const status = ownerCallStatusResultSchema.parse(await callSourceAction(readOwnerCall, { callRef }))
      if (status.callRef !== callRef) throw new Error('plan_receipt_identity_mismatch')
      return status
    } catch {
      return { kind: 'source_unavailable', callRef }
    }
  }))
  return { ...result, callStatuses }
}

const cancelOwner = sourceMutation<{ planRef: string; operationKey: string; correlationId: string;
  sourceWrite: SourceWriteAdmission; sourceWriteRequest: SourceWriteAdmissionRequest }, unknown>('capabilityPlans:cancelOwner')
export async function cancelOwnerPlanThroughSource(planRef: string, context: unknown): Promise<PlanRunResult> {
  const operationKey = `plan-cancel:${planRef}`
  const command = { planRef, operationKey, correlationId: operationKey }
  const sourceWrite = await sourceWriteAdmissionFromContext({ context, command, scope: 'protected_action', operationKey, correlationId: operationKey })
  return parsePlanRunReadback(await callSourceMutation(cancelOwner, { ...command, sourceWrite, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite) }))
}
