import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { Infer } from 'convex/values'
import type {
  CallDispatchCommand,
  CallDispatchProjection,
} from './lib/callLifecycle/contracts'
import type { RouteTransportObservation } from '@/modules/capability-supply/route-transport-runtime'
import { transportObservationDigest } from '@/modules/capability-supply/public'
import {
  pricingConfigDecisionAmount,
  pricingConfigDigest,
  type ExactAmount,
  type MoneyAcceptedCallCharge,
} from '@/modules/money/public'
import type {
  PublishedTool,
  RuntimePublishedToolDescriptor,
} from '@/modules/capability-supply/public'
import {
  callResultValue,
  callReceiptValue,
  recoveryResultValue,
  usageValue,
  buildCanonicalTerminalOutcomeCommand,
  buildSellerOnboardingCanaryReceipt,
  type CanonicalClaimSnapshot,
  type CanonicalTerminalOutcome,
  type DurableActionExecutionPort,
  type CallPersistedAuthority,
  type PublicExecutionStatus,
} from '@/modules/capability-execution/convex'
import {
  callReceiptPaymentProfile,
  type CallResult,
} from '@/modules/capability-execution/call-contracts'
import type { ActionCtx } from './_generated/server'
import { internal } from './_generated/api'
import type { SellerOnboardingCanaryExecutionEnvelope } from '@/modules/capability-execution'

export type OpenDispatch = Readonly<{
  committedPaymentRequiredJson?: string
  sourceUsdcUnits?: string
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
  idempotencyKey: string
  inputDigest: string
  requestDigest: string
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  grantRef: string
  toolJson: string
  inputJson: string
  workId?: string
  attemptRef?: string
  dispatchState?: 'enqueued' | 'running' | 'completed' | 'failed' | 'reconciliation_required'
  authority?: CallPersistedAuthority
}>

export type ContractOutputValidation =
  | Readonly<{ valid: false }>
  | Readonly<{ valid: true; output: StableHashValue }>

export type ChargeSettlementResult =
  | Readonly<{
      kind: 'settled'
      outcome: 'not_released' | 'released'
      externalSettlementRef?: string
      settlementTransactionHash?: string
      paymentIdentifier?: string
      accountingTransactionRefs?: readonly string[]
      refundState?: 'released' | 'not_applicable' | 'unknown'
      lossState?: 'none' | 'provider_output_invalid' | 'unknown'
    }>
  | Readonly<{
      kind: 'reconciliation_required'
      paymentIdentifier?: string
      accountingTransactionRefs?: readonly string[]
      refundState?: 'unknown'
      lossState?: 'unknown'
    }>

export type WorkerAcceptedCharge = Omit<MoneyAcceptedCallCharge, 'transactionRef' | 'providerNet' | 'rake'> & Readonly<{
  transactionRef?: string | undefined
  providerNet?: ExactAmount | undefined
  rake?: ExactAmount | undefined
}>

export type CanonicalPort = Pick<
  DurableActionExecutionPort<CallResult>,
  'transact' | 'readControl' | 'readAttempt' | 'readAttempts' | 'readHistory' | 'readHistoryCommand' | 'recordLateObservation'
>

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
  toolJson: string
  inputJson: string
  result?: Infer<typeof callResultValue>
  usage?: Infer<typeof usageValue>
  evidenceHash?: string
  attemptRef?: string
  updatedAt: number
}>

type WorkerRecoveryResult = Infer<typeof recoveryResultValue>

type RecoveryAttempt = Readonly<{
  attemptRef: string
  effectGeneration: number
  outcome: Readonly<{ state: string; reconciliationRequiredAt?: string }>
}>

type RecoveryOuterProjectionOptions = Readonly<{
  clearResult?: boolean
  clearWorkId?: boolean
  clearAttemptRef?: boolean
  clearEvidenceHash?: boolean
  clearDispatchState?: boolean
}>

export function toCallDispatchCommand(
  command: Parameters<DurableActionExecutionPort<CallResult>['transact']>[0],
): CallDispatchCommand {
  const { commandId, commandDigest, expectedExecutionVersion, expectedEffectGeneration, row, currentAttemptWrite, history } = command
  return {
    commandId,
    commandDigest,
    expectedExecutionVersion,
    ...(expectedEffectGeneration === undefined ? {} : { expectedEffectGeneration }),
    row: {
      ...row,
      control: {
        ...row.control,
        control: row.control.control.state === 'gathering_information'
          ? { ...row.control.control, missingFields: [...row.control.control.missingFields] }
          : row.control.control,
      },
    },
    ...(currentAttemptWrite === undefined ? {} : { currentAttemptWrite }),
    history,
  }
}

export function canonicalPort(ctx: ActionCtx): CanonicalPort {
  return {
    transact: async (command: Parameters<DurableActionExecutionPort<CallResult>['transact']>[0]) => {
      const { commandId, commandDigest, expectedExecutionVersion, expectedEffectGeneration, row, currentAttemptWrite, history } = command
      const mutableRow = {
        ...row,
        control: {
          ...row.control,
          control: row.control.control.state === 'gathering_information'
            ? { ...row.control.control, missingFields: [...row.control.control.missingFields] }
            : row.control.control,
        },
      }
      return await ctx.runMutation(internal.actionExecutionControl.transact, {
        commandId,
        commandDigest,
        expectedExecutionVersion,
        ...(expectedEffectGeneration === undefined ? {} : { expectedEffectGeneration }),
        row: mutableRow,
        ...(currentAttemptWrite === undefined ? {} : { currentAttemptWrite }),
        history,
      })
    },
    readControl: async (executionRef) => await ctx.runQuery(internal.actionExecutionControl.readControl, { executionRef }) ?? undefined,
    readAttempt: async (executionRef, attemptRef) => await ctx.runQuery(internal.actionExecutionControl.readAttempt, { executionRef, attemptRef }) ?? undefined,
    readAttempts: async (executionRef, limit) => await ctx.runQuery(internal.actionExecutionControl.readAttempts, { executionRef, limit }),
    readHistory: async (executionRef, afterVersion, limit) => await ctx.runQuery(internal.actionExecutionControl.readHistory, { executionRef, afterVersion, limit }),
    readHistoryCommand: async (executionRef, commandId) => await ctx.runQuery(internal.actionExecutionControl.readHistoryCommand, { executionRef, commandId }) ?? undefined,
    recordLateObservation: async (input) => await ctx.runMutation(internal.actionExecutionControl.recordLateObservation, { ...input, recordedAt: new Date().toISOString() }),
  }
}

export function recoveryNotFound(callRef: string): WorkerRecoveryResult {
  return { kind: 'refused', callRef, code: 'invocation_not_found', retryable: false }
}

export function projectPureCallStatus(
  row: RecoveryRow,
  status: PublicExecutionStatus,
): WorkerRecoveryResult {
  const latestAttempt = status.attempts.at(-1)
  const attemptRef = latestAttempt?.attemptRef ?? row.attemptRef
  const effectGeneration = latestAttempt?.effectGeneration
  const staleResult = (
    status.control === 'retryable'
    || (status.control === 'reconciliation_required' && row.result?.kind !== 'reconciliation_required')
    || (status.control === 'terminal' && row.result?.kind === 'pending')
    || (status.control === 'cancelled' && row.result?.kind === 'pending')
  )
  const projectedResult = staleResult ? undefined : row.result
  const receipt = projectedResult !== undefined && 'receipt' in projectedResult
    ? projectedResult.receipt
    : undefined
  return {
    kind: 'found',
    callRef: row.callRef,
    version: row.updatedAt,
    toolRef: row.toolRef,
    state: status.control,
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(attemptRef === undefined ? {} : { attemptRef }),
    ...(effectGeneration === undefined ? {} : { effectGeneration }),
    ...(receipt === undefined ? {} : { receipt }),
    ...(projectedResult === undefined ? {} : { result: projectedResult }),
  }
}

export function cancelledRecoveryResult(row: RecoveryRow): WorkerRecoveryResult {
  return {
    kind: 'found',
    callRef: row.callRef,
    version: row.updatedAt,
    toolRef: row.toolRef,
    state: 'cancelled',
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    result: {
      kind: 'refused',
      toolRef: row.toolRef,
      code: 'invocation_cancelled',
      retryable: false,
    },
  }
}

export function retryableRecoveryResult(
  row: RecoveryRow,
  receipt?: Infer<typeof callReceiptValue>,
): WorkerRecoveryResult {
  return {
    kind: 'found',
    callRef: row.callRef,
    version: row.updatedAt,
    toolRef: row.toolRef,
    state: 'retryable',
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(receipt === undefined ? {} : { receipt }),
  }
}

export function projectPersistedRecovery(
  row: RecoveryRow,
  state = row.state,
): WorkerRecoveryResult {
  const effectGeneration = row.result?.kind === 'reconciliation_required'
    ? row.result.evidence.effectGeneration
    : undefined
  const projectedResult = state === 'cancelled' && row.result?.kind === 'pending'
    ? undefined
    : row.result
  const receipt = projectedResult !== undefined && 'receipt' in projectedResult
    ? projectedResult.receipt
    : undefined
  const publicState: PublicExecutionStatus['control'] = state === 'pending'
    ? row.result?.kind === 'needs_authority'
      ? 'awaiting_authority'
      : row.result?.kind === 'reconciliation_required'
        ? 'reconciliation_required'
        : 'in_progress'
    : state === 'reconciliation_required'
      ? 'reconciliation_required'
      : state === 'cancelled'
        ? 'cancelled'
        : 'terminal'
  return {
    kind: 'found',
    callRef: row.callRef,
    version: row.updatedAt,
    toolRef: row.toolRef,
    state: publicState,
    ...(effectGeneration === undefined ? {} : { effectGeneration }),
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    ...(receipt === undefined ? {} : { receipt }),
    ...(projectedResult === undefined ? {} : { result: projectedResult }),
  }
}

function recoveryOuterState(
  row: RecoveryRow,
  status: Readonly<{ state: string }>,
): 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled' {
  if (status.state === 'cancelled') return 'cancelled'
  if (status.state === 'reconciliation_required') return 'reconciliation_required'
  return row.state === 'completed' ? 'completed' : 'pending'
}

export function reconciliationResult(
  row: RecoveryRow,
  status: PublicExecutionStatus,
  attemptRows: readonly RecoveryAttempt[],
  operationId: string,
  receipt?: Infer<typeof callReceiptValue>,
): WorkerRecoveryResult {
  const currentAttemptRef = status.attempts.at(-1)?.attemptRef ?? row.attemptRef
  const attempt = attemptRows.find(({ attemptRef }) => attemptRef === currentAttemptRef) ?? attemptRows.at(-1)
  const requiredAt = attempt?.outcome.state === 'uncertain' || attempt?.outcome.state === 'timed_out'
    ? attempt.outcome.reconciliationRequiredAt ?? new Date().toISOString()
    : new Date().toISOString()
  return {
    kind: 'reconciliation_required',
    callRef: row.callRef,
    toolRef: row.toolRef,
    evidence: {
      attemptRef: attempt?.attemptRef ?? currentAttemptRef ?? `operation-attempt:${row.callRef}:1`,
      effectGeneration: attempt?.effectGeneration ?? 1,
      requiredAt,
      retry: 'reconcile_before_retry',
      evidenceSource: `published-tool:${operationId}`,
    },
    ...(receipt === undefined ? {} : { receipt }),
  }
}

export async function projectRecoveryOuter(
  ctx: ActionCtx,
  row: RecoveryRow,
  result: WorkerRecoveryResult,
  stateOverride: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled' | undefined,
  options: RecoveryOuterProjectionOptions = {},
): Promise<void> {
  const state = stateOverride ?? (
    result.kind === 'found' && typeof result.state === 'string'
      ? recoveryOuterState(row, { state: result.state })
      : row.state
  )
  const clearResult = options.clearResult === true
    || (
      state === 'cancelled'
      && result.kind === 'found'
      && result.result === undefined
      && row.result?.kind === 'pending'
    )
  const clearWorkId = options.clearWorkId === true
  const clearAttemptRef = options.clearAttemptRef === true
  const clearEvidenceHash = options.clearEvidenceHash === true
  const clearDispatchState = options.clearDispatchState === true
  const projectedResult = clearResult
    ? undefined
    : result.kind === 'found' && result.result !== undefined
      ? result.result
      : result.kind === 'reconciliation_required'
      ? {
            kind: 'reconciliation_required' as const,

            callRef: result.callRef,
            toolRef: result.toolRef,
            evidence: result.evidence,
            ...(result.receipt === undefined ? {} : { receipt: result.receipt }),
          }
        : undefined
  const projectedDispatchState = clearDispatchState
    ? undefined
    : state === 'cancelled' || state === 'refused'
      ? 'failed' as const
      : state === 'reconciliation_required'
        ? 'reconciliation_required' as const
        : state === 'completed'
          ? 'completed' as const
          : 'running' as const
  await ctx.runMutation(internal.capabilityCalls.projectRecovery, {
    callRef: row.callRef,
    principalId: row.principalId,
    state,
    ...(projectedResult === undefined ? {} : { result: projectedResult }),
    ...(clearAttemptRef ? {} : result.kind === 'found' && typeof result.attemptRef === 'string' ? { attemptRef: result.attemptRef } : {}),
    ...(projectedDispatchState === undefined ? {} : { dispatchState: projectedDispatchState }),
    clearResult,
    clearWorkId,
    clearAttemptRef,
    clearEvidenceHash,
    clearDispatchState,
    now: Date.now(),
  })
}

export async function readCanonicalSnapshot(port: CanonicalPort, callRef: string, attemptRef: string): Promise<CanonicalClaimSnapshot | undefined> {
  const control = await port.readControl(callRef)
  if (control === undefined || control.currentAttemptRef !== attemptRef) return undefined
  const attempt = await port.readAttempt(callRef, attemptRef)
  return attempt === undefined ? undefined : { control, attempt }
}

export async function finalizeCallDispatch(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  snapshot: CanonicalClaimSnapshot,
  outcome: CanonicalTerminalOutcome,
  projection: CallDispatchProjection,
  recordedAt: string,
): Promise<void> {
  const command = buildCanonicalTerminalOutcomeCommand({ snapshot, outcome, recordedAt })
  const persistedCommand = toCallDispatchCommand(command)
  const result = await ctx.runMutation(internal.capabilityCalls.finalizeDispatch, {
    dispatch,
    command: persistedCommand,
    projection,
  })
  if (result.kind === 'refused') throw new Error(`operation_finalize_${result.code}`)
}

export async function projectReconciliationRequired(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  attemptRef: string,
  recordedAt: string,
  effectGeneration = 1,
): Promise<void> {
  await ctx.runMutation(internal.capabilityCalls.record, {
    callRef: dispatch.callRef,
    principalId: dispatch.principalId,
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
    now: Date.now(),
  })
}

export function parseContractOutput(
  observation: RouteTransportObservation,
  descriptor: RuntimePublishedToolDescriptor,
): ContractOutputValidation {
  if (observation.disposition !== 'succeeded' || observation.outputJson === undefined) return { valid: false }
  try {
    const output: unknown = JSON.parse(observation.outputJson)
    return isBoundedJsonValue(output) && descriptor.validateOutput(output)
      ? { valid: true, output }
      : { valid: false }
  } catch {
    return { valid: false }
  }
}

export function canonicalTerminalOutcome(
  observation: RouteTransportObservation,
  recordedAt: string,
  contractValidOutput = true,
  deliveryOutcome?: 'not_released' | 'released' | 'unknown',
): CanonicalTerminalOutcome {
  const evidenceDigest = transportObservationDigest(observation)
  if (deliveryOutcome === 'unknown') {
    return {
      kind: 'uncertain',
      errorDigest: evidenceDigest,
      reconciliationRequiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
      release: 'possibly_released',
    }
  }
  if (
    deliveryOutcome === 'not_released'
    && observation.disposition === 'succeeded'
    && !contractValidOutput
  ) {
    return { kind: 'failed', errorDigest: evidenceDigest, release: 'not_released' }
  }
  if (
    observation.disposition === 'succeeded'
    && observation.outputJson !== undefined
    && contractValidOutput
    && !observation.releaseStarted
  ) {
    return { kind: 'failed', errorDigest: evidenceDigest, release: 'not_released' }
  }
  if (
    observation.disposition === 'succeeded'
    && observation.outputJson !== undefined
    && contractValidOutput
  ) {
    return {
      kind: 'returned',
      businessOutcome: 'operation_succeeded',
      resultRef: `operation-result:v1:${evidenceDigest}`,
      resultDigest: evidenceDigest,
      resultReferenceable: true,
      release: 'released',
    }
  }
  if (
    observation.disposition === 'succeeded'
    && observation.outputJson !== undefined
    && !contractValidOutput
    && !observation.releaseStarted
  ) {
    return { kind: 'failed', errorDigest: evidenceDigest, release: 'not_released' }
  }
  if (observation.disposition === 'refused' && !observation.releaseStarted) {
    return { kind: 'failed', errorDigest: evidenceDigest, release: 'not_released' }
  }
  return {
    kind: 'uncertain',
    errorDigest: evidenceDigest,
    reconciliationRequiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
    release: 'possibly_released',
  }
}

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
    await ctx.runMutation(internal.qualifiedUse.recordQualifiedUse, {
      callRef: dispatch.callRef,
      attemptRef,
      effectGeneration,
      businessId: operation.identity.businessId,
      toolRef: dispatch.toolRef,
      publicationRef: operation.identity.publicationRef,
      publicationRevision: operation.identity.publicationRevision,
      contractDigest: operation.identity.contractDigest,
      bindingDigest: operation.identity.bindingDigest,
      principalClass: 'agent_key',
      requestDigest: observation.requestDigest,
      responseDigest: evidenceHash,
      evidenceRefs: [`operation:${dispatch.toolRef}`, `attempt:${attemptRef}`],
      principalId: dispatch.principalId,
      environment: dispatch.environment,
      qualifiedAt: Date.parse(recordedAt),
      usageRef: usage.usageRef,
      ...(usage.transactionRef === undefined ? {} : { transactionRef: usage.transactionRef }),
    })
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

/**
 * Finalize the internal seller-onboarding canary without inventing a buyer
 * usage event. Package 4 refuses its retired payment lane before financial
 * submission, so this projector records no qualified use or financial state.
 */
export async function projectSellerOnboardingCanaryResult(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  operation: PublishedTool,
  descriptor: RuntimePublishedToolDescriptor,
  observation: RouteTransportObservation,
  recordedAt: string,
  settlement: ChargeSettlementResult,
  attemptRef: string,
  effectGeneration: number,
  validatedOutput: ContractOutputValidation,
  retainedSnapshot: CanonicalClaimSnapshot,
): Promise<void> {
  const canary = dispatch.sellerOnboardingCanary
  const payment = operation.identity.payment
  const profile = payment.kind === 'x402'
    ? callReceiptPaymentProfile(
        dispatch.environment,
        payment.network,
        payment.asset,
      )
    : undefined
  if (
    canary === undefined
    || dispatch.environment !== 'sandbox'
    || profile === undefined
    || profile.network !== 'eip155:84532'
    || pricingConfigDecisionAmount(operation.pricingConfig) !== undefined
  ) throw new Error('seller_canary_projection_identity_invalid')

  const evidenceHash = observation.responseDigest
    ?? (observation.outputJson === undefined
      ? transportObservationDigest(observation)
      : canonicalDigest(observation.outputJson))
  const settled = settlement.kind === 'settled' ? settlement : undefined
  const knownSettled = settled?.outcome === 'released'
    && settled.externalSettlementRef !== undefined
    && settled.settlementTransactionHash !== undefined
    && settled.paymentIdentifier !== undefined
  const knownNotSettled = settled?.outcome === 'not_released'
    && observation.releaseStarted === false
  const receipt = buildSellerOnboardingCanaryReceipt({
    canary,
    operation,
    callRef: dispatch.callRef,
    toolRef: dispatch.toolRef,
    attemptRef,
    state: knownSettled
      ? 'settled'
      : knownNotSettled
        ? 'refunded'
        : 'reconciliation_required',
    providerQuotedAmount: canary.funding.requestedSpend,
    ...(settlement.paymentIdentifier === undefined
      ? {}
      : { paymentIdentifier: settlement.paymentIdentifier }),
    ...(settled?.settlementTransactionHash === undefined
      ? {}
      : { settlementTransactionHash: settled.settlementTransactionHash }),
    ...(settled?.externalSettlementRef === undefined
      ? {}
      : { externalSettlementRef: settled.externalSettlementRef }),
    refundState: knownSettled ? 'not_applicable' : knownNotSettled ? 'released' : 'unknown',
    lossState: knownSettled
      ? validatedOutput.valid ? 'none' : 'provider_output_invalid'
      : knownNotSettled ? 'none' : 'unknown',
    evidenceHash,
    issuedAt: recordedAt,
  })
  if (receipt === undefined) throw new Error('seller_canary_receipt_identity_invalid')
  const successful = knownSettled
    && validatedOutput.valid
    && observation.disposition === 'succeeded'
    && observation.outputJson !== undefined
    && observation.releaseStarted
  if (successful) {
    await finalizeCallDispatch(
      ctx,
      dispatch,
      retainedSnapshot,
      canonicalTerminalOutcome(observation, recordedAt, true, 'released'),
      {
        state: 'completed',
        result: {
          kind: 'completed',
          callRef: dispatch.callRef,
          toolRef: dispatch.toolRef,
          output: validatedOutput.output,
          evidenceHash,
          receipt,
        },
        evidenceHash,
        attemptRef,
        dispatchState: 'completed',
      },
      recordedAt,
    )
    return
  }

  const ambiguous = settlement.kind === 'reconciliation_required'
    || (!knownSettled && !knownNotSettled)
    || observation.disposition === 'unknown'
    || observation.disposition === 'partial'
  if (ambiguous) {
    await finalizeCallDispatch(
      ctx,
      dispatch,
      retainedSnapshot,
      canonicalTerminalOutcome({
        ...observation,
        disposition: 'unknown',
        releaseStarted: true,
      }, recordedAt, validatedOutput.valid, 'unknown'),
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
            evidenceSource: `seller-canary:${canary.canaryRef}`,
          },
          receipt,
        },
        evidenceHash,
        attemptRef,
        dispatchState: 'reconciliation_required',
      },
      recordedAt,
    )
    return
  }

  const paidButInvalid = knownSettled && !validatedOutput.valid
  await finalizeCallDispatch(
    ctx,
    dispatch,
    retainedSnapshot,
    paidButInvalid
      ? {
          kind: 'returned',
          businessOutcome: 'seller_onboarding_canary_output_invalid',
          resultRef: `seller-canary-result:v1:${evidenceHash}`,
          resultDigest: evidenceHash,
          resultReferenceable: true,
          release: 'released',
        }
      : canonicalTerminalOutcome(observation, recordedAt, false, 'not_released'),
    {
      state: 'refused',
      result: {
        kind: 'refused',
        toolRef: dispatch.toolRef,
        code: paidButInvalid
          ? 'seller_canary_output_invalid'
          : observation.failureCode ?? 'provider_refused',
        retryable: false,
        receipt,
      },
      evidenceHash,
      attemptRef,
      dispatchState: 'failed',
    },
    recordedAt,
  )
}
