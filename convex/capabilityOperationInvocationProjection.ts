import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { Infer } from 'convex/values'
import type {
  OperationDispatchCommand,
  OperationDispatchProjection,
} from './lib/operationInvocations/contracts'
import type { RouteTransportObservation } from '@/modules/capability-supply/route-transport-runtime'
import { transportObservationDigest } from '@/modules/capability-supply/public'
import {
  pricingConfigDigest,
  type ExactAmount,
  type MoneyAcceptedInvocationCharge,
} from '@/modules/money/public'
import type {
  PublishedOperation,
  RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import {
  operationResultValue,
  operationInvokeReceiptValue,
  recoveryResultValue,
  usageValue,
  buildCanonicalTerminalOutcomeCommand,
  type CanonicalClaimSnapshot,
  type CanonicalTerminalOutcome,
  type DurableActionInvocationPort,
  type OperationInvokePersistedAuthority,
  type PublicInvocationStatus,
} from '@/modules/capability-execution/convex'
import type { OperationInvokeResult } from '@/modules/capability-execution/operation-invoke-contracts'
import type { ActionCtx } from './_generated/server'
import { internal } from './_generated/api'

export type OpenDispatch = Readonly<{
  invocationRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  operationRef: string
  idempotencyKey: string
  inputDigest: string
  requestDigest: string
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  grantRef: string
  operationJson: string
  inputJson: string
  workId?: string
  attemptRef?: string
  dispatchState?: 'enqueued' | 'running' | 'completed' | 'failed' | 'reconciliation_required'
  authority?: OperationInvokePersistedAuthority
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

export type WorkerAcceptedCharge = Omit<MoneyAcceptedInvocationCharge, 'transactionRef' | 'providerNet' | 'rake'> & Readonly<{
  transactionRef?: string | undefined
  providerNet?: ExactAmount | undefined
  rake?: ExactAmount | undefined
}>

export type CanonicalPort = Pick<
  DurableActionInvocationPort<OperationInvokeResult>,
  'transact' | 'readControl' | 'readAttempt' | 'readAttempts' | 'readHistory' | 'readHistoryCommand' | 'recordLateObservation'
>

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
  operationJson: string
  inputJson: string
  result?: Infer<typeof operationResultValue>
  usage?: Infer<typeof usageValue>
  evidenceHash?: string
  attemptRef?: string
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

export function toOperationDispatchCommand(
  command: Parameters<DurableActionInvocationPort<OperationInvokeResult>['transact']>[0],
): OperationDispatchCommand {
  const { commandId, commandDigest, expectedInvocationVersion, expectedEffectGeneration, row, currentAttemptWrite, history } = command
  return {
    commandId,
    commandDigest,
    expectedInvocationVersion,
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
    transact: async (command: Parameters<DurableActionInvocationPort<OperationInvokeResult>['transact']>[0]) => {
      const { commandId, commandDigest, expectedInvocationVersion, expectedEffectGeneration, row, currentAttemptWrite, history } = command
      const mutableRow = {
        ...row,
        control: {
          ...row.control,
          control: row.control.control.state === 'gathering_information'
            ? { ...row.control.control, missingFields: [...row.control.control.missingFields] }
            : row.control.control,
        },
      }
      return await ctx.runMutation(internal.actionInvocationControl.transact, {
        commandId,
        commandDigest,
        expectedInvocationVersion,
        ...(expectedEffectGeneration === undefined ? {} : { expectedEffectGeneration }),
        row: mutableRow,
        ...(currentAttemptWrite === undefined ? {} : { currentAttemptWrite }),
        history,
      })
    },
    readControl: async (invocationRef) => await ctx.runQuery(internal.actionInvocationControl.readControl, { invocationRef }) ?? undefined,
    readAttempt: async (invocationRef, attemptRef) => await ctx.runQuery(internal.actionInvocationControl.readAttempt, { invocationRef, attemptRef }) ?? undefined,
    readAttempts: async (invocationRef, limit) => await ctx.runQuery(internal.actionInvocationControl.readAttempts, { invocationRef, limit }),
    readHistory: async (invocationRef, afterVersion, limit) => await ctx.runQuery(internal.actionInvocationControl.readHistory, { invocationRef, afterVersion, limit }),
    readHistoryCommand: async (invocationRef, commandId) => await ctx.runQuery(internal.actionInvocationControl.readHistoryCommand, { invocationRef, commandId }) ?? undefined,
    recordLateObservation: async (input) => await ctx.runMutation(internal.actionInvocationControl.recordLateObservation, { ...input, recordedAt: new Date().toISOString() }),
  }
}

export function recoveryNotFound(invocationRef: string): WorkerRecoveryResult {
  return { kind: 'refused', invocationRef, code: 'invocation_not_found', retryable: false }
}

export function projectPureOperationInvocationStatus(
  row: RecoveryRow,
  status: PublicInvocationStatus,
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
    invocationRef: row.invocationRef,
    operationRef: row.operationRef,
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
    invocationRef: row.invocationRef,
    operationRef: row.operationRef,
    state: 'cancelled',
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    result: {
      kind: 'refused',
      operationRef: row.operationRef,
      code: 'invocation_cancelled',
      retryable: false,
    },
  }
}

export function retryableRecoveryResult(
  row: RecoveryRow,
  receipt?: Infer<typeof operationInvokeReceiptValue>,
): WorkerRecoveryResult {
  return {
    kind: 'found',
    invocationRef: row.invocationRef,
    operationRef: row.operationRef,
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
  const publicState: PublicInvocationStatus['control'] = state === 'pending'
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
    invocationRef: row.invocationRef,
    operationRef: row.operationRef,
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
  status: PublicInvocationStatus,
  attemptRows: readonly RecoveryAttempt[],
  operationId: string,
  receipt?: Infer<typeof operationInvokeReceiptValue>,
): WorkerRecoveryResult {
  const currentAttemptRef = status.attempts.at(-1)?.attemptRef ?? row.attemptRef
  const attempt = attemptRows.find(({ attemptRef }) => attemptRef === currentAttemptRef) ?? attemptRows.at(-1)
  const requiredAt = attempt?.outcome.state === 'uncertain' || attempt?.outcome.state === 'timed_out'
    ? attempt.outcome.reconciliationRequiredAt ?? new Date().toISOString()
    : new Date().toISOString()
  return {
    kind: 'reconciliation_required',
    invocationRef: row.invocationRef,
    operationRef: row.operationRef,
    evidence: {
      attemptRef: attempt?.attemptRef ?? currentAttemptRef ?? `operation-attempt:${row.invocationRef}:1`,
      effectGeneration: attempt?.effectGeneration ?? 1,
      requiredAt,
      retry: 'reconcile_before_retry',
      evidenceSource: `published-operation:${operationId}`,
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

            invocationRef: result.invocationRef,
            operationRef: result.operationRef,
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
  await ctx.runMutation(internal.capabilityOperationInvocations.projectRecovery, {
    invocationRef: row.invocationRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
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

export async function readCanonicalSnapshot(port: CanonicalPort, invocationRef: string, attemptRef: string): Promise<CanonicalClaimSnapshot | undefined> {
  const control = await port.readControl(invocationRef)
  if (control === undefined || control.currentAttemptRef !== attemptRef) return undefined
  const attempt = await port.readAttempt(invocationRef, attemptRef)
  return attempt === undefined ? undefined : { control, attempt }
}

export async function finalizeOperationDispatch(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  snapshot: CanonicalClaimSnapshot,
  outcome: CanonicalTerminalOutcome,
  projection: OperationDispatchProjection,
  recordedAt: string,
): Promise<void> {
  const command = buildCanonicalTerminalOutcomeCommand({ snapshot, outcome, recordedAt })
  const persistedCommand = toOperationDispatchCommand(command)
  const result = await ctx.runMutation(internal.capabilityOperationInvocations.finalizeDispatch, {
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
  await ctx.runMutation(internal.capabilityOperationInvocations.record, {
    invocationRef: dispatch.invocationRef,
    principalId: dispatch.principalId,
    state: 'reconciliation_required',
    result: {
      kind: 'reconciliation_required',
      invocationRef: dispatch.invocationRef,
      operationRef: dispatch.operationRef,
      evidence: {
        attemptRef,
        effectGeneration,
        requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
        retry: 'reconcile_before_retry',
        evidenceSource: `operation:${dispatch.operationRef}`,
      },
    },
    attemptRef,
    dispatchState: 'reconciliation_required',
    now: Date.now(),
  })
}

export function parseContractOutput(
  observation: RouteTransportObservation,
  descriptor: RuntimePublishedOperationDescriptor,
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
  operation: PublishedOperation,
  descriptor: RuntimePublishedOperationDescriptor,
  observation: RouteTransportObservation,
  recordedAt: string,
  money?: WorkerAcceptedCharge,
  settlement?: ChargeSettlementResult,
  attemptRef = `operation-attempt:${dispatch.invocationRef}:1`,
  effectGeneration = 1,
  validatedOutput?: ContractOutputValidation,
  retainedSnapshot?: CanonicalClaimSnapshot,
): Promise<void> {
  const outputValidation = validatedOutput ?? parseContractOutput(observation, descriptor)
  const snapshot = retainedSnapshot ?? await readCanonicalSnapshot(canonicalPort(ctx), dispatch.invocationRef, attemptRef)
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
    await finalizeOperationDispatch(
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
          invocationRef: dispatch.invocationRef,
          operationRef: dispatch.operationRef,
          evidence: {
            attemptRef,
            effectGeneration,
            requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
            retry: 'reconcile_before_retry',
            evidenceSource: `operation:${dispatch.operationRef}`,
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
    const usage = money === undefined
      ? descriptor.price.kind !== 'fixed'
        ? undefined
        : {
            usageRef: `operation-x402-payment:${dispatch.invocationRef}:${attemptRef}`,
            observedAt: Date.parse(recordedAt),
            chargeState: 'paid' as const,
            amount: descriptor.price.amount,
            priceDigest: pricingConfigDigest({ version: 'pricing:v2', unit: 'call', paidAmount: descriptor.price.amount }),
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
      await finalizeOperationDispatch(
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
            invocationRef: dispatch.invocationRef,
            operationRef: dispatch.operationRef,
            evidence: {
              attemptRef,
              effectGeneration,
              requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
              retry: 'reconcile_before_retry',
              evidenceSource: `operation:${dispatch.operationRef}`,
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
      invocationRef: dispatch.invocationRef,
      attemptRef,
      effectGeneration,
      businessId: operation.identity.businessId,
      operationRef: dispatch.operationRef,
      publicationRef: operation.identity.publicationRef,
      publicationRevision: operation.identity.publicationRevision,
      contractDigest: operation.identity.contractDigest,
      bindingDigest: operation.identity.bindingDigest,
      principalClass: 'agent_key',
      requestDigest: observation.requestDigest,
      responseDigest: evidenceHash,
      evidenceRefs: [`operation:${dispatch.operationRef}`, `attempt:${attemptRef}`],
      principalId: dispatch.principalId,
      environment: dispatch.environment,
      qualifiedAt: Date.parse(recordedAt),
      usageRef: usage.usageRef,
      ...(usage.transactionRef === undefined ? {} : { transactionRef: usage.transactionRef }),
    })
    await finalizeOperationDispatch(
      ctx,
      dispatch,
      snapshot,
      canonicalTerminalOutcome(observation, recordedAt, true, settlementOutcome),
      {
        state: 'completed',
        result: {
          kind: 'completed',
          invocationRef: dispatch.invocationRef,
          operationRef: dispatch.operationRef,
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
  await finalizeOperationDispatch(
    ctx,
    dispatch,
    snapshot,
    canonicalTerminalOutcome(observation, recordedAt, outputValidation.valid, settlementOutcome),
    {
      state: 'refused',
      result: {
        kind: 'refused',
        operationRef: dispatch.operationRef,
        code: observation.failureCode ?? 'provider_refused',
        retryable: false,
      },
      attemptRef,
      dispatchState: 'failed',
    },
    recordedAt,
  )
}
