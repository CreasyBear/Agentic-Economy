import type { CanonicalClaimSnapshot } from '@/modules/action-invocation/runtime'
import type { RouteTransportObservation } from '@/modules/capability-supply/route-transport-runtime'
import type { ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import {
  canonicalPort,
  canonicalTerminalOutcome,
  finalizeOperationDispatch,
  type ChargeSettlementResult,
  type OpenDispatch,
} from '../../../../convex/capabilityOperationInvocationProjection'

export type WorkerResult =
  | Readonly<{ kind: 'recorded' }>
  | Readonly<{ kind: 'none' }>

export async function restoreHoldIfReserved(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
): Promise<ChargeSettlementResult> {
  const reservation = await ctx.runQuery(internal.moneyManagedCallLifecycle.readReservation, {
    invocationRef: dispatch.invocationRef,
  })
  if (reservation === null || reservation.state === 'released' || reservation.state === 'settled') {
    return { kind: 'settled', outcome: 'not_released' }
  }
  if (reservation.state !== 'reserved') return { kind: 'reconciliation_required' }
  const released = await ctx.runAction(internal.moneyManagedCallLifecycle.releaseBeforeSubmission, {
    invocationRef: dispatch.invocationRef,
    now: Date.now(),
  })
  return released.kind === 'accepted'
    ? { kind: 'settled', outcome: 'not_released' }
    : { kind: 'reconciliation_required' }
}

export async function refuseBeforeClaim(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  code: string,
  retryable: boolean,
  nextAction?: string,
): Promise<WorkerResult> {
  const port = canonicalPort(ctx)
  const control = await port.readControl(dispatch.invocationRef)
  const attemptRef = control?.currentAttemptRef
  if (control !== undefined && attemptRef !== undefined) {
    const attempt = await port.readAttempt(dispatch.invocationRef, attemptRef)
    if (attempt !== undefined) {
      const snapshot = { control, attempt }
      if (control.control.control.state === 'leased' && attempt.release.state === 'possibly_released') {
        return await convergeReleaseFenceBeforeGates(ctx, dispatch, snapshot)
      }
      if (control.control.control.state === 'leased') {
        const settlement = await restoreHoldIfReserved(ctx, dispatch)
        return await convergePreRelease(ctx, dispatch, snapshot, code, retryable, nextAction, settlement)
      }
      if (
        control.control.control.state === 'terminal'
        || control.control.control.state === 'reconciliation_required'
        || control.control.control.state === 'cancelled'
      ) return { kind: 'none' }
    }
  }
  await ctx.runMutation(internal.capabilityOperationInvocations.record, {
    invocationRef: dispatch.invocationRef,
    principalId: dispatch.principalId,
    state: 'refused',
    result: {
      kind: 'refused',
      operationRef: dispatch.operationRef,
      code,
      retryable,
      ...(nextAction === undefined ? {} : { nextAction }),
    },
    dispatchState: 'failed',
    now: Date.now(),
  })
  return { kind: 'recorded' }
}

export async function convergeReleaseFenceBeforeGates(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  snapshot: CanonicalClaimSnapshot,
): Promise<WorkerResult> {
  const recordedAt = new Date().toISOString()
  const observation: RouteTransportObservation = {
    transport: 'unknown',
    disposition: 'unknown',
    releaseStarted: true,
    requestDigest: dispatch.inputDigest,
    failureCode: 'release_fence_replay',
  }
  await finalizeOperationDispatch(
    ctx,
    dispatch,
    snapshot,
    canonicalTerminalOutcome(observation, recordedAt),
    {
      state: 'reconciliation_required',
      result: {
        kind: 'reconciliation_required',
        invocationRef: dispatch.invocationRef,
        operationRef: dispatch.operationRef,
        evidence: {
          attemptRef: snapshot.attempt.attemptRef,
          effectGeneration: snapshot.attempt.effectGeneration,
          requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
          retry: 'reconcile_before_retry',
          evidenceSource: `operation:${dispatch.operationRef}`,
        },
      },
      attemptRef: snapshot.attempt.attemptRef,
      dispatchState: 'reconciliation_required',
    },
    recordedAt,
  )
  return { kind: 'recorded' }
}

export async function convergePreRelease(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  snapshot: CanonicalClaimSnapshot,
  code: string,
  retryable: boolean,
  nextAction?: string,
  settlement?: ChargeSettlementResult,
): Promise<WorkerResult> {
  const recordedAt = new Date().toISOString()
  const reconciliation = settlement?.kind === 'reconciliation_required'
  const observation: RouteTransportObservation = reconciliation
    ? {
        transport: 'unknown',
        disposition: 'unknown',
        releaseStarted: true,
        requestDigest: dispatch.inputDigest,
        failureCode: nextAction === undefined ? code : `${code}:${nextAction}`,
      }
    : {
        transport: 'unknown',
        disposition: 'refused',
        releaseStarted: false,
        requestDigest: dispatch.inputDigest,
        failureCode: nextAction === undefined ? code : `${code}:${nextAction}`,
      }
  await finalizeOperationDispatch(
    ctx,
    dispatch,
    snapshot,
    canonicalTerminalOutcome(observation, recordedAt),
    reconciliation
      ? {
          state: 'reconciliation_required',
          result: {
            kind: 'reconciliation_required',
            invocationRef: dispatch.invocationRef,
            operationRef: dispatch.operationRef,
            evidence: {
              attemptRef: snapshot.attempt.attemptRef,
              effectGeneration: snapshot.attempt.effectGeneration,
              requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
              retry: 'reconcile_before_retry',
              evidenceSource: `operation:${dispatch.operationRef}`,
            },
          },
          attemptRef: snapshot.attempt.attemptRef,
          dispatchState: 'reconciliation_required',
        }
      : {
          state: 'refused',
          result: {
            kind: 'refused',
            operationRef: dispatch.operationRef,
            code,
            retryable,
            ...(nextAction === undefined ? {} : { nextAction }),
          },
          attemptRef: snapshot.attempt.attemptRef,
          dispatchState: 'failed',
        },
    recordedAt,
  )
  return { kind: 'recorded' }
}
