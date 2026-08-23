import type { Infer } from 'convex/values'
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { internal } from './_generated/api'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import {
  createOperationInvokeApplication,
  type OperationInvokeRuntime,
} from '@/modules/capability-execution/operation-invoke'
import type { OperationInvokeResult } from '@/modules/capability-execution/operation-invoke-contracts'
import {
  operationResultValue,
  reconciliationEvidenceValue,
  recoveryResultValue,
  statusResultValue,
  usageValue,
} from '@/modules/capability-execution/convex'
import { x402PaymentReconciliationEvidenceValue } from '@/modules/action-invocation/public'
import {
  sourceWriteAdmissionArg,
  sourceWriteRequestArg,
} from './sourceWriteAdmission'
import {
  materializeRuntimePublishedOperation,
  parsePublishedOperationSnapshot,
  type PublishedOperation,
} from '@/modules/capability-supply/public'
import { isPublicOperationRef } from '@/modules/capability-supply/public'
import { type AdmitArgs, type OperationInvokePrincipal } from './capabilityOperationAdmission'

type OperationInvocationRow = Doc<'capabilityOperationInvocations'>
type OperationResult = Infer<typeof operationResultValue>
type Usage = Infer<typeof usageValue>

export type RecoveryRow = Readonly<{
  invocationRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  operationRef: string
  inputDigest: string
  requestDigest: string
  grantGeneration: number
  grantRef: string
  operationJson: string
  inputJson: string
  result?: OperationResult
  usage?: Usage
  evidenceHash?: string
  attemptRef?: string
}>

type ReplayRow = Readonly<{
  operationRef: string
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  result?: OperationResult
  usage?: Usage
  evidenceHash?: string
  attemptRef?: string
}>

type DispatchState = 'enqueued' | 'running' | 'completed' | 'failed' | 'reconciliation_required'

function projectRecoveryRow(row: OperationInvocationRow): RecoveryRow | null {
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

export type InvokeArgs = AdmitArgs

type RecoveryAdmission =
  | Readonly<{ kind: 'authorized'; row: RecoveryRow }>
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
): Promise<RecoveryRow | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (
    identity === null
    || identity.tokenIdentifier.trim().length === 0
    || (idempotencyKey !== undefined && idempotencyKey.trim().length === 0)
  ) return null
  const row = await ctx.runQuery(internal.capabilityOperationInvocations.readOwnerRecovery, { invocationRef })
  return row === null || row.ownerId !== identity.tokenIdentifier ? null : row
}

export async function invokeHandler(
  ctx: ActionCtx,
  args: InvokeArgs,
): Promise<Infer<typeof operationResultValue>> {
  await ctx.runMutation(internal.capabilityOperationInvocations.admit, args)
  const principal: AgentAccessPrincipal = args.principal
  if (!isPublicOperationRef(args.operationRef) || !principal.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)) {
    return { kind: 'refused' as const, operationRef: args.operationRef, code: 'grant_not_found', retryable: false }
  }
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
  const result = await service.invokeOperation({
    input: { operationRef: args.operationRef, input: args.input, idempotencyKey: args.idempotencyKey },
    principal,
    correlationId: args.correlationId,
  })
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
}

type RecoveryActionArgs = {
  operationKey: string
  correlationId: string
  sourceWrite?: Infer<typeof sourceWriteAdmissionArg>
  sourceWriteRequest?: Infer<typeof sourceWriteRequestArg>
  principal: OperationInvokePrincipal
  invocationRef: string
  idempotencyKey?: string
}

type RecoveryEvidence =
  | Infer<typeof reconciliationEvidenceValue>
  | Infer<typeof x402PaymentReconciliationEvidenceValue>

export async function readInvocationStatusHandler(
  ctx: ActionCtx,
  args: RecoveryActionArgs,
): Promise<Infer<typeof statusResultValue>> {
  await ctx.runMutation(internal.capabilityOperationInvocations.admit, {
    ...args,
    operationRef: '',
    input: {},
    idempotencyKey: `status:${args.invocationRef}`,
  })
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
}

export async function cancelInvocationHandler(
  ctx: ActionCtx,
  args: RecoveryActionArgs & { idempotencyKey: string },
): Promise<Infer<typeof recoveryResultValue>> {
  await ctx.runMutation(internal.capabilityOperationInvocations.admit, {
    ...args,
    operationRef: '',
    input: {},
    idempotencyKey: `cancel:${args.idempotencyKey}`,
  })
  const admission = await authorizeRecovery(ctx, args.invocationRef, args.principal)
  if (admission.kind !== 'authorized') return recoveryNotFound(args.invocationRef)
  return await ctx.runAction(internal.capabilityOperationInvocationWorker.recover, {
    invocationRef: args.invocationRef,
    principalId: args.principal.principalId,
    credentialId: args.principal.credentialId,
    mode: 'cancel',
    idempotencyKey: args.idempotencyKey,
  })
}

export async function reconcileInvocationHandler(
  ctx: ActionCtx,
  args: RecoveryActionArgs & { idempotencyKey: string; evidence: RecoveryEvidence },
): Promise<Infer<typeof recoveryResultValue>> {
  await ctx.runMutation(internal.capabilityOperationInvocations.admit, {
    ...args,
    operationRef: '',
    input: {},
    idempotencyKey: `reconcile:${args.idempotencyKey}`,
  })
  const admission = await authorizeRecovery(ctx, args.invocationRef, args.principal)
  if (admission.kind !== 'authorized') return recoveryNotFound(args.invocationRef)
  return await ctx.runAction(internal.capabilityOperationInvocationWorker.recover, {
    invocationRef: args.invocationRef,
    principalId: args.principal.principalId,
    credentialId: args.principal.credentialId,
    mode: 'reconcile',
    evidence: args.evidence,
  })
}

export async function readOwnerInvocationStatusHandler(
  ctx: ActionCtx,
  args: { invocationRef: string },
): Promise<Infer<typeof statusResultValue>> {
  const row = await authorizeOwnerRecovery(ctx, args.invocationRef)
  if (row === null) return recoveryNotFound(args.invocationRef) as Infer<typeof statusResultValue>
  const result = await ctx.runAction(internal.capabilityOperationInvocationWorker.recover, {
    invocationRef: args.invocationRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    mode: 'status',
  })
  return projectStatusRecoveryResult(result)
}

export async function cancelOwnerInvocationHandler(
  ctx: ActionCtx,
  args: { invocationRef: string; idempotencyKey: string },
): Promise<Infer<typeof recoveryResultValue>> {
  const row = await authorizeOwnerRecovery(ctx, args.invocationRef, args.idempotencyKey)
  if (row === null) return recoveryNotFound(args.invocationRef)
  return await ctx.runAction(internal.capabilityOperationInvocationWorker.recover, {
    invocationRef: args.invocationRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    mode: 'cancel',
    idempotencyKey: args.idempotencyKey,
  })
}

export async function reconcileOwnerInvocationHandler(
  ctx: ActionCtx,
  args: { invocationRef: string; idempotencyKey: string; evidence: RecoveryEvidence },
): Promise<Infer<typeof recoveryResultValue>> {
  const row = await authorizeOwnerRecovery(ctx, args.invocationRef, args.idempotencyKey)
  if (row === null) return recoveryNotFound(args.invocationRef)
  return await ctx.runAction(internal.capabilityOperationInvocationWorker.recover, {
    invocationRef: args.invocationRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    mode: 'reconcile',
    evidence: args.evidence,
  })
}

export async function readReplayHandler(
  ctx: QueryCtx,
  args: { invocationRef: string; principalId: string; credentialId: string },
): Promise<ReplayRow | null> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique()
  if (row === null || row.principalId !== args.principalId || row.credentialId !== args.credentialId) return null
  if (row.result !== undefined) assertOperationResultJson(row.result)
  return {
    operationRef: row.operationRef,
    state: row.state,
    ...(row.result === undefined ? {} : { result: structuredClone(row.result) as OperationResult }),
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
  }
}

export async function readRecoveryHandler(
  ctx: QueryCtx,
  args: { invocationRef: string; principalId: string; credentialId: string },
): Promise<RecoveryRow | null> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique()
  if (row === null || row.principalId !== args.principalId || row.credentialId !== args.credentialId) return null
  return projectRecoveryRow(row)
}

export async function readOwnerRecoveryHandler(
  ctx: QueryCtx,
  args: { invocationRef: string },
): Promise<RecoveryRow | null> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique()
  return row === null ? null : projectRecoveryRow(row)
}

export async function recordHandler(
  ctx: MutationCtx,
  args: {
    invocationRef: string
    principalId: string
    state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
    result?: OperationResult
    usage?: Usage
    evidenceHash?: string
    attemptRef?: string
    dispatchState?: DispatchState
    now: number
  },
): Promise<{ kind: 'recorded' }> {
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
}

export async function projectRecoveryHandler(
  ctx: MutationCtx,
  args: {
    invocationRef: string
    principalId: string
    credentialId: string
    state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
    result?: OperationResult
    attemptRef?: string
    dispatchState?: DispatchState
    clearResult: boolean
    clearWorkId: boolean
    clearAttemptRef: boolean
    clearEvidenceHash: boolean
    clearDispatchState: boolean
    now: number
  },
): Promise<{ kind: 'recorded' }> {
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
}

export async function readProviderLeaseAuthorityHandler(
  ctx: QueryCtx,
  args: { connectionRef: string; authorityGeneration: number },
) {
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
}
