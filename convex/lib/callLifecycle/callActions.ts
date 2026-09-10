import type { Infer } from 'convex/values'
import type { PaginationOptions } from 'convex/server'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import { internal } from '../../_generated/api'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import { pricingConfigDecisionAmount } from '@/modules/money/public'
import {
  createCallApplication,
  type CallIdempotencyReservation,
  type CallPortRefusal,
  type CallRuntime,
} from '@/modules/capability-execution/call-authority'
import { callResultSchema, type CallResult } from '@/modules/capability-execution/call-contracts'
import {
  callResultValue,
  reconciliationEvidenceValue,
  recoveryResultValue,
  statusResultValue,
  usageValue,
  x402PaymentReconciliationEvidenceValue,
} from '@/modules/capability-execution/convex'
import {
  sourceWriteAdmissionArg,
  sourceWriteRequestArg,
} from '../../sourceWriteAdmission'
import {
  isCanonicalCredentiallessX402ProviderConnection,
  validateProviderConnectionAuthority,
  type ProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import {
  materializeRuntimePublishedTool,
  parsePublishedToolSnapshot,
  type PublishedTool,
  validPublicHttpsEndpoint,
} from '@/modules/capability-supply/public'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { type AdmitArgs, type CallPrincipal } from './admission'
import type { SellerOnboardingCanaryExecutionEnvelope } from '@/modules/capability-supply/public'

type CallRow = Doc<'capabilityCalls'>
type CallResultValue = Infer<typeof callResultValue>
type Usage = Infer<typeof usageValue>
type CallListState = CallRow['state']

function receiptRefFromResult(result: CallResultValue | undefined): string | undefined {
  return result !== undefined && 'receipt' in result ? result.receipt?.receiptRef : undefined
}

export async function listAgentCallSummariesHandler(
  ctx: QueryCtx,
  args: Readonly<{
    principalId: string
    ownerId: string
    credentialId: string
    applicationRef: string
    environment: 'sandbox' | 'production'
    state?: CallListState
    paginationOpts: PaginationOptions
  }>,
) {
  const state = args.state
  const source = state === undefined
    ? ctx.db.query('capabilityCalls')
        .withIndex('by_principalId_and_createdAt', (query) => query.eq('principalId', args.principalId))
        .order('desc')
    : ctx.db.query('capabilityCalls')
        .withIndex('by_principalId_and_state', (query) => query.eq('principalId', args.principalId).eq('state', state))
        .order('desc')
  const page = await source.paginate(args.paginationOpts)
  return {
    ...page,
    page: page.page
      .filter((row) => row.principalId === args.principalId
        && row.ownerId === args.ownerId
        && row.applicationRef === args.applicationRef
        && row.environment === args.environment)
      .map((row) => {
        const receiptRef = receiptRefFromResult(row.result)
        return {
          callRef: row.callRef,
          toolRef: row.toolRef,
          state: row.state,
          ...(row.result === undefined ? {} : { resultKind: row.result.kind }),
          ...(row.usage === undefined ? {} : { usage: row.usage }),
          ...(receiptRef === undefined ? {} : { receiptRef }),
          ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }
      }),
  }
}

export type RecoveryRow = Readonly<{
  quoteRef?: string
  callRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  toolRef: string
  sellerOnboardingCanary?: SellerOnboardingCanaryExecutionEnvelope
  inputDigest: string
  requestDigest: string
  grantGeneration: number
  grantRef: string
  toolJson: string
  inputJson: string
  result?: CallResultValue
  usage?: Usage
  evidenceHash?: string
  attemptRef?: string
  updatedAt: number
}>

type ReplayRow = Readonly<{
  toolRef: string
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  result?: CallResultValue
  usage?: Usage
  evidenceHash?: string
  attemptRef?: string
}>

type DispatchState = 'enqueued' | 'running' | 'completed' | 'failed' | 'reconciliation_required'

function projectRecoveryRow(row: CallRow): RecoveryRow | null {
  if (row.toolJson === undefined || row.inputJson === undefined) return null
  if (row.result !== undefined) assertCallResultJson(row.result)
  return {
    ...(row.quoteRef === undefined ? {} : { quoteRef: row.quoteRef }),
    callRef: row.callRef,
    principalId: row.principalId,
    ownerId: row.ownerId,
    credentialId: row.credentialId,
    applicationRef: row.applicationRef,
    environment: row.environment,
    state: row.state,
    toolRef: row.toolRef,
    ...(row.sellerOnboardingCanary === undefined
      ? {}
      : { sellerOnboardingCanary: structuredClone(row.sellerOnboardingCanary) }),
    inputDigest: row.inputDigest,
    requestDigest: row.requestDigest,
    grantGeneration: row.grantGeneration,
    grantRef: row.grantRef,
    toolJson: row.toolJson,
    inputJson: row.inputJson,
    ...(row.result === undefined ? {} : { result: row.result }),
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    updatedAt: row.updatedAt,
  }
}

function assertCallResultJson(value: CallResultValue): void {
  if (value.kind === 'completed' && !isBoundedJsonValue(value.output)) {
    throw new Error('operation_invocation_result_json_invalid')
  }
}

export function projectCallResult(result: CallResult): CallResultValue {
  if (result.kind !== 'needs_authority') return result
  return {
    ...result,
    authorityRequest: {
      ...result.authorityRequest,
      dataFields: [...result.authorityRequest.dataFields],
    },
  }
}

export type CallArgs = AdmitArgs & Readonly<{
  quoteRef: string
  decisionPrice?: Readonly<{ currency: 'AUD'; exponent: 6; units: string }>
}>

type CallPersistenceState = Readonly<{
  reservedCallRef?: string
  reservationWasCreated: boolean
  reservationWasReplayed: boolean
  reservationCleanup: 'none' | 'abandoned' | 'failed'
}>

type RecoveryAdmission =
  | Readonly<{ kind: 'authorized'; row: RecoveryRow }>
  | Readonly<{ kind: 'not_found' }>

function recoveryNotFound(callRef: string): Infer<typeof recoveryResultValue> {
  return { kind: 'refused', callRef, code: 'invocation_not_found', retryable: false }
}

function projectStatusRecoveryResult(
  result: Infer<typeof recoveryResultValue>,
): Infer<typeof statusResultValue> {
  if (result.kind !== 'reconciliation_required') return result
  return {
    kind: 'found',
    callRef: result.callRef,
    version: Date.now(),
    toolRef: result.toolRef,
    state: 'reconciliation_required',
    attemptRef: result.evidence.attemptRef,
    effectGeneration: result.evidence.effectGeneration,
  }
}

// A Call is identified by the Principal tuple that survives a credential
// rotation. The stored credentialId stays on the row as effect evidence.
export type CallIdentityArgs = Readonly<{
  principalId: string
  ownerId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
}>

function callIdentity(principal: AgentAccessPrincipal): CallIdentityArgs {
  return {
    principalId: principal.principalId,
    ownerId: principal.ownerId,
    applicationRef: principal.applicationRef,
    environment: principal.environment,
  }
}

function callIdentityMatches<T extends CallIdentityArgs>(row: T | null, identity: CallIdentityArgs): row is T {
  if (row === null) return false
  return [
    row.principalId === identity.principalId,
    row.ownerId === identity.ownerId,
    row.applicationRef === identity.applicationRef,
    row.environment === identity.environment,
  ].every(Boolean)
}

async function authorizeRecovery(
  ctx: ActionCtx,
  callRef: string,
  principal: AgentAccessPrincipal,
): Promise<RecoveryAdmission> {
  // The outer authority boundary authenticates the current credential. A Call
  // retains its original credential as effect evidence after replacement.
  const row = await ctx.runQuery(internal.capabilityCalls.readOwnerRecovery, { callRef })
  if (!callIdentityMatches(row, callIdentity(principal))) return { kind: 'not_found' }
  return { kind: 'authorized', row }
}

async function authorizeOwnerRecovery(
  ctx: ActionCtx,
  callRef: string,
  idempotencyKey?: string,
): Promise<RecoveryRow | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (
    identity === null
    || identity.tokenIdentifier.trim().length === 0
    || (idempotencyKey !== undefined && idempotencyKey.trim().length === 0)
  ) return null
  const row = await ctx.runQuery(internal.capabilityCalls.readOwnerRecovery, { callRef })
  return row === null || row.ownerId !== identity.tokenIdentifier ? null : row
}

function canInvokeOperation(args: CallArgs, principal: AgentAccessPrincipal): boolean {
  return isPublicToolRef(args.toolRef)
    && principal.scopes.includes(MARKET_TOOLS_CALL_SCOPE)
}

function shouldPersistRefusal(state: CallPersistenceState): state is CallPersistenceState & { reservedCallRef: string } {
  return [
    state.reservationWasCreated,
    state.reservationCleanup === 'none',
    state.reservedCallRef !== undefined,
  ].every(Boolean)
}

async function persistProjectedRefusal(
  ctx: ActionCtx,
  principal: AgentAccessPrincipal,
  result: Extract<CallResultValue, { kind: 'refused' }>,
  state: CallPersistenceState,
): Promise<void> {
  if (!shouldPersistRefusal(state)) return
  await ctx.runMutation(internal.capabilityCalls.record, {
    callRef: state.reservedCallRef,
    principalId: principal.principalId,
    state: 'refused',
    result,
    dispatchState: 'failed',
    now: Date.now(),
  })
}

function projectedCallState(
  result: Exclude<CallResultValue, { kind: 'refused' }>,
): 'pending' | 'completed' | 'reconciliation_required' {
  if (result.kind === 'completed') return 'completed'
  return result.kind === 'reconciliation_required' ? 'reconciliation_required' : 'pending'
}

async function persistProjectedInvocation(
  ctx: ActionCtx,
  principal: AgentAccessPrincipal,
  result: Exclude<CallResultValue, { kind: 'refused' }>,
  reservationWasReplayed: boolean,
): Promise<void> {
  if (!('callRef' in result)) return
  if (reservationWasReplayed) return
  await ctx.runMutation(internal.capabilityCalls.record, {
    callRef: result.callRef,
    principalId: principal.principalId,
    state: projectedCallState(result),
    result,
    ...(result.kind === 'completed' ? { usage: result.usage, evidenceHash: result.evidenceHash } : {}),
    ...(result.kind === 'reconciliation_required' ? { attemptRef: result.evidence.attemptRef } : {}),
    now: Date.now(),
  })
}

async function persistProjectedInvokeResult(
  ctx: ActionCtx,
  principal: AgentAccessPrincipal,
  result: CallResultValue,
  state: CallPersistenceState,
): Promise<void> {
  if (result.kind === 'refused') {
    await persistProjectedRefusal(ctx, principal, result, state)
    return
  }
  await persistProjectedInvocation(ctx, principal, result, state.reservationWasReplayed)
}

type ReservationResult = Awaited<ReturnType<CallRuntime['idempotency']['reserve']>>
type ReservedCall = Extract<ReservationResult, { kind: 'reserved' | 'replayed' }>

async function abandonFinancialReservation(
  ctx: ActionCtx,
  principal: AgentAccessPrincipal,
  reservation: CallIdempotencyReservation,
  retryable: boolean,
): Promise<CallPortRefusal> {
  await ctx.runMutation(internal.capabilityCalls.abandon, {
    ...reservation,
    ownerId: principal.ownerId,
  })
  return {
    kind: 'refused',
    code: 'commercial_policy_unavailable',
    retryable,
  }
}

async function attachFormanceReservation(
  ctx: ActionCtx,
  principal: AgentAccessPrincipal,
  result: ReservedCall,
  booking: Parameters<typeof ctx.runAction>[1],
): Promise<ReservationResult> {
  const booked = await ctx.runAction(internal.moneyFormance.reserveManagedCall, booking)
  if (booked.kind === 'completed') {
    const attached = await ctx.runMutation(internal.moneyManagedCall.attachReservation, {
      callRef: result.reservation.callRef,
      transactionRefs: [...booked.transactionRefs],
    })
    if (attached.kind !== 'refused') return result
    await ctx.runMutation(internal.moneyManagedCall.markReservationUnknown, {
      callRef: result.reservation.callRef,
      reference: booked.transactionRefs[0] ?? `formance-reservation:${result.reservation.callRef}`,
      statusRef: `operation-status:${result.reservation.callRef}`,
    })
    return { kind: 'replayed', reservation: result.reservation }
  }
  if (booked.kind === 'outcome_unknown') {
    await ctx.runMutation(internal.moneyManagedCall.markReservationUnknown, {
      callRef: result.reservation.callRef,
      reference: booked.reference,
      statusRef: booked.statusRef,
    })
    return { kind: 'replayed', reservation: result.reservation }
  }
  return await abandonFinancialReservation(
    ctx,
    principal,
    result.reservation,
    booked.kind === 'unavailable',
  )
}

async function reserveFormanceBackedInvocation(
  ctx: ActionCtx,
  principal: AgentAccessPrincipal,
  reservation: CallIdempotencyReservation,
  toolJson: string | undefined,
  input: Record<string, unknown>,
): Promise<ReservationResult> {
  const result = await ctx.runMutation(internal.capabilityCalls.reserve, {
    ...reservation,
    ownerId: principal.ownerId,
    ...(toolJson === undefined ? {} : { toolJson }),
    inputJson: JSON.stringify(input),
    now: Date.now(),
  })
  if (result.kind !== 'reserved' && result.kind !== 'replayed') return result
  const material = await ctx.runQuery(internal.moneyManagedCall.readBooking, {
    callRef: result.reservation.callRef,
  })
  if (material.kind === 'not_required') return result
  if (material.kind === 'not_found' || material.entryRefusalCode === 'financial_scope_locked') {
    return await abandonFinancialReservation(ctx, principal, result.reservation, false)
  }
  if (material.financialState === 'outcome_unknown') {
    return { kind: 'replayed', reservation: result.reservation }
  }
  if (material.financialState === 'reserved') return result
  return await attachFormanceReservation(ctx, principal, result, material.booking)
}

export async function callHandler(
  ctx: ActionCtx,
  args: CallArgs,
  sourceAlreadyAdmitted = false,
): Promise<Infer<typeof callResultValue>> {
  if (!sourceAlreadyAdmitted) {
    await ctx.runMutation(internal.capabilityCalls.admit, args)
  }
  const principal: AgentAccessPrincipal = args.principal
  if (!canInvokeOperation(args, principal)) {
    return { kind: 'refused' as const, toolRef: args.toolRef, code: 'grant_not_found', retryable: false }
  }
  type CurrentOperationState =
    | Readonly<{ kind: 'valid'; operation: PublishedTool; toolJson: string }>
    | Readonly<{ kind: 'not_current' }>
    | Readonly<{ kind: 'unsupported' }>
    | Readonly<{ kind: 'unavailable' }>
  let currentOperationState: CurrentOperationState | undefined
  const readCurrentTool = async (): Promise<CurrentOperationState> => {
    if (currentOperationState !== undefined) return currentOperationState
    let snapshot: { toolJson: string } | null
    try {
      snapshot = await ctx.runQuery(internal.capabilitySupplyTools.readCurrentPublishedToolSnapshot, {
        toolRef: args.toolRef,
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
      const operation = parsePublishedToolSnapshot(snapshot.toolJson)
      if (operation === undefined) throw new Error('operation_unsupported')
      materializeRuntimePublishedTool(operation)
      currentOperationState = { kind: 'valid', operation, toolJson: snapshot.toolJson }
    } catch {
      currentOperationState = { kind: 'unsupported' }
    }
    return currentOperationState
  }
  let reservedCallRef: string | undefined
  let reservationWasCreated = false
  let reservationWasReplayed = false
  let reservationCleanup: 'none' | 'abandoned' | 'failed' = 'none'
  const runtime: CallRuntime = {
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
            policyDigest: row.spendingPolicyDigest,
            expiresAt: row.expiresAt,
            lifecycle: 'active',
            toolAccess: row.toolAccess,
            toolRefs: row.toolRefs,
          },
        }
      },
      evaluateAuthority: async ({ operation, descriptor, toolRef, grant, callRef }) => {
        const authorityExpiresAt = principal.authorityMode === 'spending_policy'
          ? grant.expiresAt
          : Math.min(Date.now() + 30_000, grant.expiresAt)
        if (principal.authorityMode === 'unrestricted_test_only' || principal.authorityMode === 'spending_policy') return {
          kind: 'approved' as const,
          basis: {
            kind: 'spending_policy_use' as const,
            spendingPolicyRef: `agent-access-grant:${grant.grantRef}`,
            spendingPolicyVersion: 1,
            spendingPolicyGeneration: grant.generation,
            authorityUseRef: `operation-authority-use:${callRef}`,
            grantEvidenceRef: `agent-access-grant-evidence:${grant.policyDigest}`,
          },
          expiresAt: new Date(authorityExpiresAt).toISOString(),
        }
        const fixedPriceAmount = pricingConfigDecisionAmount(operation.pricingConfig)
        const freeRead = descriptor.consequenceClass === 'read_only'
          && descriptor.authorityRequirement === 'none'
          && fixedPriceAmount !== undefined
          && fixedPriceAmount.units === '0'
        if (freeRead) return {
          kind: 'approved' as const,
          basis: { kind: 'approval_required' as const, authorityRef: `inspect-only:${toolRef}` },
          expiresAt: new Date(authorityExpiresAt).toISOString(),
        }
        return {
          kind: 'needs_authority' as const,
          authorityRequest: {
            kind: 'approval_required' as const,
            toolRef,
            consequence: descriptor.consequenceClass,
            retryClass: descriptor.retryClass,
            ...(fixedPriceAmount === undefined ? {} : { maximumSpend: fixedPriceAmount }),
            dataFields: descriptor.materialInputPointers,
          },
        }
      },
    },
    idempotency: {
      reserve: async (reservation) => {
        const current = await readCurrentTool()
        const result = await reserveFormanceBackedInvocation(
          ctx,
          principal,
          reservation,
          current.kind === 'valid' ? current.toolJson : undefined,
          args.input,
        )
        if (result.kind !== 'reserved' && result.kind !== 'replayed') return result
        reservedCallRef = result.reservation.callRef
        if (result.kind === 'reserved') reservationWasCreated = true
        else reservationWasReplayed = true
        return result
      },
      abandon: async (abandonment) => {
        try {
          const result = await ctx.runMutation(internal.capabilityCalls.abandon, abandonment)
          reservationCleanup = result.kind === 'abandoned' ? 'abandoned' : 'failed'
          return result
        } catch (error) {
          reservationCleanup = 'failed'
          throw error
        }
      },
      readReplay: async (input) => {
        const replay = await ctx.runQuery(internal.capabilityCalls.readReplay, {
          callRef: input.callRef,
          ...callIdentity(input.principal),
        })
        if (replay?.result !== undefined) {
          const parsed = callResultSchema.safeParse(replay.result)
          if (!parsed.success) throw new Error('call_result_persisted_invalid')
          return parsed.data
        }
        reservedCallRef = input.callRef
        return undefined
      },
    },
    currentTool: async () => {
      const current = await readCurrentTool()
      if (current.kind === 'not_current') return undefined
      if (current.kind === 'unsupported') throw new Error('operation_unsupported')
      if (current.kind === 'unavailable') throw new Error('source_unavailable')
      return {
        operation: current.operation,
        toolRef: args.toolRef,
        descriptor: materializeRuntimePublishedTool(current.operation),
      }
    },
    dispatch: async ({ callRef, principal: dispatchPrincipal, authority }) => {
      const result = await ctx.runMutation(internal.capabilityCalls.dispatch, {
        callRef,
        principalId: dispatchPrincipal.principalId,
        credentialId: dispatchPrincipal.credentialId,
        toolRef: args.toolRef,
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
  const service = createCallApplication(runtime)
  const result = await service.callTool({
    input: {
      quoteRef: args.quoteRef,
      toolRef: args.toolRef,
      input: args.input,
      idempotencyKey: args.idempotencyKey,
    },
    principal,
    correlationId: args.correlationId,
  })
  const projectedResult = projectCallResult(result)
  assertCallResultJson(projectedResult)
  await persistProjectedInvokeResult(ctx, principal, projectedResult, {
    ...(reservedCallRef === undefined ? {} : { reservedCallRef }),
    reservationWasCreated,
    reservationWasReplayed,
    reservationCleanup,
  })
  return structuredClone(projectedResult)
}

type RecoveryActionArgs = {
  operationKey: string
  correlationId: string
  sourceWrite?: Infer<typeof sourceWriteAdmissionArg>
  sourceWriteRequest?: Infer<typeof sourceWriteRequestArg>
  principal: CallPrincipal
  callRef: string
  afterVersion?: number
  idempotencyKey?: string
}

export async function listAgentCallsHandler(
  ctx: ActionCtx,
  args: Omit<RecoveryActionArgs, 'callRef'> & Readonly<{ state?: CallListState; paginationOpts: PaginationOptions }>,
) {
  await ctx.runMutation(internal.capabilityCalls.admit, {
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    ...(args.sourceWrite === undefined ? {} : { sourceWrite: args.sourceWrite }),
    ...(args.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: args.sourceWriteRequest }),
    principal: args.principal,
    toolRef: '',
    input: {},
    idempotencyKey: `list:${args.state ?? 'all'}:${args.paginationOpts.cursor ?? 'start'}:${args.paginationOpts.numItems}`,
  })
  return await ctx.runQuery(internal.capabilityCalls.listAgentCallSummaries, {
    principalId: args.principal.principalId,
    ownerId: args.principal.ownerId,
    credentialId: args.principal.credentialId,
    applicationRef: args.principal.applicationRef,
    environment: args.principal.environment,
    ...(args.state === undefined ? {} : { state: args.state }),
    paginationOpts: args.paginationOpts,
  })
}

type RecoveryEvidence =
  | Infer<typeof reconciliationEvidenceValue>
  | Infer<typeof x402PaymentReconciliationEvidenceValue>

export async function readCallStatusHandler(
  ctx: ActionCtx,
  args: RecoveryActionArgs,
): Promise<Infer<typeof statusResultValue>> {
  await ctx.runMutation(internal.capabilityCalls.admit, {
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    ...(args.sourceWrite === undefined ? {} : { sourceWrite: args.sourceWrite }),
    ...(args.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: args.sourceWriteRequest }),
    principal: args.principal,
    toolRef: '',
    input: {},
    idempotencyKey: `status:${args.callRef}`,
  })
  const admission = await authorizeRecovery(ctx, args.callRef, args.principal)
  if (admission.kind !== 'authorized') {
    return recoveryNotFound(args.callRef) as Infer<typeof statusResultValue>
  }
  const result = await ctx.runAction(internal.capabilityCallWorker.recover, {
    callRef: args.callRef,
    principalId: admission.row.principalId,
    credentialId: admission.row.credentialId,
    recoveryPrincipal: args.principal,
    mode: 'status',
  })
  const projected = projectStatusRecoveryResult(result)
  return projected.kind === 'found'
    && args.afterVersion !== undefined
    && projected.version <= args.afterVersion
    ? {
        kind: 'unchanged' as const,
        callRef: projected.callRef,
        version: projected.version,
        retryAfterMs: 1_000,
      }
    : projected
}

export async function cancelCallHandler(
  ctx: ActionCtx,
  args: RecoveryActionArgs & { idempotencyKey: string },
): Promise<Infer<typeof recoveryResultValue>> {
  await ctx.runMutation(internal.capabilityCalls.admit, {
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    ...(args.sourceWrite === undefined ? {} : { sourceWrite: args.sourceWrite }),
    ...(args.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: args.sourceWriteRequest }),
    principal: args.principal,
    toolRef: '',
    input: {},
    idempotencyKey: `cancel:${args.idempotencyKey}`,
  })
  const admission = await authorizeRecovery(ctx, args.callRef, args.principal)
  if (admission.kind !== 'authorized') return recoveryNotFound(args.callRef)
  return await ctx.runAction(internal.capabilityCallWorker.recover, {
    callRef: args.callRef,
    principalId: admission.row.principalId,
    credentialId: admission.row.credentialId,
    recoveryPrincipal: args.principal,
    mode: 'cancel',
    idempotencyKey: args.idempotencyKey,
  })
}

export async function reconcileCallHandler(
  ctx: ActionCtx,
  args: RecoveryActionArgs & { idempotencyKey: string; evidence: RecoveryEvidence },
): Promise<Infer<typeof recoveryResultValue>> {
  await ctx.runMutation(internal.capabilityCalls.admit, {
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    ...(args.sourceWrite === undefined ? {} : { sourceWrite: args.sourceWrite }),
    ...(args.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: args.sourceWriteRequest }),
    principal: args.principal,
    toolRef: '',
    input: {},
    idempotencyKey: `reconcile:${args.idempotencyKey}`,
  })
  const admission = await authorizeRecovery(ctx, args.callRef, args.principal)
  if (admission.kind !== 'authorized') return recoveryNotFound(args.callRef)
  return await ctx.runAction(internal.capabilityCallWorker.recover, {
    callRef: args.callRef,
    principalId: admission.row.principalId,
    credentialId: admission.row.credentialId,
    recoveryPrincipal: args.principal,
    mode: 'reconcile',
    evidence: args.evidence,
  })
}

export async function readOwnerCallStatusHandler(
  ctx: ActionCtx,
  args: { callRef: string },
): Promise<Infer<typeof statusResultValue>> {
  const row = await authorizeOwnerRecovery(ctx, args.callRef)
  if (row === null) return recoveryNotFound(args.callRef) as Infer<typeof statusResultValue>
  const result = await ctx.runAction(internal.capabilityCallWorker.recover, {
    callRef: args.callRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    recoverAsOwner: true,
    mode: 'status',
  })
  const projected = projectStatusRecoveryResult(result)
  if (projected.kind !== 'found') return projected
  const previousInput = parseOwnerPreviousInput(row.inputJson)
  return {
    ...projected,
    ...(previousInput === undefined ? {} : { previousInput }),
  }
}

function parseOwnerPreviousInput(inputJson: string): Record<string, JsonValue> | undefined {
  try {
    const value: unknown = JSON.parse(inputJson)
    return isRecord(value) && isBoundedJsonValue(value)
      ? value as Record<string, JsonValue>
      : undefined
  } catch {
    return undefined
  }
}

export async function cancelOwnerCallHandler(
  ctx: ActionCtx,
  args: { callRef: string; idempotencyKey: string },
): Promise<Infer<typeof recoveryResultValue>> {
  const row = await authorizeOwnerRecovery(ctx, args.callRef, args.idempotencyKey)
  if (row === null) return recoveryNotFound(args.callRef)
  return await ctx.runAction(internal.capabilityCallWorker.recover, {
    callRef: args.callRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    recoverAsOwner: true,
    mode: 'cancel',
    idempotencyKey: args.idempotencyKey,
  })
}

export async function reconcileOwnerCallHandler(
  ctx: ActionCtx,
  args: { callRef: string; idempotencyKey: string; evidence: RecoveryEvidence },
): Promise<Infer<typeof recoveryResultValue>> {
  const row = await authorizeOwnerRecovery(ctx, args.callRef, args.idempotencyKey)
  if (row === null) return recoveryNotFound(args.callRef)
  return await ctx.runAction(internal.capabilityCallWorker.recover, {
    callRef: args.callRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    recoverAsOwner: true,
    mode: 'reconcile',
    evidence: args.evidence,
  })
}

export async function readReplayHandler(
  ctx: QueryCtx,
  args: CallIdentityArgs & { callRef: string },
): Promise<ReplayRow | null> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  if (!callIdentityMatches(row, args)) return null
  if (row.result !== undefined) assertCallResultJson(row.result)
  return {
    toolRef: row.toolRef,
    state: row.state,
    ...(row.result === undefined ? {} : { result: structuredClone(row.result) }),
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
  }
}

export async function readRecoveryHandler(
  ctx: QueryCtx,
  args: { callRef: string; principalId: string },
): Promise<RecoveryRow | null> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  if (row === null || row.principalId !== args.principalId) return null
  return projectRecoveryRow(row)
}

export async function readOwnerRecoveryHandler(
  ctx: QueryCtx,
  args: { callRef: string },
): Promise<RecoveryRow | null> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  return row === null ? null : projectRecoveryRow(row)
}

export async function recordHandler(
  ctx: MutationCtx,
  args: {
    callRef: string
    principalId: string
    state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
    result?: CallResultValue
    usage?: Usage
    evidenceHash?: string
    attemptRef?: string
    dispatchState?: DispatchState
    now: number
  },
): Promise<{ kind: 'recorded' }> {
  if (args.result !== undefined) assertCallResultJson(args.result)
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  if (row === null || row.principalId !== args.principalId) throw new Error('operation_invoke_identity_refused')
  if (
    row.state !== 'pending'
    && args.state !== row.state
  ) return { kind: 'recorded' as const }
  await ctx.db.patch(row._id, recordPatch(args))
  return { kind: 'recorded' as const }
}

type RecordArgs = Parameters<typeof recordHandler>[1]

function recordPatch(args: RecordArgs): Partial<CallRow> {
  return {
    state: args.state,
    ...(args.result === undefined ? {} : { result: args.result }),
    ...(args.usage === undefined ? {} : { usage: args.usage }),
    ...(args.evidenceHash === undefined ? {} : { evidenceHash: args.evidenceHash }),
    ...(args.attemptRef === undefined ? {} : { attemptRef: args.attemptRef }),
    ...(args.dispatchState === undefined ? {} : { dispatchState: args.dispatchState }),
    updatedAt: args.now,
  }
}

type ProjectRecoveryArgs = Parameters<typeof projectRecoveryHandler>[1]

function recoveryProjectionIdentityMatches(row: CallRow | null, args: ProjectRecoveryArgs): row is CallRow {
  // The stored credential is effect evidence, never the projection gate: a
  // replaced credential must still project onto the original Call.
  return row !== null && row.principalId === args.principalId
}

function isCompletedProjection(row: CallRow): boolean {
  return row.state === 'completed' && row.result?.kind === 'completed'
}

function resetsPendingRecovery(row: CallRow, args: ProjectRecoveryArgs): boolean {
  return [
    row.state === 'reconciliation_required',
    args.state === 'pending',
    args.clearResult,
    args.clearWorkId,
    args.clearAttemptRef,
    args.clearEvidenceHash,
    args.clearDispatchState,
  ].every(Boolean)
}

function recoveryProjectionTransitionAllowed(row: CallRow, args: ProjectRecoveryArgs): boolean {
  return row.state === 'pending'
    || args.state === row.state
    || resetsPendingRecovery(row, args)
}

type CallPatch = {
  [Property in keyof CallRow]?: undefined extends CallRow[Property]
    ? CallRow[Property] | undefined
    : CallRow[Property]
}

function recoveryProjectionPatch(row: CallRow, args: ProjectRecoveryArgs): CallPatch {
  return {
    state: args.state,
    ...(args.clearResult ? { result: undefined } : args.result === undefined ? {} : { result: args.result }),
    ...(args.clearWorkId ? { workId: undefined } : {}),
    ...(args.clearAttemptRef ? { attemptRef: undefined } : args.attemptRef === undefined ? {} : { attemptRef: args.attemptRef }),
    ...(args.clearEvidenceHash ? { evidenceHash: undefined } : {}),
    ...(args.clearDispatchState ? { dispatchState: undefined } : args.dispatchState === undefined ? {} : { dispatchState: args.dispatchState }),
    ...(resetsPendingRecovery(row, args) ? { reconciliation: undefined } : {}),
    updatedAt: args.now,
  }
}

export async function projectRecoveryHandler(
  ctx: MutationCtx,
  args: {
    callRef: string
    principalId: string
    state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
    result?: CallResultValue
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
  if (args.result !== undefined) assertCallResultJson(args.result)
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  if (!recoveryProjectionIdentityMatches(row, args)) {
    throw new Error('operation_invoke_identity_refused')
  }
  if (isCompletedProjection(row)) return { kind: 'recorded' as const }
  if (!recoveryProjectionTransitionAllowed(row, args)) return { kind: 'recorded' as const }
  await ctx.db.patch(row._id, recoveryProjectionPatch(row, args))
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

export async function readCurrentProviderConnectionAuthorityHandler(
  ctx: QueryCtx,
  args: Readonly<{
    connectionRef: string
    providerRef: string
    adapterId: string
    authorityGeneration: number
    authorityDigest: string
    resourceUrl: string
    now: number
  }>,
) {
  const connection = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef))
    .unique()
  if (connection === null) return null
  const current: ProviderConnection = {
    ...connection,
    businessId: String(connection.businessId),
  }
  const exactAuthority = [
    current.connectionRef === args.connectionRef,
    current.providerRef === args.providerRef,
    current.adapterId === args.adapterId,
    validateProviderConnectionAuthority(
      current,
      args.authorityGeneration,
      args.authorityDigest,
      args.now,
    ).kind === 'valid',
  ].every(Boolean)
  if (!exactAuthority) return null
  if (!isCanonicalCredentiallessX402ProviderConnection(current)) {
    return { kind: 'credentialed' as const }
  }
  const resource = validPublicHttpsEndpoint(args.resourceUrl)
  return [
    resource !== undefined,
    resource?.hash === '',
    current.grantedResources.length === 1,
    current.grantedResources[0] === resource?.toString(),
  ].every(Boolean)
    ? { kind: 'credentialless_x402' as const }
    : null
}
