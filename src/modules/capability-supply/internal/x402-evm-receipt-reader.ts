import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { isRecord } from '@/modules/common/is-record'
import {
  defaultDnsResolver,
  isPublicHttpTarget,
} from '@/modules/network-guard/public'
import { eip3009ABI } from '@x402/evm'
import {
  createPublicClient,
  custom,
  isAddress,
  type Address,
  type Hex,
} from 'viem'
import { fetch as guardedFetch, type Agent } from 'undici'

import {
  BASE_NETWORK,
  BASE_USDC_ADDRESS,
} from './cdp-x402-payment-signer'
import type { X402EvmReceipt } from './x402-settlement-verifier'

/**
 * A JSON-RPC result is opaque by protocol, so the envelope — not the payload —
 * carries the contract: `unavailable` covers transport, bound, and parse
 * failures alike and never masquerades as a legitimate null result.
 */
type GuardedRpcResult =
  | Readonly<{ kind: 'result'; value: unknown }>
  | Readonly<{ kind: 'unavailable' }>

async function readGuardedRpcResult(
  target: URL,
  dispatcher: Agent,
  method: string,
  params: readonly unknown[],
): Promise<GuardedRpcResult> {
  const response = await guardedFetch(target, {
    method: 'POST',
    dispatcher,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) return { kind: 'unavailable' }
  const bounded = await readBoundedRequestText(response, 256 * 1024)
  if (!bounded.ok) return { kind: 'unavailable' }
  const payload: unknown = JSON.parse(bounded.text)
  if (!isRecord(payload) || !('result' in payload)) return { kind: 'unavailable' }
  return { kind: 'result', value: payload.result }
}

export async function readGuardedX402EvmReceipt(input: Readonly<{
  target: URL
  network: string
  transactionHash: string
  payer: string
  nonce: string
  dispatcher: Agent
}>): Promise<X402EvmReceipt | undefined> {
  if (
    input.target.protocol !== 'https:'
    || input.network !== BASE_NETWORK
    || !/^0x[0-9a-fA-F]{64}$/.test(input.transactionHash)
    || !isAddress(input.payer)
    || !/^0x[0-9a-fA-F]{64}$/.test(input.nonce)
    || !await isPublicHttpTarget(input.target, defaultDnsResolver)
  ) {
    return undefined
  }
  try {
    const client = createPublicClient({
      transport: custom({
        request: async ({ method, params = [] }) => {
          const result = await readGuardedRpcResult(
            input.target,
            input.dispatcher,
            method,
            params,
          )
          if (result.kind === 'unavailable') {
            throw new Error('x402_rpc_result_missing')
          }
          return result.value
        },
      }),
    })
    const [receipt, transaction, latestBlock] = await Promise.all([
      client.getTransactionReceipt({
        hash: input.transactionHash as Hex,
      }),
      client.getTransaction({
        hash: input.transactionHash as Hex,
      }),
      client.getBlockNumber(),
    ])
    if (
      latestBlock < receipt.blockNumber
      || transaction.hash.toLowerCase() !== receipt.transactionHash.toLowerCase()
      || receipt.transactionHash.toLowerCase() !== input.transactionHash.toLowerCase()
      || typeof receipt.blockHash !== 'string'
      || typeof transaction.blockHash !== 'string'
      || receipt.blockHash.toLowerCase() !== transaction.blockHash.toLowerCase()
      || transaction.blockNumber === null
      || transaction.blockNumber !== receipt.blockNumber
    ) return undefined
    const authorizationState = await client.readContract({
      address: BASE_USDC_ADDRESS as Address,
      abi: eip3009ABI,
      functionName: 'authorizationState',
      args: [input.payer as Address, input.nonce as Hex],
      blockNumber: receipt.blockNumber,
    })
    if (typeof authorizationState !== 'boolean') return undefined
    return {
      transactionHash: receipt.transactionHash,
      status: receipt.status,
      confirmations: latestBlock - receipt.blockNumber + 1n,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber,
      authorizationState,
      transactionTo: transaction.to,
      transactionInput: transaction.input,
      logs: receipt.logs.map((log) => ({
        address: log.address,
        data: log.data,
        topics: log.topics,
      })),
    }
  } catch {
    return undefined
  }
}
