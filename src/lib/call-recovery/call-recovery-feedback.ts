import { purchaseStatusLabel } from '@/modules/capability-execution/call-receipt-view'
import type {
  CallRecoveryResult,
  CallStatusResult,
} from '@/modules/capability-execution/call-recovery-contracts'

import { machineLabel } from './machine-label'
import type { CallStatusPageActions, CallStatusPageResult } from './call-status-page-types'

export function statusFromRecovery(result: CallRecoveryResult): CallStatusPageResult {
  if (result.kind !== 'reconciliation_required') return result
  return {
    kind: 'found',
    callRef: result.callRef,
    version: Date.parse(result.evidence.requiredAt),
    toolRef: result.toolRef,
    state: 'reconciliation_required',
    attemptRef: result.evidence.attemptRef,
    effectGeneration: result.evidence.effectGeneration,
  }
}

export function refreshFeedback(result: CallStatusResult): CallStatusPageActions['feedback'] {
  if (result.kind === 'found') {
    return { kind: 'success', message: `Current status refreshed. Purchase status: ${purchaseStatusLabel(result)}.` }
  }
  if (result.kind === 'unchanged') {
    return { kind: 'success', message: `No status change. The Call remains at version ${result.version}.` }
  }
  return {
    kind: 'error',
    message: `The status source refused the refresh (${machineLabel(result.code)}). No current state is claimed.`,
  }
}

export function cancelFeedback(result: CallRecoveryResult): CallStatusPageActions['feedback'] {
  if (result.kind === 'reconciliation_required') {
    return {
      kind: 'error',
      message: 'Cancellation could not complete because the external effect may have started. Reconciliation evidence is required before retrying.',
    }
  }
  if (result.kind === 'refused') {
    return { kind: 'error', message: recoveryRefusalMessage(result.code) }
  }
  if (result.kind === 'unchanged') {
    return { kind: 'success', message: `No status change. The Call remains at version ${result.version}.` }
  }
  if (result.state === 'cancelled') {
    return { kind: 'success', message: 'Cancellation was recorded. The current status was refreshed.' }
  }
  return { kind: 'error', message: `Cancellation was not accepted. Current state remains ${machineLabel(result.state)}.` }
}

export function reconcileFeedback(result: CallRecoveryResult): CallStatusPageActions['feedback'] {
  if (result.kind === 'refused') return { kind: 'error', message: `Reconciliation was refused (${machineLabel(result.code)}). No state change is claimed.` }
  if (result.kind === 'reconciliation_required') return { kind: 'error', message: 'Reconciliation remains required. The submitted evidence was not accepted.' }
  if (result.kind === 'unchanged') return { kind: 'success', message: `No status change. The Call remains at version ${result.version}.` }
  if (result.state === 'terminal' || result.state === 'retryable') {
    return { kind: 'success', message: `Reconciliation recorded. Current state is ${machineLabel(result.state)} and the status was refreshed.` }
  }
  return { kind: 'error', message: `Reconciliation did not complete. Current state remains ${machineLabel(result.state)}.` }
}

function recoveryRefusalMessage(code: string): string {
  if (code === 'invocation_not_found') return 'This Call is no longer available to the signed-in owner.'
  if (code === 'invocation_runtime_unavailable') return 'The Call source is unavailable. No new state is claimed.'
  if (code === 'grant_generation_stale' || code === 'grant_revoked' || code === 'grant_expired') {
    return 'The issuing access grant changed, but owner recovery remains bound to this Call. Refresh the current record.'
  }
  return `The cancellation was refused (${machineLabel(code)}). No state change is claimed.`
}
