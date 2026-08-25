import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type {
  OperationInvokeRecoveryResult,
  OperationInvokeStatusResult,
} from './operation-recovery-contracts'

export type OperationInvokeRecoveryRequest = Readonly<{
  invocationRef: string
  principal: AgentAccessPrincipal
  correlationId: string
}>

export type OperationInvokeRecoveryPort = Readonly<{
  read(input: OperationInvokeRecoveryRequest): Promise<OperationInvokeStatusResult>
  cancel(input: OperationInvokeRecoveryRequest & Readonly<{ idempotencyKey: string }>): Promise<OperationInvokeRecoveryResult>
  reconcile(input: OperationInvokeRecoveryRequest & Readonly<{ evidence: Record<string, unknown>; idempotencyKey: string }>): Promise<OperationInvokeRecoveryResult>
}>

function unavailableRecovery(invocationRef: string): OperationInvokeStatusResult {
  return {
    kind: 'refused',
    invocationRef,
    code: 'invocation_runtime_unavailable',
    retryable: true,
    nextAction: 'Retry after the invocation store is available.',
  }
}

export function bindOperationInvokeRecovery(input: Readonly<{
  recovery: OperationInvokeRecoveryPort | undefined
}>): Readonly<{
  readInvocationStatus(input: OperationInvokeRecoveryRequest): Promise<OperationInvokeStatusResult>
  cancelInvocation(input: OperationInvokeRecoveryRequest & Readonly<{ idempotencyKey: string }>): Promise<OperationInvokeRecoveryResult>
  reconcileInvocation(input: OperationInvokeRecoveryRequest & Readonly<{ evidence: Record<string, unknown>; idempotencyKey: string }>): Promise<OperationInvokeRecoveryResult>
}> {
  const recovery = input.recovery
  return {
    readInvocationStatus: async (request) => (
      recovery === undefined
        ? unavailableRecovery(request.invocationRef)
        : await recovery.read(request)
    ),
    cancelInvocation: async (request) => (
      recovery === undefined
        ? unavailableRecovery(request.invocationRef)
        : await recovery.cancel(request)
    ),
    reconcileInvocation: async (request) => (
      recovery === undefined
        ? unavailableRecovery(request.invocationRef)
        : await recovery.reconcile(request)
    ),
  }
}
