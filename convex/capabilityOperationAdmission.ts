import type { Infer } from 'convex/values'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
  requireSourceWrite,
  sourceWriteAdmissionArg,
  sourceWriteRequestArg,
} from './sourceWriteAdmission'
import { readCurrentPublishedOperation } from './capabilitySupplyOperations'
import { enqueueInvocationDispatch } from './capabilityOperationDispatch'
import { assertAgentAccessRateAdmission } from './lib/rateLimit'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import { isPublicOperationRef } from '@/modules/capability-supply/public'
import {
  materializeRuntimePublishedOperation,
  parsePublishedOperationSnapshot,
  publishedOperationMaterialMatches,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import {
  buildOperationInvokeAuthority,
  type OperationInvokeApprovedAuthority,
  type OperationInvokeGrant,
  type OperationInvokeIdempotencyReservation,
} from '@/modules/capability-execution/operation-invoke'

export function assertJsonObject(value: unknown): asserts value is Record<string, JsonValue> {
  if (!isRecord(value) || !isBoundedJsonValue(value)) throw new Error('operation_invocation_json_invalid')
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) && isBoundedJsonValue(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export type OperationInvokePrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  scopes: string[]
  authorityMode: 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo'
}>

export type AdmitArgs = {
  operationKey: string
  correlationId: string
  sourceWrite?: Infer<typeof sourceWriteAdmissionArg>
  sourceWriteRequest?: Infer<typeof sourceWriteRequestArg>
  principal: OperationInvokePrincipal
  operationRef: string
  input: Record<string, JsonValue>
  idempotencyKey: string
}

export type ReserveArgs = Readonly<{
  invocationRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  grantRef: string
  environment: 'sandbox' | 'production'
  operationRef: string
  idempotencyKey: string
  inputDigest: string
  requestDigest: string
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  operationJson?: string
  inputJson?: string
  now: number
}>

export type ReserveResult =
  | { kind: 'reserved'; reservation: OperationInvokeIdempotencyReservation }
  | { kind: 'replayed'; reservation: OperationInvokeIdempotencyReservation }
  | { kind: 'conflict' }
  | {
      kind: 'refused'
      code:
        | 'grant_not_found'
        | 'grant_revoked'
        | 'grant_expired'
        | 'grant_generation_stale'
        | 'environment_mismatch'
        | 'rate_limited'
        | 'concurrency_limited'
      retryable: boolean
      nextAction?: string
    }

export type AbandonArgs = Omit<ReserveArgs, 'operationJson' | 'inputJson' | 'now'>

export type AbandonResult =
  | { kind: 'abandoned' }
  | { kind: 'not_found' }
  | { kind: 'dispatch_started' }

export type PendingApprovalView = Readonly<{
  invocationRef: string
  operationRef: string
  authorityRequest: {
    kind: 'approve_each' | 'bounded_mandate'
    operationRef: string
    consequence: 'read_only' | 'communication' | 'external_effect'
    retryClass: 'replayable' | 'attributable_retry' | 'reconcile_before_retry'
    maximumSpend?: { currency: string; units: string; exponent: number }
    dataFields: string[]
    expiresAt?: string
  }
  createdAt: number
}>

export type ApprovalDecisionResult =
  | { kind: 'approved' | 'denied' | 'replayed'; invocationRef: string }
  | {
      kind: 'refused'
      code:
        | 'authentication_required'
        | 'invocation_not_found'
        | 'authority_not_pending'
        | 'grant_not_current'
        | 'invocation_invalid'
    }

export async function admitHandler(
  ctx: MutationCtx,
  args: AdmitArgs,
): Promise<{ kind: 'accepted' }> {
  assertJsonObject(args.input)
  const admission = await requireSourceWrite(ctx, args, 'protected_action')
  if (admission.kind === 'rejected') throw new Error(`operation_invoke_source_write_rejected:${admission.reason}`)
  return { kind: 'accepted' as const }
}

export async function reserveHandler(
  ctx: MutationCtx,
  args: ReserveArgs,
): Promise<ReserveResult> {
  const existing = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_credentialId_and_idempotencyKey', (query) => query.eq('credentialId', args.credentialId).eq('idempotencyKey', args.idempotencyKey))
    .unique()
  const reservation: OperationInvokeIdempotencyReservation = {
    principalId: args.principalId,
    credentialId: args.credentialId,
    applicationRef: args.applicationRef,
    grantRef: args.grantRef,
    grantGeneration: args.grantGeneration,
    policyDigest: args.policyDigest,
    grantExpiresAt: args.grantExpiresAt,
    environment: args.environment,
    operationRef: args.operationRef,
    idempotencyKey: args.idempotencyKey,
    inputDigest: args.inputDigest,
    requestDigest: args.requestDigest,
    invocationRef: args.invocationRef,
  }
  if (existing !== null) {
    const existingGrantRef = existing.grantRef
    const existingPolicyDigest = existing.policyDigest
    const existingGrantExpiresAt = existing.grantExpiresAt
    const operationJsonMatches = existing.operationJson === undefined
      || args.operationJson === undefined
      || publishedOperationMaterialMatches(
        parsePublishedOperationSnapshot(existing.operationJson),
        parsePublishedOperationSnapshot(args.operationJson),
      )
    if (
      existingGrantRef === undefined
      || existingPolicyDigest === undefined
      || existingGrantExpiresAt === undefined
      || existing.principalId !== args.principalId
      || existing.ownerId !== args.ownerId
      || existing.credentialId !== args.credentialId
      || existing.applicationRef !== args.applicationRef
      || existing.grantRef !== args.grantRef
      || existing.grantGeneration !== args.grantGeneration
      || existing.policyDigest !== args.policyDigest
      || existing.grantExpiresAt !== args.grantExpiresAt
      || existing.environment !== args.environment
      || existing.operationRef !== args.operationRef
      || existing.idempotencyKey !== args.idempotencyKey
      || existing.inputDigest !== args.inputDigest
      || existing.requestDigest !== args.requestDigest
      || existing.invocationRef !== args.invocationRef
      || !operationJsonMatches
      || existing.inputJson !== args.inputJson
    ) return { kind: 'conflict' }
    if (existing.operationJson === undefined && args.operationJson !== undefined) {
      await ctx.db.patch(existing._id, { operationJson: args.operationJson, updatedAt: args.now })
    }
    return {
      kind: 'replayed',
      reservation: {
        principalId: existing.principalId,
        credentialId: existing.credentialId,
        applicationRef: existing.applicationRef,
        grantRef: existingGrantRef,
        grantGeneration: existing.grantGeneration,
        policyDigest: existingPolicyDigest,
        grantExpiresAt: existingGrantExpiresAt,
        environment: existing.environment,
        operationRef: existing.operationRef,
        idempotencyKey: existing.idempotencyKey,
        inputDigest: existing.inputDigest,
        requestDigest: existing.requestDigest,
        invocationRef: existing.invocationRef,
      },
    }
  }

  const grant = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef))
    .unique()
  if (grant === null) {
    return {
      kind: 'refused',
      code: 'grant_not_found',
      retryable: false,
      nextAction: 'Refresh the agent grant and retry.',
    }
  }
  if (grant.environment !== args.environment) {
    return {
      kind: 'refused',
      code: 'environment_mismatch',
      retryable: false,
      nextAction: 'Use a grant for the requested environment.',
    }
  }
  if (grant.principalId !== args.principalId
    || grant.ownerId !== args.ownerId
    || grant.credentialId !== args.credentialId
    || grant.applicationRef !== args.applicationRef) {
    return {
      kind: 'refused',
      code: 'grant_not_found',
      retryable: false,
      nextAction: 'Refresh the agent grant and retry.',
    }
  }
  if (grant.lifecycle === 'revoked') {
    return {
      kind: 'refused',
      code: 'grant_revoked',
      retryable: false,
      nextAction: 'Issue a new agent grant before retrying.',
    }
  }
  if (grant.lifecycle === 'expired' || grant.expiresAt <= args.now) {
    return {
      kind: 'refused',
      code: 'grant_expired',
      retryable: false,
      nextAction: 'Issue a new agent grant before retrying.',
    }
  }
  if (grant.generation !== args.grantGeneration
    || grant.policyDigest !== args.policyDigest
    || grant.expiresAt !== args.grantExpiresAt) {
    return {
      kind: 'refused',
      code: 'grant_generation_stale',
      retryable: false,
      nextAction: 'Refresh the agent grant and retry.',
    }
  }

  const rate = await assertAgentAccessRateAdmission(ctx, {
    applicationRef: args.applicationRef,
    credentialId: args.credentialId,
    maximumCallsPerMinute: grant.policy.rate.maximumCallsPerMinute,
    maximumCallsPerHour: grant.policy.rate.maximumCallsPerHour,
  })
  if (!rate.ok) {
    return {
      kind: 'refused',
      code: 'rate_limited',
      retryable: true,
      nextAction: 'Retry after the current rate window advances.',
    }
  }

  // Bound queued envelopes before spend admission; budget concurrency is a separate gate.
  const concurrentLimit = grant.policy.budget.maximumConcurrentInvocations
  const pendingRows = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_credentialId_and_state_and_grantExpiresAt', (query) => (
      query.eq('credentialId', args.credentialId)
        .eq('state', 'pending')
        .gt('grantExpiresAt', args.now)
    ))
    .take(concurrentLimit)
  if (pendingRows.length >= concurrentLimit) {
    return {
      kind: 'refused',
      code: 'concurrency_limited',
      retryable: true,
      nextAction: 'Retry after an active invocation completes.',
    }
  }
  const reconciliationRows = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_credentialId_and_state', (query) => query.eq('credentialId', args.credentialId).eq('state', 'reconciliation_required'))
    .take(concurrentLimit - pendingRows.length)
  if (pendingRows.length + reconciliationRows.length >= concurrentLimit) {
    return {
      kind: 'refused',
      code: 'concurrency_limited',
      retryable: true,
      nextAction: 'Resolve an active invocation before retrying.',
    }
  }

  await ctx.db.insert('capabilityOperationInvocations', {
    ...reservation,
    ...(args.operationJson === undefined ? {} : { operationJson: args.operationJson }),
    ...(args.inputJson === undefined ? {} : { inputJson: args.inputJson }),
    ownerId: args.ownerId,
    state: 'pending',
    createdAt: args.now,
    updatedAt: args.now,
  })

  return { kind: 'reserved', reservation }
}

export async function abandonHandler(
  ctx: MutationCtx,
  args: AbandonArgs,
): Promise<AbandonResult> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
    .unique()
  if (
    row === null
    || row.principalId !== args.principalId
    || row.ownerId !== args.ownerId
    || row.credentialId !== args.credentialId
    || row.applicationRef !== args.applicationRef
    || row.grantRef !== args.grantRef
    || row.grantGeneration !== args.grantGeneration
    || row.policyDigest !== args.policyDigest
    || row.grantExpiresAt !== args.grantExpiresAt
    || row.environment !== args.environment
    || row.operationRef !== args.operationRef
    || row.idempotencyKey !== args.idempotencyKey
    || row.inputDigest !== args.inputDigest
    || row.requestDigest !== args.requestDigest
    || row.invocationRef !== args.invocationRef
  ) return { kind: 'not_found' as const }
  if (
    row.state !== 'pending'
    || row.result !== undefined
    || row.workId !== undefined
    || row.authority !== undefined
    || row.dispatchState !== undefined
  ) return { kind: 'dispatch_started' as const }
  await ctx.db.delete(row._id)
  return { kind: 'abandoned' as const }
}

export async function listPendingOperationApprovalsHandler(
  ctx: QueryCtx,
): Promise<PendingApprovalView[]> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null || identity.subject.trim().length === 0) return []
  const now = Date.now()
  const rows = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_ownerId_and_state_and_createdAt', (query) => (
      query.eq('ownerId', identity.subject).eq('state', 'pending')
    ))
    .order('desc')
    .take(50)
  return rows.flatMap((row) => {
    if (row.grantExpiresAt <= now) return []
    if (row.result?.kind !== 'needs_authority') return []
    if (row.result.invocationRef !== row.invocationRef || row.result.operationRef !== row.operationRef) return []
    return [{
      invocationRef: row.invocationRef,
      operationRef: row.operationRef,
      authorityRequest: structuredClone(row.result.authorityRequest),
      createdAt: row.createdAt,
    }]
  })
}

export async function decideOperationApprovalHandler(
  ctx: MutationCtx,
  args: { invocationRef: string; decision: 'approve' | 'deny' },
): Promise<ApprovalDecisionResult> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null || identity.subject.trim().length === 0) {
    return { kind: 'refused', code: 'authentication_required' }
  }
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
    .unique()
  if (row === null || row.ownerId !== identity.subject) {
    return { kind: 'refused', code: 'invocation_not_found' }
  }
  if (
    args.decision === 'deny'
    && row.state === 'refused'
    && row.result?.kind === 'refused'
    && row.result.code === 'authority_denied'
  ) return { kind: 'replayed', invocationRef: row.invocationRef }
  if (
    args.decision === 'approve'
    && row.state === 'pending'
    && row.result?.kind === 'pending'
    && row.workId !== undefined
    && row.authority !== undefined
  ) return { kind: 'replayed', invocationRef: row.invocationRef }
  if (row.state !== 'pending' || row.result?.kind !== 'needs_authority') {
    return { kind: 'refused', code: 'authority_not_pending' }
  }
  if (row.workId !== undefined || row.authority !== undefined) {
    return { kind: 'refused', code: 'invocation_invalid' }
  }
  if (args.decision === 'deny') {
    await ctx.db.patch(row._id, {
      state: 'refused',
      dispatchState: 'failed',
      result: {
        kind: 'refused',
        operationRef: row.operationRef,
        code: 'authority_denied',
        retryable: false,
        nextAction: 'The owner declined this operation.',
      },
      updatedAt: Date.now(),
    })
    return { kind: 'denied', invocationRef: row.invocationRef }
  }

  if (!isPublicOperationRef(row.operationRef)) return { kind: 'refused', code: 'invocation_invalid' }
  if (row.inputJson === undefined || row.operationJson === undefined) {
    return { kind: 'refused', code: 'invocation_invalid' }
  }
  const persistedInput = parseJsonObject(row.inputJson)
  const persistedOperation = parsePublishedOperationSnapshot(row.operationJson)
  if (persistedInput === undefined || persistedOperation === undefined || persistedOperation.operationId !== row.operationRef) {
    return { kind: 'refused', code: 'invocation_invalid' }
  }
  try {
    if (
      canonicalDigest(persistedInput) !== row.inputDigest
      || canonicalDigest({ operationRef: row.operationRef, input: persistedInput }) !== row.requestDigest
    ) return { kind: 'refused', code: 'invocation_invalid' }
  } catch {
    return { kind: 'refused', code: 'invocation_invalid' }
  }
  const now = Date.now()
  let currentOperation: PublishedOperation | undefined
  try {
    currentOperation = await readCurrentPublishedOperation(ctx, row.operationRef, now)
  } catch {
    return { kind: 'refused', code: 'invocation_invalid' }
  }
  if (
    currentOperation === undefined
    || currentOperation.operationId !== row.operationRef
    || !publishedOperationMaterialMatches(persistedOperation, currentOperation)
  ) return { kind: 'refused', code: 'invocation_invalid' }
  let descriptor: RuntimePublishedOperationDescriptor
  try {
    descriptor = materializeRuntimePublishedOperation(currentOperation)
  } catch {
    return { kind: 'refused', code: 'invocation_invalid' }
  }
  if (descriptor.price.kind !== 'fixed') return { kind: 'refused', code: 'invocation_invalid' }
  const expectedAuthorityRequest = {
    kind: 'approve_each' as const,
    operationRef: row.operationRef,
    consequence: descriptor.consequenceClass,
    retryClass: descriptor.retryClass,
    maximumSpend: descriptor.price.amount,
    dataFields: [...descriptor.materialInputPointers],
  }
  try {
    if (canonicalDigest(row.result.authorityRequest as never) !== canonicalDigest(expectedAuthorityRequest as never)) {
      return { kind: 'refused', code: 'invocation_invalid' }
    }
  } catch {
    return { kind: 'refused', code: 'invocation_invalid' }
  }

  const grant = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', row.grantRef))
    .unique()
  if (
    grant === null
    || grant.lifecycle !== 'active'
    || grant.authorityMode !== 'approve_each'
    || grant.expiresAt <= now
    || grant.principalId !== row.principalId
    || grant.ownerId !== row.ownerId
    || grant.credentialId !== row.credentialId
    || grant.applicationRef !== row.applicationRef
    || grant.environment !== row.environment
    || grant.generation !== row.grantGeneration
    || grant.policyDigest !== row.policyDigest
    || grant.expiresAt !== row.grantExpiresAt
  ) return { kind: 'refused', code: 'grant_not_current' }
  const operationGrant: OperationInvokeGrant = {
    grantRef: grant.grantRef,
    principalId: grant.principalId,
    ownerId: grant.ownerId,
    applicationRef: grant.applicationRef,
    credentialId: grant.credentialId,
    environment: grant.environment,
    generation: grant.generation,
    policyDigest: grant.policyDigest,
    expiresAt: grant.expiresAt,
    lifecycle: 'active',
    operationAccess: grant.operationAccess,
  }
  const approval: OperationInvokeApprovedAuthority = {
    kind: 'approved',
    basis: {
      kind: 'approve_each',
      authorityRef: `owner-approval:${canonicalDigest({
        invocationRef: row.invocationRef,
        ownerId: identity.subject,
      }).slice(7)}`,
    },
    expiresAt: new Date(grant.expiresAt).toISOString(),
  }
  const authority = buildOperationInvokeAuthority({
    authority: approval,
    grant: operationGrant,
    operation: currentOperation,
    descriptor,
    operationRef: row.operationRef,
    invocationRef: row.invocationRef,
    inputDigest: row.inputDigest,
    now,
  })
  if (authority === undefined) return { kind: 'refused', code: 'invocation_invalid' }
  const dispatched = await enqueueInvocationDispatch(ctx, row, authority, now)
  if (dispatched.kind === 'replayed') return { kind: 'replayed', invocationRef: row.invocationRef }
  if (dispatched.kind === 'refused') return { kind: 'refused', code: 'invocation_invalid' }
  return { kind: 'approved', invocationRef: row.invocationRef }
}
