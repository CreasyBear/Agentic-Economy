import { type Infer, type ObjectType } from 'convex/values'
import { internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { actionInvocationTransactArgs } from '../../actionInvocationControl'
import { marketDispatchWorkpool } from '../../marketDispatchWorkpool'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import { parsePublishedOperationSnapshot } from '@/modules/capability-supply/public'
import {
  operationInvokeAuthorityValue,
  operationResultValue,
  usageValue,
} from '@/modules/capability-execution/convex'
import { recordMarketEvidenceFact } from '../../marketEvidence'

export const OPERATION_INVOKE_RETRY_AFTER_MS = 1_000

type OperationInvocationRow = Doc<'capabilityOperationInvocations'>
type PersistedOperationAuthority = Infer<typeof operationInvokeAuthorityValue>
type DispatchCommand = ObjectType<typeof actionInvocationTransactArgs>
type OperationResult = Infer<typeof operationResultValue>
type Usage = Infer<typeof usageValue>

export type OpenDispatchValue = Readonly<{
  invocationRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  operationRef: string
  idempotencyKey: string
  inputDigest: string
  requestDigest: string
  grantRef: string
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  operationJson: string
  inputJson: string
  authority?: PersistedOperationAuthority
  workId?: string
  attemptRef?: string
  dispatchState?: 'enqueued' | 'running' | 'completed' | 'failed' | 'reconciliation_required'
}>

export type OperationDispatchProjectionShape = Readonly<{
  state: 'completed' | 'refused' | 'reconciliation_required'
  result?: OperationResult
  usage?: Usage
  evidenceHash?: string
  attemptRef?: string
  dispatchState: 'completed' | 'failed' | 'reconciliation_required'
}>

export type DispatchResult =
  | { kind: 'enqueued'; workId: string }
  | { kind: 'replayed'; workId: string }
  | { kind: 'refused' }

export type OperationDispatchMutationResult =
  | { kind: 'applied' | 'duplicate'; attemptRef: string; effectGeneration: number }
  | { kind: 'claimed' }
  | { kind: 'cancelled'; workId?: string }
  | { kind: 'reconciliation_required'; attemptRef: string; effectGeneration: number }
  | { kind: 'refused'; code: string }

function assertOperationResultJson(value: OperationResult): void {
  if (value.kind === 'completed' && !isBoundedJsonValue(value.output)) {
    throw new Error('operation_invocation_result_json_invalid')
  }
}

function persistedDispatchMatches(row: OperationInvocationRow, dispatch: OpenDispatchValue): boolean {
  const outerFieldsMatch = [
    row.invocationRef === dispatch.invocationRef,
    row.principalId === dispatch.principalId,
    row.ownerId === dispatch.ownerId,
    row.credentialId === dispatch.credentialId,
    row.applicationRef === dispatch.applicationRef,
    row.environment === dispatch.environment,
    row.operationRef === dispatch.operationRef,
    row.idempotencyKey === dispatch.idempotencyKey,
    row.inputDigest === dispatch.inputDigest,
    row.requestDigest === dispatch.requestDigest,
    row.grantRef === dispatch.grantRef,
    row.grantGeneration === dispatch.grantGeneration,
    row.policyDigest === dispatch.policyDigest,
    row.grantExpiresAt === dispatch.grantExpiresAt,
    row.operationJson === dispatch.operationJson,
    row.inputJson === dispatch.inputJson,
    row.workId === dispatch.workId,
  ].every(Boolean)
  if (!outerFieldsMatch) return false
  if ((row.authority === undefined) !== (dispatch.authority === undefined)) return false
  return row.authority === undefined
    || canonicalDigest(row.authority as never) === canonicalDigest(dispatch.authority as never)
}

function commandMatchesDispatch(command: unknown, dispatch: OpenDispatchValue): boolean {
  if (!isRecord(command)) return false
  const commandRow = command.row
  const currentAttemptWrite = command.currentAttemptWrite
  if (!isRecord(commandRow) || !isRecord(currentAttemptWrite)) return false
  const operation = parsePublishedOperationSnapshot(dispatch.operationJson)
  if (operation === undefined) return false
  const row = commandRow
  const attempt = currentAttemptWrite
  const control = asRecord(row.control)
  const owner = asRecord(field(control, 'owner'))
  const action = asRecord(field(control, 'action'))
  const authorityBinding = asRecord(row.authorityBinding)
  const idempotency = asRecord(attempt.idempotency)
  const attemptActor = asRecord(attempt.actor)
  const authority = dispatch.authority
  return [
    row.invocationRef === dispatch.invocationRef,
    row.sourceRef === `operation-invocation-source:${dispatch.invocationRef}`,
    row.preparedMaterialDigest === dispatch.inputDigest,
    field(control, 'invocationRef') === dispatch.invocationRef,
    field(owner, 'callerRef') === dispatch.credentialId,
    field(owner, 'principalRef') === dispatch.principalId,
    field(action, 'id') === operation.operationId,
    field(authorityBinding, 'invocationRef') === dispatch.invocationRef,
    field(authorityBinding, 'digest') === field(asRecord(authority), 'decisionDigest'),
    field(authorityBinding, 'targetDigest') === field(asRecord(authority), 'targetDigest'),
    field(authorityBinding, 'expiresAt') === field(asRecord(authority), 'expiresAt'),
    attempt.invocationRef === dispatch.invocationRef,
    field(attemptActor, 'callerRef') === dispatch.credentialId,
    field(attemptActor, 'principalRef') === dispatch.principalId,
    field(idempotency, 'operationKey') === dispatch.operationRef,
    field(idempotency, 'materialInputDigest') === dispatch.inputDigest,
    typeof attempt.attemptRef === 'string',
    typeof attempt.effectGeneration === 'number',
  ].every(Boolean)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function field(record: Record<string, unknown> | undefined, key: string): unknown {
  return record === undefined ? undefined : record[key]
}

function withoutSystemFields<T extends { _id: unknown; _creationTime: number }>(
  row: T,
): Omit<T, '_id' | '_creationTime'> {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...value } = row
  return value
}

async function canonicalCommandReadbackMatches(ctx: MutationCtx, command: unknown): Promise<boolean> {
  if (!isRecord(command)) return false
  const commandRow = command.row
  const currentAttemptWrite = command.currentAttemptWrite
  if (!isRecord(commandRow) || !isRecord(currentAttemptWrite)) return false
  const expectedAttempt = currentAttemptWrite
  const [control, attempt] = await Promise.all([
    ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', String(commandRow.invocationRef)))
      .unique(),
    ctx.db.query('actionInvocationAttempts')
      .withIndex('by_invocationRef_and_attemptRef', (query) => (
        query.eq('invocationRef', String(expectedAttempt.invocationRef))
          .eq('attemptRef', String(expectedAttempt.attemptRef))
      ))
      .unique(),
  ])
  if (control === null || attempt === null) return false
  return canonicalDigest(withoutSystemFields(control) as never) === canonicalDigest(commandRow as never)
    && canonicalDigest(withoutSystemFields(attempt) as never) === canonicalDigest(expectedAttempt as never)
}

export async function enqueueInvocationDispatch(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  authority: PersistedOperationAuthority,
  now: number,
): Promise<DispatchResult> {
  if (row.state !== 'pending') return { kind: 'refused' as const }
  if (row.workId !== undefined) {
    if (
      row.authority === undefined
      || canonicalDigest(row.authority as never) !== canonicalDigest(authority as never)
    ) return { kind: 'refused' as const }
    return { kind: 'replayed' as const, workId: row.workId }
  }
  if (
    row.authority !== undefined
    && canonicalDigest(row.authority as never) !== canonicalDigest(authority as never)
  ) return { kind: 'refused' as const }
  const workId = await marketDispatchWorkpool.enqueueAction(
    ctx,
    internal.capabilityOperationInvocationWorker.run,
    { invocationRef: row.invocationRef },
    {
      retry: true,
      onComplete: internal.capabilityOperationInvocations.completeWork,
      context: { invocationRef: row.invocationRef },
    },
  )
  await ctx.db.patch(row._id, {
    workId,
    authority,
    dispatchState: 'enqueued',
    result: {
      kind: 'pending',
      invocationRef: row.invocationRef,
      operationRef: row.operationRef,
      retryAfterMs: OPERATION_INVOKE_RETRY_AFTER_MS,
    },
    updatedAt: now,
  })
  return { kind: 'enqueued' as const, workId }
}

export async function dispatchHandler(
  ctx: MutationCtx,
  args: {
    invocationRef: string
    principalId: string
    credentialId: string
    operationRef: string
    authority?: PersistedOperationAuthority
    now: number
  },
): Promise<DispatchResult> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique()
  if (
    row === null
    || row.principalId !== args.principalId
    || row.credentialId !== args.credentialId
    || row.operationRef !== args.operationRef
    || row.operationJson === undefined
    || row.inputJson === undefined
  ) return { kind: 'refused' as const }
  if (args.authority === undefined) return { kind: 'refused' as const }
  return await enqueueInvocationDispatch(ctx, row, args.authority, args.now)
}

export async function claimDispatchHandler(
  ctx: MutationCtx,
  { dispatch, command }: { dispatch: OpenDispatchValue; command: DispatchCommand },
): Promise<OperationDispatchMutationResult> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', dispatch.invocationRef))
    .unique()
  if (
    row === null
    || !persistedDispatchMatches(row, dispatch)
    || row.state !== 'pending'
    || row.dispatchState === 'completed'
    || row.dispatchState === 'reconciliation_required'
    || dispatch.authority === undefined
    || !commandMatchesDispatch(command, dispatch)
  ) return { kind: 'refused', code: 'outer_identity_refused' }
  const canonicalResult = await ctx.runMutation(
    internal.actionInvocationControl.transact,
    command,
  )
  if (canonicalResult.kind === 'refused') return canonicalResult
  if (!await canonicalCommandReadbackMatches(ctx, command)) {
    return { kind: 'refused', code: 'command_identity_conflict' }
  }
  const attempt = command.currentAttemptWrite as { attemptRef: string; effectGeneration: number }
  await ctx.db.patch(row._id, {
    dispatchState: 'running',
    attemptRef: attempt.attemptRef,
    updatedAt: Date.now(),
  })
  return {
    kind: canonicalResult.kind,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
  }
}

function projectedOuterMatches(row: OperationInvocationRow, projection: OperationDispatchProjectionShape): boolean {
  return [
    row.state === projection.state,
    row.dispatchState === projection.dispatchState,
    row.attemptRef === projection.attemptRef,
    canonicalDigest((row.result ?? null) as never) === canonicalDigest((projection.result ?? null) as never),
    canonicalDigest((row.usage ?? null) as never) === canonicalDigest((projection.usage ?? null) as never),
    (row.evidenceHash ?? null) === (projection.evidenceHash ?? null),
  ].every(Boolean)
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function validFinalizationEnvelope(
  row: OperationInvocationRow | null,
  dispatch: OpenDispatchValue,
  command: DispatchCommand,
  projection: OperationDispatchProjectionShape,
): row is OperationInvocationRow {
  if (row === null || !isRecord(projection)) return false
  return [
    persistedDispatchMatches(row, dispatch),
    ['completed', 'refused', 'reconciliation_required'].includes(projection.state),
    ['completed', 'failed', 'reconciliation_required'].includes(projection.dispatchState),
    isOptionalString(projection.attemptRef),
    commandMatchesDispatch(command, dispatch),
  ].every(Boolean)
}

async function terminalFinalizationResult(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  command: DispatchCommand,
  projection: OperationDispatchProjectionShape,
): Promise<OperationDispatchMutationResult | null> {
  if (row.state === 'pending') return null
  if (!projectedOuterMatches(row, projection)) return { kind: 'refused', code: 'outer_state_refused' }
  if (!await canonicalCommandReadbackMatches(ctx, command)) return { kind: 'refused', code: 'outer_state_refused' }
  const attempt = command.currentAttemptWrite as { attemptRef: string; effectGeneration: number }
  return { kind: 'duplicate', attemptRef: attempt.attemptRef, effectGeneration: attempt.effectGeneration }
}

async function recordFinalizationEvidence(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  state: OperationDispatchProjectionShape['state'],
): Promise<void> {
  if (state === 'completed') {
    const completedAt = Date.now()
    await recordMarketEvidenceFact(ctx, 'ae_invocation_completed', row.invocationRef, completedAt, {
      operationRef: row.operationRef,
      durationMs: Math.max(0, completedAt - row.createdAt),
    })
  }
  if (state === 'reconciliation_required') {
    await recordMarketEvidenceFact(ctx, 'ae_reconciliation_required', row.invocationRef, Date.now())
  }
}

export async function finalizeDispatchHandler(
  ctx: MutationCtx,
  { dispatch, command, projection }: {
    dispatch: OpenDispatchValue
    command: DispatchCommand
    projection: OperationDispatchProjectionShape
  },
): Promise<OperationDispatchMutationResult> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', dispatch.invocationRef))
    .unique()
  if (!validFinalizationEnvelope(row, dispatch, command, projection)) {
    return { kind: 'refused', code: 'outer_identity_refused' }
  }
  const normalizedProjection = projection
  if (normalizedProjection.result !== undefined) {
    assertOperationResultJson(normalizedProjection.result)
  }
  const terminalResult = await terminalFinalizationResult(ctx, row, command, normalizedProjection)
  if (terminalResult !== null) return terminalResult
  const canonicalResult = await ctx.runMutation(
    internal.actionInvocationControl.transact,
    command,
  )
  if (canonicalResult.kind === 'refused') return canonicalResult
  if (!await canonicalCommandReadbackMatches(ctx, command)) {
    return { kind: 'refused', code: 'command_identity_conflict' }
  }
  const attempt = command.currentAttemptWrite as { attemptRef: string; effectGeneration: number }
  await ctx.db.patch(row._id, {
    state: normalizedProjection.state,
    result: normalizedProjection.result,
    usage: normalizedProjection.usage,
    evidenceHash: normalizedProjection.evidenceHash,
    attemptRef: normalizedProjection.attemptRef,
    dispatchState: normalizedProjection.dispatchState,
    updatedAt: Date.now(),
  })
  await recordFinalizationEvidence(ctx, row, normalizedProjection.state)
  return {
    kind: canonicalResult.kind,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
  }
}

type CancellationArgs = Readonly<{
  invocationRef: string
  principalId: string
  credentialId: string
  idempotencyKey: string
}>

function cancellationIdentityMatches(row: OperationInvocationRow | null, args: CancellationArgs): row is OperationInvocationRow {
  if (row === null) return false
  return [
    row.principalId === args.principalId,
    row.credentialId === args.credentialId,
    row.idempotencyKey === args.idempotencyKey,
  ].every(Boolean)
}

function cancelledResult(workId?: string): OperationDispatchMutationResult {
  return workId === undefined ? { kind: 'cancelled' } : { kind: 'cancelled', workId }
}

async function patchCancelledInvocation(ctx: MutationCtx, row: OperationInvocationRow): Promise<void> {
  await ctx.db.patch(row._id, {
    state: 'cancelled',
    result: {
      kind: 'refused',
      operationRef: row.operationRef,
      code: 'invocation_cancelled',
      retryable: false,
    },
    workId: undefined,
    attemptRef: undefined,
    dispatchState: 'failed',
    updatedAt: Date.now(),
  })
}

function cancellationNeedsReconciliation(
  canonical: Doc<'actionInvocationControls'>['control']['control'],
  attemptRef: string | undefined,
): boolean {
  if (attemptRef === undefined) return true
  if (canonical.state === 'reconciliation_required') return true
  return canonical.state === 'leased' && canonical.release === 'possibly_released'
}

async function patchCancellationReconciliation(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  attemptRef: string,
  effectGeneration: number,
): Promise<void> {
  if (row.state !== 'pending') return
  await ctx.db.patch(row._id, {
    state: 'reconciliation_required',
    dispatchState: 'reconciliation_required',
    result: {
      kind: 'reconciliation_required',
      invocationRef: row.invocationRef,
      operationRef: row.operationRef,
      evidence: {
        attemptRef,
        effectGeneration,
        requiredAt: new Date(Date.now() + 1_000).toISOString(),
        retry: 'reconcile_before_retry',
        evidenceSource: `operation:${row.operationRef}`,
      },
    },
    attemptRef,
    updatedAt: Date.now(),
  })
}

async function markCancellationClaimed(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  attemptRef: string | undefined,
): Promise<void> {
  if (row.state !== 'pending' || attemptRef === undefined) return
  await ctx.db.patch(row._id, {
    dispatchState: 'running',
    attemptRef,
    updatedAt: Date.now(),
  })
}

export async function cancelBeforeClaimHandler(
  ctx: MutationCtx,
  args: CancellationArgs,
): Promise<OperationDispatchMutationResult> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
    .unique()
  if (!cancellationIdentityMatches(row, args)) return { kind: 'refused', code: 'invocation_not_found' }
  if (row.state === 'cancelled') return cancelledResult(row.workId)
  const control = await ctx.db.query('actionInvocationControls')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
    .unique()
  if (control === null && row.state === 'pending') {
    const workId = row.workId
    await patchCancelledInvocation(ctx, row)
    return cancelledResult(workId)
  }
  if (control === null) return { kind: 'refused', code: 'invocation_state_refused' }
  const canonical = control.control.control
  const attemptRef = control.currentAttemptRef
  const effectGeneration = control.currentEffectGeneration ?? 1
  if (canonical.state === 'cancelled') {
    await patchCancelledInvocation(ctx, row)
    return { kind: 'cancelled' }
  }
  if (cancellationNeedsReconciliation(canonical, attemptRef)) {
    const reconciliationAttemptRef = attemptRef ?? `operation-attempt:${row.invocationRef}:1`
    await patchCancellationReconciliation(ctx, row, reconciliationAttemptRef, effectGeneration)
    return {
      kind: 'reconciliation_required',
      attemptRef: reconciliationAttemptRef,
      effectGeneration,
    }
  }
  await markCancellationClaimed(ctx, row, attemptRef)
  return { kind: 'claimed' }
}

export async function openDispatchHandler(
  ctx: QueryCtx,
  args: { invocationRef: string },
): Promise<OpenDispatchValue | null> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique()
  if (
    row === null
    || row.operationJson === undefined
    || row.inputJson === undefined
  ) return null
  return {
    invocationRef: row.invocationRef,
    principalId: row.principalId,
    ownerId: row.ownerId,
    credentialId: row.credentialId,
    applicationRef: row.applicationRef,
    environment: row.environment,
    state: row.state,
    operationRef: row.operationRef,
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    requestDigest: row.requestDigest,
    grantRef: row.grantRef,
    grantGeneration: row.grantGeneration,
    policyDigest: row.policyDigest,
    grantExpiresAt: row.grantExpiresAt,
    operationJson: row.operationJson,
    inputJson: row.inputJson,
    ...(row.authority === undefined ? {} : { authority: structuredClone(row.authority) }),
    ...(row.workId === undefined ? {} : { workId: row.workId }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    ...(row.dispatchState === undefined ? {} : { dispatchState: row.dispatchState }),
  }
}
