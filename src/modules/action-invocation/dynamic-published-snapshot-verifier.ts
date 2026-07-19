import type {
  PublishedOperation,
  RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { ActionInvocationOrigin, InvocationActor } from './contracts'
import type { ActionInvocationView } from './contracts'
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

export type DynamicPublishedSnapshotAnchors = Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  actor: InvocationActor
  origin: ActionInvocationOrigin
  issuedAuthority: Readonly<{
    reference: string
    accepted: NonNullable<ActionInvocationView['acceptedAuthority']>
    materialInputDigest: string
  }>
  expectedEffectCount: number
  expectedChallengeDigest?: string
}>

export function verifyDynamicPublishedSnapshot(input: Readonly<{
  snapshot: unknown
  anchors: DynamicPublishedSnapshotAnchors
}>): void {
  assertDynamicPublishedSnapshotShape(input.snapshot)
  const snapshot = input.snapshot
  const {
    operation,
    descriptor,
    actor,
    origin,
    issuedAuthority,
  } = input.anchors
  const source = snapshot.sourceRows[0]!
  const control = snapshot.controls[0]!
  const attemptGroup = snapshot.attempts[0]!
  const historyGroup = snapshot.history[0]!
  const recomputedInput = buildDynamicPublishedInput({
    operation,
    descriptor,
    value: source.input.input,
  })
  const price = executableFixedPrice(operation)
  if (
    canonicalDigest(source.operation as unknown as StableHashValue)
      !== canonicalDigest(operation as unknown as StableHashValue)
    || source.input.operationKey !== recomputedInput.operationKey
    || source.input.inputDigest !== recomputedInput.inputDigest
    || source.input.sourceSnapshotDigest !== dynamicPublishedSourceDigest(operation, descriptor)
    || canonicalDigest(source.input.target) !== canonicalDigest(recomputedInput.target)
    || source.operationKey !== recomputedInput.operationKey
    || control.sourceRef !== recomputedInput.operationKey
    || control.control.owner.callerRef !== actor.callerRef
    || control.control.owner.principalRef !== actor.principalRef
    || canonicalDigest(control.control.origin as unknown as StableHashValue)
      !== canonicalDigest(origin as unknown as StableHashValue)
    || control.control.action.id !== operation.operationId
    || control.control.action.contractVersion !== descriptor.version
    || control.authorityBinding?.actor.callerRef !== actor.callerRef
    || control.authorityBinding.actor.principalRef !== actor.principalRef
    || canonicalDigest(control.authorityBinding.origin as unknown as StableHashValue)
      !== canonicalDigest(origin as unknown as StableHashValue)
    || control.authorityBinding.actionId !== operation.operationId
    || control.authorityBinding.contractVersion !== descriptor.version
    || control.control.authority?.reference !== issuedAuthority.reference
    || control.authorityBinding.reference !== issuedAuthority.reference
    || control.authorityBinding.digest !== issuedAuthority.materialInputDigest
    || control.authorityBinding.targetDigest !== canonicalDigest(recomputedInput.target)
    || control.authorityBinding.limits.amountMinor !== price.amountMinor
    || canonicalDigest(control.control.acceptedAuthority as unknown as StableHashValue)
      !== canonicalDigest(issuedAuthority.accepted as unknown as StableHashValue)
    || canonicalDigest(control.authorityBinding.acceptedBasis as unknown as StableHashValue)
      !== canonicalDigest(issuedAuthority.accepted as unknown as StableHashValue)
    || canonicalDigest(control.control.acceptedAuthority as unknown as StableHashValue)
      !== canonicalDigest(control.authorityBinding.acceptedBasis as unknown as StableHashValue)
    || !acceptedAuthorityGenerationValid(control.control.acceptedAuthority)
    || attemptGroup.invocationRef !== control.invocationRef
    || historyGroup.invocationRef !== control.invocationRef
    || attemptGroup.rows.length !== input.anchors.expectedEffectCount
    || (attemptGroup.rows.length > 0
      && control.currentAttemptRef !== attemptGroup.rows.at(-1)?.attemptRef)
    || !attemptsValid(attemptGroup.rows, operation.operationId, recomputedInput.operationKey)
    || !historyValid(
      historyGroup.rows,
      control.invocationVersion,
      issuedAuthority.accepted.kind,
      attemptGroup.rows,
    )
    || !commandsValid(snapshot.commands, historyGroup.rows, control.invocationRef)
    || !attemptGroup.rows.every((attempt) =>
      attempt.idempotency.materialInputDigest === issuedAuthority.materialInputDigest)
    || !resultIdentityValid(source, control, input.anchors.expectedChallengeDigest)
  ) throw new Error('dynamic_published_snapshot_semantics_invalid')
}

function acceptedAuthorityGenerationValid(
  accepted: ActionInvocationView['acceptedAuthority'],
): boolean {
  return accepted !== undefined
    && (accepted.kind !== 'standing_mandate_use'
      || (Number.isSafeInteger(accepted.mandateGeneration) && accepted.mandateGeneration >= 1))
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
  invocationRef: string,
): boolean {
  const byId = new Map(history.map((row) => [row.commandId, row]))
  return commands.length === history.length && commands.every(({ commandId, value }) => {
    const row = byId.get(commandId)
    if (!isRecord(value.material)) return false
    const expectedVersion = row === undefined ? undefined : row.invocationVersion - 1
    const material = value.material
    return row !== undefined
      && canonicalDigest(material) === value.digest
      && row.commandDigest === value.digest
      && value.result.kind === 'applied'
      && value.result.invocationVersion === row.invocationVersion
      && material.invocationRef === invocationRef
      && material.kind === row.kind
      && material.nextInvocationVersion === row.invocationVersion
      && material.expectedInvocationVersion === (expectedVersion === 0 ? null : expectedVersion)
      && commandId === `${invocationRef}:${expectedVersion === 0 ? 'create' : expectedVersion}:${row.kind}`
      && (row.kind !== 'acquire'
        || material.expectedEffectGeneration === null)
      && (row.kind !== 'begin_release' && row.kind !== 'execute_acquired'
        || material.expectedEffectGeneration === 1)
      && commandControlValid(row.kind, material.control)
  })
}

function commandControlValid(kind: string, value: unknown): boolean {
  if (!isRecord(value)) return false
  if (kind === 'prepare') return value.state === 'awaiting_authority'
  if (kind === 'decide' || kind === 'authorize_standing_mandate_use') {
    return value.state === 'authorized' && typeof value.decidedAt === 'string'
  }
  if (kind === 'acquire') {
    return value.state === 'leased'
      && value.release === 'not_started'
      && value.effectGeneration === 1
      && typeof value.attemptRef === 'string'
      && typeof value.leaseOwner === 'string'
  }
  if (kind === 'begin_release') {
    return value.state === 'leased'
      && value.release === 'possibly_released'
      && value.effectGeneration === 1
      && typeof value.attemptRef === 'string'
      && typeof value.leaseOwner === 'string'
  }
  return kind === 'execute_acquired'
    && (value.state === 'terminal' || value.state === 'reconciliation_required')
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
