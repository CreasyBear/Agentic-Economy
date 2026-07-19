import {
  materializeRuntimePublishedOperation,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import type { ActionContext } from '@/modules/common/action'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { ActionInvocationView, PreparedInvocation } from './contracts'
import {
  assertExactDescriptor,
  dynamicPublishedSourceDigest,
  type DynamicPublishedInvocationInput,
  type DynamicPublishedInvocationResult,
} from './dynamic-published-contract'

export type DynamicPublishedSourceRow = Readonly<{
  operationKey: string
  operation: PublishedOperation
  input: DynamicPublishedInvocationInput
  context: ActionContext
  prepared?: PreparedInvocation
  observedResolution: ActionInvocationView<DynamicPublishedInvocationResult>['observedResolution']
  resultIdentity?: Readonly<{ sourceResultRef: string; resultDigest: string }>
}>

export type DynamicPublishedSourcePort = Readonly<{
  current(operationId: string): PublishedOperation | undefined
  read(operationKey: string): DynamicPublishedSourceRow | undefined
  write(row: DynamicPublishedSourceRow): void
  list(): readonly DynamicPublishedSourceRow[]
}>

export function createDevelopmentDynamicPublishedSource(
  operations: readonly PublishedOperation[],
  rows: Map<string, DynamicPublishedSourceRow> = new Map(),
): DynamicPublishedSourcePort & Readonly<{
  rows: Map<string, DynamicPublishedSourceRow>
  setCurrent(operation: PublishedOperation): void
}> {
  const current = new Map(operations.map((operation) => [operation.operationId, operation]))
  return {
    rows,
    current: (operationId) => current.get(operationId),
    read: (operationKey) => rows.get(operationKey),
    write: (row) => rows.set(row.operationKey, row),
    list: () => [...rows.values()],
    setCurrent: (operation) => current.set(operation.operationId, operation),
  }
}

export function requalifyDynamicPublishedSource(input: Readonly<{
  preparedOperation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  currentOperation: PublishedOperation | undefined
  value: StableHashValue
  now: number
}>): string | undefined {
  if (input.currentOperation === undefined) return 'publication_not_current'
  const currentDescriptor = materializeRuntimePublishedOperation(input.currentOperation)
  try {
    assertExactDescriptor(input.currentOperation, currentDescriptor)
  } catch {
    return 'descriptor_not_current'
  }
  if (!currentDescriptor.validateInput(input.value)) return 'input_invalid'
  if (input.currentOperation.readiness.validUntil <= input.now) return 'readiness_stale'
  if (
    input.descriptor.version !== currentDescriptor.version
    || dynamicPublishedSourceDigest(input.preparedOperation, input.descriptor)
      !== dynamicPublishedSourceDigest(input.currentOperation, currentDescriptor)
  ) return 'operation_material_changed'
  return undefined
}
