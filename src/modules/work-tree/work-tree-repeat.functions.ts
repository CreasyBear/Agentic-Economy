import { z } from 'zod'

import {
  callSourceMutation,
  callSourceQuery,
  ConvexSourceError,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'

import {
  workTreeRepeatFinalizeInputSchema,
  workTreeRepeatFinalizeResultSchema,
  workTreeRepeatInspectInputSchema,
  workTreeRepeatInspectResultSchema,
  workTreeRepeatReconcileInputSchema,
  workTreeRepeatReconcileResultSchema,
  workTreeRepeatReserveInputSchema,
  workTreeRepeatReserveResultSchema,
  workTreeRepeatRefusalReasonSchema,
  type WorkTreeRepeatFinalizeInput,
  type WorkTreeRepeatFinalizeResult,
  type WorkTreeRepeatInspectInput,
  type WorkTreeRepeatInspectResult,
  type WorkTreeRepeatReconcileInput,
  type WorkTreeRepeatReconcileResult,
  type WorkTreeRepeatReserveInput,
  type WorkTreeRepeatReserveResult,
} from './internal/repeat-ledger'

export {
  workTreeRepeatFinalizeResultSchema,
  workTreeRepeatInspectResultSchema,
  workTreeRepeatReconcileResultSchema,
  workTreeRepeatReserveResultSchema,
}
export type {
  WorkTreeRepeatFinalizeResult,
  WorkTreeRepeatInspectResult,
  WorkTreeRepeatReconcileResult,
  WorkTreeRepeatReserveResult,
}

const reserveSourceMutation = sourceMutation<WorkTreeRepeatReserveInput, WorkTreeRepeatReserveResult>('workTreeRepeatLedger:reserveRepeatUse')
const finalizeSourceMutation = sourceMutation<WorkTreeRepeatFinalizeInput, WorkTreeRepeatFinalizeResult>('workTreeRepeatLedger:finalizeRepeatUse')
const reconcileSourceMutation = sourceMutation<WorkTreeRepeatReconcileInput, WorkTreeRepeatReconcileResult>('workTreeRepeatLedger:reconcileRepeatUse')
const inspectSourceQuery = sourceQuery<WorkTreeRepeatInspectInput, WorkTreeRepeatInspectResult>('workTreeRepeatLedger:inspectRepeatUse')

export async function reserveRepeatUseThroughSource(input: WorkTreeRepeatReserveInput): Promise<WorkTreeRepeatReserveResult> {
  try {
    return workTreeRepeatReserveResultSchema.parse(await callSourceMutation(reserveSourceMutation, workTreeRepeatReserveInputSchema.parse(input)))
  } catch (error) {
    return refusedResult(error)
  }
}

export async function finalizeRepeatUseThroughSource(input: WorkTreeRepeatFinalizeInput): Promise<WorkTreeRepeatFinalizeResult> {
  try {
    return workTreeRepeatFinalizeResultSchema.parse(await callSourceMutation(finalizeSourceMutation, workTreeRepeatFinalizeInputSchema.parse(input)))
  } catch (error) {
    return refusedResult(error)
  }
}

export async function reconcileRepeatUseThroughSource(input: WorkTreeRepeatReconcileInput): Promise<WorkTreeRepeatReconcileResult> {
  try {
    return workTreeRepeatReconcileResultSchema.parse(await callSourceMutation(reconcileSourceMutation, workTreeRepeatReconcileInputSchema.parse(input)))
  } catch (error) {
    return refusedResult(error)
  }
}

export async function inspectRepeatUseThroughSource(input: WorkTreeRepeatInspectInput): Promise<WorkTreeRepeatInspectResult> {
  try {
    return workTreeRepeatInspectResultSchema.parse(await callSourceQuery(inspectSourceQuery, workTreeRepeatInspectInputSchema.parse(input)))
  } catch (error) {
    return refusedResult(error)
  }
}

type RepeatRefusalReason = z.infer<typeof workTreeRepeatRefusalReasonSchema>

function refusedResult(error: unknown): { kind: 'refused'; reason: RepeatRefusalReason } {
  if (error instanceof ConvexSourceError && error.code === 'missing_auth') {
    return { kind: 'refused', reason: 'authentication_required' }
  }
  if (error instanceof ConvexSourceError && workTreeRepeatRefusalReasonSchema.safeParse(error.code).success) {
    return { kind: 'refused', reason: error.code as RepeatRefusalReason }
  }
  return { kind: 'refused', reason: 'source_unavailable' }
}
