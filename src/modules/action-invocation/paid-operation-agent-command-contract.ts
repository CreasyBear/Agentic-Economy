import type {
  PaidOperationContinuation,
  PaidOperationSemantics,
} from './paid-operation-semantics'

export type PaidOperationAgentCommand =
  | 'inspect'
  | 'authorize'
  | 'execute'
  | 'reconcile'

export type PaidOperationAgentCommandDescriptor = Readonly<{
  command: PaidOperationAgentCommand
  commandIdRequired: boolean
  expectedInvocationVersion: number
  requiredInput: readonly [] | readonly ['accept']
  relation: Readonly<{
    method: 'GET' | 'POST'
    href: string
  }>
}>

/**
 * Projects only the current source-owned paid-operation continuation. Retry is
 * deliberately absent: uncertainty remains inspect/reconcile-only, and a
 * caller never constructs a later command, version, or route.
 */
export function projectPaidOperationAgentCommands(
  semantics: PaidOperationSemantics,
): readonly PaidOperationAgentCommandDescriptor[] {
  if (semantics.continuations.length !== 1) return []
  const continuation = semantics.continuations[0]
  if (
    continuation === undefined
    || continuation.kind === 'retry'
    || continuation.expectedInvocationVersion
      !== semantics.identity.expectedInvocationVersion
  ) return []

  const descriptor = commandDescriptor(continuation, semantics.identity.invocationRef)
  return descriptor === undefined ? [] : Object.freeze([descriptor])
}

function commandDescriptor(
  continuation: Exclude<PaidOperationContinuation, Readonly<{ kind: 'retry' }>>,
  invocationRef: string,
): PaidOperationAgentCommandDescriptor | undefined {
  const expectedInvocationVersion = continuation.expectedInvocationVersion
  const encodedRef = encodeURIComponent(invocationRef)
  if (continuation.kind === 'inspect') {
    return Object.freeze({
      command: 'inspect',
      commandIdRequired: false,
      expectedInvocationVersion,
      requiredInput: [],
      relation: {
        method: 'GET',
        href: `/api/v1/paid-operations/${encodedRef}?expectedInvocationVersion=${expectedInvocationVersion}`,
      },
    } satisfies PaidOperationAgentCommandDescriptor)
  }

  if (continuation.kind === 'authorize') {
    return Object.freeze({
      command: 'authorize',
      commandIdRequired: true,
      expectedInvocationVersion,
      requiredInput: ['accept'],
      relation: {
        method: 'POST',
        href: `/api/v1/paid-operations/${encodedRef}/commands`,
      },
    } satisfies PaidOperationAgentCommandDescriptor)
  }

  if (continuation.kind === 'execute' || continuation.kind === 'reconcile') {
    return Object.freeze({
      command: continuation.kind,
      commandIdRequired: true,
      expectedInvocationVersion,
      requiredInput: [],
      relation: {
        method: 'POST',
        href: `/api/v1/paid-operations/${encodedRef}/commands`,
      },
    } satisfies PaidOperationAgentCommandDescriptor)
  }

  return undefined
}
