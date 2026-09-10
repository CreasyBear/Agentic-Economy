import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type {
  CallRecoveryResult,
  CallStatusResult,
} from './call-recovery-contracts'

export type CallRecoveryRequest = Readonly<{
  callRef: string
  afterVersion?: number
  principal: AgentAccessPrincipal
  correlationId: string
}>

export type CallRecoveryPort = Readonly<{
  read(input: CallRecoveryRequest): Promise<CallStatusResult>
  cancel(input: CallRecoveryRequest & Readonly<{ idempotencyKey: string }>): Promise<CallRecoveryResult>
  reconcile(input: CallRecoveryRequest & Readonly<{ evidence: Record<string, unknown>; idempotencyKey: string }>): Promise<CallRecoveryResult>
}>

function unavailableRecovery(callRef: string): CallStatusResult {
  return {
    kind: 'refused',
    callRef,
    code: 'invocation_runtime_unavailable',
    retryable: true,
    nextAction: 'Retry after the invocation store is available.',
  }
}

export function bindCallRecovery(input: Readonly<{
  recovery: CallRecoveryPort | undefined
}>): Readonly<{
  readCallStatus(input: CallRecoveryRequest): Promise<CallStatusResult>
  cancelCall(input: CallRecoveryRequest & Readonly<{ idempotencyKey: string }>): Promise<CallRecoveryResult>
  reconcileCall(input: CallRecoveryRequest & Readonly<{ evidence: Record<string, unknown>; idempotencyKey: string }>): Promise<CallRecoveryResult>
}> {
  const recovery = input.recovery
  return {
    readCallStatus: async (request) => (
      recovery === undefined
        ? unavailableRecovery(request.callRef)
        : await recovery.read(request)
    ),
    cancelCall: async (request) => (
      recovery === undefined
        ? unavailableRecovery(request.callRef)
        : await recovery.cancel(request)
    ),
    reconcileCall: async (request) => (
      recovery === undefined
        ? unavailableRecovery(request.callRef)
        : await recovery.reconcile(request)
    ),
  }
}
