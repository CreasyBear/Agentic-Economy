import type { Infer } from 'convex/values'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import type { ActionCtx, QueryCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { pricingConfigDecisionAmount } from '@/modules/money/public'
import { callResultSchema, type CallResult } from '@/modules/capability-execution/call-contracts'
import {
  callResultValue,
} from '@/modules/capability-execution/convex'
import {
  createCallApplication,
  type CallIdempotencyReservation,
  type CallPortRefusal,
  type CallRuntime,
} from '@/modules/capability-execution/call-authority'
import {
  materializeRuntimePublishedTool,
  parsePublishedToolSnapshot,
  type PublishedTool,
} from '@/modules/capability-supply/public'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { type AdmitArgs, type ReserveArgs } from './admission'
import {
  assertCallResultJson,
  callIdentity,
  callIdentityMatches,
  type CallIdentityArgs,
} from './callIdentity'
import type { ReplayRow } from './callRecoveryActions'

function currentUtcMonthWindow(): { periodStartAt: number; periodEndAt: number } {
  const now = new Date()
  return {
    periodStartAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    periodEndAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  }
}

async function readOrganizationMonthlySpendForReserve(
  ctx: ActionCtx,
  ownerId: string,
): Promise<ReserveArgs['organizationMonthlySpend']> {
  const budgetRow = await ctx.runQuery(
    internal.moneyMonthlySpendBudget.readOrganizationMonthlySpendBudgetForAccount,
    { accountRef: ownerId },
  )
  if (!budgetRow.enabled) return undefined
  const { periodStartAt, periodEndAt } = currentUtcMonthWindow()
  const accountSpend = await ctx.runAction(internal.moneyFormance.readPeriodSpend, {
    accountRef: ownerId,
    periodStartAt,
    periodEndAt,
  })
  return {
    enabled: true,
    ceilingUnits: budgetRow.ceilingUnits,
    ...(accountSpend.kind === 'available'
      ? { monthSpendUnits: accountSpend.spendUnits }
      : accountSpend.kind === 'empty'
        ? { monthSpendUnits: '0' }
        : {}),
  }
}

type CallResultValue = Infer<typeof callResultValue>

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
  turnRef?: string,
): Promise<CallPortRefusal> {
  await ctx.runMutation(internal.capabilityCalls.abandon, {
    ...reservation,
    ownerId: principal.ownerId,
    ...(turnRef === undefined ? {} : { turnRef }),
  })
  return {
    kind: 'refused',
    code: 'commercial_policy_unavailable',
    retryable,
    nextAction: 'Request a new Quote for this Tool to check current funds and spending limits. Contact AE support if the purchase remains unavailable.',
  }
}

async function attachFormanceReservation(
  ctx: ActionCtx,
  principal: AgentAccessPrincipal,
  result: ReservedCall,
  booking: Parameters<typeof ctx.runAction>[1],
  turnRef?: string,
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
    turnRef,
  )
}

async function reserveFormanceBackedInvocation(
  ctx: ActionCtx,
  principal: AgentAccessPrincipal,
  reservation: CallIdempotencyReservation,
  toolJson: string | undefined,
  input: Record<string, unknown>,
  turnRef?: string,
): Promise<ReservationResult> {
  const organizationMonthlySpend = await readOrganizationMonthlySpendForReserve(ctx, principal.ownerId)
  const result = await ctx.runMutation(internal.capabilityCalls.reserve, {
    ...reservation,
    ownerId: principal.ownerId,
    ...(toolJson === undefined ? {} : { toolJson }),
    inputJson: JSON.stringify(input),
    now: Date.now(),
    ...(turnRef === undefined ? {} : { turnRef }),
    ...(organizationMonthlySpend === undefined ? {} : { organizationMonthlySpend }),
  })
  if (result.kind !== 'reserved' && result.kind !== 'replayed') return result
  const material = await ctx.runQuery(internal.moneyManagedCall.readBooking, {
    callRef: result.reservation.callRef,
  })
  if (material.kind === 'not_required') return result
  if (material.kind === 'not_found' || material.entryRefusalCode === 'financial_scope_locked') {
    return await abandonFinancialReservation(ctx, principal, result.reservation, false, turnRef)
  }
  if (material.financialState === 'outcome_unknown') {
    return { kind: 'replayed', reservation: result.reservation }
  }
  if (material.financialState === 'reserved') return result
  return await attachFormanceReservation(ctx, principal, result, material.booking, turnRef)
}

export async function callHandler(
  ctx: ActionCtx,
  args: CallArgs,
  sourceAlreadyAdmitted = false,
  turnRef?: string,
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
    } catch (cause) {
      currentOperationState = degradeBackend(cause, { kind: 'unavailable' as const }, { site: 'callHandler', reason: 'source_unavailable' })
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
    } catch (cause) {
      currentOperationState = degradeBackend(cause, { kind: 'unsupported' as const }, { site: 'callHandler', reason: 'invalid_response' })
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
        const freeRead = principal.applicationRef !== 'ae-owner-chat'
          && descriptor.consequenceClass === 'read_only'
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
          turnRef,
        )
        if (result.kind !== 'reserved' && result.kind !== 'replayed') return result
        reservedCallRef = result.reservation.callRef
        if (result.kind === 'reserved') reservationWasCreated = true
        else reservationWasReplayed = true
        return result
      },
      abandon: async (abandonment) => {
        try {
          const result = await ctx.runMutation(internal.capabilityCalls.abandon, {
            ...abandonment,
            ...(turnRef === undefined ? {} : { turnRef }),
          })
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
      ...(args.decisionPrice === undefined ? {} : { decisionPrice: args.decisionPrice }),
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
