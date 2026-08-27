import type { Infer } from 'convex/values'
import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import {
  requireSourceWrite,
  sourceWriteAdmissionArg,
  sourceWriteRequestArg,
} from '../../sourceWriteAdmission'
import { readCurrentPublishedOperation } from '../../capabilitySupplyOperations'
import { enqueueInvocationDispatch } from './dispatch'
import { assertAgentAccessRateAdmission } from '../rateLimit'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import { createPublicOperationRef, isPublicOperationRef } from '@/modules/capability-supply/public'
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
import { currentOperationCommitmentsMatch } from '@/modules/capability-execution/current-operation-commitment'
import { recordMarketEvidenceFact } from '../../marketEvidence'

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

function publicOperationRef(operation: PublishedOperation): string {
  return createPublicOperationRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref,
  })
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

type InvocationRow = Doc<'capabilityOperationInvocations'>
type GrantRow = Doc<'agentAccessGrants'>

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

function reservationFromArgs(args: ReserveArgs): OperationInvokeIdempotencyReservation {
  return {
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
}

function operationSnapshotMatches(existing: InvocationRow, args: ReserveArgs): boolean {
  if (existing.operationJson === undefined || args.operationJson === undefined) return true
  return publishedOperationMaterialMatches(
    parsePublishedOperationSnapshot(existing.operationJson),
    parsePublishedOperationSnapshot(args.operationJson),
  )
}

function existingReservationMatches(existing: InvocationRow, args: ReserveArgs): boolean {
  return [
    existing.grantRef !== undefined,
    existing.policyDigest !== undefined,
    existing.grantExpiresAt !== undefined,
    existing.principalId === args.principalId,
    existing.ownerId === args.ownerId,
    existing.credentialId === args.credentialId,
    existing.applicationRef === args.applicationRef,
    existing.grantRef === args.grantRef,
    existing.grantGeneration === args.grantGeneration,
    existing.policyDigest === args.policyDigest,
    existing.grantExpiresAt === args.grantExpiresAt,
    existing.environment === args.environment,
    existing.operationRef === args.operationRef,
    existing.idempotencyKey === args.idempotencyKey,
    existing.inputDigest === args.inputDigest,
    existing.requestDigest === args.requestDigest,
    existing.invocationRef === args.invocationRef,
    operationSnapshotMatches(existing, args),
    existing.inputJson === args.inputJson,
  ].every(Boolean)
}

async function replayExistingReservation(
  ctx: MutationCtx,
  existing: InvocationRow,
  args: ReserveArgs,
): Promise<ReserveResult> {
  if (!existingReservationMatches(existing, args)) return { kind: 'conflict' }
  if (existing.operationJson === undefined && args.operationJson !== undefined) {
    await ctx.db.patch(existing._id, { operationJson: args.operationJson, updatedAt: args.now })
  }
  return { kind: 'replayed', reservation: reservationFromArgs(args) }
}

type GrantRefusal = Extract<ReserveResult, { kind: 'refused' }>

function missingGrant(): GrantRefusal {
  return {
    kind: 'refused',
    code: 'grant_not_found',
    retryable: false,
    nextAction: 'Refresh the agent grant and retry.',
  }
}

function grantIdentityMatches(grant: GrantRow, args: ReserveArgs): boolean {
  return [
    grant.principalId === args.principalId,
    grant.ownerId === args.ownerId,
    grant.credentialId === args.credentialId,
    grant.applicationRef === args.applicationRef,
  ].every(Boolean)
}

function grantAdmissionRefusal(grant: GrantRow | null, args: ReserveArgs): GrantRefusal | null {
  if (grant === null) return missingGrant()
  if (grant.environment !== args.environment) {
    return { kind: 'refused', code: 'environment_mismatch', retryable: false, nextAction: 'Use a grant for the requested environment.' }
  }
  if (!grantIdentityMatches(grant, args)) return missingGrant()
  if (grant.lifecycle === 'revoked') {
    return { kind: 'refused', code: 'grant_revoked', retryable: false, nextAction: 'Issue a new agent grant before retrying.' }
  }
  if (grant.lifecycle === 'expired' || grant.expiresAt <= args.now) {
    return { kind: 'refused', code: 'grant_expired', retryable: false, nextAction: 'Issue a new agent grant before retrying.' }
  }
  const generationMatches = [
    grant.generation === args.grantGeneration,
    grant.policyDigest === args.policyDigest,
    grant.expiresAt === args.grantExpiresAt,
  ].every(Boolean)
  return generationMatches
    ? null
    : { kind: 'refused', code: 'grant_generation_stale', retryable: false, nextAction: 'Refresh the agent grant and retry.' }
}

async function concurrencyAdmissionRefusal(
  ctx: MutationCtx,
  args: ReserveArgs,
  concurrentLimit: number,
): Promise<GrantRefusal | null> {
  const pendingRows = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_credentialId_and_state_and_grantExpiresAt', (query) => (
      query.eq('credentialId', args.credentialId)
        .eq('state', 'pending')
        .gt('grantExpiresAt', args.now)
    ))
    .take(concurrentLimit)
  if (pendingRows.length >= concurrentLimit) {
    return { kind: 'refused', code: 'concurrency_limited', retryable: true, nextAction: 'Retry after an active invocation completes.' }
  }
  const reconciliationRows = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_credentialId_and_state', (query) => query.eq('credentialId', args.credentialId).eq('state', 'reconciliation_required'))
    .take(concurrentLimit - pendingRows.length)
  return pendingRows.length + reconciliationRows.length >= concurrentLimit
    ? { kind: 'refused', code: 'concurrency_limited', retryable: true, nextAction: 'Resolve an active invocation before retrying.' }
    : null
}

export async function reserveHandler(
  ctx: MutationCtx,
  args: ReserveArgs,
): Promise<ReserveResult> {
  const existing = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_credentialId_and_idempotencyKey', (query) => query.eq('credentialId', args.credentialId).eq('idempotencyKey', args.idempotencyKey))
    .unique()
  const reservation = reservationFromArgs(args)
  if (existing !== null) return await replayExistingReservation(ctx, existing, args)

  const grant = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef))
    .unique()
  const grantRefusal = grantAdmissionRefusal(grant, args)
  if (grantRefusal !== null) return grantRefusal
  if (grant === null) return missingGrant()

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
  const concurrencyRefusal = await concurrencyAdmissionRefusal(
    ctx,
    args,
    grant.policy.budget.maximumConcurrentInvocations,
  )
  if (concurrencyRefusal !== null) return concurrencyRefusal

  await ctx.db.insert('capabilityOperationInvocations', {
    ...reservation,
    ...(args.operationJson === undefined ? {} : { operationJson: args.operationJson }),
    ...(args.inputJson === undefined ? {} : { inputJson: args.inputJson }),
    ownerId: args.ownerId,
    state: 'pending',
    createdAt: args.now,
    updatedAt: args.now,
  })
  await recordMarketEvidenceFact(ctx, 'ae_invocation', reservation.invocationRef, args.now, {
    operationRef: reservation.operationRef,
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
  if (row === null || !abandonmentIdentityMatches(row, args)) return { kind: 'not_found' as const }
  if (dispatchHasStarted(row)) return { kind: 'dispatch_started' as const }
  await ctx.db.delete(row._id)
  return { kind: 'abandoned' as const }
}

function abandonmentIdentityMatches(row: InvocationRow, args: AbandonArgs): boolean {
  return [
    row.principalId === args.principalId,
    row.ownerId === args.ownerId,
    row.credentialId === args.credentialId,
    row.applicationRef === args.applicationRef,
    row.grantRef === args.grantRef,
    row.grantGeneration === args.grantGeneration,
    row.policyDigest === args.policyDigest,
    row.grantExpiresAt === args.grantExpiresAt,
    row.environment === args.environment,
    row.operationRef === args.operationRef,
    row.idempotencyKey === args.idempotencyKey,
    row.inputDigest === args.inputDigest,
    row.requestDigest === args.requestDigest,
    row.invocationRef === args.invocationRef,
  ].every(Boolean)
}

function dispatchHasStarted(row: InvocationRow): boolean {
  return [
    row.state !== 'pending',
    row.result !== undefined,
    row.workId !== undefined,
    row.authority !== undefined,
    row.dispatchState !== undefined,
  ].some(Boolean)
}

export async function listPendingOperationApprovalsHandler(
  ctx: QueryCtx,
): Promise<PendingApprovalView[]> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null || identity.tokenIdentifier.trim().length === 0) return []
  const now = Date.now()
  const rows = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_ownerId_and_state_and_createdAt', (query) => (
      query.eq('ownerId', identity.tokenIdentifier).eq('state', 'pending')
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

type NeedsAuthorityResult = Extract<NonNullable<InvocationRow['result']>, { kind: 'needs_authority' }>
type PendingApprovalRow = InvocationRow & { result: NeedsAuthorityResult }

type ApprovalMaterial = Readonly<{
  input: Record<string, unknown>
  operation: PublishedOperation
}>

type ApprovalRuntime = Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
}>

async function authenticatedOwnerRef(ctx: MutationCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return null
  const ownerRef = identity.tokenIdentifier.trim()
  return ownerRef.length === 0 ? null : identity.tokenIdentifier
}

function replayedApprovalDecision(
  row: InvocationRow,
  decision: 'approve' | 'deny',
): ApprovalDecisionResult | null {
  const result = row.result
  if (decision === 'deny') {
    const replayed = [
      row.state === 'refused',
      result?.kind === 'refused',
      result?.kind === 'refused' && result.code === 'authority_denied',
    ].every(Boolean)
    return replayed ? { kind: 'replayed', invocationRef: row.invocationRef } : null
  }
  const replayed = [
    row.state === 'pending',
    result?.kind === 'pending',
    row.workId !== undefined,
    row.authority !== undefined,
  ].every(Boolean)
  return replayed ? { kind: 'replayed', invocationRef: row.invocationRef } : null
}

function pendingApprovalRow(row: InvocationRow): row is PendingApprovalRow {
  return row.state === 'pending' && row.result?.kind === 'needs_authority'
}

function pendingApprovalIsClean(row: PendingApprovalRow): boolean {
  return row.workId === undefined && row.authority === undefined
}

async function denyPendingApproval(ctx: MutationCtx, row: PendingApprovalRow): Promise<ApprovalDecisionResult> {
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

function loadApprovalMaterial(row: PendingApprovalRow): ApprovalMaterial | null {
  if (!isPublicOperationRef(row.operationRef)) return null
  if (row.inputJson === undefined || row.operationJson === undefined) return null
  const input = parseJsonObject(row.inputJson)
  const operation = parsePublishedOperationSnapshot(row.operationJson)
  if (input === undefined || operation === undefined) return null
  if (publicOperationRef(operation) !== row.operationRef) return null
  try {
    const digestsMatch = [
      canonicalDigest(input) === row.inputDigest,
      canonicalDigest({ operationRef: row.operationRef, input }) === row.requestDigest,
    ].every(Boolean)
    return digestsMatch ? { input, operation } : null
  } catch {
    return null
  }
}

function approvalRequestMatches(
  row: PendingApprovalRow,
  descriptor: RuntimePublishedOperationDescriptor,
): boolean {
  if (descriptor.price.kind !== 'fixed') return false
  const expected = {
    kind: 'approve_each' as const,
    operationRef: row.operationRef,
    consequence: descriptor.consequenceClass,
    retryClass: descriptor.retryClass,
    maximumSpend: descriptor.price.amount,
    dataFields: [...descriptor.materialInputPointers],
  }
  try {
    return canonicalDigest(row.result.authorityRequest as never) === canonicalDigest(expected as never)
  } catch {
    return false
  }
}

async function loadApprovalRuntime(
  ctx: MutationCtx,
  row: PendingApprovalRow,
  material: ApprovalMaterial,
  now: number,
): Promise<ApprovalRuntime | null> {
  let operation: PublishedOperation | undefined
  try {
    operation = await readCurrentPublishedOperation(ctx, row.operationRef, now)
  } catch {
    return null
  }
  if (operation === undefined) return null
  const commitmentsMatch = [
    publicOperationRef(operation) === row.operationRef,
    currentOperationCommitmentsMatch({
      operationRef: row.operationRef,
      pinned: material.operation,
      current: operation,
    }),
  ].every(Boolean)
  if (!commitmentsMatch) return null
  try {
    const descriptor = materializeRuntimePublishedOperation(operation)
    return approvalRequestMatches(row, descriptor) ? { operation, descriptor } : null
  } catch {
    return null
  }
}

function currentApprovalGrant(grant: GrantRow | null, row: InvocationRow, now: number): grant is GrantRow {
  if (grant === null) return false
  return [
    grant.lifecycle === 'active',
    grant.authorityMode === 'approve_each',
    grant.expiresAt > now,
    grant.principalId === row.principalId,
    grant.ownerId === row.ownerId,
    grant.credentialId === row.credentialId,
    grant.applicationRef === row.applicationRef,
    grant.environment === row.environment,
    grant.generation === row.grantGeneration,
    grant.policyDigest === row.policyDigest,
    grant.expiresAt === row.grantExpiresAt,
  ].every(Boolean)
}

function operationGrantFromRow(grant: GrantRow): OperationInvokeGrant {
  return {
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
}

function approvedAuthority(grant: GrantRow, row: InvocationRow): OperationInvokeApprovedAuthority {
  return {
    kind: 'approved',
    basis: {
      kind: 'approve_each',
      authorityRef: `owner-approval:${canonicalDigest({
        invocationRef: row.invocationRef,
        ownerId: row.ownerId,
      }).slice(7)}`,
    },
    expiresAt: new Date(grant.expiresAt).toISOString(),
  }
}

async function approvePendingInvocation(
  ctx: MutationCtx,
  row: PendingApprovalRow,
  runtime: ApprovalRuntime,
  now: number,
): Promise<ApprovalDecisionResult> {
  const grant = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', row.grantRef))
    .unique()
  if (!currentApprovalGrant(grant, row, now)) return { kind: 'refused', code: 'grant_not_current' }
  const authority = buildOperationInvokeAuthority({
    authority: approvedAuthority(grant, row),
    grant: operationGrantFromRow(grant),
    operation: runtime.operation,
    descriptor: runtime.descriptor,
    operationRef: row.operationRef,
    invocationRef: row.invocationRef,
    inputDigest: row.inputDigest,
    now,
  })
  if (authority === undefined) return { kind: 'refused', code: 'invocation_invalid' }
  const dispatched = await enqueueInvocationDispatch(ctx, row, authority, now)
  if (dispatched.kind === 'replayed') return { kind: 'replayed', invocationRef: row.invocationRef }
  return dispatched.kind === 'refused'
    ? { kind: 'refused', code: 'invocation_invalid' }
    : { kind: 'approved', invocationRef: row.invocationRef }
}

export async function decideOperationApprovalHandler(
  ctx: MutationCtx,
  args: { invocationRef: string; decision: 'approve' | 'deny' },
): Promise<ApprovalDecisionResult> {
  const ownerRef = await authenticatedOwnerRef(ctx)
  if (ownerRef === null) return { kind: 'refused', code: 'authentication_required' }
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
    .unique()
  if (row === null || row.ownerId !== ownerRef) return { kind: 'refused', code: 'invocation_not_found' }
  const replay = replayedApprovalDecision(row, args.decision)
  if (replay !== null) return replay
  if (!pendingApprovalRow(row)) return { kind: 'refused', code: 'authority_not_pending' }
  if (!pendingApprovalIsClean(row)) return { kind: 'refused', code: 'invocation_invalid' }
  if (args.decision === 'deny') return await denyPendingApproval(ctx, row)
  const material = loadApprovalMaterial(row)
  if (material === null) return { kind: 'refused', code: 'invocation_invalid' }
  const now = Date.now()
  const runtime = await loadApprovalRuntime(ctx, row, material, now)
  if (runtime === null) return { kind: 'refused', code: 'invocation_invalid' }
  return await approvePendingInvocation(ctx, row, runtime, now)
}
