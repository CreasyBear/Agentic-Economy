import { degradeBackend } from '@/lib/observability/degrade-backend'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { isRecord } from '@/modules/common/is-record'
import { eip3009ABI } from '@x402/evm'
import {
  createPublicClient,
  custom,
  encodeFunctionData,
  isAddress,
  type Address,
  type Hex,
} from 'viem'
import { fetch as guardedFetch, type Agent } from 'undici'

import {
  x402PaymentProfileForEnvironment,
  type X402AeEnvironment,
} from './x402-payment-profile'
import type { X402EvmReceipt } from './x402-settlement-verifier'
import {
  createX402ReadBudget, receiptFailureFromCause, receiptReadFailure, retryableReceiptFailure, X402RpcReadError,
  type X402ReadBudget, type X402ReceiptFailure, type X402ReceiptReadResult, type X402RpcMethod,
} from './x402-rpc-read'

type GuardedRpcResult = Readonly<{ kind: 'result'; value: unknown }> | X402ReceiptFailure

type RpcOptions = Readonly<{ budget: X402ReadBudget; provider: 'rpc_1' | 'rpc_2' }>

function retryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined
  const seconds = /^\d+(?:\.\d+)?$/u.test(value.trim()) ? Number(value) * 1_000 : Date.parse(value) - Date.now()
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(120_000, Math.ceil(seconds)) : undefined
}

async function readGuardedRpcResult(
  target: URL, dispatcher: Agent, method: X402RpcMethod, params: readonly unknown[], options?: RpcOptions,
): Promise<GuardedRpcResult> {
  const startedAt = Date.now()
  const budget = options?.budget ?? createX402ReadBudget(startedAt + 5_000)
  const provider = options?.provider ?? 'rpc_1'
  const signal = AbortSignal.any([budget.signal, AbortSignal.timeout(5_000)])
  const fail = (code: X402ReceiptFailure['code'], details: Partial<Pick<X402ReceiptFailure, 'httpStatus' | 'retryAfterMs'>> = {}) =>
    receiptReadFailure(code, method, { provider, elapsedMs: Math.max(0, Date.now() - startedAt), ...details })
  try {
    const response = await budget.run(() => guardedFetch(target, {
      method: 'POST', dispatcher, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal,
    }), method, provider, signal)
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined)
      const delay = retryAfterMs(response.headers.get('retry-after'))
      const code = response.status === 401 || response.status === 403 ? 'rpc_authentication_failed'
        : response.status === 429 ? 'rpc_rate_limited'
          : response.status >= 500 ? 'rpc_transport_unavailable' : 'rpc_configuration_invalid'
      return fail(code, { httpStatus: response.status, ...(delay === undefined ? {} : { retryAfterMs: delay }) })
    }
    const bounded = await budget.run(() => readBoundedRequestText(response, 256 * 1024, signal), method, provider, signal)
    if (!bounded.ok) return fail('rpc_invalid_response')
    let payload: unknown
    try { payload = JSON.parse(bounded.text) }
    catch { return fail('rpc_invalid_response') }
    if (!isRecord(payload) || payload.jsonrpc !== '2.0' || payload.id !== 1) return fail('rpc_invalid_response')
    if ('error' in payload) {
      if ('result' in payload || !isRecord(payload.error)) return fail('rpc_invalid_response')
      const message = typeof payload.error.message === 'string' ? payload.error.message.slice(0, 512) : ''
      return fail(payload.error.code === 429 || payload.error.code === -32005 || /rate.?limit|too many requests|quota|capacity|credits exhausted/iu.test(message)
        ? 'rpc_rate_limited' : /unauthori[sz]ed|invalid api.?key|authentication/iu.test(message)
          ? 'rpc_authentication_failed' : 'rpc_invalid_response')
    }
    if (!('result' in payload)) return fail('rpc_invalid_response')
    return { kind: 'result', value: payload.result }
  } catch (cause) {
    return receiptFailureFromCause(cause) ?? fail(signal.aborted ? 'rpc_timeout' : 'rpc_transport_unavailable')
  } finally { if (options === undefined) budget.dispose() }
}

type ReceiptReadInput = Readonly<{
  target: URL; aeEnvironment: X402AeEnvironment; network: string; asset: string
  transactionHash: string; payer: string; nonce: string; dispatcher: Agent
  minimumConfirmations?: number; confirmationTimeoutMs?: number; transportRetryCount?: 0
  deadlineAt?: number; provider?: 'rpc_1' | 'rpc_2'; signal?: AbortSignal
}>

/** Compatibility view for existing Call/cancellation consumers; detailed failures stay internal. */
export async function readGuardedX402EvmReceipt(input: ReceiptReadInput): Promise<X402EvmReceipt | undefined> {
  const result = await readGuardedX402EvmReceiptDetailed(input)
  return result.kind === 'receipt' ? result.receipt : undefined
}

/**
 * Requires exact payment identity and one absolute read deadline.
 * Ensures typed sanitized failures survive transport/Viem wrapping; no raw URL,
 * response body or credential becomes diagnostics. Reads have no money effects.
 * Invariant: receipt/head/transaction/nonce checks and caller confirmation policy.
 * On violation: named failure; a contradiction is never a transient missing read.
 */
export async function readGuardedX402EvmReceiptDetailed(input: ReceiptReadInput): Promise<X402ReceiptReadResult> {
  const { defaultDnsResolver, isPublicHttpTarget } = await import('@/modules/network-guard/public')
  const profile = x402PaymentProfileForEnvironment(input.aeEnvironment)
  const provider = input.provider ?? 'rpc_1'
  const fail = (code: X402ReceiptFailure['code'], method: X402RpcMethod) => receiptReadFailure(code, method, { provider })
  if (profile === undefined || input.target.protocol !== 'https:' || input.target.username !== '' || input.target.password !== ''
    || input.network !== profile.network || input.asset.toLowerCase() !== profile.asset.toLowerCase()
    || !/^0x[0-9a-fA-F]{64}$/u.test(input.transactionHash) || !isAddress(input.payer)
    || !/^0x[0-9a-fA-F]{64}$/u.test(input.nonce)
    || !validConfirmationWait(input.minimumConfirmations, input.confirmationTimeoutMs)) {
    return fail('rpc_configuration_invalid', 'confirmation')
  }
  const deadlineAt = input.deadlineAt ?? Date.now() + Math.min(120_000, (input.confirmationTimeoutMs ?? 0) + 30_000)
  if (!Number.isSafeInteger(deadlineAt) || deadlineAt > Date.now() + 120_000) return fail('rpc_configuration_invalid', 'confirmation')
  const budget = createX402ReadBudget(deadlineAt, input.signal)
  try {
    let dnsFailure: X402ReceiptFailure | undefined
    const resolver = { lookup: async (hostname: string) => {
      try { return await budget.run(() => defaultDnsResolver.lookup(hostname), 'dns', provider) }
      catch (cause) {
        dnsFailure = receiptFailureFromCause(cause) ?? fail('rpc_transport_unavailable', 'dns')
        throw new X402RpcReadError(dnsFailure)
      }
    } }
    const publicTarget = await budget.run(() => isPublicHttpTarget(input.target, resolver), 'dns', provider)
    if (!publicTarget) return dnsFailure ?? fail('rpc_target_refused', 'dns')
    const minimumConfirmations = input.minimumConfirmations ?? 1
    const client = createPublicClient({
      transport: custom({ request: async ({ method, params = [] }) => {
        if (!isReceiptRpcMethod(method)) throw new X402RpcReadError(fail('rpc_configuration_invalid', 'confirmation'))
        const maximum = input.transportRetryCount === 0 ? 1 : 4
        for (let attempt = 0; attempt < maximum; attempt += 1) {
          const result = await readGuardedRpcResult(input.target, input.dispatcher, method, params, { budget, provider })
          if (result.kind === 'result') {
            if (result.value === null && (method === 'eth_getTransactionByHash' || method === 'eth_getTransactionReceipt')) {
              throw new X402RpcReadError(fail('receipt_missing', method))
            }
            return result.value
          }
          const delay = result.retryAfterMs ?? 150 * 2 ** attempt
          if (attempt + 1 >= maximum || !retryableReceiptFailure(result) || Date.now() + delay >= budget.deadlineAt) {
            throw new X402RpcReadError(result)
          }
          await budget.wait(delay)
        }
        throw new X402RpcReadError(fail('rpc_deadline_exceeded', method))
      } }, { retryCount: 0 }),
    })
    const confirmationDeadline = Math.min(budget.deadlineAt, Date.now() + (input.confirmationTimeoutMs ?? 0))
    // Own the polling policy: viem's waiter retries errors outside the transport.
    // Here only a missing receipt or an immature valid receipt can wait for a block.
    for (;;) {
      let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>>
      try {
        receipt = await budget.run(() => client.getTransactionReceipt({ hash: input.transactionHash as Hex }), 'eth_getTransactionReceipt', provider)
      } catch (cause) {
        if (minimumConfirmations > 1 && receiptFailureFromCause(cause)?.code === 'receipt_missing'
          && Date.now() + 1_000 < confirmationDeadline) { await budget.wait(1_000); continue }
        throw cause
      }
      const [transaction, latestBlock] = await budget.run(() => Promise.all([
        client.getTransaction({ hash: input.transactionHash as Hex }), client.getBlock(),
      ]), 'eth_getTransactionByHash', provider)
      if (latestBlock.number === null || latestBlock.number < receipt.blockNumber
        || transaction.hash.toLowerCase() !== receipt.transactionHash.toLowerCase()
        || receipt.transactionHash.toLowerCase() !== input.transactionHash.toLowerCase()
        || typeof receipt.blockHash !== 'string' || typeof transaction.blockHash !== 'string'
        || receipt.blockHash.toLowerCase() !== transaction.blockHash.toLowerCase()
        || transaction.blockNumber === null || transaction.blockNumber !== receipt.blockNumber) {
        return fail('receipt_conflict', 'eth_getTransactionByHash')
      }
      if (latestBlock.number - receipt.blockNumber + 1n < BigInt(minimumConfirmations)) {
        if (minimumConfirmations > 1 && Date.now() + 1_000 < confirmationDeadline) { await budget.wait(1_000); continue }
        return fail('receipt_immature', 'confirmation')
      }
      const authorizationState = await budget.run(() => client.readContract({
        address: profile.asset as Address, abi: eip3009ABI, functionName: 'authorizationState',
        args: [input.payer as Address, input.nonce as Hex], blockNumber: latestBlock.number,
      }), 'eth_call', provider)
      if (typeof authorizationState !== 'boolean') return fail('rpc_invalid_response', 'eth_call')
      return { kind: 'receipt', receipt: {
        transactionHash: receipt.transactionHash, status: receipt.status,
        confirmations: latestBlock.number - receipt.blockNumber + 1n, blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber, observedBlockTimestamp: latestBlock.timestamp,
        authorizationState, transactionTo: transaction.to, transactionInput: transaction.input,
        logs: receipt.logs.map(log => ({ address: log.address, data: log.data, topics: log.topics })),
      } }
    }
  } catch (cause) {
    return receiptFailureFromCause(cause) ?? fail('rpc_invalid_response', 'confirmation')
  } finally { budget.dispose() }
}

function isReceiptRpcMethod(method: string): method is X402RpcMethod {
  return ['eth_blockNumber', 'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_call'].includes(method)
}

/**
 * Requires an exact supported authorization identity and expiry. Ensures the
 * nonce was unused at a canonical safe block at/after expiry. No wall-clock,
 * missing-log or latest-head fallback can establish this proof. Unavailable,
 * malformed or conflicting evidence returns undefined without side effects.
 */
export async function readGuardedX402UnusedAuthorization(input: Readonly<{
  target: URL
  aeEnvironment: X402AeEnvironment
  network: string
  asset: string
  payer: string
  nonce: string
  dispatcher: Agent
  expiresAt: number
}>): Promise<Readonly<{
  blockHash: string
  blockNumber: bigint
  blockTimestamp: bigint
  authorizationState: false
}> | undefined> {
  const { defaultDnsResolver, isPublicHttpTarget } = await import('@/modules/network-guard/public')
  const profile = x402PaymentProfileForEnvironment(input.aeEnvironment)
  if (
    profile === undefined
    || input.target.protocol !== 'https:'
    || input.network !== profile.network
    || input.asset.toLowerCase() !== profile.asset.toLowerCase()
    || !isAddress(input.payer)
    || !/^0x[0-9a-fA-F]{64}$/.test(input.nonce)
    || !Number.isSafeInteger(input.expiresAt)
    || input.expiresAt <= 0
    || !await isPublicHttpTarget(input.target, defaultDnsResolver)
  ) return undefined

  try {
    const result = await readGuardedRpcResult(input.target, input.dispatcher,
      'eth_getBlockByNumber', ['safe', false])
    if (result.kind !== 'result' || !isRecord(result.value)) return undefined
    const block = result.value
    const quantity = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/
    if (
      typeof block.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(block.hash)
      || typeof block.number !== 'string' || !quantity.test(block.number)
      || typeof block.timestamp !== 'string' || !quantity.test(block.timestamp)
    ) return undefined
    const blockNumber = BigInt(block.number)
    const blockTimestamp = BigInt(block.timestamp)
    if (blockTimestamp * 1_000n < BigInt(input.expiresAt)) return undefined
    const state = await readGuardedRpcResult(input.target, input.dispatcher, 'eth_call', [{
      to: profile.asset,
      data: encodeFunctionData({
        abi: eip3009ABI,
        functionName: 'authorizationState',
        args: [input.payer as Address, input.nonce as Hex],
      }),
    }, { blockHash: block.hash, requireCanonical: true }])
    if (state.kind !== 'result' || state.value !== `0x${'0'.repeat(64)}`) return undefined
    return { blockHash: block.hash, blockNumber, blockTimestamp, authorizationState: false }
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'readGuardedX402UnusedAuthorization', reason: 'source_unavailable' })
  }
}

function validConfirmationWait(
  minimumConfirmations: number | undefined,
  timeoutMs: number | undefined,
): boolean {
  return (
    minimumConfirmations === undefined
    || (Number.isSafeInteger(minimumConfirmations)
      && minimumConfirmations >= 1
      && minimumConfirmations <= 64)
  ) && (
    timeoutMs === undefined
    || (Number.isSafeInteger(timeoutMs) && timeoutMs >= 1_000 && timeoutMs <= 120_000)
  )
}
