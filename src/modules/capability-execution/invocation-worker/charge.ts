import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { CanonicalClaimSnapshot } from '@/modules/action-invocation'
import type { RouteTransportObservation } from '@/modules/capability-supply/route-transport-runtime'
import {
  parsePublishedOperationSnapshot,
  type PublishedOperation,
} from '@/modules/capability-supply/public'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  normalizePricingConfig,
  pricingConfigDigest,
  readExactAmount,
  type ExactAmount,
} from '@/modules/money/public'
import type { ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import {
  canonicalPort,
  canonicalTerminalOutcome,
  finalizeOperationDispatch,
  type ChargeSettlementResult,
  type OpenDispatch,
  type WorkerAcceptedCharge,
} from '../../../../convex/capabilityOperationInvocationProjection'
import type { AuthorizeInvocationChargeArgs } from '../../../../convex/moneyChargeAdmission'

export type WorkerResult =
  | Readonly<{ kind: 'recorded' }>
  | Readonly<{ kind: 'none' }>

type ChargeDispatch = Pick<
  OpenDispatch,
  'invocationRef' | 'principalId' | 'credentialId' | 'inputDigest' | 'operationRef'
>

export async function restoreHoldIfReserved(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  attemptRef: string,
): Promise<ChargeSettlementResult> {
  const operation = parsePublishedOperationSnapshot(dispatch.operationJson)
  if (operation === undefined) return { kind: 'reconciliation_required' }
  return await reconcileAcceptedCharge(
    ctx,
    dispatch,
    operation,
    {
      chargeState: 'paid',
      transactionRef: `operation-money:${dispatch.invocationRef}:${attemptRef}:1`,
    },
    attemptRef,
    'not_released',
  )
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
        const settlement = await restoreHoldIfReserved(ctx, dispatch, attemptRef)
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

export async function reconcileAcceptedCharge(
  ctx: ActionCtx,
  dispatch: ChargeDispatch,
  operation: PublishedOperation,
  charge: Pick<WorkerAcceptedCharge, 'transactionRef' | 'chargeState'>,
  attemptRef: string,
  outcome: 'not_released' | 'released' | 'unknown',
): Promise<ChargeSettlementResult> {
  const transactionRef = charge.transactionRef
  if (transactionRef === undefined) {
    return charge.chargeState === 'free_tier' && outcome !== 'unknown'
      ? { kind: 'settled', outcome }
      : { kind: 'reconciliation_required' }
  }
  const reconciliationDigest = canonicalDigest({
    format: 'operation-money-reconciliation:v1',
    invocationRef: dispatch.invocationRef,
    attemptRef,
    operationRef: dispatch.operationRef,
    inputDigest: dispatch.inputDigest,
    transactionRef,
    outcome,
    sourceDigest: operation.materialDigest,
  } as StableHashValue)
  const evidenceRefs = [
    ...operation.readiness.evidenceRefs,
    `operation-money-reconciliation:${reconciliationDigest}`,
  ]
  const now = Date.now()
  try {
    if (outcome === 'unknown') {
      await ctx.runMutation(internal.moneyLedger.markChargeOutcomeUnknown, {
        transactionRef,
        principalId: dispatch.principalId,
        now,
      })
      return { kind: 'reconciliation_required' }
    }
    const refundTransactionRef = `operation-money-refund:${dispatch.invocationRef}:${attemptRef}:1`
    const result = await ctx.runMutation(internal.moneyLedger.reconcileInvocationCharge, {
      invocationRef: dispatch.invocationRef,
      principalId: dispatch.principalId,
      credentialId: dispatch.credentialId,
      attemptRef,
      transactionRef,
      inputDigest: dispatch.inputDigest,
      outcome,
      refundTransactionRef,
      refundIdempotencyKey: refundTransactionRef,
      refundInputDigest: canonicalDigest({
        format: 'operation-money-refund:v1',
        invocationRef: dispatch.invocationRef,
        attemptRef,
        inputDigest: dispatch.inputDigest,
        transactionRef,
        outcome,
      } as StableHashValue),
      sourceDigest: operation.materialDigest,
      evidenceRefs,
      observedAt: now,
    })
    if (result.kind === 'none' || result.kind === 'settled') {
      return { kind: 'settled', outcome }
    }
    return { kind: 'reconciliation_required' }
  } catch {
    return { kind: 'reconciliation_required' }
  }
}

export async function authorizeAeInternalCharge(
  ctx: ActionCtx,
  input: Readonly<{
    principal: AgentAccessPrincipal
    operation: PublishedOperation
    dispatch: OpenDispatch
    authorityMaximumSpend: ExactAmount
    durableAttemptRef: string
  }>,
): Promise<
  | Readonly<{ kind: 'accepted'; charge: WorkerAcceptedCharge }>
  | Readonly<{ kind: 'missing_billing_identity' }>
  | Readonly<{ kind: 'refused'; code: string; retryable: boolean }>
> {
  const operatorAccountVersion = await ctx.runQuery(internal.moneyLedger.readOperatorAccountVersion, {
    ownerId: input.principal.ownerId,
    currency: input.authorityMaximumSpend.currency,
  })
  if (operatorAccountVersion === null) {
    return { kind: 'missing_billing_identity' }
  }

  const authorizedCharge = await ctx.runMutation(internal.moneyLedger.authorizeInvocationCharge, {
    principalId: input.principal.principalId,
    amount: input.authorityMaximumSpend,
    operatorAccountRef: accountRefForOwner(input.principal.ownerId, input.authorityMaximumSpend.currency),
    providerAccountRef: accountRefForProvider(input.operation.identity.businessId, input.authorityMaximumSpend.currency),
    rakeAccountRef: accountRefForRake(input.authorityMaximumSpend.currency),
    transactionRef: `operation-money:${input.dispatch.invocationRef}:${input.durableAttemptRef}:1`,
    idempotencyKey: `operation-money:${input.dispatch.invocationRef}:${input.durableAttemptRef}:1`,
    inputDigest: input.dispatch.inputDigest,
    expectedAccountVersion: operatorAccountVersion,
    rakeBps: 1_000,
    priceDigest: pricingConfigDigest({ version: 'pricing:v2', unit: 'call', paidAmount: input.authorityMaximumSpend }),
    priceSourceDigest: pricingConfigDigest({ version: 'pricing:v2', unit: 'call', paidAmount: input.authorityMaximumSpend }),
    authorityMaximumSpend: input.authorityMaximumSpend,
    credentialId: input.principal.credentialId,
    credentialBudgetGrantRef: input.dispatch.grantRef,
    credentialBudgetGeneration: input.dispatch.grantGeneration,
    applicationRef: input.principal.applicationRef,
    serviceRef: input.operation.operationId,
    offeringRef: input.operation.identity.offeringId,
    businessId: input.operation.identity.businessId,
    invocationRef: input.dispatch.invocationRef,
    attemptRef: input.durableAttemptRef,
    operationKey: input.dispatch.operationRef,
    sourceDigest: input.operation.materialDigest,
    evidenceRefs: [...input.operation.readiness.evidenceRefs],
    observedAt: Date.now(),
    freeTier: false,
  })
  if (authorizedCharge.kind !== 'accepted') {
    return { kind: 'refused', code: authorizedCharge.code, retryable: authorizedCharge.retryable }
  }
  return { kind: 'accepted', charge: authorizedCharge }
}

type BrokeredChargeArgs = AuthorizeInvocationChargeArgs
type BrokeredChargeDispatch = Pick<
  OpenDispatch,
  | 'invocationRef'
  | 'principalId'
  | 'ownerId'
  | 'credentialId'
  | 'applicationRef'
  | 'grantRef'
  | 'grantGeneration'
  | 'inputDigest'
  | 'operationRef'
>

export type BrokeredChargeReservation = Readonly<{
  charge: WorkerAcceptedCharge
  args: BrokeredChargeArgs
  expectedAccountVersion: number
}>

export async function brokeredChargeReservationForRecovery(
  ctx: ActionCtx,
  input: Readonly<{
    operation: PublishedOperation
    dispatch: BrokeredChargeDispatch
    durableAttemptRef: string
  }>,
): Promise<BrokeredChargeReservation | undefined> {
  const normalized = normalizePricingConfig(input.operation.identity.pricingConfig)
  if (normalized.kind === 'invalid') return undefined
  const amount = readExactAmount(normalized.config.paidAmount)
  if (amount === undefined) return undefined
  const transactionRef = `operation-money:${input.dispatch.invocationRef}:${input.durableAttemptRef}:1`
  const expectedAccountVersion = await ctx.runQuery(
    internal.moneyLedger.readInvocationChargeExpectedAccountVersion,
    { transactionRef },
  )
  if (expectedAccountVersion === null) return undefined
  const args = brokeredChargeArgs({
    principal: {
      principalId: input.dispatch.principalId,
      ownerId: input.dispatch.ownerId,
      credentialId: input.dispatch.credentialId,
      applicationRef: input.dispatch.applicationRef,
    } as AgentAccessPrincipal,
    operation: input.operation,
    dispatch: input.dispatch,
    authorityMaximumSpend: amount,
    durableAttemptRef: input.durableAttemptRef,
    expectedAccountVersion,
  })
  if (args === undefined) return undefined
  return {
    args,
    expectedAccountVersion,
    charge: {
      kind: 'accepted',
      chargeState: 'paid',
      amount,
      priceDigest: args.priceDigest,
      transactionRef: args.transactionRef,
      providerNet: normalized.config.providerAmount,
      rake: normalized.config.platformFee,
      usageRef: `${input.dispatch.invocationRef}:${input.durableAttemptRef}:${input.dispatch.operationRef}`,
      observedAt: args.observedAt,
    },
  }
}

function brokeredChargeArgs(
  input: Readonly<{
    principal: AgentAccessPrincipal
    operation: PublishedOperation
    dispatch: BrokeredChargeDispatch
    authorityMaximumSpend: ExactAmount
    durableAttemptRef: string
    expectedAccountVersion: number
  }>,
): BrokeredChargeArgs | undefined {
  const normalized = normalizePricingConfig(input.operation.identity.pricingConfig)
  if (normalized.kind === 'invalid') return undefined
  const amount = readExactAmount(normalized.config.paidAmount)
  if (amount === undefined) return undefined
  const priceDigest = pricingConfigDigest(normalized.config)
  return {
    principalId: input.principal.principalId,
    amount,
    operatorAccountRef: accountRefForOwner(input.principal.ownerId, amount.currency),
    providerAccountRef: accountRefForProvider(input.operation.identity.businessId, amount.currency),
    rakeAccountRef: accountRefForRake(amount.currency),
    transactionRef: `operation-money:${input.dispatch.invocationRef}:${input.durableAttemptRef}:1`,
    idempotencyKey: `operation-money:${input.dispatch.invocationRef}:${input.durableAttemptRef}:1`,
    inputDigest: input.dispatch.inputDigest,
    expectedAccountVersion: input.expectedAccountVersion,
    rakeBps: 1_000,
    priceDigest,
    priceSourceDigest: priceDigest,
    authorityMaximumSpend: input.authorityMaximumSpend,
    credentialId: input.principal.credentialId,
    applicationRef: input.principal.applicationRef,
    serviceRef: input.operation.operationId,
    offeringRef: input.operation.identity.offeringId,
    businessId: input.operation.identity.businessId,
    invocationRef: input.dispatch.invocationRef,
    attemptRef: input.durableAttemptRef,
    operationKey: input.dispatch.operationRef,
    sourceDigest: input.operation.materialDigest,
    evidenceRefs: [...input.operation.readiness.evidenceRefs],
    observedAt: Date.now(),
    freeTier: false,
    credentialBudgetGrantRef: input.dispatch.grantRef,
    credentialBudgetGeneration: input.dispatch.grantGeneration,
  }
}

export async function reserveBrokeredInvocationCharge(
  ctx: ActionCtx,
  input: Readonly<{
    principal: AgentAccessPrincipal
    operation: PublishedOperation
    dispatch: OpenDispatch
    authorityMaximumSpend: ExactAmount
    durableAttemptRef: string
  }>,
): Promise<
  | Readonly<{ kind: 'accepted'; reservation: BrokeredChargeReservation }>
  | Readonly<{ kind: 'missing_billing_identity' }>
  | Readonly<{ kind: 'refused'; code: string; retryable: boolean }>
> {
  const normalized = normalizePricingConfig(input.operation.identity.pricingConfig)
  if (normalized.kind === 'invalid') {
    return { kind: 'refused', code: normalized.code, retryable: false }
  }
  const amount = readExactAmount(normalized.config.paidAmount)
  if (amount === undefined) return { kind: 'refused', code: 'price_unavailable', retryable: false }
  const operatorAccountVersion = await ctx.runQuery(internal.moneyLedger.readOperatorAccountVersion, {
    ownerId: input.principal.ownerId,
    currency: amount.currency,
  })
  if (operatorAccountVersion === null) return { kind: 'missing_billing_identity' }
  const args = brokeredChargeArgs({ ...input, expectedAccountVersion: operatorAccountVersion })
  if (args === undefined) return { kind: 'refused', code: 'price_unavailable', retryable: false }
  const result = await ctx.runMutation(internal.moneyLedger.reserveBrokeredInvocationCharge, args)
  if (result.kind !== 'accepted') {
    return { kind: 'refused', code: result.code, retryable: result.retryable }
  }
  return {
    kind: 'accepted',
    reservation: {
      charge: result,
      args,
      expectedAccountVersion: operatorAccountVersion,
    },
  }
}

export async function releaseBrokeredInvocationCharge(
  ctx: ActionCtx,
  reservation: BrokeredChargeReservation,
  reconciliationEvidenceRefs?: readonly string[],
): Promise<ChargeSettlementResult> {
  try {
    const result = await ctx.runMutation(internal.moneyLedger.releaseBrokeredInvocationCharge, {
      ...reservation.args,
      ...(reconciliationEvidenceRefs === undefined
        ? {}
        : { reconciliationEvidenceRefs: [...reconciliationEvidenceRefs] }),
    })
    return result.kind === 'released'
      ? { kind: 'settled', outcome: 'not_released' }
      : { kind: 'reconciliation_required' }
  } catch {
    return { kind: 'reconciliation_required' }
  }
}

export async function recordBrokeredInvalidOutputLoss(
  ctx: ActionCtx,
  reservation: BrokeredChargeReservation,
  input: Readonly<{
    externalRef: string
    invalidOutputEvidenceRef: string
    invalidOutputEvidenceDigest: string
    reconciliationEvidenceRefs: readonly string[]
  }>,
): Promise<
  | Readonly<{ kind: 'settled'; lossTransactionRef: string }>
  | Readonly<{ kind: 'reconciliation_required' }>
> {
  if (
    input.externalRef.trim().length === 0
    || input.invalidOutputEvidenceRef.trim().length === 0
    || input.invalidOutputEvidenceDigest.trim().length === 0
    || input.reconciliationEvidenceRefs.length === 0
    || input.reconciliationEvidenceRefs.some((ref) => ref.trim().length === 0)
  ) return { kind: 'reconciliation_required' }
  try {
    const result = await ctx.runMutation(internal.moneyLedger.recordBrokeredInvalidOutputLoss, {
      ...reservation.args,
      externalRef: input.externalRef,
      invalidOutputEvidenceRef: input.invalidOutputEvidenceRef,
      invalidOutputEvidenceDigest: input.invalidOutputEvidenceDigest,
      reconciliationEvidenceRefs: [...input.reconciliationEvidenceRefs],
    })
    return result.kind === 'settled'
      ? { kind: 'settled', lossTransactionRef: result.lossTransactionRef }
      : { kind: 'reconciliation_required' }
  } catch {
    return { kind: 'reconciliation_required' }
  }
}

export async function markBrokeredInvocationChargeOutcomeUnknown(
  ctx: ActionCtx,
  reservation: BrokeredChargeReservation,
): Promise<ChargeSettlementResult> {
  try {
    const result = await ctx.runMutation(internal.moneyLedger.markBrokeredInvocationChargeOutcomeUnknown, reservation.args)
    return result.kind === 'outcome_unknown'
      ? { kind: 'reconciliation_required' }
      : { kind: 'reconciliation_required' }
  } catch {
    return { kind: 'reconciliation_required' }
  }
}

export async function finalizeBrokeredInvocationCharge(
  ctx: ActionCtx,
  reservation: BrokeredChargeReservation,
  externalRef: string,
  reconciliationEvidenceRefs?: readonly string[],
): Promise<ChargeSettlementResult> {
  if (externalRef.trim().length === 0) return { kind: 'reconciliation_required' }
  try {
    const result = await ctx.runMutation(internal.moneyLedger.finalizeBrokeredInvocationCharge, {
      ...reservation.args,
      externalRef,
      ...(reconciliationEvidenceRefs === undefined
        ? {}
        : { reconciliationEvidenceRefs: [...reconciliationEvidenceRefs] }),
    })
    return result.kind === 'accepted'
      ? { kind: 'settled', outcome: 'released' }
      : { kind: 'reconciliation_required' }
  } catch {
    return { kind: 'reconciliation_required' }
  }
}
