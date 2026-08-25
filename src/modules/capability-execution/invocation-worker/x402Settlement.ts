import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { Agent } from 'undici'
import {
  paymentObservationDigest,
  readGuardedX402EvmReceipt,
  transportObservationDigest,
  x402SettlementStatusForObservation,
} from '@/modules/capability-supply/server'
import type {
  RouteTransportObservation,
} from '@/modules/capability-supply/route-transport-runtime'
import type { PublishedOperation } from '@/modules/capability-supply/public'
import {
  exactAmountSchema,
  externalSpendIdentityMatchingReservationRef,
  type ExactAmount,
  type ExternalSpendIdentity,
  type ExternalSpendPaymentFacts,
  type ExternalSpendSettlementStatus,
  type ExternalSpendSubmissionStatus,
} from '@/modules/money/public'
import { env, type ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import type { ChargeSettlementResult, OpenDispatch } from '../../../../convex/capabilityOperationInvocationProjection'

export type ExternalSpendSettlement =
  | Readonly<{ kind: 'settled'; settlementStatus: 'settled' | 'not_settled' }>
  | Readonly<{ kind: 'reconciliation_required' }>

export type X402AttemptSnapshotForMoney = Readonly<{
  reservationRef?: string
  selectedRequirementJson: string
  paymentIdentifier: string
  challengeDigest: string
  amountUnits: string
  currency: string
  exponent: number
  custodyBudgetRef?: string
  custodyGeneration?: number
  custodyDailyMaximumUnits?: string
}>

type X402EvmReceipt = NonNullable<Awaited<ReturnType<typeof readGuardedX402EvmReceipt>>>

const MAX_X402_RPC_CONFIG_LENGTH = 16_384
const X402_EVM_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/
const X402_EVM_HEX_DATA_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/

function parseX402RpcUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}

/** Read one or two bounded RPC targets; two targets must agree unanimously. */
export function configuredX402RpcUrls(
  network: string,
  environment: 'sandbox' | 'production' = 'production',
): readonly URL[] {
  const raw = env.AE_X402_RPC_URLS_JSON?.trim()
  if (
    raw === undefined
    || raw.length === 0
    || raw.length > MAX_X402_RPC_CONFIG_LENGTH
    || (environment !== 'sandbox' && environment !== 'production')
  ) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return []
    const configured = parsed[network]
    const values = Array.isArray(configured)
      && (environment === 'production'
        ? configured.length === 2
        : configured.length >= 1 && configured.length <= 2)
      ? configured
      : undefined
    if (values === undefined) return []

    const urls = values.map(parseX402RpcUrl)
    if (urls.some((url) => url === undefined)) return []
    const parsedUrls = urls as URL[]
    const distinct = new Set(parsedUrls.map((url) => url.href))
    return distinct.size === parsedUrls.length ? parsedUrls : []
  } catch {
    return []
  }
}

export function configuredX402RpcUrl(
  network: string,
  environment: 'sandbox' | 'production' = 'production',
): URL | undefined {
  return configuredX402RpcUrls(network, environment)[0]
}

export async function readX402EvmReceipt(
  network: string,
  transactionHash: string,
  dispatcher: Agent,
  environment: 'sandbox' | 'production',
  payer: string,
  nonce: string,
): Promise<X402EvmReceipt | undefined> {
  const targets = configuredX402RpcUrls(network, environment)
  if (targets.length === 0) return undefined

  const receipts = await Promise.all(targets.map(async (target) => {
    try {
      return await readGuardedX402EvmReceipt({
        target,
        network,
        transactionHash,
        payer,
        nonce,
        dispatcher,
      })
    } catch {
      return undefined
    }
  }))
  if (receipts.some((receipt) => receipt === undefined)) return undefined

  const first = receipts[0]
  if (first === undefined || !x402EvmReceiptsAgree(first, first)) return undefined
  return receipts.slice(1).every((receipt) => receipt !== undefined && x402EvmReceiptsAgree(first, receipt))
    ? first
    : undefined
}

function x402EvmReceiptsAgree(left: X402EvmReceipt, right: X402EvmReceipt): boolean {
  for (const receipt of [left, right]) {
    if (
      typeof receipt.transactionHash !== 'string'
      || !X402_EVM_HASH_PATTERN.test(receipt.transactionHash)
      || (receipt.status !== 'success' && receipt.status !== 'reverted')
      || typeof receipt.confirmations !== 'bigint'
      || receipt.confirmations < 0n
      || typeof receipt.blockHash !== 'string'
      || !X402_EVM_HASH_PATTERN.test(receipt.blockHash)
      || typeof receipt.blockNumber !== 'bigint'
      || receipt.blockNumber < 0n
      || typeof receipt.authorizationState !== 'boolean'
      || (receipt.transactionTo !== null && typeof receipt.transactionTo !== 'string')
      || typeof receipt.transactionInput !== 'string'
      || !X402_EVM_HEX_DATA_PATTERN.test(receipt.transactionInput)
      || !Array.isArray(receipt.logs)
      || !receipt.logs.every((log) =>
        typeof log === 'object'
        && log !== null
        && typeof log.address === 'string'
        && typeof log.data === 'string'
        && X402_EVM_HEX_DATA_PATTERN.test(log.data)
        && Array.isArray(log.topics)
        && log.topics.every((topic: unknown) =>
          typeof topic === 'string' && X402_EVM_HEX_DATA_PATTERN.test(topic)),
      )
    ) return false
  }
  if (
    left.transactionHash !== right.transactionHash
    || left.status !== right.status
    || left.confirmations !== right.confirmations
    || left.blockHash !== right.blockHash
    || left.blockNumber !== right.blockNumber
    || left.authorizationState !== right.authorizationState
    || left.transactionTo !== right.transactionTo
    || left.transactionInput !== right.transactionInput
    || left.logs.length !== right.logs.length
  ) return false

  return left.logs.every((leftLog, index) => {
    const rightLog = right.logs[index]
    return rightLog !== undefined
      && leftLog.address === rightLog.address
      && leftLog.data === rightLog.data
      && leftLog.topics.length === rightLog.topics.length
      && leftLog.topics.every((topic, topicIndex) => topic === rightLog.topics[topicIndex])
  })
}

export async function finalizeX402ExternalSpend(
  ctx: ActionCtx,
  identity: ExternalSpendIdentity,
  submissionStatus: 'not_submitted' | 'possibly_submitted' | 'observed' | 'unknown',
  settlementStatus: ExternalSpendSettlementStatus,
  paymentResponseDigest: string | undefined,
  evidenceRefs: readonly string[],
  providerReceiptDigest?: string,
): Promise<ExternalSpendSettlement> {
  const result = await ctx.runMutation(internal.moneyLedger.finalizeExternalInvocationSpend, {
    ...identity,
    submissionStatus,
    settlementStatus,
    ...(paymentResponseDigest === undefined ? {} : { paymentResponseDigest }),
    ...(providerReceiptDigest === undefined ? {} : { providerReceiptDigest }),
    evidenceRefs: [...evidenceRefs],
    observedAt: Date.now(),
  })
  if (result.kind !== 'accepted' || settlementStatus === 'unknown') {
    return { kind: 'reconciliation_required' }
  }
  return { kind: 'settled', settlementStatus }
}

export async function bestEffortReleaseX402ExternalSpend(
  ctx: ActionCtx,
  identity: ExternalSpendIdentity,
  evidenceRefs: readonly string[],
): Promise<'released' | 'failed'> {
  try {
    const result = await finalizeX402ExternalSpend(
      ctx,
      identity,
      'not_submitted',
      'not_settled',
      undefined,
      evidenceRefs,
    )
    return result.kind === 'settled'
      && result.settlementStatus === 'not_settled'
      ? 'released'
      : 'failed'
  } catch {
    return 'failed'
  }
}

export async function releaseX402ExternalSpendBeforeSubmission(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    operation: PublishedOperation
    attemptRef: string
    effectGeneration: number
    evidenceRefs: readonly string[]
  }>,
): Promise<ChargeSettlementResult> {
  const attempt = await ctx.runQuery(
    internal.moneyX402PaymentAttempts.readX402PaymentAttempt,
    {
      dispatchRef: input.dispatch.invocationRef,
      attemptRef: input.attemptRef,
      effectGeneration: input.effectGeneration,
    },
  )
  if (attempt === null) return { kind: 'settled', outcome: 'not_released' }
  const identity = externalSpendIdentityFromAttempt(
    input.dispatch,
    input.operation,
    attempt,
    input.attemptRef,
    input.effectGeneration,
  )
  if (identity === undefined) return { kind: 'reconciliation_required' }
  const released = await bestEffortReleaseX402ExternalSpend(
    ctx,
    identity,
    input.evidenceRefs,
  )
  return released === 'released'
    ? { kind: 'settled', outcome: 'not_released' }
    : { kind: 'reconciliation_required' }
}

export function externalSpendPaymentFactsFromDispatch(
  dispatch: Readonly<{
    invocationRef: string
    principalId: string
    credentialId: string
    grantRef: string
    grantGeneration: number
    environment: 'sandbox' | 'production'
    operationRef: string
  }>,
  input: Readonly<{
    attemptRef: string
    effectGeneration: number
    providerRef: string
    paymentIdentifier: string
    challengeDigest: string
    amount: ExactAmount
    custodyRef?: string
    custodyGeneration?: number
    custodyDailyMaximum?: ExactAmount
  }>,
): ExternalSpendPaymentFacts {
  return {
    principalId: dispatch.principalId,
    credentialId: dispatch.credentialId,
    grantRef: dispatch.grantRef,
    grantGeneration: dispatch.grantGeneration,
    environment: dispatch.environment,
    invocationRef: dispatch.invocationRef,
    attemptRef: input.attemptRef,
    effectGeneration: input.effectGeneration,
    operationRef: dispatch.operationRef,
    providerRef: input.providerRef,
    paymentIdentifier: input.paymentIdentifier,
    challengeDigest: input.challengeDigest,
    amount: input.amount,
    ...(input.custodyRef === undefined ? {} : { custodyRef: input.custodyRef }),
    ...(input.custodyGeneration === undefined ? {} : { custodyGeneration: input.custodyGeneration }),
    ...(input.custodyDailyMaximum === undefined ? {} : { custodyDailyMaximum: input.custodyDailyMaximum }),
  }
}

export function externalSpendIdentityFromAttempt(
  dispatch: OpenDispatch,
  operation: PublishedOperation,
  attempt: X402AttemptSnapshotForMoney,
  attemptRef: string,
  effectGeneration: number,
): ExternalSpendIdentity | undefined {
  if (
    operation.binding.authority.kind !== 'provider_connection'
    || attempt.reservationRef === undefined
  ) return undefined
  const amount = exactAmountSchema.safeParse({
    currency: attempt.currency,
    units: attempt.amountUnits,
    exponent: attempt.exponent,
  })
  if (!amount.success) return undefined
  const custodyFields = [
    attempt.custodyBudgetRef,
    attempt.custodyGeneration,
    attempt.custodyDailyMaximumUnits,
  ]
  const custodyFieldsSupplied = custodyFields.filter((value) => value !== undefined).length
  if (custodyFieldsSupplied !== 0 && custodyFieldsSupplied !== custodyFields.length) return undefined
  const custody = custodyFieldsSupplied === 0
    ? undefined
    : (() => {
        const { custodyBudgetRef, custodyGeneration, custodyDailyMaximumUnits } = attempt
        if (
          typeof custodyBudgetRef !== 'string'
          || custodyBudgetRef.trim().length === 0
          || typeof custodyGeneration !== 'number'
          || !Number.isSafeInteger(custodyGeneration)
          || custodyGeneration <= 0
          || typeof custodyDailyMaximumUnits !== 'string'
        ) return undefined
        const dailyMaximum = exactAmountSchema.safeParse({
          currency: attempt.currency,
          units: custodyDailyMaximumUnits,
          exponent: attempt.exponent,
        })
        return dailyMaximum.success
          ? { custodyRef: custodyBudgetRef, custodyGeneration, custodyDailyMaximum: dailyMaximum.data }
          : undefined
      })()
  if (custodyFieldsSupplied !== 0 && custody === undefined) return undefined
  return externalSpendIdentityMatchingReservationRef(
    externalSpendPaymentFactsFromDispatch(dispatch, {
      attemptRef,
      effectGeneration,
      providerRef: operation.binding.authority.providerRef,
      paymentIdentifier: attempt.paymentIdentifier,
      challengeDigest: attempt.challengeDigest,
      amount: amount.data,
      ...(custody === undefined ? {} : custody),
    }),
    attempt.reservationRef,
  )
}

export async function settleX402TransportObservation(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    operation: PublishedOperation
    observation: RouteTransportObservation
    durableAttemptRef: string
    durableEffectGeneration: number
    operationKeyDigest: string
  }>,
): Promise<ChargeSettlementResult> {
  const recorded = await recordX402TransportObservation(ctx, input)
  const external = recorded.identity === undefined
    ? { kind: 'reconciliation_required' as const }
    : await finalizeX402ExternalSpend(
        ctx,
        recorded.identity,
        recorded.submissionStatus,
        recorded.settlementStatus,
        recorded.settlementDigest,
        recorded.evidenceRefs,
        recorded.providerReceiptDigest,
      )
  return external.kind === 'settled'
    ? {
        kind: 'settled',
        outcome: external.settlementStatus === 'settled'
          ? 'released'
          : 'not_released',
      }
    : external
}

export type X402TransportObservationRecord = Readonly<{
  identity?: ExternalSpendIdentity
  settlementStatus: ExternalSpendSettlementStatus
  submissionStatus: 'not_submitted' | 'possibly_submitted' | 'observed' | 'unknown'
  settlementDigest?: string
  providerReceiptDigest?: string
  settlementRef?: string
  evidenceRefs: readonly string[]
}>

/**
 * Persist the independently verified x402 observation without moving either economic leg. The
 * brokered worker calls this after transport, validates provider output, and only then finalizes
 * or reverses external custody plus the buyer reservation.
 */
export async function recordX402TransportObservation(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    operation: PublishedOperation
    observation: RouteTransportObservation
    durableAttemptRef: string
    durableEffectGeneration: number
    operationKeyDigest: string
  }>,
): Promise<X402TransportObservationRecord> {
  const x402SettlementStatus = x402SettlementStatusForObservation(input.observation)
  const settlementDigest =
    input.observation.settlementEvidence?.kind === 'settled'
    || input.observation.settlementEvidence?.kind === 'not_settled'
      ? input.observation.settlementEvidence.digest
      : undefined
  const attempt = await ctx.runQuery(
    internal.moneyX402PaymentAttempts.readX402PaymentAttempt,
    {
      dispatchRef: input.dispatch.invocationRef,
      attemptRef: input.durableAttemptRef,
      effectGeneration: input.durableEffectGeneration,
    },
  )
  const identity = attempt === null
    ? undefined
    : externalSpendIdentityFromAttempt(
        input.dispatch,
        input.operation,
        attempt,
        input.durableAttemptRef,
        input.durableEffectGeneration,
      )
  const evidenceRefs = [
    ...input.operation.readiness.evidenceRefs,
    transportObservationDigest(input.observation),
    ...(settlementDigest === undefined ? [] : [settlementDigest]),
  ]
  const submissionStatus = input.observation.paymentSubmissionStatus
    ?? (x402SettlementStatus === 'unknown'
      ? 'unknown'
      : 'observed')
  await ctx.runMutation(internal.moneyX402PaymentAttempts.recordX402PaymentObservation, {
    dispatchRef: input.dispatch.invocationRef,
    attemptRef: input.durableAttemptRef,
    effectGeneration: input.durableEffectGeneration,
    paymentIdentifier: input.operationKeyDigest,
    operationRef: input.dispatch.operationRef,
    inputDigest: input.dispatch.inputDigest,
    transportObservationDigest: transportObservationDigest(input.observation),
    transportRequestDigest: input.observation.requestDigest,
    paymentObservationDigest: paymentObservationDigest(input.observation, input.operationKeyDigest),
    settlementStatus: x402SettlementStatus,
    ...(settlementDigest === undefined
      ? {}
      : { paymentResponseDigest: settlementDigest }),
    observedAt: Date.now(),
  })
  return {
    ...(identity === undefined ? {} : { identity }),
    settlementStatus: x402SettlementStatus,
    submissionStatus,
    ...(settlementDigest === undefined ? {} : { settlementDigest }),
    ...(input.observation.providerReceipt === undefined
      ? {}
      : { providerReceiptDigest: canonicalDigest(input.observation.providerReceipt) }),
    ...(input.observation.settlementEvidence?.kind === 'settled'
      && input.observation.settlementEvidence.response.transaction.length > 0
      ? { settlementRef: input.observation.settlementEvidence.response.transaction }
      : {}),
    evidenceRefs,
  }
}

export async function reverseX402ExternalSpendForInvalidOutput(
  ctx: ActionCtx,
  identity: ExternalSpendIdentity,
  input: Readonly<{
    settlementStatus: ExternalSpendSettlementStatus
    submissionStatus: ExternalSpendSubmissionStatus
    paymentResponseDigest?: string
    providerReceiptDigest?: string
    evidenceRefs: readonly string[]
    invalidOutputEvidenceRef: string
    invalidOutputEvidenceDigest: string
  }>,
): Promise<ExternalSpendSettlement> {
  try {
    const result = await ctx.runMutation(
      internal.moneyLedger.reverseExternalInvocationSpendForInvalidOutput,
      {
        ...identity,
        settlementStatus: input.settlementStatus,
        submissionStatus: input.submissionStatus,
        ...(input.paymentResponseDigest === undefined
          ? {}
          : { paymentResponseDigest: input.paymentResponseDigest }),
        ...(input.providerReceiptDigest === undefined
          ? {}
          : { providerReceiptDigest: input.providerReceiptDigest }),
        evidenceRefs: [...input.evidenceRefs],
        invalidOutputEvidenceRef: input.invalidOutputEvidenceRef,
        invalidOutputEvidenceDigest: input.invalidOutputEvidenceDigest,
        observedAt: Date.now(),
      },
    )
    return result.kind === 'accepted'
      ? { kind: 'settled', settlementStatus: 'not_settled' }
      : { kind: 'reconciliation_required' }
  } catch {
    return { kind: 'reconciliation_required' }
  }
}
