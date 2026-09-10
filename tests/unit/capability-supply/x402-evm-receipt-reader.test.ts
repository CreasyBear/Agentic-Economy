import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
} from '@/modules/capability-supply/public'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  isPublicHttpTarget: vi.fn(async () => true),
}))

vi.mock('undici', () => ({ fetch: mocks.fetch }))
vi.mock('@/modules/network-guard/public', () => ({
  defaultDnsResolver: {},
  isPublicHttpTarget: mocks.isPublicHttpTarget,
}))

import { readGuardedX402EvmReceipt } from '@/modules/capability-supply/server'

const transactionHash = `0x${'1'.repeat(64)}`
const blockHash = `0x${'2'.repeat(64)}`
const payer = '0x0000000000000000000000000000000000000001'
const nonce = `0x${'3'.repeat(64)}`

function rpcResult(value: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: value }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function installSuccessfulRpc(asset: string) {
  mocks.fetch.mockImplementation(async (_target: URL, init: RequestInit) => {
    const request = JSON.parse(String(init.body)) as {
      method: string
      params: readonly unknown[]
    }
    switch (request.method) {
      case 'eth_blockNumber':
        return rpcResult('0x70')
      case 'eth_getTransactionReceipt':
        return rpcResult({
          transactionHash,
          transactionIndex: '0x0',
          blockHash,
          blockNumber: '0x64',
          from: payer,
          to: asset,
          cumulativeGasUsed: '0x1',
          gasUsed: '0x1',
          logs: [],
          logsBloom: `0x${'0'.repeat(512)}`,
          status: '0x1',
          effectiveGasPrice: '0x1',
          type: '0x2',
        })
      case 'eth_getTransactionByHash':
        return rpcResult({
          hash: transactionHash,
          blockHash,
          blockNumber: '0x64',
          transactionIndex: '0x0',
          from: payer,
          to: asset,
          input: '0x',
          value: '0x0',
          gas: '0x1',
          gasPrice: '0x1',
          nonce: '0x0',
          v: '0x1',
          r: `0x${'1'.repeat(64)}`,
          s: `0x${'1'.repeat(64)}`,
          type: '0x0',
        })
      case 'eth_getBlockByNumber':
        return rpcResult({
          number: '0x70',
          hash: `0x${'6'.repeat(64)}`,
          parentHash: `0x${'7'.repeat(64)}`,
          nonce: '0x0000000000000000',
          sha3Uncles: `0x${'0'.repeat(64)}`,
          logsBloom: `0x${'0'.repeat(512)}`,
          transactionsRoot: `0x${'0'.repeat(64)}`,
          stateRoot: `0x${'0'.repeat(64)}`,
          receiptsRoot: `0x${'0'.repeat(64)}`,
          miner: '0x0000000000000000000000000000000000000000',
          difficulty: '0x0',
          totalDifficulty: '0x0',
          extraData: '0x',
          size: '0x1',
          gasLimit: '0x1',
          gasUsed: '0x1',
          timestamp: '0x6a948bc0',
          transactions: [],
          uncles: [],
          mixHash: `0x${'0'.repeat(64)}`,
        })
      case 'eth_call':
        return rpcResult(`0x${'0'.repeat(63)}1`)
      default:
        throw new Error(`unexpected_rpc_method:${request.method}`)
    }
  })
}

describe('guarded x402 EVM receipt reader', () => {
  beforeEach(() => {
    mocks.fetch.mockReset()
    mocks.isPublicHttpTarget.mockClear()
  })

  it.each([
    ['sandbox', BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC_ADDRESS],
    ['production', BASE_MAINNET_NETWORK, BASE_MAINNET_USDC_ADDRESS],
  ] as const)('reads the canonical %s profile from its exact USDC contract', async (
    aeEnvironment,
    network,
    asset,
  ) => {
    installSuccessfulRpc(asset)

    await expect(readGuardedX402EvmReceipt({
      target: new URL('https://rpc.example.test'),
      aeEnvironment,
      network,
      asset,
      transactionHash,
      payer,
      nonce,
      dispatcher: {} as never,
    })).resolves.toMatchObject({
      transactionHash,
      status: 'success',
      blockHash,
      blockNumber: 100n,
      confirmations: 13n,
      observedBlockTimestamp: 1_788_120_000n,
      authorizationState: true,
    })

    const call = mocks.fetch.mock.calls
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as {
        method: string
        params: readonly unknown[]
      })
      .find(({ method }) => method === 'eth_call')
    expect(call?.params[0]).toMatchObject({ to: asset })
    expect(call?.params[1]).toBe('0x70')
  })

  it('uses viem confirmation waiting when the caller requires final settlement evidence', async () => {
    installSuccessfulRpc(BASE_SEPOLIA_USDC_ADDRESS)

    await expect(readGuardedX402EvmReceipt({
      target: new URL('https://rpc.example.test'),
      aeEnvironment: 'sandbox',
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      transactionHash,
      payer,
      nonce,
      dispatcher: {} as never,
      minimumConfirmations: 12,
      confirmationTimeoutMs: 60_000,
    })).resolves.toMatchObject({
      transactionHash,
      confirmations: 13n,
      authorizationState: true,
    })
  })

  it('refuses unbounded confirmation waits before any RPC call', async () => {
    await expect(readGuardedX402EvmReceipt({
      target: new URL('https://rpc.example.test'),
      aeEnvironment: 'sandbox',
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      transactionHash,
      payer,
      nonce,
      dispatcher: {} as never,
      minimumConfirmations: 65,
      confirmationTimeoutMs: 60_000,
    })).resolves.toBeUndefined()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['sandbox with mainnet network', 'sandbox', BASE_MAINNET_NETWORK, BASE_SEPOLIA_USDC_ADDRESS],
    ['sandbox with mainnet asset', 'sandbox', BASE_SEPOLIA_NETWORK, BASE_MAINNET_USDC_ADDRESS],
    ['production with testnet network', 'production', BASE_SEPOLIA_NETWORK, BASE_MAINNET_USDC_ADDRESS],
    ['production with testnet asset', 'production', BASE_MAINNET_NETWORK, BASE_SEPOLIA_USDC_ADDRESS],
  ] as const)('refuses %s before any RPC call', async (
    _label,
    aeEnvironment,
    network,
    asset,
  ) => {
    await expect(readGuardedX402EvmReceipt({
      target: new URL('https://rpc.example.test'),
      aeEnvironment,
      network,
      asset,
      transactionHash,
      payer,
      nonce,
      dispatcher: {} as never,
    })).resolves.toBeUndefined()
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.isPublicHttpTarget).not.toHaveBeenCalled()
  })
})
