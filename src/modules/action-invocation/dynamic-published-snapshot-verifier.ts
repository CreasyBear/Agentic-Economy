import type {
  PublishedOperation,
  RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { ActionInvocationOrigin, InvocationActor } from './contracts'
import {
  buildDynamicPublishedInput,
  dynamicPublishedSourceDigest,
  executableFixedPrice,
} from './dynamic-published-contract'
import type { DynamicPublishedAdapterSnapshot } from './dynamic-published-adapter'

export function assertDynamicPublishedSnapshotShape(value: unknown): asserts value is DynamicPublishedAdapterSnapshot {
  if (!isRecord(value)
    || value.format !== 'dynamic-published-action-invocation:development:v1'
    || !Array.isArray(value.sourceRows)
    || !Array.isArray(value.controls)
    || !Array.isArray(value.attempts)
    || !Array.isArray(value.history)
    || !Array.isArray(value.commands)
    || !exactKeys(value, ['format', 'sourceRows', 'controls', 'attempts', 'history', 'commands'])
    || value.sourceRows.length !== 1
    || value.controls.length !== 1
    || value.attempts.length !== 1
    || value.history.length !== 1
    || !isRecord(value.sourceRows[0])
    || typeof value.sourceRows[0].operationKey !== 'string'
    || !isRecord(value.sourceRows[0].operation)
    || !isRecord(value.sourceRows[0].input)
    || !isRecord(value.controls[0])
    || typeof value.controls[0].invocationRef !== 'string'
    || !isRecord(value.controls[0].control)
    || !isRecord(value.attempts[0])
    || !Array.isArray(value.attempts[0].rows)
    || !isRecord(value.history[0])
    || !Array.isArray(value.history[0].rows)
    || value.commands.some((command) => !isRecord(command)
      || typeof command.commandId !== 'string'
      || !isRecord(command.value))) {
    throw new Error('dynamic_published_snapshot_schema_invalid')
  }
}

export function verifyDynamicPublishedSnapshot(input: Readonly<{
  snapshot: unknown
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  actor: InvocationActor
  origin: ActionInvocationOrigin
  expectedAuthorityKind: 'approve_each' | 'standing_mandate_use'
  expectedEffectCount: number
  expectedChallengeDigest?: string
}>): void {
  assertDynamicPublishedSnapshotShape(input.snapshot)
  const snapshot = input.snapshot
  const source = snapshot.sourceRows[0]!
  const control = snapshot.controls[0]!
  const attemptGroup = snapshot.attempts[0]!
  const historyGroup = snapshot.history[0]!
  const recomputedInput = buildDynamicPublishedInput({
    operation: input.operation,
    descriptor: input.descriptor,
    value: source.input.input,
  })
  const price = executableFixedPrice(input.operation)
  if (
    canonicalDigest(source.operation as unknown as StableHashValue)
      !== canonicalDigest(input.operation as unknown as StableHashValue)
    || source.input.operationKey !== recomputedInput.operationKey
    || source.input.inputDigest !== recomputedInput.inputDigest
    || source.input.sourceSnapshotDigest !== dynamicPublishedSourceDigest(input.operation, input.descriptor)
    || canonicalDigest(source.input.target) !== canonicalDigest(recomputedInput.target)
    || source.operationKey !== recomputedInput.operationKey
    || control.sourceRef !== recomputedInput.operationKey
    || control.control.owner.callerRef !== input.actor.callerRef
    || control.control.owner.principalRef !== input.actor.principalRef
    || canonicalDigest(control.control.origin as unknown as StableHashValue)
      !== canonicalDigest(input.origin as unknown as StableHashValue)
    || control.control.action.id !== input.operation.operationId
    || control.control.action.contractVersion !== input.descriptor.version
    || control.authorityBinding?.actor.callerRef !== input.actor.callerRef
    || control.authorityBinding.actor.principalRef !== input.actor.principalRef
    || canonicalDigest(control.authorityBinding.origin as unknown as StableHashValue)
      !== canonicalDigest(input.origin as unknown as StableHashValue)
    || control.authorityBinding.actionId !== input.operation.operationId
    || control.authorityBinding.contractVersion !== input.descriptor.version
    || control.authorityBinding.digest
      !== canonicalDigest({
        operationKey: recomputedInput.operationKey,
        inputDigest: recomputedInput.inputDigest,
        sourceSnapshotDigest: recomputedInput.sourceSnapshotDigest,
        target: recomputedInput.target,
      })
    || control.authorityBinding.targetDigest !== canonicalDigest(recomputedInput.target)
    || control.authorityBinding.limits.amountMinor !== price.amountMinor
    || control.control.acceptedAuthority?.kind !== input.expectedAuthorityKind
    || control.authorityBinding.acceptedBasis?.kind !== input.expectedAuthorityKind
    || canonicalDigest(control.control.acceptedAuthority as unknown as StableHashValue)
      !== canonicalDigest(control.authorityBinding.acceptedBasis as unknown as StableHashValue)
    || (control.control.acceptedAuthority.kind === 'standing_mandate_use'
      && (!Number.isSafeInteger(control.control.acceptedAuthority.mandateGeneration)
        || control.control.acceptedAuthority.mandateGeneration < 1))
    || attemptGroup.invocationRef !== control.invocationRef
    || historyGroup.invocationRef !== control.invocationRef
    || attemptGroup.rows.length !== input.expectedEffectCount
    || (attemptGroup.rows.length > 0
      && control.currentAttemptRef !== attemptGroup.rows.at(-1)?.attemptRef)
    || !attemptsValid(attemptGroup.rows, input.operation.operationId, recomputedInput.operationKey)
    || !historyValid(
      historyGroup.rows,
      control.invocationVersion,
      input.expectedAuthorityKind,
      attemptGroup.rows,
    )
    || !commandsValid(snapshot.commands, historyGroup.rows)
    || !resultIdentityValid(source, control, input.expectedChallengeDigest)
  ) throw new Error('dynamic_published_snapshot_semantics_invalid')
}

function attemptsValid(
  attempts: DynamicPublishedAdapterSnapshot['attempts'][number]['rows'],
  actionId: string,
  operationKey: string,
): boolean {
  return attempts.every((attempt, index) => (
    attempt.attemptNumber === index + 1
    && attempt.effectGeneration === index + 1
    && attempt.idempotency.operationKey === operationKey
    && attempt.idempotency.effectIdentity === canonicalDigest({
      actionId,
      operationKey,
      materialInputDigest: attempt.idempotency.materialInputDigest,
    })
  ))
}

function historyValid(
  history: DynamicPublishedAdapterSnapshot['history'][number]['rows'],
  currentVersion: number,
  authorityKind: 'approve_each' | 'standing_mandate_use',
  attempts: DynamicPublishedAdapterSnapshot['attempts'][number]['rows'],
): boolean {
  const expectedKinds = [
    'prepare',
    authorityKind === 'approve_each' ? 'decide' : 'authorize_standing_mandate_use',
    'acquire',
    'begin_release',
    'execute_acquired',
  ]
  if (history.length !== expectedKinds.length || attempts.length !== 1) return false
  const commands = new Set<string>()
  for (const [index, row] of history.entries()) {
    if (
      row.invocationVersion !== index + 1
      || row.kind !== expectedKinds[index]
      || commands.has(row.commandId)
    ) {
      return false
    }
    commands.add(row.commandId)
  }
  const transition = history.at(-1)?.attemptTransition
  const attempt = attempts[0]!
  if (transition === undefined
    || transition.attemptRef !== attempt.attemptRef
    || transition.effectGeneration !== attempt.effectGeneration
    || transition.nextDigest !== canonicalDigest(attempt as unknown as StableHashValue)
    || transition.nextReleaseState !== attempt.release.state
    || transition.nextOutcomeState !== attempt.outcome.state
    || transition.priorReleaseState !== 'not_released'
    || transition.priorOutcomeState !== 'running') return false
  const priorAttempt = {
    ...attempt,
    release: { state: 'not_released' as const },
    outcome: { state: 'running' as const },
  }
  return currentVersion === history.length
    && transition.priorDigest === canonicalDigest(priorAttempt as unknown as StableHashValue)
}

function commandsValid(
  commands: DynamicPublishedAdapterSnapshot['commands'],
  history: DynamicPublishedAdapterSnapshot['history'][number]['rows'],
): boolean {
  const byId = new Map(history.map((row) => [row.commandId, row]))
  return commands.length === history.length && commands.every(({ commandId, value }) => {
    const row = byId.get(commandId)
    return row !== undefined
      && row.commandDigest === value.digest
      && value.result.kind === 'applied'
      && value.result.invocationVersion === row.invocationVersion
  })
}

function resultIdentityValid(
  source: DynamicPublishedAdapterSnapshot['sourceRows'][number],
  control: DynamicPublishedAdapterSnapshot['controls'][number],
  expectedChallengeDigest: string | undefined,
): boolean {
  if (control.control.control.state !== 'terminal') return source.resultIdentity === undefined
  if (source.observedResolution.state !== 'returned') return false
  const identity = source.resultIdentity
  return identity !== undefined
    && identity.sourceResultRef === control.sourceResultRef
    && identity.resultDigest === control.sourceResultDigest
    && identity.resultDigest
      === canonicalDigest(source.observedResolution.result as unknown as StableHashValue)
    && (expectedChallengeDigest === undefined
      || source.observedResolution.result.paymentChallengeDigest === expectedChallengeDigest)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value)
}
