import type { RecoveryRow } from '@/modules/capability-execution/convex'
import type { DurableControlRow } from '@/modules/action-execution/runtime'
import type { CallResult } from '@/modules/capability-execution/call-contracts'

type RecoveryControlRow = DurableControlRow<CallResult>

export function recoveryControlMatchesCall(recovered: RecoveryRow, control: RecoveryControlRow): boolean {
  return control.control.owner.principalRef === recovered.principalId
    && control.control.owner.callerRef === recovered.credentialId
    && control.control.origin.kind === 'standalone'
    && control.control.origin.principalRef === recovered.principalId
    && control.control.origin.callerRef === recovered.credentialId
    && control.control.executionRef === recovered.callRef
    && control.sourceRef === `operation-invocation-source:${recovered.callRef}`
}

export function recoveryControlUsesPersistedResult(
  recovered: RecoveryRow,
  control: RecoveryControlRow | undefined,
): boolean {
  // Requires: this internal flag is derived from the durable manual unknown-
  // settlement hold. Ensures: restored local control cannot prove no release.
  // Invariant: generic recovery remains persisted while held; the dedicated
  // verified-paid remedy retains its own admission boundary.
  // On violation: keep the recorded uncertainty, without a retry or refund.
  return recovered.requiresManualSettlementReview === true
    || control === undefined
    || (recovered.state === 'completed' && recovered.result?.kind === 'completed'
      && control.control.control.state === 'terminal' && recovered.result.receipt?.state === 'settled')
    || (recovered.state === 'refused' && recovered.result?.kind === 'refused'
      && !recovered.result.retryable && recovered.result.receipt?.refundState === 'released')
}
