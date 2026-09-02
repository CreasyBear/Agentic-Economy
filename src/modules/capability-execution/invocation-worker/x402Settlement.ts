import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { operationInvokeReceiptPaymentProfile } from '@/modules/capability-execution/operation-invoke-contracts'
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
import { env, type ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import type { OpenDispatch } from '../../../../convex/capabilityOperationInvocationProjection'

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
  asset: string,
  transactionHash: string,
  dispatcher: Agent,
  environment: 'sandbox' | 'production',
  payer: string,
  nonce: string,
  confirmation?: Readonly<{ minimumConfirmations: number; timeoutMs: number }>,
): Promise<X402EvmReceipt | undefined> {
  if (operationInvokeReceiptPaymentProfile(environment, network, asset) === undefined) return undefined
  const targets = configuredX402RpcUrls(network, environment)
  if (targets.length === 0) return undefined

  const receipts = await Promise.all(targets.map(async (target) => {
    try {
      return await readGuardedX402EvmReceipt({
        target,
        aeEnvironment: environment,
        network,
        asset,
        transactionHash,
        payer,
        nonce,
        dispatcher,
        ...(confirmation === undefined
          ? {}
          : {
              minimumConfirmations: confirmation.minimumConfirmations,
              confirmationTimeoutMs: confirmation.timeoutMs,
            }),
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
    || left.confirmations !== right.confirmations
    || left.blockHash !== right.blockHash
    || left.blockNumber !== right.blockNumber
    || left.observedBlockTimestamp !== right.observedBlockTimestamp
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
    ...(x402SettlementStatus === 'unknown'
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
