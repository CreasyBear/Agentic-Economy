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

export type DynamicPublishedSemanticClaim = Readonly<{
  semanticBaseKey: string
  semanticIdentityDigest: string
  principalRef: string
  ownerInvocationRef: string
  status: 'pending' | 'completed' | 'uncertain'
  outcome?: DynamicPublishedSharedOutcome
}>

export type DynamicPublishedSourcePort = Readonly<{
  current(slot: string): PublishedOperation | undefined
  read(invocationRef: string): DynamicPublishedSourceRow | undefined
  write(row: DynamicPublishedSourceRow): void
  remove(invocationRef: string): void
  list(): readonly DynamicPublishedSourceRow[]
  listSemanticClaims(): readonly DynamicPublishedSemanticClaim[]
  claimSemanticEffect(input: Readonly<{
    semanticBaseKey: string
    semanticIdentityDigest: string
    principalRef: string
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
  restoredClaims: readonly DynamicPublishedSemanticClaim[] = [],
): DynamicPublishedSourcePort & Readonly<{
  rows: Map<string, DynamicPublishedSourceRow>
  setCurrent(operation: PublishedOperation): void
}> {
  const current = new Map(operations.map((operation) => [dynamicPublishedOperationSlot(operation), operation]))
  const semantic = new Map<string, {
    claim: DynamicPublishedSemanticClaim
    active: boolean
    waiters: ((outcome: DynamicPublishedSharedOutcome) => void)[]
  }>()
  for (const claim of restoredClaims) {
    semantic.set(claim.semanticBaseKey, { claim, active: false, waiters: [] })
  }
  return {
    rows,
    current: (operationId) => current.get(operationId),
    read: (invocationRef) => rows.get(invocationRef),
    write: (row) => rows.set(row.invocationRef, row),
    remove: (invocationRef) => { rows.delete(invocationRef) },
    list: () => [...rows.values()],
    listSemanticClaims: () => [...semantic.values()].map(({ claim }) => claim),
    claimSemanticEffect: ({ semanticBaseKey, semanticIdentityDigest, principalRef, invocationRef }) => {
      const prior = semantic.get(semanticBaseKey)
      if (prior === undefined) {
        semantic.set(semanticBaseKey, {
          claim: {
            semanticBaseKey,
            semanticIdentityDigest,
            principalRef,
            ownerInvocationRef: invocationRef,
            status: 'pending',
          },
          active: true,
          waiters: [],
        })
        return { kind: 'owner' }
      }
      if (prior.claim.semanticIdentityDigest !== semanticIdentityDigest
        || prior.claim.principalRef !== principalRef) return { kind: 'conflict' }
      if (prior.claim.outcome !== undefined) return { kind: 'reuse', outcome: prior.claim.outcome }
      if (prior.claim.ownerInvocationRef === invocationRef) {
        prior.active = true
        return { kind: 'owner' }
      }
      if (!prior.active) {
        const outcome: DynamicPublishedSharedOutcome = {
          semanticIdentityDigest,
          ownerInvocationRef: prior.claim.ownerInvocationRef,
          observedResolution: {
            state: 'threw',
            execution: 'runner_threw',
            message: 'semantic_effect_owner_process_lost',
          },
        }
        prior.claim = { ...prior.claim, status: 'uncertain', outcome }
        return { kind: 'reuse', outcome }
      }
      return {
        kind: 'wait',
        outcome: new Promise((resolve) => prior.waiters.push(resolve)),
      }
    },
    completeSemanticEffect: ({ semanticBaseKey, outcome }) => {
      const prior = semantic.get(semanticBaseKey)
      if (prior === undefined
        || prior.claim.ownerInvocationRef !== outcome.ownerInvocationRef
        || prior.claim.semanticIdentityDigest !== outcome.semanticIdentityDigest) {
        throw new Error('dynamic_semantic_effect_owner_mismatch')
      }
      prior.claim = {
        ...prior.claim,
        status: outcome.observedResolution.state === 'returned' ? 'completed' : 'uncertain',
        outcome,
      }
      prior.active = false
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
