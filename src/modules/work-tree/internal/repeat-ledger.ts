import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { exactAmountSchema, type ExactAmount } from '@/modules/money/public'

const identifier = z.string().trim().min(1).max(300)
const digest = identifier
const money = exactAmountSchema

export const workTreeRepeatReserveInputSchema = z.strictObject({
  projectId: identifier,
  permissionRef: identifier,
  operationKey: identifier,
  requestedOccurrences: z.number().int().positive().safe(),
  requestedSpend: money,
  requestedDataAllocations: z.number().int().nonnegative().safe(),
})
export type WorkTreeRepeatReserveInput = z.infer<typeof workTreeRepeatReserveInputSchema>

export const workTreeRepeatFinalizeInputSchema = z.strictObject({
  useRef: identifier,
  operationKey: identifier,
  actualOccurrences: z.number().int().nonnegative().safe(),
  actualSpend: money.optional(),
  actualDataAllocations: z.number().int().nonnegative().safe().optional(),
  outcome: z.enum(['settled', 'unknown']),
})
export type WorkTreeRepeatFinalizeInput = z.infer<typeof workTreeRepeatFinalizeInputSchema>

export const workTreeRepeatReconcileInputSchema = z.strictObject({
  useRef: identifier,
  operationKey: identifier,
  actualOccurrences: z.number().int().nonnegative().safe(),
  actualSpend: money.optional(),
  actualDataAllocations: z.number().int().nonnegative().safe().optional(),
  outcome: z.enum(['settled', 'not_settled']),
})
export type WorkTreeRepeatReconcileInput = z.infer<typeof workTreeRepeatReconcileInputSchema>

export const workTreeRepeatInspectInputSchema = z.strictObject({ useRef: identifier })
export type WorkTreeRepeatInspectInput = z.infer<typeof workTreeRepeatInspectInputSchema>

export const workTreeRepeatRefusalReasonSchema = z.enum([
  'authentication_required',
  'forbidden',
  'not_found',
  'conflict',
  'limit_exceeded',
  'permission_expired',
  'permission_revoked',
  'fence_mismatch',
  'credential_mismatch',
  'invalid_amount',
  'invalid_request',
  'already_finalized',
  'not_reconcilable',
  'live_money_gate_open',
  'stripe_setup_required',
  'source_unavailable',
])
const useStateSchema = z.enum(['reserved', 'unknown', 'settled', 'not_settled'])
const boundedCount = z.number().int().nonnegative().safe()
const boundedPositiveCount = z.number().int().positive().safe()
const refusedResultSchema = z.strictObject({
  kind: z.literal('refused'),
  reason: workTreeRepeatRefusalReasonSchema,
  useRef: identifier.optional(),
})
const conflictResultSchema = z.strictObject({
  kind: z.literal('conflict'),
  useRef: identifier.optional(),
  operationKey: identifier,
})
const reservationReceiptSchema = z.strictObject({
  kind: z.enum(['accepted', 'replayed']),
  useRef: identifier,
  permissionRef: identifier,
  operationKey: identifier,
  state: z.literal('reserved'),
  reservedOccurrences: boundedPositiveCount,
  reservedDataAllocations: boundedCount,
  reservedSpend: money,
})
const finalReceiptSchema = z.strictObject({
  kind: z.enum(['accepted', 'replayed', 'unknown']),
  useRef: identifier,
  operationKey: identifier,
  reconcileOperationKey: identifier.optional(),
  state: useStateSchema,
  releasedOccurrences: boundedCount,
  releasedSpend: money,
  releasedDataAllocations: boundedCount,
  heldSpend: money.optional(),
  heldDataAllocations: boundedCount.optional(),
})
const actualSpendSchema = money.optional()
const repeatInspectUseSchema = z.strictObject({
  useRef: identifier,
  permissionRef: identifier,
  projectId: identifier,
  treeId: identifier,
  principalId: identifier,
  nodeId: identifier,
  generation: boundedPositiveCount,
  revision: boundedPositiveCount,
  delegatedCredentialId: identifier,
  operationKey: identifier,
  requestedOccurrences: boundedPositiveCount,
  requestedSpend: money,
  requestedDataAllocations: boundedCount,
  reservedOccurrences: boundedCount,
  reservedSpend: money,
  reservedDataAllocations: boundedCount,
  state: useStateSchema,
  actualOccurrences: boundedCount.optional(),
  actualSpend: actualSpendSchema,
  actualDataAllocations: boundedCount.optional(),
  releasedOccurrences: boundedCount,
  releasedSpend: money,
  releasedDataAllocations: boundedCount,
  finalizeOperationKey: identifier.optional(),
  reconcileOperationKey: identifier.optional(),
})
const repeatInspectPermissionSchema = z.strictObject({
  permissionRef: identifier,
  projectId: identifier,
  treeId: identifier,
  nodeId: identifier,
  generation: boundedPositiveCount,
  revision: boundedPositiveCount,
  delegatedCredentialId: identifier,
  validFrom: z.number().finite(),
  validUntil: z.number().finite(),
  perUseSpend: money,
  cumulativeSpend: money,
  occurrenceLimit: boundedPositiveCount,
  perUseDataAllocations: boundedCount,
  cumulativeDataAllocations: boundedCount,
  reservedDataAllocations: boundedCount,
  settledDataAllocations: boundedCount,
  reservedOccurrences: boundedCount,
  settledOccurrences: boundedCount,
  reservedSpend: money,
  settledSpend: money,
  status: z.enum(['active', 'withdrawn']),
  issuedAt: z.number().finite(),
  sourceReceiptId: identifier,
})
const inspectAcceptedResultSchema = z.strictObject({
  kind: z.literal('accepted'),
  use: repeatInspectUseSchema,
  permission: repeatInspectPermissionSchema,
})

export const workTreeRepeatReserveResultSchema = z.union([reservationReceiptSchema, conflictResultSchema, refusedResultSchema])
export const workTreeRepeatFinalizeResultSchema = z.union([finalReceiptSchema, conflictResultSchema, refusedResultSchema])
export const workTreeRepeatReconcileResultSchema = z.union([finalReceiptSchema, conflictResultSchema, refusedResultSchema])
export const workTreeRepeatInspectResultSchema = z.union([inspectAcceptedResultSchema, refusedResultSchema])
export const workTreeRepeatResultSchema = z.union([
  reservationReceiptSchema,
  finalReceiptSchema,
  inspectAcceptedResultSchema,
  conflictResultSchema,
  refusedResultSchema,
])
export type WorkTreeRepeatReserveResult = z.infer<typeof workTreeRepeatReserveResultSchema>
export type WorkTreeRepeatFinalizeResult = z.infer<typeof workTreeRepeatFinalizeResultSchema>
export type WorkTreeRepeatReconcileResult = z.infer<typeof workTreeRepeatReconcileResultSchema>
export type WorkTreeRepeatInspectResult = z.infer<typeof workTreeRepeatInspectResultSchema>
export type WorkTreeRepeatResult = z.infer<typeof workTreeRepeatResultSchema>

export function repeatReservationDigest(input: WorkTreeRepeatReserveInput, principalId: string): string {
  return canonicalDigest({ contract: 'ae.work-tree-repeat-reservation:v1', ...input, principalId })
}

export function repeatFinalizationDigest(
  input: WorkTreeRepeatFinalizeInput | WorkTreeRepeatReconcileInput,
): string {
  return canonicalDigest({ contract: 'ae.work-tree-repeat-settlement:v1', ...input })
}

export function repeatPermissionDigest(input: Readonly<{
  projectId: string
  treeId: string
  ownerId: string
  principalId: string
  nodeId: string
  generation: number
  revision: number
  proposalDigest: string
  delegatedCredentialId: string
  validFrom: number
  validUntil: number
  perUseSpend: ExactAmount
  cumulativeSpend: ExactAmount
  occurrenceLimit: number
  perUseDataAllocations: number
  cumulativeDataAllocations: number
  sourceReceiptId: string
}>): string {
  return canonicalDigest({ contract: 'ae.work-tree-repeat-permission:v1', ...input })
}
