import { vOnCompleteArgs } from '@convex-dev/workpool'
import { v, type Infer } from 'convex/values'
import { internalMutation, internalQuery, mutation, query, action, type ActionCtx, type MutationCtx } from './_generated/server'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { readCurrentPublishedOperation } from './capabilitySupplyOperations'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { actionInvocationTransactArgs } from './actionInvocationControl'
import {
  buildOperationInvokeAuthority,
  createOperationInvokeApplication,
  type OperationInvokeApprovedAuthority,
  type OperationInvokeGrant,
  type OperationInvokeRuntime,
} from '@/modules/capability-execution/operation-invoke'
import type { OperationInvokeResult } from '@/modules/capability-execution/operation-invoke-contracts'
import {
  materializeRuntimePublishedOperation,
  parsePublishedOperationSnapshot,
  publishedOperationMaterialMatches,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import type { OperationInvokeIdempotencyReservation } from '@/modules/capability-execution/operation-invoke'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isPublicOperationRef } from '@/modules/capability-supply/public'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import { assertAgentAccessRateAdmission } from './lib/rateLimit'
import { marketDispatchWorkpool } from './marketDispatchWorkpool'
import {
  jsonObject,
  operationResultValue,
  reconciliationEvidenceValue,
  recoveryResultValue,
  operationInvokeAuthorityValue,
  statusResultValue,
  usageValue,
} from '@/modules/capability-execution/convex'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
function assertJsonObject(value: unknown): void {
  if (!isRecord(value) || !isBoundedJsonValue(value)) throw new Error('operation_invocation_json_invalid')
}

function assertOperationResultJson(value: Infer<typeof operationResultValue>): void {
  if (value.kind === 'completed' && !isBoundedJsonValue(value.output)) {
    throw new Error('operation_invocation_result_json_invalid')
  }
}
function projectOperationResult(result: OperationInvokeResult): Infer<typeof operationResultValue> {
  if (result.kind !== 'needs_authority') return result
  return {
    ...result,
    authorityRequest: {
      ...result.authorityRequest,
      dataFields: [...result.authorityRequest.dataFields],
    },
  }
}




const environment = v.union(v.literal('sandbox'), v.literal('production'))
const authorityMode = v.union(
  v.literal('inspect_only'),
  v.literal('approve_each'),
  v.literal('bounded_mandate'),
  v.literal('full_yolo'),
)
const principalValue = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  scopes: v.array(v.string()),
  authorityMode,
})
const providerLeaseAuthorityValue = v.object({
  connectionRef: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  approvalDecisionRef: v.string(),
  approvalDecisionDigest: v.string(),
})
const dispatchState = v.union(
  v.literal('enqueued'),
  v.literal('running'),
  v.literal('completed'),
  v.literal('failed'),
  v.literal('reconciliation_required'),
)
const dispatchResult = v.union(
  v.object({ kind: v.literal('enqueued'), workId: v.string() }),
  v.object({ kind: v.literal('replayed'), workId: v.string() }),
  v.object({ kind: v.literal('refused') }),
)
const operationDispatchMutationResult = v.union(
  v.object({
    kind: v.union(v.literal('applied'), v.literal('duplicate')),
    attemptRef: v.string(),
    effectGeneration: v.number(),
  }),
  v.object({ kind: v.literal('claimed') }),
  v.object({ kind: v.literal('cancelled'), workId: v.optional(v.string()) }),
  v.object({ kind: v.literal('reconciliation_required'), attemptRef: v.string(), effectGeneration: v.number() }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
)
const approvalDecision = v.union(v.literal('approve'), v.literal('deny'))
const pendingApprovalView = v.object({
  invocationRef: v.string(),
  operationRef: v.string(),
  authorityRequest: v.object({
    kind: v.union(v.literal('approve_each'), v.literal('bounded_mandate')),
    operationRef: v.string(),
    consequence: v.union(v.literal('read_only'), v.literal('communication'), v.literal('external_effect')),
    retryClass: v.union(v.literal('replayable'), v.literal('attributable_retry'), v.literal('reconcile_before_retry')),
    maximumSpend: v.optional(v.object({ currency: v.string(), units: v.string(), exponent: v.number() })),
    dataFields: v.array(v.string()),
    expiresAt: v.optional(v.string()),
  }),
  createdAt: v.number(),
})
const approvalDecisionResult = v.union(
  v.object({ kind: v.union(v.literal('approved'), v.literal('denied'), v.literal('replayed')), invocationRef: v.string() }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('authentication_required'),
      v.literal('invocation_not_found'),
      v.literal('authority_not_pending'),
      v.literal('grant_not_current'),
      v.literal('invocation_invalid'),
    ),
  }),
)
const dispatchArgs = {
  invocationRef: v.string(),
  principalId: v.string(),
  credentialId: v.string(),
  operationRef: v.string(),
  authority: v.optional(operationInvokeAuthorityValue),
  now: v.number(),
} as const
const openDispatchValue = v.object({
  invocationRef: v.string(),
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  state: v.union(v.literal('pending'), v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required'), v.literal('cancelled')),
  operationRef: v.string(),
  idempotencyKey: v.string(),
  inputDigest: v.string(),
  requestDigest: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  policyDigest: v.string(),
  grantExpiresAt: v.number(),
  operationJson: v.string(),
  inputJson: v.string(),
  authority: v.optional(operationInvokeAuthorityValue),
  workId: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
  dispatchState: v.optional(dispatchState),
})
const operationDispatchProjectionValue = v.object({
  state: v.union(v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required')),
  result: v.optional(operationResultValue),
  usage: v.optional(usageValue),
  evidenceHash: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
  dispatchState: v.union(v.literal('completed'), v.literal('failed'), v.literal('reconciliation_required')),
})
const operationDispatchMutationArgs = {
  dispatch: openDispatchValue,
  command: v.object(actionInvocationTransactArgs),
} as const
const cancelBeforeClaimArgs = {
  invocationRef: v.string(),
  principalId: v.string(),
  credentialId: v.string(),
  idempotencyKey: v.string(),
} as const
const finalizeDispatchArgs = {
  dispatch: openDispatchValue,
  command: v.object(actionInvocationTransactArgs),
  projection: operationDispatchProjectionValue,
} as const
export type OperationDispatchCommand = Infer<typeof operationDispatchMutationArgs.command>
export type OperationDispatchProjection = Infer<typeof operationDispatchProjectionValue>
const recordArgs = {
  invocationRef: v.string(), principalId: v.string(), state: v.union(v.literal('pending'), v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required'), v.literal('cancelled')),
  result: v.optional(operationResultValue), usage: v.optional(usageValue), evidenceHash: v.optional(v.string()), attemptRef: v.optional(v.string()),
  dispatchState: v.optional(dispatchState), now: v.number(),
} as const
const replayValue = v.object({
  operationRef: v.string(),
  state: v.union(
    v.literal('pending'),
    v.literal('completed'),
    v.literal('refused'),
    v.literal('reconciliation_required'),
    v.literal('cancelled'),
  ),
  result: v.optional(operationResultValue),
  usage: v.optional(usageValue),
  evidenceHash: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
})
const recoveryValue = v.object({
  invocationRef: v.string(),
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  state: v.union(
    v.literal('pending'),
    v.literal('completed'),
    v.literal('refused'),
    v.literal('reconciliation_required'),
    v.literal('cancelled'),
  ),
  operationRef: v.string(),
  inputDigest: v.string(),
  requestDigest: v.string(),
  grantGeneration: v.number(),
  grantRef: v.string(),
  operationJson: v.string(),
  inputJson: v.string(),
  result: v.optional(operationResultValue),
  usage: v.optional(usageValue),
  evidenceHash: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
})
const projectRecoveryArgs = {
  invocationRef: v.string(),
  principalId: v.string(),
  credentialId: v.string(),
  state: v.union(
    v.literal('pending'),
    v.literal('completed'),
    v.literal('refused'),
    v.literal('reconciliation_required'),
    v.literal('cancelled'),
  ),
  result: v.optional(operationResultValue),
  attemptRef: v.optional(v.string()),
  dispatchState: v.optional(dispatchState),
  clearResult: v.boolean(),
  clearWorkId: v.boolean(),
  clearAttemptRef: v.boolean(),
  clearEvidenceHash: v.boolean(),
  clearDispatchState: v.boolean(),
  now: v.number(),
} as const
const principalAndSourceArgs = {
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
  principal: principalValue,
} as const
const invokeArgs = {
  ...principalAndSourceArgs,
  operationRef: v.string(),
  input: jsonObject,
  idempotencyKey: v.string(),
} as const
const reserveArgs = {
  invocationRef: v.string(), principalId: v.string(), ownerId: v.string(), credentialId: v.string(),
  applicationRef: v.string(), grantRef: v.string(), environment, operationRef: v.string(), idempotencyKey: v.string(),
  inputDigest: v.string(), requestDigest: v.string(), grantGeneration: v.number(), policyDigest: v.string(), grantExpiresAt: v.number(),
  operationJson: v.optional(v.string()), inputJson: v.optional(v.string()), now: v.number(),
} as const
const reservationValue = v.object({
  principalId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  policyDigest: v.string(),
  grantExpiresAt: v.number(),
  environment,
  operationRef: v.string(),
  idempotencyKey: v.string(),
  inputDigest: v.string(),
  requestDigest: v.string(),
  invocationRef: v.string(),
})
const reserveRefusalCode = v.union(
  v.literal('grant_not_found'),
  v.literal('grant_revoked'),
  v.literal('grant_expired'),
  v.literal('grant_generation_stale'),
  v.literal('environment_mismatch'),
  v.literal('rate_limited'),
  v.literal('concurrency_limited'),
)
const reserveResult = v.union(
  v.object({ kind: v.literal('reserved'), reservation: reservationValue }),
  v.object({ kind: v.literal('replayed'), reservation: reservationValue }),
  v.object({ kind: v.literal('conflict') }),
  v.object({ kind: v.literal('refused'), code: reserveRefusalCode, retryable: v.boolean(), nextAction: v.optional(v.string()) }),
)
const abandonArgs = {
  invocationRef: v.string(), principalId: v.string(), ownerId: v.string(), credentialId: v.string(),
  applicationRef: v.string(), grantRef: v.string(), environment, operationRef: v.string(), idempotencyKey: v.string(),
  inputDigest: v.string(), requestDigest: v.string(), grantGeneration: v.number(), policyDigest: v.string(), grantExpiresAt: v.number(),
} as const
const abandonResult = v.union(
  v.object({ kind: v.literal('abandoned') }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('dispatch_started') }),
)

export const admit = internalMutation({
  args: { ...principalAndSourceArgs, operationRef: v.string(), input: jsonObject, idempotencyKey: v.string() },
  returns: v.object({ kind: v.literal('accepted') }),
  handler: async (ctx, args) => {
    assertJsonObject(args.input)
    const admission = await requireSourceWrite(ctx, args, 'protected_action')
    if (admission.kind === 'rejected') throw new Error(`operation_invoke_source_write_rejected:${admission.reason}`)
    return { kind: 'accepted' as const }
  },
})


export const reserve = internalMutation({
  args: reserveArgs,
  returns: reserveResult,
  handler: async (ctx, args): Promise<Infer<typeof reserveResult>> => {
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

    // Bound queued envelopes before money/claim admission; budget concurrency is a separate gate.
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
  },
})
export const abandon = internalMutation({
  args: abandonArgs,
  returns: abandonResult,
  handler: async (ctx, args): Promise<Infer<typeof abandonResult>> => {
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
  },
})
const OPERATION_INVOKE_RETRY_AFTER_MS = 1_000
type OperationInvocationRow = Doc<'capabilityOperationInvocations'>
type PersistedOperationAuthority = Infer<typeof operationInvokeAuthorityValue>
type OpenDispatchValue = Infer<typeof openDispatchValue>
type OperationDispatchProjectionShape = Readonly<{
  state: 'completed' | 'refused' | 'reconciliation_required'
  result?: Infer<typeof operationResultValue>
  usage?: Infer<typeof usageValue>
  evidenceHash?: string
  attemptRef?: string
  dispatchState: 'completed' | 'failed' | 'reconciliation_required'
}>

function persistedDispatchMatches(row: OperationInvocationRow, dispatch: OpenDispatchValue): boolean {
  if (
    row.invocationRef !== dispatch.invocationRef
    || row.principalId !== dispatch.principalId
    || row.ownerId !== dispatch.ownerId
    || row.credentialId !== dispatch.credentialId
    || row.applicationRef !== dispatch.applicationRef
    || row.environment !== dispatch.environment
    || row.operationRef !== dispatch.operationRef
    || row.idempotencyKey !== dispatch.idempotencyKey
    || row.inputDigest !== dispatch.inputDigest
    || row.requestDigest !== dispatch.requestDigest
    || row.grantRef !== dispatch.grantRef
    || row.grantGeneration !== dispatch.grantGeneration
    || row.policyDigest !== dispatch.policyDigest
    || row.grantExpiresAt !== dispatch.grantExpiresAt
    || row.operationJson !== dispatch.operationJson
    || row.inputJson !== dispatch.inputJson
    || row.workId !== dispatch.workId
  ) return false
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
  const control = isRecord(row.control) ? row.control : undefined
  const owner = control !== undefined && isRecord(control.owner) ? control.owner : undefined
  const action = control !== undefined && isRecord(control.action) ? control.action : undefined
  const authorityBinding = isRecord(row.authorityBinding) ? row.authorityBinding : undefined
  const idempotency = isRecord(attempt.idempotency) ? attempt.idempotency : undefined
  const attemptActor = isRecord(attempt.actor) ? attempt.actor : undefined
  return (
    row.invocationRef === dispatch.invocationRef
    && row.sourceRef === `operation-invocation-source:${dispatch.invocationRef}`
    && row.preparedMaterialDigest === dispatch.inputDigest
    && control?.invocationRef === dispatch.invocationRef
    && owner?.callerRef === dispatch.credentialId
    && owner?.principalRef === dispatch.principalId
    && action?.id === operation.operationId
    && authorityBinding?.invocationRef === dispatch.invocationRef
    && authorityBinding?.digest === dispatch.authority?.decisionDigest
    && authorityBinding?.targetDigest === dispatch.authority?.targetDigest
    && authorityBinding?.expiresAt === dispatch.authority?.expiresAt
    && attempt.invocationRef === dispatch.invocationRef
    && attemptActor?.callerRef === dispatch.credentialId
    && attemptActor?.principalRef === dispatch.principalId
    && idempotency?.operationKey === dispatch.operationRef
    && idempotency?.materialInputDigest === dispatch.inputDigest
    && typeof attempt.attemptRef === 'string'
    && typeof attempt.effectGeneration === 'number'
  )
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

function projectRecoveryRow(row: OperationInvocationRow): Infer<typeof recoveryValue> | null {
  if (row.operationJson === undefined || row.inputJson === undefined) return null
  if (row.result !== undefined) assertOperationResultJson(row.result)
  return {
    invocationRef: row.invocationRef,
    principalId: row.principalId,
    ownerId: row.ownerId,
    credentialId: row.credentialId,
    applicationRef: row.applicationRef,
    environment: row.environment,
    state: row.state,
    operationRef: row.operationRef,
    inputDigest: row.inputDigest,
    requestDigest: row.requestDigest,
    grantGeneration: row.grantGeneration,
    grantRef: row.grantRef,
    operationJson: row.operationJson,
    inputJson: row.inputJson,
    ...(row.result === undefined ? {} : { result: row.result }),
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
  }
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) && isBoundedJsonValue(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

async function enqueueInvocationDispatch(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  authority: PersistedOperationAuthority,
  now: number,
): Promise<Infer<typeof dispatchResult>> {
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

export const dispatch = internalMutation({
  args: dispatchArgs,
  returns: dispatchResult,
  handler: async (ctx, args): Promise<Infer<typeof dispatchResult>> => {
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
  },
})
export const claimDispatch = internalMutation({
  args: operationDispatchMutationArgs,
  returns: operationDispatchMutationResult,
  handler: async (ctx, { dispatch, command }): Promise<Infer<typeof operationDispatchMutationResult>> => {
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
  },
})

function projectedOuterMatches(row: OperationInvocationRow, projection: OperationDispatchProjectionShape): boolean {
  return row.state === projection.state
    && row.dispatchState === projection.dispatchState
    && row.attemptRef === projection.attemptRef
    && canonicalDigest((row.result ?? null) as never) === canonicalDigest((projection.result ?? null) as never)
    && canonicalDigest((row.usage ?? null) as never) === canonicalDigest((projection.usage ?? null) as never)
    && (row.evidenceHash ?? null) === (projection.evidenceHash ?? null)
}

export const finalizeDispatch = internalMutation({
  args: finalizeDispatchArgs,
  returns: operationDispatchMutationResult,
  handler: async (ctx, { dispatch, command, projection }): Promise<Infer<typeof operationDispatchMutationResult>> => {
    const row = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', dispatch.invocationRef))
      .unique()
    if (
      row === null
      || !persistedDispatchMatches(row, dispatch)
      || !isRecord(projection)
      || (projection.state !== 'completed' && projection.state !== 'refused' && projection.state !== 'reconciliation_required')
      || (projection.dispatchState !== 'completed' && projection.dispatchState !== 'failed' && projection.dispatchState !== 'reconciliation_required')
      || (projection.attemptRef !== undefined && typeof projection.attemptRef !== 'string')
      || !commandMatchesDispatch(command, dispatch)
    ) return { kind: 'refused', code: 'outer_identity_refused' }
    const normalizedProjection = projection as OperationDispatchProjectionShape
    if (normalizedProjection.result !== undefined) {
      assertOperationResultJson(normalizedProjection.result)
    }
    if (row.state !== 'pending') {
      if (projectedOuterMatches(row, normalizedProjection) && await canonicalCommandReadbackMatches(ctx, command)) {
        const attempt = command.currentAttemptWrite as { attemptRef: string; effectGeneration: number }
        return { kind: 'duplicate', attemptRef: attempt.attemptRef, effectGeneration: attempt.effectGeneration }
      }
      return { kind: 'refused', code: 'outer_state_refused' }
    }
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
    return {
      kind: canonicalResult.kind,
      attemptRef: attempt.attemptRef,
      effectGeneration: attempt.effectGeneration,
    }
  },
})

export const cancelBeforeClaim = internalMutation({
  args: cancelBeforeClaimArgs,
  returns: operationDispatchMutationResult,
  handler: async (ctx, args): Promise<Infer<typeof operationDispatchMutationResult>> => {
    const row = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique()
    if (
      row === null
      || row.principalId !== args.principalId
      || row.credentialId !== args.credentialId
      || row.idempotencyKey !== args.idempotencyKey
    ) return { kind: 'refused', code: 'invocation_not_found' }
    if (row.state === 'cancelled') return { kind: 'cancelled', ...(row.workId === undefined ? {} : { workId: row.workId }) }
    const control = await ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique()
    if (control === null && row.state === 'pending') {
      const workId = row.workId
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
      return { kind: 'cancelled', ...(workId === undefined ? {} : { workId }) }
    }
    if (control === null) return { kind: 'refused', code: 'invocation_state_refused' }
    const canonical = control.control.control
    const attemptRef = control.currentAttemptRef
    const effectGeneration = control.currentEffectGeneration ?? 1
    if (canonical.state === 'cancelled') {
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
      return { kind: 'cancelled' }
    }
    if (
      canonical.state === 'reconciliation_required'
      || (canonical.state === 'leased' && canonical.release === 'possibly_released')
      || attemptRef === undefined
    ) {
      if (row.state === 'pending') {
        await ctx.db.patch(row._id, {
          state: 'reconciliation_required',
          dispatchState: 'reconciliation_required',
          result: {
            kind: 'reconciliation_required',
            invocationRef: row.invocationRef,
            operationRef: row.operationRef,
            evidence: {
              attemptRef: attemptRef ?? `operation-attempt:${row.invocationRef}:1`,
              effectGeneration,
              requiredAt: new Date(Date.now() + 1_000).toISOString(),
              retry: 'reconcile_before_retry',
              evidenceSource: `operation:${row.operationRef}`,
            },
          },
          attemptRef: attemptRef ?? `operation-attempt:${row.invocationRef}:1`,
          updatedAt: Date.now(),
        })
      }
      return {
        kind: 'reconciliation_required',
        attemptRef: attemptRef ?? `operation-attempt:${row.invocationRef}:1`,
        effectGeneration,
      }
    }
    if (row.state === 'pending') {
      await ctx.db.patch(row._id, {
        dispatchState: 'running',
        attemptRef,
        updatedAt: Date.now(),
      })
    }
    return { kind: 'claimed' }
  },
})
export const listPendingOperationApprovals = query({
  args: {},
  returns: v.array(pendingApprovalView),
  handler: async (ctx): Promise<Array<Infer<typeof pendingApprovalView>>> => {
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
  },
})

export const decideOperationApproval = mutation({
  args: { invocationRef: v.string(), decision: approvalDecision },
  returns: approvalDecisionResult,
  handler: async (ctx, args): Promise<Infer<typeof approvalDecisionResult>> => {
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
  },
})


export const openDispatch = internalQuery({
  args: { invocationRef: v.string() },
  returns: v.union(openDispatchValue, v.null()),
  handler: async (ctx, args) => {
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
  },
})

export const readReplay = internalQuery({
  args: { invocationRef: v.string(), principalId: v.string(), credentialId: v.string() },
  returns: v.union(replayValue, v.null()),
  handler: async (ctx, args): Promise<Infer<typeof replayValue> | null> => {
    const row = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique()
    if (row === null || row.principalId !== args.principalId || row.credentialId !== args.credentialId) return null
    if (row.result !== undefined) assertOperationResultJson(row.result)
    return {
      operationRef: row.operationRef,
      state: row.state,
      ...(row.result === undefined ? {} : { result: structuredClone(row.result) as Infer<typeof operationResultValue> }),
      ...(row.usage === undefined ? {} : { usage: row.usage }),
      ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
      ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    }
  },
})

export const readRecovery = internalQuery({
  args: { invocationRef: v.string(), principalId: v.string(), credentialId: v.string() },
  returns: v.union(recoveryValue, v.null()),
  handler: async (ctx, args): Promise<Infer<typeof recoveryValue> | null> => {
    const row = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique()
    if (row === null || row.principalId !== args.principalId || row.credentialId !== args.credentialId) return null
    return projectRecoveryRow(row)
  },
})

export const readOwnerRecovery = internalQuery({
  args: { invocationRef: v.string() },
  returns: v.union(recoveryValue, v.null()),
  handler: async (ctx, args): Promise<Infer<typeof recoveryValue> | null> => {
    const row = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique()
    return row === null ? null : projectRecoveryRow(row)
  },
})

export const record = internalMutation({
  args: recordArgs,
  returns: v.object({ kind: v.literal('recorded') }),
  handler: async (ctx, args) => {
    if (args.result !== undefined) assertOperationResultJson(args.result)
    const row = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique()
    if (row === null || row.principalId !== args.principalId) throw new Error('operation_invoke_identity_refused')
    if (
      row.state !== 'pending'
      && args.state !== row.state
    ) return { kind: 'recorded' as const }
    await ctx.db.patch(row._id, {
      state: args.state,
      ...(args.result === undefined ? {} : { result: args.result }),
      ...(args.usage === undefined ? {} : { usage: args.usage }),
      ...(args.evidenceHash === undefined ? {} : { evidenceHash: args.evidenceHash }),
      ...(args.attemptRef === undefined ? {} : { attemptRef: args.attemptRef }),
      ...(args.dispatchState === undefined ? {} : { dispatchState: args.dispatchState }),
      updatedAt: args.now,
    })
    return { kind: 'recorded' as const }
  },
})
export const projectRecovery = internalMutation({
  args: projectRecoveryArgs,
  returns: v.object({ kind: v.literal('recorded') }),
  handler: async (ctx, args) => {
    if (args.result !== undefined) assertOperationResultJson(args.result)
    const row = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique()
    if (row === null || row.principalId !== args.principalId || row.credentialId !== args.credentialId) {
      throw new Error('operation_invoke_identity_refused')
    }
    if (row.state === 'completed' && row.result?.kind === 'completed') return { kind: 'recorded' as const }
    const resetPending = row.state === 'reconciliation_required'
      && args.state === 'pending'
      && args.clearResult
      && args.clearWorkId
      && args.clearAttemptRef
      && args.clearEvidenceHash
      && args.clearDispatchState
    if (row.state !== 'pending' && args.state !== row.state && !resetPending) return { kind: 'recorded' as const }
    await ctx.db.patch(row._id, {
      state: args.state,
      ...(args.clearResult ? { result: undefined } : args.result === undefined ? {} : { result: args.result }),
      ...(args.clearWorkId ? { workId: undefined } : {}),
      ...(args.clearAttemptRef ? { attemptRef: undefined } : args.attemptRef === undefined ? {} : { attemptRef: args.attemptRef }),
      ...(args.clearEvidenceHash ? { evidenceHash: undefined } : {}),
      ...(args.clearDispatchState ? { dispatchState: undefined } : args.dispatchState === undefined ? {} : { dispatchState: args.dispatchState }),
      updatedAt: args.now,
    })
    return { kind: 'recorded' as const }
  },
})


export const readProviderLeaseAuthority = internalQuery({
  args: { connectionRef: v.string(), authorityGeneration: v.number() },
  returns: v.union(providerLeaseAuthorityValue, v.null()),
  handler: async (ctx, args) => {
    const [connection, approval] = await Promise.all([
      ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef))
        .unique(),
      ctx.db.query('capabilityProviderApprovals')
        .withIndex('by_connectionRef_and_authorityGeneration', (query) => (
          query.eq('connectionRef', args.connectionRef).eq('authorityGeneration', args.authorityGeneration)
        ))
        .unique(),
    ])
    if (
      connection === null
      || approval === null
      || connection.lifecycle !== 'active'
      || connection.authorityGeneration !== args.authorityGeneration
      || approval.decision !== 'granted'
    ) return null
    return {
      connectionRef: connection.connectionRef,
      providerRef: connection.providerRef,
      providerAccountRef: connection.providerAccountRef,
      adapterId: connection.adapterId,
      authorityGeneration: connection.authorityGeneration,
      authorityDigest: connection.authorityDigest,
      grantedScopes: connection.grantedScopes,
      grantedResources: connection.grantedResources,
      approvalDecisionRef: approval.decisionRef,
      approvalDecisionDigest: approval.decisionDigest,
    }
  },
})
const workCompletionArgs = vOnCompleteArgs(v.object({ invocationRef: v.string() }))

export const completeWork = internalMutation({
  args: workCompletionArgs,
  returns: v.null(),
  handler: async (ctx, { context, result }) => {
    const row = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', context.invocationRef)).unique()
    if (row === null || row.state !== 'pending') return null
    if (
      result.kind === 'success'
      && typeof result.returnValue === 'object'
      && result.returnValue !== null
      && 'kind' in result.returnValue
      && result.returnValue.kind === 'recorded'
    ) {
      await ctx.db.patch(row._id, { dispatchState: 'completed', updatedAt: Date.now() })
      return null
    }
    const control = await ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', context.invocationRef)).unique()
    const invocationControl = control?.control.control
    const release = invocationControl?.state === 'leased' ? invocationControl.release : undefined
    const possibleRelease = release === 'possibly_released'
      || invocationControl?.state === 'reconciliation_required'
      || invocationControl?.state === 'terminal'
    if (possibleRelease) {
      const attemptRef = control?.currentAttemptRef ?? `operation-attempt:${context.invocationRef}`
      const effectGeneration = control?.currentEffectGeneration ?? 1
      await ctx.db.patch(row._id, {
        state: 'reconciliation_required',
        dispatchState: 'reconciliation_required',
        result: {
          kind: 'reconciliation_required',
          invocationRef: context.invocationRef,
          operationRef: row.operationRef,
          evidence: {
            attemptRef,
            effectGeneration,
            requiredAt: new Date(Date.now() + 1_000).toISOString(),
            retry: 'reconcile_before_retry' as const,
            evidenceSource: `operation:${row.operationRef}`,
          },
        },
        attemptRef,
        updatedAt: Date.now(),
      })
      return null
    }
    const attemptRef = `operation-attempt:${context.invocationRef}:1`
    const transactionRef = `operation-money:${context.invocationRef}:${attemptRef}:1`
    const sourceDigest = parsePublishedOperationSnapshot(row.operationJson ?? '')?.materialDigest
      ?? canonicalDigest({
        format: 'operation-money-source:v1',
        invocationRef: context.invocationRef,
        operationRef: row.operationRef,
        requestDigest: row.requestDigest,
      } as never)
    const reconciliationDigest = canonicalDigest({
      format: 'operation-money-reconciliation:v1',
      invocationRef: context.invocationRef,
      attemptRef,
      operationRef: row.operationRef,
      inputDigest: row.inputDigest,
      transactionRef,
      outcome: 'not_released',
      sourceDigest,
    } as never)
    const refundTransactionRef = `operation-money-refund:${context.invocationRef}:${attemptRef}:1`
    const refundInputDigest = canonicalDigest({
      format: 'operation-money-refund:v1',
      invocationRef: context.invocationRef,
      attemptRef,
      inputDigest: row.inputDigest,
      transactionRef,
      outcome: 'not_released',
    } as never)
    let settlement: { kind: 'none' | 'settled' | 'reconciliation_required' }
    try {
      settlement = await ctx.runMutation(internal.moneyLedger.reconcileInvocationCharge, {
        invocationRef: context.invocationRef,
        principalId: row.principalId,
        credentialId: row.credentialId,
        attemptRef,
        transactionRef,
        inputDigest: row.inputDigest,
        outcome: 'not_released',
        refundTransactionRef,
        refundIdempotencyKey: refundTransactionRef,
        refundInputDigest,
        sourceDigest,
        evidenceRefs: [`operation-money-reconciliation:${reconciliationDigest}`],
        observedAt: Date.now(),
      })
    } catch {
      settlement = { kind: 'reconciliation_required' }
    }
    if (settlement.kind === 'reconciliation_required') {
      const evidenceAttemptRef = control?.currentAttemptRef ?? attemptRef
      const effectGeneration = control?.currentEffectGeneration ?? 1
      await ctx.db.patch(row._id, {
        state: 'reconciliation_required',
        dispatchState: 'reconciliation_required',
        result: {
          kind: 'reconciliation_required',
          invocationRef: context.invocationRef,
          operationRef: row.operationRef,
          evidence: {
            attemptRef: evidenceAttemptRef,
            effectGeneration,
            requiredAt: new Date(Date.now() + 1_000).toISOString(),
            retry: 'reconcile_before_retry' as const,
            evidenceSource: `operation:${row.operationRef}`,
          },
        },
        attemptRef: evidenceAttemptRef,
        updatedAt: Date.now(),
      })
      return null
    }
    await ctx.db.patch(row._id, {
      state: 'refused',
      dispatchState: 'failed',
      result: {
        kind: 'refused',
        operationRef: row.operationRef,
        code: 'pre_release_failed',
        retryable: true,
        nextAction: 'Retry with a new idempotency key.',
      },
      updatedAt: Date.now(),
    })
    return null
  },
})

 
export const invoke = action({
  args: invokeArgs,
  returns: operationResultValue,
  handler: async (ctx, args): Promise<Infer<typeof operationResultValue>> => {
    await ctx.runMutation(internal.capabilityOperationInvocations.admit, args)
    const principal: AgentAccessPrincipal = args.principal
    if (!isPublicOperationRef(args.operationRef) || !principal.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)) return { kind: 'refused' as const, operationRef: args.operationRef, code: 'grant_not_found', retryable: false }
    type CurrentOperationState =
      | Readonly<{ kind: 'valid'; operation: PublishedOperation; operationJson: string }>
      | Readonly<{ kind: 'not_current' }>
      | Readonly<{ kind: 'unsupported' }>
      | Readonly<{ kind: 'unavailable' }>
    let currentOperationState: CurrentOperationState | undefined
    const readCurrentOperation = async (): Promise<CurrentOperationState> => {
      if (currentOperationState !== undefined) return currentOperationState
      let snapshot: { operationJson: string } | null
      try {
        snapshot = await ctx.runQuery(internal.capabilitySupplyOperations.readCurrentPublishedOperationSnapshot, {
          operationRef: args.operationRef,
        })
      } catch {
        currentOperationState = { kind: 'unavailable' }
        return currentOperationState
      }
      if (snapshot === null) {
        currentOperationState = { kind: 'not_current' }
        return currentOperationState
      }
      try {
        const operation = parsePublishedOperationSnapshot(snapshot.operationJson)
        if (operation === undefined) throw new Error('operation_unsupported')
        materializeRuntimePublishedOperation(operation)
        currentOperationState = { kind: 'valid', operation, operationJson: snapshot.operationJson }
      } catch {
        currentOperationState = { kind: 'unsupported' }
      }
      return currentOperationState
    }
    let reservedInvocationRef: string | undefined
    let reservationWasCreated = false
    let reservationWasReplayed = false
    let reservationCleanup: 'none' | 'abandoned' | 'failed' = 'none'
    const runtime: OperationInvokeRuntime = {
      policy: {
        readGrant: async () => {
          const row = await ctx.runQuery(internal.agentAccessPolicy.readActiveGrant, {
            credentialId: principal.credentialId,
            environment: principal.environment,
            principalId: principal.principalId,
            applicationRef: principal.applicationRef,
            now: Date.now(),
          })
          return row === null ? { kind: 'refused', code: 'grant_not_found', retryable: false } : {
            kind: 'granted',
            grant: {
              grantRef: row.grantRef,
              principalId: row.principalId,
              ownerId: row.ownerId,
              applicationRef: row.applicationRef,
              credentialId: row.credentialId,
              environment: row.environment,
              generation: row.generation,
              policyDigest: row.policyDigest,
              expiresAt: row.expiresAt,
              lifecycle: 'active',
              operationAccess: row.operationAccess,
            },
          }
        },
        evaluateAuthority: async ({ descriptor, operationRef, grant, invocationRef }) => {
          const authorityExpiresAt = principal.authorityMode === 'bounded_mandate'
            ? grant.expiresAt
            : Math.min(Date.now() + 30_000, grant.expiresAt)
          if (principal.authorityMode === 'full_yolo' || principal.authorityMode === 'bounded_mandate') return {
            kind: 'approved' as const,
            basis: {
              kind: 'standing_mandate_use' as const,
              mandateRef: `agent-access-grant:${grant.grantRef}`,
              mandateVersion: 1,
              mandateGeneration: grant.generation,
              authorityUseRef: `operation-authority-use:${invocationRef}`,
              grantEvidenceRef: `agent-access-grant-evidence:${grant.policyDigest}`,
            },
            expiresAt: new Date(authorityExpiresAt).toISOString(),
          }
          const freeRead = descriptor.consequenceClass === 'read_only'
            && descriptor.authorityRequirement === 'none'
            && descriptor.price.kind === 'fixed'
            && descriptor.price.amount.units === '0'
          if (freeRead) return {
            kind: 'approved' as const,
            basis: { kind: 'approve_each' as const, authorityRef: `inspect-only:${operationRef}` },
            expiresAt: new Date(authorityExpiresAt).toISOString(),
          }
          return {
            kind: 'needs_authority' as const,
            authorityRequest: {
              kind: 'approve_each' as const,
              operationRef,
              consequence: descriptor.consequenceClass,
              retryClass: descriptor.retryClass,
              ...(descriptor.price.kind === 'fixed' ? { maximumSpend: descriptor.price.amount } : {}),
              dataFields: descriptor.materialInputPointers,
            },
          }
        },
      },
      idempotency: {
        reserve: async (reservation) => {
          const current = await readCurrentOperation()
          const result = await ctx.runMutation(internal.capabilityOperationInvocations.reserve, {
            ...reservation,
            ownerId: principal.ownerId,
            ...(current.kind === 'valid' ? { operationJson: current.operationJson } : {}),
            inputJson: JSON.stringify(args.input),
            now: Date.now(),
          })
          if (result.kind === 'reserved') {
            reservedInvocationRef = result.reservation.invocationRef
            reservationWasCreated = true
          } else if (result.kind === 'replayed') {
            reservationWasReplayed = true
          }
          return result
        },
        abandon: async (abandonment) => {
          try {
            const result = await ctx.runMutation(internal.capabilityOperationInvocations.abandon, abandonment)
            reservationCleanup = result.kind === 'abandoned' ? 'abandoned' : 'failed'
            return result
          } catch (error) {
            reservationCleanup = 'failed'
            throw error
          }
        },
        readReplay: async (input) => {
          const replay = await ctx.runQuery(internal.capabilityOperationInvocations.readReplay, {
            invocationRef: input.invocationRef,
            principalId: input.principal.principalId,
            credentialId: input.principal.credentialId,
          })
          if (replay?.result !== undefined) return replay.result as OperationInvokeResult
          reservedInvocationRef = input.invocationRef
          return undefined
        },
      },
      currentOperation: async () => {
        const current = await readCurrentOperation()
        if (current.kind === 'not_current') return undefined
        if (current.kind === 'unsupported') throw new Error('operation_unsupported')
        if (current.kind === 'unavailable') throw new Error('source_unavailable')
        return {
          operation: current.operation,
          operationRef: args.operationRef,
          descriptor: materializeRuntimePublishedOperation(current.operation),
        }
      },
      dispatch: async ({ invocationRef, principal: dispatchPrincipal, authority }) => {
        const result = await ctx.runMutation(internal.capabilityOperationInvocations.dispatch, {
          invocationRef,
          principalId: dispatchPrincipal.principalId,
          credentialId: dispatchPrincipal.credentialId,
          operationRef: args.operationRef,
          authority,
          now: Date.now(),
        })
        if (result.kind === 'enqueued' || result.kind === 'replayed') return { kind: 'enqueued' as const }
        return {
          kind: 'refused' as const,
          code: 'invocation_runtime_unavailable' as const,
          retryable: true,
          nextAction: 'Retry after the invocation worker is available.',
        }
      },
    }
    const service = createOperationInvokeApplication(runtime)
    const result = await service.invokeOperation({ input: { operationRef: args.operationRef, input: args.input, idempotencyKey: args.idempotencyKey }, principal, correlationId: args.correlationId })
    const projectedResult = projectOperationResult(result)
    assertOperationResultJson(projectedResult)
    if (projectedResult.kind === 'refused') {
      if ((reservationWasCreated || reservationWasReplayed) && reservationCleanup === 'none' && reservedInvocationRef !== undefined) {
        await ctx.runMutation(internal.capabilityOperationInvocations.record, {
          invocationRef: reservedInvocationRef,
          principalId: principal.principalId,
          state: 'refused',
          result: projectedResult,
          dispatchState: 'failed',
          now: Date.now(),
        })
      }
    } else if ('invocationRef' in projectedResult && !(reservationWasReplayed && projectedResult.kind === 'pending')) {
      await ctx.runMutation(internal.capabilityOperationInvocations.record, {
        invocationRef: projectedResult.invocationRef,
        principalId: principal.principalId,
        state: projectedResult.kind === 'completed' ? 'completed' : projectedResult.kind === 'reconciliation_required' ? 'reconciliation_required' : 'pending',
        result: projectedResult,
        ...(projectedResult.kind === 'completed' ? { usage: projectedResult.usage, evidenceHash: projectedResult.evidenceHash } : {}),
        ...(projectedResult.kind === 'reconciliation_required' ? { attemptRef: projectedResult.evidence.attemptRef } : {}),
        now: Date.now(),
      })
    }
    return structuredClone(projectedResult)
  },
})


type RecoveryAdmission =
  | Readonly<{ kind: 'authorized'; row: Infer<typeof recoveryValue> }>
  | Readonly<{ kind: 'not_found' }>

function recoveryNotFound(invocationRef: string): Infer<typeof recoveryResultValue> {
  return { kind: 'refused', invocationRef, code: 'invocation_not_found', retryable: false }
}


function projectStatusRecoveryResult(
  result: Infer<typeof recoveryResultValue>,
): Infer<typeof statusResultValue> {
  if (result.kind !== 'reconciliation_required') return result
  return {
    kind: 'found',
    invocationRef: result.invocationRef,
    operationRef: result.operationRef,
    state: 'reconciliation_required',
    attemptRef: result.evidence.attemptRef,
    effectGeneration: result.evidence.effectGeneration,
  }
}

async function authorizeRecovery(
  ctx: ActionCtx,
  invocationRef: string,
  principal: AgentAccessPrincipal,
): Promise<RecoveryAdmission> {
  const row = await ctx.runQuery(internal.capabilityOperationInvocations.readRecovery, {
    invocationRef,
    principalId: principal.principalId,
    credentialId: principal.credentialId,
  })
  if (
    row === null
    || row.ownerId !== principal.ownerId
    || row.applicationRef !== principal.applicationRef
    || row.environment !== principal.environment
  ) return { kind: 'not_found' }
  return { kind: 'authorized', row }
}
async function authorizeOwnerRecovery(
  ctx: ActionCtx,
  invocationRef: string,
  idempotencyKey?: string,
): Promise<Infer<typeof recoveryValue> | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (
    identity === null
    || identity.subject.trim().length === 0
    || (idempotencyKey !== undefined && idempotencyKey.trim().length === 0)
  ) return null
  const row = await ctx.runQuery(internal.capabilityOperationInvocations.readOwnerRecovery, { invocationRef })
  return row === null || row.ownerId !== identity.subject ? null : row
}


export const readInvocationStatus = action({
  args: { ...principalAndSourceArgs, invocationRef: v.string() },
  returns: statusResultValue,
  handler: async (ctx, args): Promise<Infer<typeof statusResultValue>> => {
    await ctx.runMutation(internal.capabilityOperationInvocations.admit, { ...args, operationRef: '', input: {}, idempotencyKey: `status:${args.invocationRef}` })
    const admission = await authorizeRecovery(ctx, args.invocationRef, args.principal)
    if (admission.kind !== 'authorized') {
      return recoveryNotFound(args.invocationRef) as Infer<typeof statusResultValue>
    }
    const result = await ctx.runAction(internal.capabilityOperationInvocationWorker.recover, {
      invocationRef: args.invocationRef,
      principalId: args.principal.principalId,
      credentialId: args.principal.credentialId,
      mode: 'status',
    })
    return projectStatusRecoveryResult(result)
  },
})

export const cancelInvocation = action({
  args: { ...principalAndSourceArgs, invocationRef: v.string(), idempotencyKey: v.string() },
  returns: recoveryResultValue,
  handler: async (ctx, args): Promise<Infer<typeof recoveryResultValue>> => {
    await ctx.runMutation(internal.capabilityOperationInvocations.admit, { ...args, operationRef: '', input: {}, idempotencyKey: `cancel:${args.idempotencyKey}` })
    const admission = await authorizeRecovery(ctx, args.invocationRef, args.principal)
    if (admission.kind !== 'authorized') return recoveryNotFound(args.invocationRef)
    return await ctx.runAction(internal.capabilityOperationInvocationWorker.recover, {
      invocationRef: args.invocationRef,
      principalId: args.principal.principalId,
      credentialId: args.principal.credentialId,
      mode: 'cancel',
      idempotencyKey: args.idempotencyKey,
    })
  },
})

export const reconcileInvocation = action({
  args: { ...principalAndSourceArgs, invocationRef: v.string(), idempotencyKey: v.string(), evidence: reconciliationEvidenceValue },
  returns: recoveryResultValue,
  handler: async (ctx, args): Promise<Infer<typeof recoveryResultValue>> => {
    assertJsonObject(args.evidence)
    await ctx.runMutation(internal.capabilityOperationInvocations.admit, { ...args, operationRef: '', input: {}, idempotencyKey: `reconcile:${args.idempotencyKey}` })
    const admission = await authorizeRecovery(ctx, args.invocationRef, args.principal)
    if (admission.kind !== 'authorized') return recoveryNotFound(args.invocationRef)
    return await ctx.runAction(internal.capabilityOperationInvocationWorker.recover, {
      invocationRef: args.invocationRef,
      principalId: args.principal.principalId,
      credentialId: args.principal.credentialId,
      mode: 'reconcile',
      evidence: args.evidence,
    })
  },
})
export const readOwnerInvocationStatus = action({
  args: { invocationRef: v.string() },
  returns: statusResultValue,
  handler: async (ctx, args): Promise<Infer<typeof statusResultValue>> => {
    const row = await authorizeOwnerRecovery(ctx, args.invocationRef)
    if (row === null) return recoveryNotFound(args.invocationRef) as Infer<typeof statusResultValue>
    const result = await ctx.runAction(internal.capabilityOperationInvocationWorker.recover, {
      invocationRef: args.invocationRef,
      principalId: row.principalId,
      credentialId: row.credentialId,
      mode: 'status',
    })
    return projectStatusRecoveryResult(result)
  },
})
export const cancelOwnerInvocation = action({
  args: { invocationRef: v.string(), idempotencyKey: v.string() },
  returns: recoveryResultValue,
  handler: async (ctx, args): Promise<Infer<typeof recoveryResultValue>> => {
    const row = await authorizeOwnerRecovery(ctx, args.invocationRef, args.idempotencyKey)
    if (row === null) return recoveryNotFound(args.invocationRef)
    return await ctx.runAction(internal.capabilityOperationInvocationWorker.recover, {
      invocationRef: args.invocationRef,
      principalId: row.principalId,
      credentialId: row.credentialId,
      mode: 'cancel',
      idempotencyKey: args.idempotencyKey,
    })
  },
})


export const reconcileOwnerInvocation = action({
  args: { invocationRef: v.string(), idempotencyKey: v.string(), evidence: reconciliationEvidenceValue },
  returns: recoveryResultValue,
  handler: async (ctx, args): Promise<Infer<typeof recoveryResultValue>> => {
    assertJsonObject(args.evidence)
    const row = await authorizeOwnerRecovery(ctx, args.invocationRef, args.idempotencyKey)
    if (row === null) return recoveryNotFound(args.invocationRef)
    return await ctx.runAction(internal.capabilityOperationInvocationWorker.recover, {
      invocationRef: args.invocationRef,
      principalId: row.principalId,
      credentialId: row.credentialId,
      mode: 'reconcile',
      evidence: args.evidence,
    })
  },
})
