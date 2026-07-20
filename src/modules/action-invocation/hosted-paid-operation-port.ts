import type { ActionResult } from '@/modules/common/action'

import type { ActionInvocationView, InvocationActor } from './contracts'
import type { PaidOperationInterpretation } from './paid-operation-application-service'
import type { PaidOperationPaymentAttemptSnapshot } from './paid-operation-semantics'

export const HOSTED_PAID_OPERATION_CHILD_CAP = 32
export const HOSTED_PAID_OPERATION_HISTORY_PAGE_SIZE = 20

export type HostedPaidOperationHeader = Readonly<{
  ownerPrincipalRef: string
  invocationRef: string
  selectedSourceRef: string
  paymentAttemptRequired: boolean
  currentPaymentIdentifier?: string
  currentEffectGeneration?: number
  historyCursor: string | null
  historyPageSize: typeof HOSTED_PAID_OPERATION_HISTORY_PAGE_SIZE
}>

export type HostedPaidOperationAggregate<Result extends ActionResult> = Readonly<{
  header: HostedPaidOperationHeader
  invocation: ActionInvocationView<Result>
  paymentAttempt?: PaidOperationPaymentAttemptSnapshot
  interpretation: PaidOperationInterpretation<Result>
  evidenceReferences: readonly string[]
  history: readonly Readonly<{ commandId: string; invocationVersion: number }>[]
}>

export type HostedAggregateIncompleteReason =
  | 'header_mismatch'
  | 'selected_source_missing'
  | 'authority_missing'
  | 'current_attempt_missing'
  | 'payment_attempt_missing'
  | 'attempt_cap_exceeded'
  | 'evidence_reference_cap_exceeded'
  | 'history_page_cap_exceeded'

export type HostedPaidOperationLoadResult<Result extends ActionResult> =
  | Readonly<{ kind: 'loaded'; aggregate: HostedPaidOperationAggregate<Result> }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'aggregate_incomplete'; reason: HostedAggregateIncompleteReason }>

export type HostedPaidOperationTransaction<Result extends ActionResult> = Readonly<{
  owner: InvocationActor
  invocationRef: string
  commandId: string
  commandDigest: string
  expectedInvocationVersion: number
  expectedEffectGeneration?: number
  next: HostedPaidOperationAggregate<Result>
}>

export type HostedPaidOperationInitialCreation<Result extends ActionResult> = Readonly<{
  creationCommandId: string
  creationCommandDigest: string
  reservationRef: string
  aggregate: HostedPaidOperationAggregate<Result>
}>

export type HostedPaidOperationInitialCreationResult =
  | Readonly<{ kind: 'created' | 'duplicate' }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'creation_command_conflict'
        | 'invocation_already_exists'
        | 'aggregate_incomplete'
    }>

export type HostedPaidOperationTransactionResult =
  | Readonly<{
      kind: 'applied' | 'duplicate'
      invocationVersion: number
      effectGeneration?: number
    }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'command_identity_conflict'
        | 'cross_principal_refused'
        | 'stale_invocation_version'
        | 'effect_generation_stale'
        | 'aggregate_incomplete'
    }>

export type HostedPaidOperationAdmissionResult =
  | Readonly<{ kind: 'admitted'; reservationRef: string }>
  | Readonly<{
      kind: 'refused'
      code: 'trial_disabled' | 'principal_not_allowlisted' | 'total_exhausted' |
        'concurrency_exhausted' | 'rate_exhausted'
    }>

export type HostedPaidOperationPort<Result extends ActionResult> = Readonly<{
  createInitial(
    input: HostedPaidOperationInitialCreation<Result>,
  ): Promise<HostedPaidOperationInitialCreationResult>
  loadComplete(input: Readonly<{
    owner: InvocationActor
    invocationRef: string
  }>): Promise<HostedPaidOperationLoadResult<Result>>
  transact(input: HostedPaidOperationTransaction<Result>): Promise<HostedPaidOperationTransactionResult>
  reserveAdmission(input: Readonly<{
    principalRef: string
    windowKey: string
  }>): Promise<HostedPaidOperationAdmissionResult>
}>

type AdmissionPolicy = Readonly<{
  enabled: boolean
  allowedPrincipals: readonly string[]
  totalLimit: number
  concurrencyLimit: number
  rateLimit: number
}>

const DEFAULT_ADMISSION_POLICY: AdmissionPolicy = {
  enabled: false,
  allowedPrincipals: [],
  totalLimit: 0,
  concurrencyLimit: 0,
  rateLimit: 0,
}

/**
 * Local durable-fixture adapter. It models the same atomic compare-and-set seam
 * as Convex without claiming deployment or provider behaviour.
 */
export function createInMemoryHostedPaidOperationPort<Result extends ActionResult>(
  initial: readonly HostedPaidOperationAggregate<Result>[] = [],
  admissionPolicy: AdmissionPolicy = DEFAULT_ADMISSION_POLICY,
): HostedPaidOperationPort<Result> & Readonly<{
  effectGenerationCount(invocationRef: string): number
  exportDurableFixture(): readonly HostedPaidOperationAggregate<Result>[]
}> {
  const records = new Map<string, HostedPaidOperationAggregate<Result>>()
  const commands = new Map<string, Readonly<{
    digest: string
    invocationVersion: number
    effectGeneration?: number
  }>>()
  const creationCommands = new Map<string, Readonly<{
    digest: string
    invocationRef: string
  }>>()
  const admittedTotals = new Map<string, number>()
  const admittedConcurrent = new Map<string, number>()
  const admittedRates = new Map<string, number>()
  let reservationSequence = 0

  for (const aggregate of initial) {
    assertAggregateSerializable(aggregate)
    records.set(aggregate.invocation.invocationRef, clone(aggregate))
  }

  return Object.freeze({
    createInitial: async (input) => {
      assertAggregateSerializable(input.aggregate)
      const incomplete = aggregateIncomplete(input.aggregate)
      if (incomplete !== undefined) {
        return { kind: 'refused', code: 'aggregate_incomplete' }
      }
      const prior = creationCommands.get(input.creationCommandId)
      if (prior !== undefined && prior.digest !== input.creationCommandDigest) {
        return { kind: 'refused', code: 'creation_command_conflict' }
      }
      if (prior !== undefined) return { kind: 'duplicate' }
      if (records.has(input.aggregate.invocation.invocationRef)) {
        return { kind: 'refused', code: 'invocation_already_exists' }
      }
      records.set(
        input.aggregate.invocation.invocationRef,
        clone(input.aggregate),
      )
      creationCommands.set(input.creationCommandId, {
        digest: input.creationCommandDigest,
        invocationRef: input.aggregate.invocation.invocationRef,
      })
      return { kind: 'created' }
    },
    loadComplete: async ({ owner, invocationRef }) => {
      const aggregate = records.get(invocationRef)
      if (aggregate === undefined
        || aggregate.invocation.owner.principalRef !== owner.principalRef
        || aggregate.invocation.owner.callerRef !== owner.callerRef) {
        return { kind: 'not_found' }
      }
      const incomplete = aggregateIncomplete(aggregate)
      return incomplete === undefined
        ? { kind: 'loaded', aggregate: clone(aggregate) }
        : { kind: 'aggregate_incomplete', reason: incomplete }
    },
    transact: async (input) => {
      assertAggregateSerializable(input.next)
      const current = records.get(input.invocationRef)
      if (current === undefined
        || current.invocation.owner.principalRef !== input.owner.principalRef
        || current.invocation.owner.callerRef !== input.owner.callerRef) {
        return { kind: 'refused', code: 'cross_principal_refused' }
      }
      const commandKey = `${input.invocationRef}\u0000${input.commandId}`
      const prior = commands.get(commandKey)
      if (prior !== undefined && prior.digest !== input.commandDigest) {
        return { kind: 'refused', code: 'command_identity_conflict' }
      }
      if (prior !== undefined) {
        return {
          kind: 'duplicate',
          invocationVersion: prior.invocationVersion,
          ...(prior.effectGeneration === undefined
            ? {} : { effectGeneration: prior.effectGeneration }),
        }
      }
      if (current.invocation.invocationVersion !== input.expectedInvocationVersion) {
        return { kind: 'refused', code: 'stale_invocation_version' }
      }
      if (input.expectedEffectGeneration !== undefined
        && current.header.currentEffectGeneration !== input.expectedEffectGeneration) {
        return { kind: 'refused', code: 'effect_generation_stale' }
      }
      if (aggregateIncomplete(input.next) !== undefined) {
        return { kind: 'refused', code: 'aggregate_incomplete' }
      }
      if (input.next.invocation.invocationVersion <= current.invocation.invocationVersion) {
        return { kind: 'refused', code: 'stale_invocation_version' }
      }
      records.set(input.invocationRef, clone(input.next))
      const effectGeneration = input.next.header.currentEffectGeneration
      commands.set(commandKey, {
        digest: input.commandDigest,
        invocationVersion: input.next.invocation.invocationVersion,
        ...(effectGeneration === undefined ? {} : { effectGeneration }),
      })
      return {
        kind: 'applied',
        invocationVersion: input.next.invocation.invocationVersion,
        ...(effectGeneration === undefined ? {} : { effectGeneration }),
      }
    },
    reserveAdmission: async ({ principalRef, windowKey }) => {
      if (!admissionPolicy.enabled) return { kind: 'refused', code: 'trial_disabled' }
      if (!admissionPolicy.allowedPrincipals.includes(principalRef)) {
        return { kind: 'refused', code: 'principal_not_allowlisted' }
      }
      const total = admittedTotals.get(principalRef) ?? 0
      if (total >= admissionPolicy.totalLimit) {
        return { kind: 'refused', code: 'total_exhausted' }
      }
      const concurrent = admittedConcurrent.get(principalRef) ?? 0
      if (concurrent >= admissionPolicy.concurrencyLimit) {
        return { kind: 'refused', code: 'concurrency_exhausted' }
      }
      const rateKey = `${principalRef}\u0000${windowKey}`
      const rate = admittedRates.get(rateKey) ?? 0
      if (rate >= admissionPolicy.rateLimit) {
        return { kind: 'refused', code: 'rate_exhausted' }
      }
      admittedTotals.set(principalRef, total + 1)
      admittedConcurrent.set(principalRef, concurrent + 1)
      admittedRates.set(rateKey, rate + 1)
      reservationSequence += 1
      return { kind: 'admitted', reservationRef: `trial-reservation:${reservationSequence}` }
    },
    effectGenerationCount: (invocationRef) => {
      const generations = new Set<number>()
      const current = records.get(invocationRef)?.header.currentEffectGeneration
      if (current !== undefined) generations.add(current)
      return generations.size
    },
    exportDurableFixture: () => [...records.values()].map(clone),
  })
}

export function isOpaqueHostedReference(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/u.test(value)
}

function assertAggregateSerializable<Result extends ActionResult>(
  aggregate: HostedPaidOperationAggregate<Result>,
): void {
  const references = [
    ...aggregate.evidenceReferences,
    ...(aggregate.paymentAttempt === undefined
      ? []
      : [aggregate.paymentAttempt.custodyRef, ...aggregate.paymentAttempt.evidenceRefs]),
  ]
  if (references.some((reference) => !isOpaqueHostedReference(reference))) {
    throw new Error('hosted_paid_operation_raw_material_forbidden')
  }
  assertNoRawHostedMaterial(aggregate)
}

function assertNoRawHostedMaterial(value: unknown, path = ''): void {
  if (typeof value === 'string') {
    if (/(?:^Bearer\s|secret[-_:]|private[-_ ]?key|raw[-_ ]?(?:payload|evidence|response))/iu.test(value)) {
      throw new Error('hosted_paid_operation_raw_material_forbidden')
    }
    return
  }
  if (value === null || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    const childPath = path.length === 0 ? key : `${path}.${key}`
    if (/(?:credential|signature|authorizationPayload|paymentPayload|providerResponse|rawEvidence)/iu.test(key)) {
      throw new Error('hosted_paid_operation_raw_material_forbidden')
    }
    assertNoRawHostedMaterial(child, childPath)
  }
}

function aggregateIncomplete<Result extends ActionResult>(
  aggregate: HostedPaidOperationAggregate<Result>,
): HostedAggregateIncompleteReason | undefined {
  if (aggregate.header.invocationRef !== aggregate.invocation.invocationRef
    || aggregate.header.ownerPrincipalRef !== aggregate.invocation.owner.principalRef) {
    return 'header_mismatch'
  }
  if (aggregate.header.selectedSourceRef.length === 0) return 'selected_source_missing'
  if (aggregate.invocation.prepared !== undefined && aggregate.invocation.authority === undefined) {
    return 'authority_missing'
  }
  if (aggregate.header.currentEffectGeneration !== undefined
    && aggregate.invocation.attempts.at(-1)?.effectGeneration !== aggregate.header.currentEffectGeneration) {
    return 'current_attempt_missing'
  }
  if (aggregate.header.paymentAttemptRequired && aggregate.paymentAttempt === undefined) {
    return 'payment_attempt_missing'
  }
  if (aggregate.paymentAttempt !== undefined
    && aggregate.header.currentPaymentIdentifier !== aggregate.paymentAttempt.paymentIdentifier) {
    return 'payment_attempt_missing'
  }
  if (aggregate.invocation.attempts.length > HOSTED_PAID_OPERATION_CHILD_CAP) {
    return 'attempt_cap_exceeded'
  }
  if (aggregate.evidenceReferences.length > HOSTED_PAID_OPERATION_CHILD_CAP) {
    return 'evidence_reference_cap_exceeded'
  }
  if (aggregate.history.length > aggregate.header.historyPageSize) {
    return 'history_page_cap_exceeded'
  }
  return undefined
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
