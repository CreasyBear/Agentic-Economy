import { z } from 'zod'
import type {
  PublishedOperation,
  RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'

import type { ActionInvocationOrigin, InvocationActor } from './contracts'
import type { ActionInvocationView } from './contracts'
import {
  buildDynamicPublishedInput,
  dynamicPublishedSourceDigest,
  executableFixedPrice,
} from './dynamic-published-contract'
import type { DynamicPublishedAdapterSnapshot } from './dynamic-published-adapter'
import { reconstructDurableControlRow } from './internal/durable-contracts'
import type { DynamicPublishedSourceRow } from './dynamic-published-source'

const recordSchema = z.looseObject({})
const nonEmptyStringSchema = z.string().min(1)
const sensitiveStringPattern = /(private.?key|payment.?signature|credential)/i

function optionalFieldsAreAbsent(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(value)
  return fields.every((field) => !(keys.includes(field) && value[field] === undefined))
}

const sourceRowSchema = z.looseObject({
  operationKey: z.string(),
  operation: recordSchema,
  input: recordSchema,
})

const semanticResultIdentitySchema = z.strictObject({
  sourceResultRef: z.string(),
  resultDigest: z.string(),
})

const semanticOutcomeSchema = z.strictObject({
  semanticIdentityDigest: z.string(),
  ownerInvocationRef: z.string(),
  observedResolution: recordSchema,
  resultIdentity: semanticResultIdentitySchema.optional(),
}).refine((value) => optionalFieldsAreAbsent(value, ['resultIdentity']))

const semanticClaimSchema = z.strictObject({
  semanticBaseKey: z.string(),
  semanticIdentityDigest: z.string(),
  principalRef: z.string(),
  ownerInvocationRef: z.string(),
  status: z.custom((value) => ['pending', 'completed', 'uncertain'].includes(String(value))),
  outcome: semanticOutcomeSchema.optional(),
}).refine((value) => optionalFieldsAreAbsent(value, ['outcome']))
  .refine((value) => value.status === 'pending'
    ? value.outcome === undefined
    : value.outcome !== undefined)

const settledAmountSchema = z.strictObject({
  currency: nonEmptyStringSchema,
  amountMinor: z.number().int().safe().min(0),
})

const paymentAttemptSchema = z.strictObject({
  paymentIdentifier: nonEmptyStringSchema,
  invocationRef: nonEmptyStringSchema,
  attemptRef: nonEmptyStringSchema,
  effectGeneration: z.number().int().safe().min(1),
  operationKey: nonEmptyStringSchema,
  challengeDigest: nonEmptyStringSchema,
  scheme: nonEmptyStringSchema,
  network: nonEmptyStringSchema,
  asset: nonEmptyStringSchema,
  payTo: nonEmptyStringSchema,
  amount: nonEmptyStringSchema,
  providerEndpoint: nonEmptyStringSchema,
  operationRevision: nonEmptyStringSchema,
  authorizationDigest: nonEmptyStringSchema,
  custodyRef: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  state: z.custom((value) => [
    'prepared',
    'possibly_submitted',
    'observed',
    'reconciliation_required',
    'not_settled',
    'settled',
  ].includes(String(value))),
  preparedAt: z.number().int().safe(),
  settledAmount: settledAmountSchema.optional(),
  submissionStartedAt: z.unknown().optional(),
  observedAt: z.unknown().optional(),
  reconciliationEvidenceRef: z.unknown().optional(),
  reconciliationEvidenceDigest: z.unknown().optional(),
  evidenceRefs: z.array(z.string()),
}).refine((value) => optionalFieldsAreAbsent(value, [
  'settledAmount',
  'submissionStartedAt',
  'observedAt',
  'reconciliationEvidenceRef',
  'reconciliationEvidenceDigest',
]))
  .refine((value) => !Object.values(value).some((entry) =>
    typeof entry === 'string' && sensitiveStringPattern.test(entry)))
  .refine((value) => (
    value.state === 'not_settled' || value.state === 'settled'
      ? typeof value.reconciliationEvidenceRef === 'string'
        && value.reconciliationEvidenceRef.length > 0
        && typeof value.reconciliationEvidenceDigest === 'string'
        && /^sha256:[0-9a-f]{64}$/.test(value.reconciliationEvidenceDigest)
      : value.reconciliationEvidenceRef === undefined
        && value.reconciliationEvidenceDigest === undefined
  ))

const paymentAuthorizationEventSchema = z.strictObject({
  invocationRef: z.string(),
  attemptRef: z.string(),
  effectGeneration: z.number().int().safe().min(1),
  operationKey: z.string(),
  queryRelease: z.literal('released'),
  authorization: z.custom((value) => ['not_created', 'created', 'unknown'].includes(String(value))),
  recordedAt: z.number().int().safe(),
  challengeDigest: z.string().optional(),
  authorizationDigest: z.string().optional(),
}).refine((value) => optionalFieldsAreAbsent(value, ['challengeDigest', 'authorizationDigest']))
  .refine((value) => value.authorization === 'created'
    ? typeof value.challengeDigest === 'string'
      && typeof value.authorizationDigest === 'string'
    : value.authorizationDigest === undefined)

const controlSchema = z.looseObject({})
const sourceGroupSchema = z.looseObject({
  invocationRef: z.string(),
  control: controlSchema,
})
const attemptGroupSchema = z.looseObject({
  invocationRef: z.string(),
  rows: z.array(z.unknown()),
})
const historyGroupSchema = z.looseObject({
  invocationRef: z.string(),
  rows: z.array(z.unknown()),
})
const commandSchema = z.looseObject({
  commandId: z.string(),
  value: recordSchema,
})

const dynamicPublishedSnapshotShapeSchema = z.strictObject({
  format: z.literal('dynamic-published-action-invocation:development:v3'),
  sourceRows: z.array(sourceRowSchema),
  semanticClaims: z.array(semanticClaimSchema).max(1),
  controls: z.array(sourceGroupSchema),
  attempts: z.array(attemptGroupSchema),
  history: z.array(historyGroupSchema),
  commands: z.array(commandSchema),
  paymentAttempts: z.array(paymentAttemptSchema),
  paymentAuthorizationEvents: z.array(paymentAuthorizationEventSchema),
  inputWork: z.array(z.unknown()).optional(),
  inputHistory: z.array(z.unknown()).optional(),
  operations: z.array(z.unknown()).optional(),
}).refine((value) => optionalFieldsAreAbsent(value, ['inputWork', 'inputHistory', 'operations']))

export function assertDynamicPublishedSnapshotShape(value: unknown): asserts value is DynamicPublishedAdapterSnapshot {
  const parsed = dynamicPublishedSnapshotShapeSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error('dynamic_published_snapshot_schema_invalid')
  }
}

export function copyDynamicPublishedSnapshot(
  value: DynamicPublishedAdapterSnapshot,
): DynamicPublishedAdapterSnapshot {
  const cloned = structuredClone(value)
  assertDynamicPublishedSnapshotShape(cloned)
  return cloned
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
}>): DynamicPublishedAdapterSnapshot {
  assertDynamicPublishedSnapshotShape(input.snapshot)
  const rawSnapshot = input.snapshot
  const normalizedControls = rawSnapshot.controls.map(reconstructDurableControlRow)
  const snapshot = normalizedControls.length === rawSnapshot.controls.length
    && normalizedControls.every((row, index) => row === rawSnapshot.controls[index])
    ? rawSnapshot
    : { ...rawSnapshot, controls: normalizedControls }
  const {
    operation,
    descriptor,
    actor,
    origin,
    issuedAuthority,
  } = input.anchors
  const source = snapshot.sourceRows[0]
  const semanticClaim = snapshot.semanticClaims[0]
  const control = snapshot.controls[0]
  const attemptGroup = snapshot.attempts[0]
  const historyGroup = snapshot.history[0]
  if (
    source === undefined
    || control === undefined
    || attemptGroup === undefined
    || historyGroup === undefined
  ) {
    throw new Error('dynamic_published_snapshot_schema_invalid')
  }
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
    canonicalDigest(source.operation)
      !== canonicalDigest(operation)
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
      && canonicalDigest(source.owner)
        !== canonicalDigest(actor))
    || (source.origin !== undefined
      && canonicalDigest(source.origin)
        !== canonicalDigest(origin))
    || control.sourceRef !== control.invocationRef
    || control.control.owner.callerRef !== actor.callerRef
    || control.control.owner.principalRef !== actor.principalRef
    || canonicalDigest(control.control.origin)
      !== canonicalDigest(origin)
    || control.control.action.id !== operation.operationId
    || control.control.action.contractVersion !== descriptor.version
    || control.authorityBinding?.actor.callerRef !== actor.callerRef
    || control.authorityBinding.actor.principalRef !== actor.principalRef
    || canonicalDigest(control.authorityBinding.origin)
      !== canonicalDigest(origin)
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
    || canonicalDigest(control.control.acceptedAuthority)
      !== canonicalDigest(issuedAuthority.accepted)
    || canonicalDigest(control.authorityBinding.acceptedBasis)
      !== canonicalDigest(issuedAuthority.accepted)
    || canonicalDigest(control.control.acceptedAuthority)
      !== canonicalDigest(control.authorityBinding.acceptedBasis)
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
      price,
      input.anchors.expectedChallengeDigest,
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
  return snapshot
}

function paymentAttemptsValid(
  paymentAttempts: DynamicPublishedAdapterSnapshot['paymentAttempts'],
  authorizationEvents: DynamicPublishedAdapterSnapshot['paymentAuthorizationEvents'],
  attempts: DynamicPublishedAdapterSnapshot['attempts'][number]['rows'],
  invocationRef: string,
  operationKey: string,
  operation: PublishedOperation,
  price: Readonly<{ currency: string; amountMinor: number }>,
  expectedChallengeDigest: string | undefined,
): boolean {
  const payment = operation.identity.payment
  const transport = admittedX402Transport(operation)
  const expectedAmount = payment.kind === 'x402'
    && price.currency === payment.currency
    && payment.assetAmountExponent >= payment.routeAmountExponent
    ? (BigInt(price.amountMinor)
        * (10n ** BigInt(payment.assetAmountExponent - payment.routeAmountExponent))).toString()
    : undefined
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
      && payment.kind === 'x402'
      && transport !== undefined
      && paymentAttempt.scheme === transport.scheme
      && paymentAttempt.network === payment.network
      && paymentAttempt.asset === payment.asset
      && paymentAttempt.payTo === payment.payTo
      && paymentAttempt.amount === expectedAmount
      && paymentAttempt.challengeDigest === expectedChallengeDigest
      && durableAttempts.has(key)
  })
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
  return paymentRowsValid
    && eventsValid
    && eventKeys.size === expectedReleasedKeys.size
    && [...expectedReleasedKeys].every((key) => eventKeys.has(key))
}

function admittedX402Transport(
  operation: PublishedOperation,
): Readonly<{ scheme: string }> | undefined {
  if (operation.identity.payment.kind !== 'x402') return undefined
  try {
    const value = JSON.parse(operation.transport.configJson) as unknown
    return isRecord(value) && typeof value.scheme === 'string'
      ? { scheme: value.scheme }
      : undefined
  } catch {
    return undefined
  }
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
          claim.outcome.observedResolution.result,
        ) === canonicalDigest(observedResolution.result)
      || claim.status === 'uncertain'
        && claim.outcome?.observedResolution.state !== 'returned'
        && observedResolution.state !== 'returned')
    && canonicalDigest(claim.outcome?.resultIdentity ?? null)
      === canonicalDigest(resultIdentity ?? null)
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
  const attempt = attempts[0]
  if (attempt === undefined) return false
  if (transition === undefined
    || transition.attemptRef !== attempt.attemptRef
    || transition.effectGeneration !== attempt.effectGeneration
    || transition.nextDigest !== canonicalDigest(attempt)
    || transition.nextReleaseState !== attempt.release.state
    || transition.nextOutcomeState !== attempt.outcome.state
    || transition.priorReleaseState !== 'not_released'
    || transition.priorOutcomeState !== 'running') return false
  const priorAttempt = {
    ...attempt,
    release: { state: 'not_released' as const },
    outcome: { state: 'running' as const },
  }
  return transition.priorDigest === canonicalDigest(priorAttempt)
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
  const current = work[0]
  if (current === undefined) return false
  const requiredFields = new Set(current.requiredFields)
  if (current.invocationVersion > currentVersion
    || canonicalDigest(current.owner)
      !== canonicalDigest(actor)
    || canonicalDigest(current.origin)
      !== canonicalDigest(origin)
    || canonicalDigest(current.knownInput)
      !== canonicalDigest(source.input.input)
    || current.missingFields.some((field) => !requiredFields.has(field))
    || current.askedFields.some((field) => !requiredFields.has(field))) return false
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
    && identity.resultDigest === canonicalDigest(source.observedResolution.result)
    && (expectedChallengeDigest === undefined
      || source.observedResolution.result.paymentChallengeDigest === expectedChallengeDigest)
}


