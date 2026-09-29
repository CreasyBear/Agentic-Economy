import type { ActionCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { pricingConfigDecisionAmount, pricingConfigDigest } from '@/modules/money/public'
import type { Infer } from 'convex/values'
import { usageValue } from '@/modules/capability-execution/convex'
import type { CanonicalClaimSnapshot } from '@/modules/capability-execution/convex'
import type { RouteTransportObservation } from '@/modules/capability-supply/route-transport-runtime'
import type { PublishedTool, RuntimePublishedToolDescriptor } from '@/modules/capability-supply/public'
import { parseContractOutput } from '@/modules/capability-execution/convex'
import type { OpenDispatch, WorkerAcceptedCharge, ChargeSettlementResult, ContractOutputValidation } from '@/modules/capability-execution/convex'
import { canonicalTerminalOutcome } from '@/modules/capability-execution/convex'
import { canonicalPort, readCanonicalSnapshot } from './port'
import { finalizeCallDispatch } from './dispatch'

export async function projectOuterResult(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  operation: PublishedTool,
  descriptor: RuntimePublishedToolDescriptor,
  observation: RouteTransportObservation,
  recordedAt: string,
  money?: WorkerAcceptedCharge,
  settlement?: ChargeSettlementResult,
  attemptRef = `operation-attempt:${dispatch.callRef}:1`,
  effectGeneration = 1,
  validatedOutput?: ContractOutputValidation,
  retainedSnapshot?: CanonicalClaimSnapshot,
): Promise<void> {
  const outputValidation = validatedOutput ?? parseContractOutput(observation, descriptor)
  const snapshot = retainedSnapshot ?? await readCanonicalSnapshot(canonicalPort(ctx), dispatch.callRef, attemptRef)
  if (snapshot === undefined) throw new Error('operation_terminal_snapshot_missing')
  const settlementOutcome = settlement?.kind === 'settled'
    ? settlement.outcome
    : settlement?.kind === 'reconciliation_required'
      ? 'unknown'
      : undefined
  const requiresReconciliation = (
    settlement?.kind === 'reconciliation_required'
    || observation.disposition === 'unknown'
    || observation.disposition === 'partial'
    || (
      outputValidation.valid
      && observation.releaseStarted
      && (settlement?.kind !== 'settled' || settlement.outcome !== 'released')
    )
    || (outputValidation.valid && observation.outputJson === undefined)
    || (
      observation.releaseStarted
      && !outputValidation.valid
      && (settlement?.kind !== 'settled' || settlement.outcome !== 'not_released')
    )
  )
  if (requiresReconciliation) {
    await finalizeCallDispatch(
      ctx,
      dispatch,
      snapshot,
      canonicalTerminalOutcome(
        observation,
        recordedAt,
        outputValidation.valid,
        settlementOutcome,
      ),
      {
        state: 'reconciliation_required',
        result: {
          kind: 'reconciliation_required',
          callRef: dispatch.callRef,
          toolRef: dispatch.toolRef,
          evidence: {
            attemptRef,
            effectGeneration,
            requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
            retry: 'reconcile_before_retry',
            evidenceSource: `operation:${dispatch.toolRef}`,
          },
        },
        attemptRef,
        dispatchState: 'reconciliation_required',
      },
      recordedAt,
    )
    return
  }
  if (outputValidation.valid && observation.outputJson !== undefined && settlement?.kind === 'settled' && settlement.outcome === 'released' && observation.releaseStarted) {
    const evidenceHash = observation.responseDigest ?? canonicalDigest(observation.outputJson)
    const fixedPriceAmount = pricingConfigDecisionAmount(operation.pricingConfig)
    const usage: Infer<typeof usageValue> | undefined = money === undefined
      ? fixedPriceAmount === undefined
        ? undefined
        : {
            usageRef: `operation-usage:${dispatch.callRef}:${attemptRef}`,
            observedAt: Date.parse(recordedAt),
            chargeState: fixedPriceAmount.units === '0'
              ? 'free_tier' as const
              : 'paid' as const,
            amount: fixedPriceAmount,
            priceDigest: pricingConfigDigest({
              version: 'pricing:v3',
              kind: 'fixed_aud',
              currency: 'AUD',
              exponent: 6,
              amountUnits: fixedPriceAmount.units,
            }),
          }
      : {
          usageRef: money.usageRef,
          observedAt: money.observedAt,
          chargeState: money.chargeState,
          amount: money.amount,
          priceDigest: money.priceDigest,
          ...(money.transactionRef === undefined ? {} : { transactionRef: money.transactionRef }),
        }
    if (usage === undefined) {
      await finalizeCallDispatch(
        ctx,
        dispatch,
        snapshot,
        canonicalTerminalOutcome({
          transport: 'unknown',
          disposition: 'unknown',
          releaseStarted: true,
          requestDigest: observation.requestDigest,
          failureCode: 'usage_missing',
        }, recordedAt),
        {
          state: 'reconciliation_required',
          result: {
            kind: 'reconciliation_required',
            callRef: dispatch.callRef,
            toolRef: dispatch.toolRef,
            evidence: {
              attemptRef,
              effectGeneration,
              requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
              retry: 'reconcile_before_retry',
              evidenceSource: `operation:${dispatch.toolRef}`,
            },
          },
          attemptRef,
          dispatchState: 'reconciliation_required',
        },
        recordedAt,
      )
      return
    }
    await finalizeCallDispatch(
      ctx,
      dispatch,
      snapshot,
      canonicalTerminalOutcome(observation, recordedAt, true, settlementOutcome),
      {
        state: 'completed',
        result: {
          kind: 'completed',
          callRef: dispatch.callRef,
          toolRef: dispatch.toolRef,
          output: outputValidation.output,
          evidenceHash,
          usage,
        },
        usage,
        evidenceHash,
        attemptRef,
        dispatchState: 'completed',
      },
      recordedAt,
    )
    return
  }
  await finalizeCallDispatch(
    ctx,
    dispatch,
    snapshot,
    canonicalTerminalOutcome(observation, recordedAt, outputValidation.valid, settlementOutcome),
    {
      state: 'refused',
      result: {
        kind: 'refused',
        toolRef: dispatch.toolRef,
        code: observation.failureCode ?? 'provider_refused',
        retryable: false,
      },
      attemptRef,
      dispatchState: 'failed',
    },
    recordedAt,
  )
}
