import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { isRecord } from '@/modules/common/is-record'
import {
  defaultDnsResolver,
  isPublicHttpTarget,
} from '@/modules/network-guard/public'
import { createPublicClient, custom, type Hex } from 'viem'
import { fetch as guardedFetch, type Agent } from 'undici'

import type { X402EvmReceipt } from './x402-settlement-verifier'

async function readGuardedRpcResult(
  target: URL,
  dispatcher: Agent,
  method: string,
  params: readonly unknown[],
): Promise<unknown> {
  const response = await guardedFetch(target, {
    method: 'POST',
    dispatcher,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) return undefined
  const bounded = await readBoundedRequestText(response, 256 * 1024)
  if (!bounded.ok) return undefined
  const payload: unknown = JSON.parse(bounded.text)
  return isRecord(payload) ? payload.result : undefined
}

export async function readGuardedX402EvmReceipt(input: Readonly<{
  target: URL
  network: string
  transactionHash: string
  dispatcher: Agent
}>): Promise<X402EvmReceipt | undefined> {
  if (
    !input.network.startsWith('eip155:')
    || !/^0x[0-9a-fA-F]{64}$/.test(input.transactionHash)
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
          if (result === undefined) throw new Error('x402_rpc_result_missing')
          return result
        },
      }),
    })
    const [receipt, latestBlock] = await Promise.all([
      client.getTransactionReceipt({
        hash: input.transactionHash as Hex,
      }),
      client.getBlockNumber(),
    ])
    if (latestBlock < receipt.blockNumber) return undefined
    return {
      transactionHash: receipt.transactionHash,
      status: receipt.status,
      confirmations: latestBlock - receipt.blockNumber + 1n,
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
