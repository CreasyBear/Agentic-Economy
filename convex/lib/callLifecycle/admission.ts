import type { Infer } from 'convex/values'
import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import {
  requireSourceWrite,
  sourceWriteAdmissionArg,
  sourceWriteRequestArg,
} from '../../sourceWriteAdmission'
import { readCurrentPublishedTool } from '../../capabilitySupplyTools'
import { enqueueCallDispatch } from './dispatch'
import { assertAgentAccessRateAdmission } from '../rateLimit'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import { createPublicToolRef, isPublicToolRef } from '@/modules/capability-supply/public'
import {
  materializeRuntimePublishedTool,
  parsePublishedToolSnapshot,
  publishedToolMaterialMatches,
  type PublishedTool,
  type RuntimePublishedToolDescriptor,
} from '@/modules/capability-supply/public'
import {
  buildCallAuthority,
  type CallApprovedAuthority,
  type CallGrant,
  type CallIdempotencyReservation,
} from '@/modules/capability-execution/call-authority'
import { currentToolQuotesMatch } from '@/modules/capability-execution/current-tool-quote'
import { recordMarketEvidenceFact } from '../../marketEvidence'
import type { SellerOnboardingCanaryExecutionEnvelope } from '@/modules/capability-supply/public'
import {
  normalizeStoredAgentAccessGrant,
  normalizeStoredAgentAccessGrantForTool,
  type NormalizedStoredAgentAccessGrant,
} from '@/modules/agent-access/policy'
import { toolProviderRouteabilityIsFrozen } from '../providerOffboardingFreeze'

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

function publicOperationRef(operation: PublishedTool): string {
  return createPublicToolRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref,
  })
}

export type CallPrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  scopes: string[]
  authorityMode: 'read_only' | 'approval_required' | 'spending_policy' | 'unrestricted_test_only'
}>

export type AdmitArgs = {
  operationKey: string
  correlationId: string
  sourceWrite?: Infer<typeof sourceWriteAdmissionArg>
  sourceWriteRequest?: Infer<typeof sourceWriteRequestArg>
  principal: CallPrincipal
  toolRef: string
  input: Record<string, JsonValue>
  idempotencyKey: string
}

export type ReserveArgs = Readonly<{
  quoteRef: string
  callRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  grantRef: string
  environment: 'sandbox' | 'production'
  toolRef: string
  idempotencyKey: string
  inputDigest: string
  requestDigest: string
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  toolJson?: string
  inputJson?: string
  sellerOnboardingCanary?: SellerOnboardingCanaryExecutionEnvelope
  now: number
}>

export type ReserveResult =
  | { kind: 'reserved'; reservation: CallIdempotencyReservation }
  | { kind: 'replayed'; reservation: CallIdempotencyReservation }
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
        | 'budget_exceeded'
        | 'insufficient_balance'
        | 'treasury_capacity_unavailable'
        | 'commercial_policy_unavailable'
        | 'operation_not_ready'
      retryable: boolean
      nextAction?: string
    }

export type AbandonArgs = Omit<ReserveArgs, 'toolJson' | 'inputJson' | 'now'>

export type AbandonResult =
  | { kind: 'abandoned' }
  | { kind: 'not_found' }
  | { kind: 'dispatch_started' }

type CallRow = Doc<'capabilityCalls'>
type GrantRow = Doc<'agentAccessGrants'>

export type PendingApprovalView = Readonly<{
  callRef: string
  toolRef: string
  authorityRequest: {
    kind: 'approval_required' | 'spending_policy'
    toolRef: string
    consequence: 'read_only' | 'communication' | 'external_effect'
    retryClass: 'replayable' | 'attributable_retry' | 'reconcile_before_retry'
    maximumSpend?: { currency: string; units: string; exponent: number }
    dataFields: string[]
    expiresAt?: string
  }
  createdAt: number
}>

export type ApprovalDecisionResult =
  | { kind: 'approved' | 'denied' | 'replayed'; callRef: string }
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

function reservationFromArgs(args: ReserveArgs): CallIdempotencyReservation {
  return {
    quoteRef: args.quoteRef,
    principalId: args.principalId,
    credentialId: args.credentialId,
    applicationRef: args.applicationRef,
    grantRef: args.grantRef,
    grantGeneration: args.grantGeneration,
    policyDigest: args.policyDigest,
    grantExpiresAt: args.grantExpiresAt,
    environment: args.environment,
    toolRef: args.toolRef,
    idempotencyKey: args.idempotencyKey,
    inputDigest: args.inputDigest,
    requestDigest: args.requestDigest,
    callRef: args.callRef,
  }
}

function reservationFromRow(row: CallRow): CallIdempotencyReservation | undefined {
  if (row.quoteRef === undefined
    || row.grantRef === undefined
    || row.policyDigest === undefined
    || row.grantExpiresAt === undefined) return undefined
  return {
    quoteRef: row.quoteRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    applicationRef: row.applicationRef,
    grantRef: row.grantRef,
    grantGeneration: row.grantGeneration,
    policyDigest: row.policyDigest,
    grantExpiresAt: row.grantExpiresAt,
    environment: row.environment,
    toolRef: row.toolRef,
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    requestDigest: row.requestDigest,
    callRef: row.callRef,
  }
}

function operationSnapshotMatches(existing: CallRow, args: ReserveArgs): boolean {
  if (existing.toolJson === undefined || args.toolJson === undefined) return true
  return publishedToolMaterialMatches(
    parsePublishedToolSnapshot(existing.toolJson),
    parsePublishedToolSnapshot(args.toolJson),
  )
}

// A reservation is identified by the stable Principal tuple plus the request
// material the idempotency key stands for. The credential, the grant it was
// issued under, and the derived callRef are effect evidence retained on the
// stored row: a credential rotation must replay the original Call, so those
// fields are read back through reservationFromRow instead of compared.
function existingReservationMatches(existing: CallRow, args: ReserveArgs): boolean {
  return [
    existing.quoteRef !== undefined,
    existing.grantRef !== undefined,
    existing.policyDigest !== undefined,
    existing.grantExpiresAt !== undefined,
    existing.principalId === args.principalId,
    existing.ownerId === args.ownerId,
    existing.applicationRef === args.applicationRef,
    existing.environment === args.environment,
    existing.toolRef === args.toolRef,
    existing.idempotencyKey === args.idempotencyKey,
    existing.inputDigest === args.inputDigest,
    existing.requestDigest === args.requestDigest,
    operationSnapshotMatches(existing, args),
    existing.inputJson === args.inputJson,
    canonicalOptionalCanary(existing.sellerOnboardingCanary) === canonicalOptionalCanary(args.sellerOnboardingCanary),
  ].every(Boolean)
}

function canonicalOptionalCanary(
  value: SellerOnboardingCanaryExecutionEnvelope | undefined,
): string | undefined {
  return value === undefined ? undefined : canonicalDigest(value as never)
}

function canaryEnvelopeMatchesReservation(args: ReserveArgs): boolean {
  const canary = args.sellerOnboardingCanary
  if (canary === undefined) return true
  return [
    args.environment === 'sandbox',
    canary.executionPurpose === 'seller_onboarding_canary',
    canary.callRef === args.callRef,
    canary.toolRef === args.toolRef,
    canary.inputDigest === args.inputDigest,
    canary.idempotencyKey === args.idempotencyKey,
    canary.readinessValidUntil > args.now,
    canary.expiresAt > args.now,
    canary.expiresAt <= canary.readinessValidUntil,
    canary.funding.kind === 'ae_owned',
    canary.funding.principalId === args.principalId,
    canary.funding.ownerId === args.ownerId,
    canary.funding.credentialId === args.credentialId,
    canary.funding.applicationRef === args.applicationRef,
    canary.funding.grantRef === args.grantRef,
    canary.funding.grantGeneration === args.grantGeneration,
    canary.funding.policyDigest === args.policyDigest,
    canary.funding.ledgerEffects === 'external_spend_only',
    canary.accountingPolicy.recordBuyerUsage === false,
    canary.accountingPolicy.accrueProviderEarnings === false,
    canary.accountingPolicy.accruePlatformRake === false,
    canary.accountingPolicy.recordQualifiedUse === false,
  ].every(Boolean)
}

async function replayExistingReservation(
  ctx: MutationCtx,
  existing: CallRow,
  args: ReserveArgs,
): Promise<ReserveResult> {
  if (!existingReservationMatches(existing, args)) return { kind: 'conflict' }
  const reservation = reservationFromRow(existing)
  if (reservation === undefined) return { kind: 'conflict' }
  if (existing.toolJson === undefined && args.toolJson !== undefined) {
    await ctx.db.patch(existing._id, { toolJson: args.toolJson, updatedAt: args.now })
  }
  return { kind: 'replayed', reservation }
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

function grantIdentityMatches(grant: NormalizedStoredAgentAccessGrant, args: ReserveArgs): boolean {
  return [
    grant.principalId === args.principalId,
    grant.ownerId === args.ownerId,
    grant.credentialId === args.credentialId,
    grant.applicationRef === args.applicationRef,
  ].every(Boolean)
}

function grantAdmissionRefusal(grant: GrantRow | null, args: ReserveArgs): GrantRefusal | null {
  if (grant === null) return missingGrant()
  let normalized: NormalizedStoredAgentAccessGrant
  try {
    normalized = normalizeStoredAgentAccessGrant(grant)
  } catch {
    return missingGrant()
  }
  if (normalized.environment !== args.environment) {
    return { kind: 'refused', code: 'environment_mismatch', retryable: false, nextAction: 'Use a grant for the requested environment.' }
  }
  if (!grantIdentityMatches(normalized, args)) return missingGrant()
  if (normalized.lifecycle === 'revoked') {
    return { kind: 'refused', code: 'grant_revoked', retryable: false, nextAction: 'Issue a new agent grant before retrying.' }
  }
  if (normalized.lifecycle === 'expired' || normalized.expiresAt <= args.now) {
    return { kind: 'refused', code: 'grant_expired', retryable: false, nextAction: 'Issue a new agent grant before retrying.' }
  }
  const generationMatches = [
    normalized.generation === args.grantGeneration,
    normalized.spendingPolicyDigest === args.policyDigest,
    normalized.expiresAt === args.grantExpiresAt,
  ].every(Boolean)
  return generationMatches
    ? null
    : { kind: 'refused', code: 'grant_generation_stale', retryable: false, nextAction: 'Refresh the agent grant and retry.' }
}

async function loadReservationGrant(
  ctx: MutationCtx,
  args: ReserveArgs,
): Promise<GrantRefusal | { kind: 'granted'; grant: NormalizedStoredAgentAccessGrant }> {
  const storedGrant = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef))
    .unique()
  const refusal = grantAdmissionRefusal(storedGrant, args)
  if (refusal !== null) return refusal
  if (storedGrant === null) return missingGrant()
  const grant = normalizeStoredAgentAccessGrantForTool(storedGrant, args.toolRef)
  return grant === undefined ? missingGrant() : { kind: 'granted', grant }
}

async function concurrencyAdmissionRefusal(
  ctx: MutationCtx,
  args: ReserveArgs,
  concurrentLimit: number,
): Promise<GrantRefusal | null> {
  const pendingRows = await ctx.db.query('capabilityCalls')
    .withIndex('by_credentialId_and_state_and_grantExpiresAt', (query) => (
      query.eq('credentialId', args.credentialId)
        .eq('state', 'pending')
        .gt('grantExpiresAt', args.now)
    ))
    .take(concurrentLimit)
  if (pendingRows.length >= concurrentLimit) {
    return { kind: 'refused', code: 'concurrency_limited', retryable: true, nextAction: 'Retry after an active invocation completes.' }
  }
  const reconciliationRows = await ctx.db.query('capabilityCalls')
    .withIndex('by_credentialId_and_state', (query) => query.eq('credentialId', args.credentialId).eq('state', 'reconciliation_required'))
    .take(concurrentLimit - pendingRows.length)
  return pendingRows.length + reconciliationRows.length >= concurrentLimit
    ? { kind: 'refused', code: 'concurrency_limited', retryable: true, nextAction: 'Resolve an active invocation before retrying.' }
    : null
}

type CommitmentRow = Doc<'capabilityQuotes'>

async function loadReservationCommitment(
  ctx: MutationCtx,
  args: ReserveArgs,
): Promise<CommitmentRow | null> {
  if (args.sellerOnboardingCanary !== undefined) return null
  return await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (query) => query.eq('quoteRef', args.quoteRef))
    .unique()
}

function commitmentMatchesReservation(commitment: CommitmentRow | null, args: ReserveArgs): boolean {
  if (args.sellerOnboardingCanary !== undefined) return commitment === null
  if (commitment === null) return false
  return [
    commitment.state === 'issued',
    commitment.expiresAt > args.now,
    commitment.principalId === args.principalId,
    commitment.accountRef === args.ownerId,
    commitment.credentialId === args.credentialId,
    commitment.applicationRef === args.applicationRef,
    commitment.environment === args.environment,
    commitment.grantRef === args.grantRef,
    commitment.grantGeneration === args.grantGeneration,
    commitment.grantPolicyDigest === args.policyDigest,
    commitment.toolRef === args.toolRef,
    commitment.inputDigest === args.inputDigest,
    args.toolJson === undefined || commitment.toolJson === args.toolJson,
    args.inputJson === undefined || commitment.normalizedInputJson === args.inputJson,
  ].every(Boolean)
}

async function rateAndConcurrencyRefusal(
  ctx: MutationCtx,
  args: ReserveArgs,
  grant: NormalizedStoredAgentAccessGrant,
): Promise<GrantRefusal | null> {
  const rate = await assertAgentAccessRateAdmission(ctx, {
    applicationRef: args.applicationRef,
    credentialId: args.credentialId,
    maximumCallsPerMinute: grant.spendingPolicy.rate.maximumCallsPerMinute,
    maximumCallsPerHour: grant.spendingPolicy.rate.maximumCallsPerHour,
  })
  if (!rate.ok) {
    return {
      kind: 'refused',
      code: 'rate_limited',
      retryable: true,
      nextAction: 'Retry after the current rate window advances.',
    }
  }
  return await concurrencyAdmissionRefusal(
    ctx,
    args,
    'maximumConcurrentCalls' in grant.spendingPolicy.budget
      ? grant.spendingPolicy.budget.maximumConcurrentCalls
      : grant.spendingPolicy.budget.maximumConcurrentInvocations,
  )
}

async function persistReservedCall(
  ctx: MutationCtx,
  args: ReserveArgs,
  reservation: CallIdempotencyReservation,
  commitment: CommitmentRow | null,
): Promise<void> {
  await ctx.db.insert('capabilityCalls', {
    ...reservation,
    ...(args.toolJson === undefined ? {} : { toolJson: args.toolJson }),
    ...(args.inputJson === undefined ? {} : { inputJson: args.inputJson }),
    ...(args.sellerOnboardingCanary === undefined
      ? {}
      : { sellerOnboardingCanary: structuredClone(args.sellerOnboardingCanary) }),
    ownerId: args.ownerId,
    state: 'pending',
    createdAt: args.now,
    updatedAt: args.now,
  })
  if (commitment !== null) {
    await ctx.db.patch(commitment._id, {
      state: 'consumed',
      consumedCallRef: reservation.callRef,
      updatedAt: args.now,
    })
  }
}

export async function reserveHandler(
  ctx: MutationCtx,
  args: ReserveArgs,
): Promise<ReserveResult> {
  if (!canaryEnvelopeMatchesReservation(args)) return { kind: 'conflict' }
  // Keyed by the stable Principal: a rotated credential replays the original
  // reservation instead of minting a second Call under the same key.
  const existing = await ctx.db.query('capabilityCalls')
    .withIndex('by_principalId_and_idempotencyKey', (query) => query.eq('principalId', args.principalId).eq('idempotencyKey', args.idempotencyKey))
    .take(2)
  if (existing.length > 1) return { kind: 'conflict' }
  const reservation = reservationFromArgs(args)
  const replay = existing[0]
  if (replay !== undefined) return await replayExistingReservation(ctx, replay, args)
  if (await toolProviderRouteabilityIsFrozen(ctx, args.toolRef)) {
    return {
      kind: 'refused',
      code: 'operation_not_ready',
      retryable: false,
      nextAction: 'The Provider is offboarding; select another Tool.',
    }
  }

  const commitment = await loadReservationCommitment(ctx, args)
  if (!commitmentMatchesReservation(commitment, args)) return { kind: 'conflict' }

  const grantDecision = await loadReservationGrant(ctx, args)
  if (grantDecision.kind === 'refused') return grantDecision
  const normalizedGrant = grantDecision.grant

  const admissionRefusal = await rateAndConcurrencyRefusal(ctx, args, normalizedGrant)
  if (admissionRefusal !== null) return admissionRefusal
  await persistReservedCall(ctx, args, reservation, commitment)
  await recordMarketEvidenceFact(ctx, 'ae_invocation', reservation.callRef, args.now, {
    toolRef: reservation.toolRef,
  })

  return { kind: 'reserved', reservation }
}

export async function abandonHandler(
  ctx: MutationCtx,
  args: AbandonArgs,
): Promise<AbandonResult> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
    .unique()
  if (row === null || !abandonmentIdentityMatches(row, args)) return { kind: 'not_found' as const }
  if (dispatchHasStarted(row)) return { kind: 'dispatch_started' as const }
  const commitment = await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (query) => query.eq('quoteRef', args.quoteRef))
    .unique()
  await ctx.db.delete(row._id)
  if (commitment !== null
    && commitment.state === 'consumed'
    && commitment.consumedCallRef === row.callRef
    && commitment.expiresAt > Date.now()) {
    await ctx.db.patch(commitment._id, {
      state: 'issued',
      consumedCallRef: undefined,
      updatedAt: Date.now(),
    })
  }
  return { kind: 'abandoned' as const }
}

function abandonmentIdentityMatches(row: CallRow, args: AbandonArgs): boolean {
  return [
    row.quoteRef === args.quoteRef,
    row.principalId === args.principalId,
    row.ownerId === args.ownerId,
    row.credentialId === args.credentialId,
    row.applicationRef === args.applicationRef,
    row.grantRef === args.grantRef,
    row.grantGeneration === args.grantGeneration,
    row.policyDigest === args.policyDigest,
    row.grantExpiresAt === args.grantExpiresAt,
    row.environment === args.environment,
    row.toolRef === args.toolRef,
    row.idempotencyKey === args.idempotencyKey,
    row.inputDigest === args.inputDigest,
    row.requestDigest === args.requestDigest,
    row.callRef === args.callRef,
    canonicalOptionalCanary(row.sellerOnboardingCanary) === canonicalOptionalCanary(args.sellerOnboardingCanary),
  ].every(Boolean)
}

function dispatchHasStarted(row: CallRow): boolean {
  return [
    row.state !== 'pending',
    row.result !== undefined,
    row.workId !== undefined,
    row.authority !== undefined,
    row.dispatchState !== undefined,
  ].some(Boolean)
}

export async function listPendingCallApprovalsHandler(
  ctx: QueryCtx,
): Promise<PendingApprovalView[]> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null || identity.tokenIdentifier.trim().length === 0) return []
  const now = Date.now()
  const rows = await ctx.db.query('capabilityCalls')
    .withIndex('by_ownerId_and_state_and_createdAt', (query) => (
      query.eq('ownerId', identity.tokenIdentifier).eq('state', 'pending')
    ))
    .order('desc')
    .take(50)
  return rows.flatMap((row) => {
    if (row.grantExpiresAt <= now) return []
    if (row.result?.kind !== 'needs_authority') return []
    if (row.result.callRef !== row.callRef || row.result.toolRef !== row.toolRef) return []
    return [{
      callRef: row.callRef,
      toolRef: row.toolRef,
      authorityRequest: structuredClone(row.result.authorityRequest),
      createdAt: row.createdAt,
    }]
  })
}

type NeedsAuthorityResult = Extract<NonNullable<CallRow['result']>, { kind: 'needs_authority' }>
type PendingApprovalRow = CallRow & { result: NeedsAuthorityResult }

type ApprovalMaterial = Readonly<{
  input: Record<string, unknown>
  operation: PublishedTool
}>

type ApprovalRuntime = Readonly<{
  operation: PublishedTool
  descriptor: RuntimePublishedToolDescriptor
}>

async function authenticatedOwnerRef(ctx: MutationCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return null
  const ownerRef = identity.tokenIdentifier.trim()
  return ownerRef.length === 0 ? null : identity.tokenIdentifier
}

function replayedApprovalDecision(
  row: CallRow,
  decision: 'approve' | 'deny',
): ApprovalDecisionResult | null {
  const result = row.result
  if (decision === 'deny') {
    const replayed = [
      row.state === 'refused',
      result?.kind === 'refused',
      result?.kind === 'refused' && result.code === 'authority_denied',
    ].every(Boolean)
    return replayed ? { kind: 'replayed', callRef: row.callRef } : null
  }
  const replayed = [
    row.state === 'pending',
    result?.kind === 'pending',
    row.workId !== undefined,
    row.authority !== undefined,
  ].every(Boolean)
  return replayed ? { kind: 'replayed', callRef: row.callRef } : null
}

function pendingApprovalRow(row: CallRow): row is PendingApprovalRow {
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
      toolRef: row.toolRef,
      code: 'authority_denied',
      retryable: false,
      nextAction: 'The owner declined this operation.',
    },
    updatedAt: Date.now(),
  })
  return { kind: 'denied', callRef: row.callRef }
}

function loadApprovalMaterial(row: PendingApprovalRow): ApprovalMaterial | null {
  if (!isPublicToolRef(row.toolRef)) return null
  if (row.inputJson === undefined || row.toolJson === undefined) return null
  const input = parseJsonObject(row.inputJson)
  const operation = parsePublishedToolSnapshot(row.toolJson)
  if (input === undefined || operation === undefined) return null
  if (publicOperationRef(operation) !== row.toolRef) return null
  try {
    const digestsMatch = [
      canonicalDigest(input) === row.inputDigest,
      canonicalDigest({ toolRef: row.toolRef, input }) === row.requestDigest,
    ].every(Boolean)
    return digestsMatch ? { input, operation } : null
  } catch {
    return null
  }
}

function approvalRequestMatches(
  row: PendingApprovalRow,
  descriptor: RuntimePublishedToolDescriptor,
): boolean {
  if (descriptor.price.kind !== 'fixed') return false
  const expected = {
    kind: 'approval_required' as const,
    toolRef: row.toolRef,
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
  let operation: PublishedTool | undefined
  try {
    operation = await readCurrentPublishedTool(ctx, row.toolRef, now)
  } catch {
    return null
  }
  if (operation === undefined) return null
  const commitmentsMatch = [
    publicOperationRef(operation) === row.toolRef,
    currentToolQuotesMatch({
      toolRef: row.toolRef,
      pinned: material.operation,
      current: operation,
    }),
  ].every(Boolean)
  if (!commitmentsMatch) return null
  try {
    const descriptor = materializeRuntimePublishedTool(operation)
    return approvalRequestMatches(row, descriptor) ? { operation, descriptor } : null
  } catch {
    return null
  }
}

function currentApprovalGrant(
  grant: GrantRow | null,
  row: CallRow,
  now: number,
): NormalizedStoredAgentAccessGrant | null {
  if (grant === null) return null
  let normalized: NormalizedStoredAgentAccessGrant
  try {
    normalized = normalizeStoredAgentAccessGrant(grant)
  } catch {
    return null
  }
  const current = [
    normalized.lifecycle === 'active',
    normalized.authorityMode === 'approval_required',
    normalized.expiresAt > now,
    normalized.principalId === row.principalId,
    normalized.ownerId === row.ownerId,
    normalized.credentialId === row.credentialId,
    normalized.applicationRef === row.applicationRef,
    normalized.environment === row.environment,
    normalized.generation === row.grantGeneration,
    normalized.spendingPolicyDigest === row.policyDigest,
    normalized.expiresAt === row.grantExpiresAt,
  ].every(Boolean)
  return current ? normalized : null
}

function operationGrantFromRow(grant: NormalizedStoredAgentAccessGrant): CallGrant {
  return {
    grantRef: grant.grantRef,
    principalId: grant.principalId,
    ownerId: grant.ownerId,
    applicationRef: grant.applicationRef,
    credentialId: grant.credentialId,
    environment: grant.environment,
    generation: grant.generation,
    policyDigest: grant.spendingPolicyDigest,
    expiresAt: grant.expiresAt,
    lifecycle: 'active',
    toolAccess: grant.toolAccess,
    toolRefs: grant.toolRefs,
  }
}

function approvedAuthority(grant: Readonly<{ expiresAt: number }>, row: CallRow): CallApprovedAuthority {
  return {
    kind: 'approved',
    basis: {
      kind: 'approval_required',
      authorityRef: `owner-approval:${canonicalDigest({
        callRef: row.callRef,
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
  const currentGrant = currentApprovalGrant(grant, row, now)
  if (currentGrant === null) return { kind: 'refused', code: 'grant_not_current' }
  const authority = buildCallAuthority({
    authority: approvedAuthority(currentGrant, row),
    grant: operationGrantFromRow(currentGrant),
    operation: runtime.operation,
    descriptor: runtime.descriptor,
    toolRef: row.toolRef,
    callRef: row.callRef,
    inputDigest: row.inputDigest,
    now,
  })
  if (authority === undefined) return { kind: 'refused', code: 'invocation_invalid' }
  const dispatched = await enqueueCallDispatch(ctx, row, authority, now)
  if (dispatched.kind === 'replayed') return { kind: 'replayed', callRef: row.callRef }
  return dispatched.kind === 'refused'
    ? { kind: 'refused', code: 'invocation_invalid' }
    : { kind: 'approved', callRef: row.callRef }
}

export async function decideCallApprovalHandler(
  ctx: MutationCtx,
  args: { callRef: string; decision: 'approve' | 'deny' },
): Promise<ApprovalDecisionResult> {
  const ownerRef = await authenticatedOwnerRef(ctx)
  if (ownerRef === null) return { kind: 'refused', code: 'authentication_required' }
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
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
