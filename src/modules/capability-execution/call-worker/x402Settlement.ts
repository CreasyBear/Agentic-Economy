import { boundaryCauseKind, degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { callReceiptPaymentProfile } from '@/modules/capability-execution/call-contracts'
import { Agent } from 'undici'
import {
  paymentObservationDigest,
  readGuardedX402EvmReceipt,
  readGuardedX402EvmReceiptDetailed, createX402ReadBudget, receiptReadFailure, retryableReceiptFailure, reportX402ReceiptFailure, receiptFailureFromCause,
  type X402ReceiptReadResult, type X402ReceiptFailure,
  transportObservationDigest,
  x402SettlementStatusForObservation,
} from '@/modules/capability-supply/server'
import type {
  RouteTransportObservation,
} from '@/modules/capability-supply/route-transport-runtime'
import type { PublishedTool } from '@/modules/capability-supply/public'
import { env, type ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import type { OpenDispatch } from '@/modules/capability-execution/call-projection/contracts'

type X402SettlementStatus = ReturnType<typeof x402SettlementStatusForObservation>

type X402EvmReceipt = NonNullable<Awaited<ReturnType<typeof readGuardedX402EvmReceipt>>>

const MAX_X402_RPC_CONFIG_LENGTH = 16_384
const X402_EVM_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/
const X402_EVM_HEX_DATA_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/

function parseX402RpcUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url : undefined
  } catch (cause) {
    return degradeBackend(boundaryCauseKind(cause), undefined, { site: 'parseX402RpcUrl', reason: 'invalid_response' })
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
  } catch (cause) {
    return degradeBackend(boundaryCauseKind(cause), [], { site: 'configuredX402RpcUrls', reason: 'invalid_response' })
  }
}

export function configuredX402RpcUrl(
  network: string,
  environment: 'sandbox' | 'production' = 'production',
): URL | undefined {
  return configuredX402RpcUrls(network, environment)[0]
}

/**
 * Requires valid observations from every configured RPC. Ensures immutable
 * transaction evidence and nonce state agree, while maturity uses the least
 * advanced observation. Missing or conflicting evidence remains unavailable.
 */
export async function readX402EvmReceipt(
  network: string, asset: string, transactionHash: string, dispatcher: Agent,
  environment: 'sandbox' | 'production', payer: string, nonce: string,
  confirmation?: Readonly<{ minimumConfirmations: number; timeoutMs: number }>,
  rpcRetry?: Readonly<{ retryCount: 0; deadlineAt?: number }>,
): Promise<X402EvmReceipt | undefined> {
  const result = await readX402EvmReceiptDetailed(network, asset, transactionHash, dispatcher, environment, payer, nonce, confirmation, rpcRetry)
  return result.kind === 'receipt' ? result.receipt : undefined
}

/** Detailed corroboration preserves conflicts and the caller's absolute deadline. */
export async function readX402EvmReceiptDetailed(
  network: string, asset: string, transactionHash: string, dispatcher: Agent,
  environment: 'sandbox' | 'production', payer: string, nonce: string,
  confirmation?: Readonly<{ minimumConfirmations: number; timeoutMs: number }>,
  rpcRetry?: Readonly<{ retryCount: 0; deadlineAt?: number }>,
): Promise<X402ReceiptReadResult> {
  if (callReceiptPaymentProfile(environment, network, asset) === undefined) return receiptReadFailure('rpc_configuration_invalid', 'agreement')
  const targets = configuredX402RpcUrls(network, environment)
  if (targets.length === 0) return receiptReadFailure('rpc_configuration_invalid', 'agreement')
  const deadlineAt = rpcRetry?.deadlineAt ?? Date.now() + Math.min(120_000, (confirmation?.timeoutMs ?? 0) + 30_000)
  if (!Number.isSafeInteger(deadlineAt) || deadlineAt > Date.now() + 120_000) return receiptReadFailure('rpc_configuration_invalid', 'agreement')
  const budget = createX402ReadBudget(deadlineAt)
  const completedFailures: X402ReceiptFailure[] = []
  let terminal: (failure: X402ReceiptFailure) => void = () => undefined
  const terminalFailure = new Promise<X402ReceiptFailure>(resolve => { terminal = resolve })
  const observeFailure = (failure: X402ReceiptFailure) => {
    completedFailures.push(failure)
    if (!retryableReceiptFailure(failure)) terminal(failure)
  }
  try {
    const result = await budget.run(() => Promise.race([terminalFailure, Promise.all(targets.map(async (target, index): Promise<X402ReceiptReadResult> => {
      const provider = index === 0 ? 'rpc_1' as const : 'rpc_2' as const
      try {
        const result = await readGuardedX402EvmReceiptDetailed({
          target, aeEnvironment: environment, network, asset, transactionHash, payer, nonce, dispatcher,
          deadlineAt, provider, signal: budget.signal,
          ...(rpcRetry === undefined ? {} : { transportRetryCount: rpcRetry.retryCount }),
          ...(confirmation === undefined ? {} : {
            minimumConfirmations: confirmation.minimumConfirmations, confirmationTimeoutMs: confirmation.timeoutMs,
          }),
        })
        if (result.kind === 'failed') observeFailure(result)
        return result
      } catch (cause) {
        const failure = receiptFailureFromCause(cause) ?? receiptReadFailure('rpc_transport_unavailable', 'agreement', { provider })
        observeFailure(failure)
        return failure
      }
    }))]), 'agreement')
    const results = Array.isArray(result) ? result : [result]
    const failures = results.filter(result => result.kind === 'failed')
    for (const failure of failures) reportX402ReceiptFailure(failure)
    if (failures.length > 0) return aggregateReceiptFailure(completedFailures)
    const receipts = results.flatMap(result => result.kind === 'receipt' ? [result.receipt] : [])
    const first = receipts[0]
    if (first === undefined || !x402EvmReceiptsAgree(first, first)) return receiptReadFailure('receipt_conflict', 'agreement')
    let confirmations = first.confirmations
    let observedBlockTimestamp = first.observedBlockTimestamp
    for (const receipt of receipts.slice(1)) {
      if (!x402EvmReceiptsAgree(first, receipt)) {
        const failure = receiptReadFailure('receipt_conflict', 'agreement')
        reportX402ReceiptFailure(failure)
        return failure
      }
      if (receipt.confirmations < confirmations) confirmations = receipt.confirmations
      if (receipt.observedBlockTimestamp < observedBlockTimestamp) observedBlockTimestamp = receipt.observedBlockTimestamp
    }
    if (confirmations < BigInt(confirmation?.minimumConfirmations ?? 1)) return receiptReadFailure('receipt_immature', 'confirmation')
    return { kind: 'receipt', receipt: { ...first, confirmations, observedBlockTimestamp } }
  } catch (cause) {
    const failure = aggregateReceiptFailure([...completedFailures,
      receiptFailureFromCause(cause) ?? receiptReadFailure('rpc_invalid_response', 'agreement')])
    reportX402ReceiptFailure(failure)
    return failure
  } finally { budget.dispose() }
}

function aggregateReceiptFailure(failures: readonly X402ReceiptFailure[]): X402ReceiptFailure {
  const selected = failures.find(failure => failure.code === 'receipt_conflict')
    ?? failures.find(failure => !retryableReceiptFailure(failure))
    ?? failures.find(failure => failure.code === 'rpc_rate_limited') ?? failures[0]
  if (selected === undefined) throw new Error('receipt_failures_required')
  const retryAfterMs = Math.max(0, ...failures.map(failure => failure.retryAfterMs ?? 0))
  return retryAfterMs === 0 ? selected : { ...selected, retryAfterMs }
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
      || typeof receipt.observedBlockTimestamp !== 'bigint'
      || receipt.observedBlockTimestamp < 0n
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

export type X402TransportObservationRecord = Readonly<{
  settlementStatus: X402SettlementStatus
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
    operation: PublishedTool
    observation: RouteTransportObservation
    durableAttemptRef: string
    durableEffectGeneration: number
    operationKeyDigest: string
  }>,
): Promise<X402TransportObservationRecord> {
  const x402SettlementStatus = x402SettlementStatusForObservation(input.observation)
  const settlementDigest = input.observation.settlementEvidence?.kind !== 'not_submitted'
    ? input.observation.settlementEvidence?.digest
    : undefined
  const evidenceRefs = [
    ...input.operation.readiness.evidenceRefs,
    transportObservationDigest(input.observation),
    ...(settlementDigest === undefined ? [] : [settlementDigest]),
  ]
  const submissionStatus = input.observation.paymentSubmissionStatus
    ?? (x402SettlementStatus === 'unknown'
      ? 'unknown'
      : 'observed')
  const responseStatus = input.observation.responseStatus
  await ctx.runMutation(internal.moneyX402PaymentAttempts.recordX402PaymentObservation, {
    dispatchRef: input.dispatch.callRef,
    attemptRef: input.durableAttemptRef,
    effectGeneration: input.durableEffectGeneration,
    paymentIdentifier: input.operationKeyDigest,
    toolRef: input.dispatch.toolRef,
    inputDigest: input.dispatch.inputDigest,
    transportObservationDigest: transportObservationDigest(input.observation),
    transportRequestDigest: input.observation.requestDigest,
    paymentObservationDigest: paymentObservationDigest(input.observation, input.operationKeyDigest),
    settlementStatus: x402SettlementStatus,
    ...(responseStatus !== undefined && Number.isSafeInteger(responseStatus)
      && responseStatus >= 100 && responseStatus <= 599
      ? { responseStatus } : {}),
    ...(settlementDigest === undefined
      ? {}
      : { paymentResponseDigest: settlementDigest }),
    ...((x402SettlementStatus === 'unknown'
      || (x402SettlementStatus === 'settled' && input.observation.disposition === 'succeeded'))
      && input.observation.responseDigest !== undefined
      && input.observation.outputJson !== undefined
      ? {
          quarantinedResponseDigest: input.observation.responseDigest,
          quarantinedOutputJson: input.observation.outputJson,
        }
      : {}),
    observedAt: Date.now(),
  })
  return {
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
