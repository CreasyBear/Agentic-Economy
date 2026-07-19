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
  invocationRef: string
  operationKey: string
  semanticBaseKey: string
  semanticIdentityDigest: string
  operation: PublishedOperation
  input: DynamicPublishedInvocationInput
  context: ActionContext
  prepared?: PreparedInvocation
  observedResolution: ActionInvocationView<DynamicPublishedInvocationResult>['observedResolution']
  resultIdentity?: Readonly<{ sourceResultRef: string; resultDigest: string }>
}>

export type DynamicPublishedSharedOutcome = Readonly<{
  semanticIdentityDigest: string
  ownerInvocationRef: string
  observedResolution: DynamicPublishedSourceRow['observedResolution']
  resultIdentity?: DynamicPublishedSourceRow['resultIdentity']
}>

export type DynamicPublishedSourcePort = Readonly<{
  current(slot: string): PublishedOperation | undefined
  read(invocationRef: string): DynamicPublishedSourceRow | undefined
  write(row: DynamicPublishedSourceRow): void
  list(): readonly DynamicPublishedSourceRow[]
  claimSemanticEffect(input: Readonly<{
    semanticBaseKey: string
    semanticIdentityDigest: string
    invocationRef: string
  }>):
    | Readonly<{ kind: 'owner' }>
    | Readonly<{ kind: 'reuse'; outcome: DynamicPublishedSharedOutcome }>
    | Readonly<{ kind: 'wait'; outcome: Promise<DynamicPublishedSharedOutcome> }>
    | Readonly<{ kind: 'conflict' }>
  completeSemanticEffect(input: Readonly<{
    semanticBaseKey: string
    outcome: DynamicPublishedSharedOutcome
  }>): void
}>

export function dynamicPublishedOperationSlot(operation: PublishedOperation): string {
  return [
    operation.identity.businessId,
    operation.identity.publicationRef,
    operation.identity.contractId,
    operation.identity.contractVersion,
  ].join('\u0000')
}

export function createDevelopmentDynamicPublishedSource(
  operations: readonly PublishedOperation[],
  rows: Map<string, DynamicPublishedSourceRow> = new Map(),
): DynamicPublishedSourcePort & Readonly<{
  rows: Map<string, DynamicPublishedSourceRow>
  setCurrent(operation: PublishedOperation): void
}> {
  const current = new Map(operations.map((operation) => [dynamicPublishedOperationSlot(operation), operation]))
  const semantic = new Map<string, {
    semanticIdentityDigest: string
    ownerInvocationRef: string
    outcome?: DynamicPublishedSharedOutcome
    waiters: ((outcome: DynamicPublishedSharedOutcome) => void)[]
  }>()
  for (const row of rows.values()) {
    if (row.resultIdentity === undefined || row.observedResolution.state === 'pending') continue
    semantic.set(row.semanticBaseKey, {
      semanticIdentityDigest: row.semanticIdentityDigest,
      ownerInvocationRef: row.invocationRef,
      outcome: {
        semanticIdentityDigest: row.semanticIdentityDigest,
        ownerInvocationRef: row.invocationRef,
        observedResolution: row.observedResolution,
        resultIdentity: row.resultIdentity,
      },
      waiters: [],
    })
  }
  return {
    rows,
    current: (operationId) => current.get(operationId),
    read: (invocationRef) => rows.get(invocationRef),
    write: (row) => rows.set(row.invocationRef, row),
    list: () => [...rows.values()],
    claimSemanticEffect: ({ semanticBaseKey, semanticIdentityDigest, invocationRef }) => {
      const prior = semantic.get(semanticBaseKey)
      if (prior === undefined) {
        semantic.set(semanticBaseKey, {
          semanticIdentityDigest,
          ownerInvocationRef: invocationRef,
          waiters: [],
        })
        return { kind: 'owner' }
      }
      if (prior.semanticIdentityDigest !== semanticIdentityDigest) return { kind: 'conflict' }
      if (prior.outcome !== undefined) return { kind: 'reuse', outcome: prior.outcome }
      return {
        kind: 'wait',
        outcome: new Promise((resolve) => prior.waiters.push(resolve)),
      }
    },
    completeSemanticEffect: ({ semanticBaseKey, outcome }) => {
      const prior = semantic.get(semanticBaseKey)
      if (prior === undefined
        || prior.ownerInvocationRef !== outcome.ownerInvocationRef
        || prior.semanticIdentityDigest !== outcome.semanticIdentityDigest) {
        throw new Error('dynamic_semantic_effect_owner_mismatch')
      }
      prior.outcome = outcome
      for (const resolve of prior.waiters.splice(0)) resolve(outcome)
    },
    setCurrent: (operation) => current.set(dynamicPublishedOperationSlot(operation), operation),
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
