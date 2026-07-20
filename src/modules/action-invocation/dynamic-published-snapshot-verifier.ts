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
import type { DynamicPublishedSourceRow } from './dynamic-published-source'

export function assertDynamicPublishedSnapshotShape(value: unknown): asserts value is DynamicPublishedAdapterSnapshot {
  if (!isRecord(value)
    || value.format !== 'dynamic-published-action-invocation:development:v3'
    || !Array.isArray(value.sourceRows)
    || !Array.isArray(value.semanticClaims)
    || !Array.isArray(value.controls)
    || !Array.isArray(value.attempts)
    || !Array.isArray(value.history)
    || !Array.isArray(value.commands)
    || !Array.isArray(value.paymentAttempts)
    || !Array.isArray(value.paymentAuthorizationEvents)
    || !exactKeys(value, [
      'format', 'sourceRows', 'semanticClaims', 'controls', 'attempts', 'history', 'commands',
      'paymentAttempts',
      'paymentAuthorizationEvents',
      ...(value.inputWork === undefined ? [] : ['inputWork']),
      ...(value.inputHistory === undefined ? [] : ['inputHistory']),
      ...(value.operations === undefined ? [] : ['operations']),
    ])
    || (value.inputWork !== undefined && !Array.isArray(value.inputWork))
    || (value.inputHistory !== undefined && !Array.isArray(value.inputHistory))
    || (value.operations !== undefined && !Array.isArray(value.operations))
    || value.sourceRows.length !== 1
    || value.semanticClaims.length > 1
    || value.semanticClaims.some((claim) => !semanticClaimShapeValid(claim))
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
      || !isRecord(command.value))
    || value.paymentAttempts.some((attempt) => !paymentAttemptShapeValid(attempt))
    || value.paymentAuthorizationEvents.some((event) => !paymentAuthorizationEventShapeValid(event))) {
    throw new Error('dynamic_published_snapshot_schema_invalid')
  }
}

function paymentAuthorizationEventShapeValid(value: unknown): boolean {
  return isRecord(value)
    && typeof value.invocationRef === 'string'
    && typeof value.attemptRef === 'string'
    && Number.isSafeInteger(value.effectGeneration)
    && (value.effectGeneration as number) >= 1
    && typeof value.operationKey === 'string'
    && value.queryRelease === 'released'
    && ['not_created', 'created', 'unknown'].includes(String(value.authorization))
    && Number.isSafeInteger(value.recordedAt)
    && (value.challengeDigest === undefined || typeof value.challengeDigest === 'string')
    && (value.authorizationDigest === undefined || typeof value.authorizationDigest === 'string')
    && (value.authorization === 'created'
      ? typeof value.challengeDigest === 'string'
        && typeof value.authorizationDigest === 'string'
      : value.authorizationDigest === undefined)
    && exactKeys(value, [
      'invocationRef', 'attemptRef', 'effectGeneration', 'operationKey', 'queryRelease',
      'authorization', 'recordedAt',
      ...(value.challengeDigest === undefined ? [] : ['challengeDigest']),
      ...(value.authorizationDigest === undefined ? [] : ['authorizationDigest']),
    ])
}

function paymentAttemptShapeValid(value: unknown): boolean {
  if (!isRecord(value)
    || ![
      'prepared', 'possibly_submitted', 'observed', 'reconciliation_required',
      'not_settled', 'settled',
    ].includes(String(value.state))
    || !Number.isSafeInteger(value.effectGeneration)
    || (value.effectGeneration as number) < 1
    || !Number.isSafeInteger(value.preparedAt)
    || !Array.isArray(value.evidenceRefs)
    || value.evidenceRefs.some((ref) => typeof ref !== 'string')
    || Object.values(value).some((entry) =>
      typeof entry === 'string' && /(private.?key|payment.?signature|credential)/i.test(entry))
    || !exactKeys(value, [
      'paymentIdentifier', 'invocationRef', 'attemptRef', 'effectGeneration', 'operationKey',
      'challengeDigest', 'scheme', 'network', 'asset', 'payTo', 'amount', 'providerEndpoint',
      'operationRevision', 'authorizationDigest', 'custodyRef', 'state', 'preparedAt',
      ...(value.settledAmount === undefined ? [] : ['settledAmount']),
      ...(value.submissionStartedAt === undefined ? [] : ['submissionStartedAt']),
      ...(value.observedAt === undefined ? [] : ['observedAt']),
      ...(value.reconciliationEvidenceRef === undefined ? [] : ['reconciliationEvidenceRef']),
      ...(value.reconciliationEvidenceDigest === undefined ? [] : ['reconciliationEvidenceDigest']),
      'evidenceRefs',
    ])) return false
  return [
    'paymentIdentifier', 'invocationRef', 'attemptRef', 'operationKey', 'challengeDigest',
    'scheme', 'network', 'asset', 'payTo', 'amount', 'providerEndpoint', 'operationRevision',
    'authorizationDigest',
  ].every((key) => typeof value[key] === 'string' && (value[key] as string).length > 0)
    && typeof value.custodyRef === 'string'
    && /^sha256:[0-9a-f]{64}$/.test(value.custodyRef)
    && (value.settledAmount === undefined
      || isRecord(value.settledAmount)
        && typeof value.settledAmount.currency === 'string'
        && value.settledAmount.currency.length > 0
        && Number.isSafeInteger(value.settledAmount.amountMinor)
        && (value.settledAmount.amountMinor as number) >= 0
        && exactKeys(value.settledAmount, ['currency', 'amountMinor']))
    && ((value.state === 'not_settled' || value.state === 'settled')
      ? typeof value.reconciliationEvidenceRef === 'string'
        && value.reconciliationEvidenceRef.length > 0
        && typeof value.reconciliationEvidenceDigest === 'string'
        && /^sha256:[0-9a-f]{64}$/.test(value.reconciliationEvidenceDigest)
      : value.reconciliationEvidenceRef === undefined
        && value.reconciliationEvidenceDigest === undefined)
}

function semanticClaimShapeValid(value: unknown): boolean {
  if (!isRecord(value)
    || typeof value.semanticBaseKey !== 'string'
    || typeof value.semanticIdentityDigest !== 'string'
    || typeof value.principalRef !== 'string'
    || typeof value.ownerInvocationRef !== 'string'
    || !['pending', 'completed', 'uncertain'].includes(String(value.status))
    || !exactKeys(value, [
      'semanticBaseKey',
      'semanticIdentityDigest',
      'principalRef',
      'ownerInvocationRef',
      'status',
      ...(value.outcome === undefined ? [] : ['outcome']),
    ])) return false
  if (value.status === 'pending') return value.outcome === undefined
  if (!isRecord(value.outcome)
    || typeof value.outcome.semanticIdentityDigest !== 'string'
    || typeof value.outcome.ownerInvocationRef !== 'string'
    || !isRecord(value.outcome.observedResolution)
    || !exactKeys(value.outcome, [
      'semanticIdentityDigest',
      'ownerInvocationRef',
      'observedResolution',
      ...(value.outcome.resultIdentity === undefined ? [] : ['resultIdentity']),
    ])) return false
  return value.outcome.resultIdentity === undefined
    || (isRecord(value.outcome.resultIdentity)
      && typeof value.outcome.resultIdentity.sourceResultRef === 'string'
      && typeof value.outcome.resultIdentity.resultDigest === 'string'
      && exactKeys(value.outcome.resultIdentity, ['sourceResultRef', 'resultDigest']))
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
  expectedSemanticClaim?: Readonly<{
    ownerInvocationRef: string
    status: 'pending' | 'completed' | 'uncertain'
    outcomeResultRef?: string
  }>
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
  const semanticClaim = snapshot.semanticClaims[0]
  const control = snapshot.controls[0]!
  const attemptGroup = snapshot.attempts[0]!
  const historyGroup = snapshot.history[0]!
  const recomputedInput = buildDynamicPublishedInput({
    operation,
    descriptor,
    value: source.input.input,
  })
  const price = executableFixedPrice(operation)
  const semanticBaseKey = canonicalDigest({
    principalRef: actor.principalRef,
    actionId: operation.operationId,
    actionVersion: descriptor.version,
    operationKey: recomputedInput.operationKey,
  })
  const semanticIdentityDigest = canonicalDigest({
    semanticBaseKey,
    target: recomputedInput.target,
    preparedMaterialDigest: issuedAuthority.materialInputDigest,
  })
  if (
    canonicalDigest(source.operation as unknown as StableHashValue)
      !== canonicalDigest(operation as unknown as StableHashValue)
    || source.input.operationKey !== recomputedInput.operationKey
    || source.input.inputDigest !== recomputedInput.inputDigest
    || source.input.sourceSnapshotDigest !== dynamicPublishedSourceDigest(operation, descriptor)
    || canonicalDigest(source.input.target) !== canonicalDigest(recomputedInput.target)
    || source.operationKey !== recomputedInput.operationKey
    || source.semanticBaseKey !== semanticBaseKey
    || source.semanticIdentityDigest !== semanticIdentityDigest
    || !semanticClaimValid(
      semanticClaim,
      input.anchors.expectedSemanticClaim,
      semanticBaseKey,
      semanticIdentityDigest,
      actor.principalRef,
      source.observedResolution,
      source.resultIdentity,
    )
    || source.invocationRef !== control.invocationRef
    || (source.owner !== undefined
      && canonicalDigest(source.owner as unknown as StableHashValue)
        !== canonicalDigest(actor as unknown as StableHashValue))
    || (source.origin !== undefined
      && canonicalDigest(source.origin as unknown as StableHashValue)
        !== canonicalDigest(origin as unknown as StableHashValue))
    || control.sourceRef !== control.invocationRef
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
    || source.prepared?.materialInputDigest !== issuedAuthority.materialInputDigest
    || canonicalDigest(source.prepared.target)
      !== canonicalDigest(recomputedInput.target)
    || control.preparedMaterialDigest !== issuedAuthority.materialInputDigest
    || control.preparedTargetDigest !== canonicalDigest(recomputedInput.target)
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
    || !inputStateValid(
      snapshot,
      source,
      control.invocationRef,
      control.invocationVersion,
      actor,
      origin,
    )
    || !attemptGroup.rows.every((attempt) =>
      attempt.idempotency.materialInputDigest === issuedAuthority.materialInputDigest)
    || !paymentAttemptsValid(
      snapshot.paymentAttempts,
      snapshot.paymentAuthorizationEvents,
      attemptGroup.rows,
      control.invocationRef,
      recomputedInput.operationKey,
      operation,
    )
    || !resultIdentityValid(
      source,
      control,
      input.anchors.expectedChallengeDigest,
      `published-result:${
        control.terminalResultReferenceable === true
          ? semanticIdentityDigest
          : control.invocationRef
      }`,
    )
  ) throw new Error('dynamic_published_snapshot_semantics_invalid')
}

function paymentAttemptsValid(
  paymentAttempts: DynamicPublishedAdapterSnapshot['paymentAttempts'],
  authorizationEvents: DynamicPublishedAdapterSnapshot['paymentAuthorizationEvents'],
  attempts: DynamicPublishedAdapterSnapshot['attempts'][number]['rows'],
  invocationRef: string,
  operationKey: string,
  operation: PublishedOperation,
): boolean {
  const durableAttempts = new Map(attempts.map((attempt) => [
    `${attempt.attemptRef}\u0000${attempt.effectGeneration}`,
    attempt,
  ]))
  const seen = new Set<string>()
  const paymentRowsValid = paymentAttempts.every((paymentAttempt) => {
    const key = `${paymentAttempt.attemptRef}\u0000${paymentAttempt.effectGeneration}`
    if (seen.has(key)) return false
    seen.add(key)
    return paymentAttempt.invocationRef === invocationRef
      && paymentAttempt.operationKey === operationKey
      && paymentAttempt.paymentIdentifier === operationKey
      && sameProviderEndpoint(paymentAttempt.providerEndpoint, operation.binding.endpointUrl)
      && paymentAttempt.operationRevision === operation.identity.contractDigest
      && durableAttempts.has(key)
  })
  if (!paymentRowsValid) return false
  const paymentAttemptsByKey = new Map(paymentAttempts.map((attempt) => [
    `${attempt.attemptRef}\u0000${attempt.effectGeneration}`,
    attempt,
  ]))
  const expectedReleasedKeys = new Set(attempts
    .filter((attempt) => attempt.release.state !== 'not_released')
    .map((attempt) => `${attempt.attemptRef}\u0000${attempt.effectGeneration}`))
  const eventKeys = new Set<string>()
  const eventsValid = authorizationEvents.every((event) => {
    const key = `${event.attemptRef}\u0000${event.effectGeneration}`
    if (eventKeys.has(key)) return false
    eventKeys.add(key)
    const paymentAttempt = paymentAttemptsByKey.get(key)
    return event.invocationRef === invocationRef
      && event.operationKey === operationKey
      && expectedReleasedKeys.has(key)
      && (event.authorization === 'created'
        ? paymentAttempt !== undefined
          && event.challengeDigest === paymentAttempt.challengeDigest
          && event.authorizationDigest === paymentAttempt.authorizationDigest
        : paymentAttempt === undefined)
  })
  return eventsValid
    && eventKeys.size === expectedReleasedKeys.size
    && [...expectedReleasedKeys].every((key) => eventKeys.has(key))
}

function sameProviderEndpoint(observed: string, configured: string): boolean {
  try {
    const observedUrl = new URL(observed)
    const configuredUrl = new URL(configured)
    return observedUrl.origin === configuredUrl.origin
      && observedUrl.pathname === configuredUrl.pathname
      && observedUrl.username === ''
      && observedUrl.password === ''
      && observedUrl.hash === ''
  } catch {
    return false
  }
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

function semanticClaimValid(
  claim: DynamicPublishedAdapterSnapshot['semanticClaims'][number] | undefined,
  expected: DynamicPublishedSnapshotAnchors['expectedSemanticClaim'],
  semanticBaseKey: string,
  semanticIdentityDigest: string,
  principalRef: string,
  observedResolution: DynamicPublishedSourceRow['observedResolution'],
  resultIdentity: DynamicPublishedSourceRow['resultIdentity'],
): boolean {
  if (expected === undefined) return claim === undefined
  return claim !== undefined
    && claim.semanticBaseKey === semanticBaseKey
    && claim.semanticIdentityDigest === semanticIdentityDigest
    && claim.principalRef === principalRef
    && claim.ownerInvocationRef === expected.ownerInvocationRef
    && claim.status === expected.status
    && claim.outcome?.semanticIdentityDigest === (
      claim.status === 'pending' ? undefined : semanticIdentityDigest
    )
    && claim.outcome?.ownerInvocationRef === (
      claim.status === 'pending' ? undefined : expected.ownerInvocationRef
    )
    && claim.outcome?.resultIdentity?.sourceResultRef === expected.outcomeResultRef
    && (claim.status === 'pending'
      || claim.status === 'completed'
        && claim.outcome?.observedResolution.state === 'returned'
        && observedResolution.state === 'returned'
        && canonicalDigest(
          claim.outcome.observedResolution.result as unknown as StableHashValue,
        ) === canonicalDigest(observedResolution.result as unknown as StableHashValue)
      || claim.status === 'uncertain'
        && claim.outcome?.observedResolution.state !== 'returned'
        && observedResolution.state !== 'returned')
    && canonicalDigest((claim.outcome?.resultIdentity ?? null) as unknown as StableHashValue)
      === canonicalDigest((resultIdentity ?? null) as unknown as StableHashValue)
}

function historyValid(
  history: DynamicPublishedAdapterSnapshot['history'][number]['rows'],
  currentVersion: number,
  authorityKind: 'approve_each' | 'standing_mandate_use',
  attempts: DynamicPublishedAdapterSnapshot['attempts'][number]['rows'],
): boolean {
  const includesRelease = history.some(({ kind }) => kind === 'begin_release')
  const authorityCommand = authorityKind === 'approve_each'
    ? 'decide'
    : 'authorize_standing_mandate_use'
  const revised = history.some(({ kind }) => kind === 'revise_prepared')
  const expectedKinds = [
    'prepare',
    authorityCommand,
    ...(revised ? ['revise_prepared', authorityCommand] : []),
    'acquire',
    ...(includesRelease ? ['begin_release'] : []),
    'execute_acquired',
  ]
  if (history.length < 1 || history.length > expectedKinds.length) return false
  const actualExpectedKinds = expectedKinds.slice(0, history.length)
  const commands = new Set<string>()
  let priorRecordedAt = Number.NEGATIVE_INFINITY
  for (const [index, row] of history.entries()) {
    const recordedAt = Date.parse(row.recordedAt)
    if (
      row.invocationVersion !== index + 1
      || row.kind !== actualExpectedKinds[index]
      || commands.has(row.commandId)
      || !Number.isFinite(recordedAt)
      || recordedAt < priorRecordedAt
    ) {
      return false
    }
    priorRecordedAt = recordedAt
    commands.add(row.commandId)
  }
  if (currentVersion !== history.length) return false
  const acquireIndex = expectedKinds.indexOf('acquire')
  if (history.length <= acquireIndex) return attempts.length === 0
  if (history.length === acquireIndex + 1) {
    return attempts.length === 1
      && attempts[0]?.release.state === 'not_released'
      && attempts[0]?.outcome.state === 'running'
  }
  if (attempts.length !== 1) return false
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
  return transition.priorDigest === canonicalDigest(priorAttempt as unknown as StableHashValue)
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
  if (kind === 'prepare' || kind === 'revise_prepared') {
    return value.state === 'awaiting_authority'
  }
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

function inputStateValid(
  snapshot: DynamicPublishedAdapterSnapshot,
  source: DynamicPublishedSourceRow,
  invocationRef: string,
  currentVersion: number,
  actor: InvocationActor,
  origin: ActionInvocationOrigin,
): boolean {
  const work = snapshot.inputWork?.filter((row) => row.invocationRef === invocationRef) ?? []
  const history = snapshot.inputHistory?.filter((row) => row.invocationRef === invocationRef) ?? []
  if (work.length > 1) return false
  if (work.length === 0) return history.length === 0
  const current = work[0]!
  if (current.invocationVersion > currentVersion
    || canonicalDigest(current.owner as unknown as StableHashValue)
      !== canonicalDigest(actor as unknown as StableHashValue)
    || canonicalDigest(current.origin as unknown as StableHashValue)
      !== canonicalDigest(origin as unknown as StableHashValue)
    || canonicalDigest(current.knownInput as unknown as StableHashValue)
      !== canonicalDigest(source.input.input as unknown as StableHashValue)
    || current.missingFields.some((field) => !current.requiredFields.includes(field))
    || current.askedFields.some((field) => !current.requiredFields.includes(field))) return false
  let priorVersion = 0
  return history.every((row) => {
    const valid = row.invocationVersion > priorVersion
      && row.invocationVersion <= current.invocationVersion
      && row.commandDigest.startsWith('sha256:')
      && Number.isFinite(Date.parse(row.recordedAt))
    priorVersion = row.invocationVersion
    return valid
  })
}

function resultIdentityValid(
  source: DynamicPublishedAdapterSnapshot['sourceRows'][number],
  control: DynamicPublishedAdapterSnapshot['controls'][number],
  expectedChallengeDigest: string | undefined,
  expectedSourceResultRef: string,
): boolean {
  if (control.control.control.state !== 'terminal') return source.resultIdentity === undefined
  if (source.observedResolution.state !== 'returned') return false
  const identity = source.resultIdentity
  return identity !== undefined
    && identity.sourceResultRef === control.sourceResultRef
    && identity.sourceResultRef === expectedSourceResultRef
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
