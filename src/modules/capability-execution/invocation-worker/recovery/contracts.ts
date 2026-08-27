import { v, type Infer, type ObjectType } from 'convex/values'
import {
  reconciliationEvidenceValue,
  reconciliationValue,
  recoveryResultValue,
} from '@/modules/capability-execution/convex'
import { x402PaymentReconciliationEvidenceValue } from '@/modules/action-invocation/runtime'
import type { RecoveryRow } from '../../../../../convex/capabilityOperationInvocationProjection'

export const recoveryArgs = {
  invocationRef: v.string(),
  principalId: v.string(),
  credentialId: v.string(),
  mode: v.union(v.literal('status'), v.literal('cancel'), v.literal('reconcile')),
  idempotencyKey: v.optional(v.string()),
  evidence: v.optional(v.union(reconciliationEvidenceValue, x402PaymentReconciliationEvidenceValue)),
} as const

export type RecoveredInvocation = RecoveryRow & Readonly<{ grantRef: string }>
export type RecoveryResult = Infer<typeof recoveryResultValue>
export type RecoveryEvidence = ObjectType<typeof recoveryArgs>['evidence']
export type RecoveryIdentity = Readonly<{
  invocationRef: string
  principalId: string
  credentialId: string
}>
type ExpiryRecoveryResult = Extract<RecoveryResult, { kind: 'reconciliation_required' }>
export type InternalRecoveryResult = RecoveryResult | (ExpiryRecoveryResult & Readonly<{
  expiryDisposition: 'automatic' | 'manual_review'
}>)
export type ExpiryQueueResult =
  | Readonly<{
      kind: 'queued'
      disposition: 'automatic'
      invocationRef: string
      operationRef: string
      evidence: Infer<typeof reconciliationValue>
    }>
  | Readonly<{
      kind: 'manual_review'
      disposition: 'manual_review'
      invocationRef: string
      operationRef: string
      evidence: Infer<typeof reconciliationValue>
    }>
  | Readonly<{ kind: 'not_queued' }>
