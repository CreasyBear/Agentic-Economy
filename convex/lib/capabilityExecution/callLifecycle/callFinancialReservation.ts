import type { ActionCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type {
  CallIdempotencyReservation,
  CallPortRefusal,
  CallRuntime,
} from '@/modules/capability-execution/call-authority'
import type { ReserveArgs } from './admissionReservation'

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

export async function reserveFormanceBackedInvocation(
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
