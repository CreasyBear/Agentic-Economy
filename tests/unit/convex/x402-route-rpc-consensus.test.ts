import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from 'undici'

const mocks = vi.hoisted(() => ({
  readGuardedX402EvmReceipt: vi.fn(),
}))

vi.mock('@/modules/capability-supply/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/capability-supply/server')>()),
  readGuardedX402EvmReceipt: mocks.readGuardedX402EvmReceipt,
}))

import {
  configuredX402RpcUrl,
  configuredX402RpcUrls,
  readX402EvmReceipt,
} from '@/modules/capability-execution/invocation-worker/x402Route'

const NETWORK = 'eip155:8453'
const ASSET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const SANDBOX_NETWORK = 'eip155:84532'
const SANDBOX_ASSET = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const TRANSACTION_HASH = `0x${'1'.repeat(64)}`
const PAYER = '0x0000000000000000000000000000000000000002'
const NONCE = `0x${'a'.repeat(64)}`
const DISPATCHER = {} as Agent

const receipt = {
  transactionHash: TRANSACTION_HASH,
  status: 'success' as const,
  confirmations: 12n,
  blockHash: `0x${'2'.repeat(64)}`,
  blockNumber: 100n,
  observedBlockTimestamp: 1_788_120_000n,
  authorizationState: true,
  transactionTo: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  transactionInput: '0x1234',
  logs: [{
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    data: '0x',
    topics: ['0x01'],
  }],
} as const

describe('x402 RPC receipt consensus', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses one configured endpoint in production', async () => {
    setRpcConfig(['https://rpc.one.example'])
    mocks.readGuardedX402EvmReceipt.mockResolvedValue(receipt)

    await expect(readX402EvmReceipt(
      NETWORK,
      ASSET,
      TRANSACTION_HASH,
      DISPATCHER,
      'production',
      PAYER,
      NONCE,
    )).resolves.toBeUndefined()
    expect(configuredX402RpcUrl(NETWORK, 'production')).toBeUndefined()
    expect(configuredX402RpcUrls(NETWORK, 'production')).toEqual([])
    expect(mocks.readGuardedX402EvmReceipt).not.toHaveBeenCalled()
  })

  it('requires two configured endpoints to return identical receipts', async () => {
    setRpcConfig(['https://rpc.one.example', 'https://rpc.two.example'])
    mocks.readGuardedX402EvmReceipt.mockResolvedValue(receipt)

    await expect(readX402EvmReceipt(
      NETWORK,
      ASSET,
      TRANSACTION_HASH,
      DISPATCHER,
      'production',
      PAYER,
      NONCE,
    )).resolves.toEqual(receipt)
    expect(mocks.readGuardedX402EvmReceipt).toHaveBeenCalledTimes(2)
    expect(callTargets()).toEqual([
      'https://rpc.one.example/',
      'https://rpc.two.example/',
    ])
    expect(mocks.readGuardedX402EvmReceipt.mock.calls[0]?.[0]).toMatchObject({
      network: NETWORK,
      transactionHash: TRANSACTION_HASH,
      payer: PAYER,
      nonce: NONCE,
    })
  })

  it('returns no receipt when either endpoint is unavailable', async () => {
    setRpcConfig(['https://rpc.one.example', 'https://rpc.two.example'])
    mocks.readGuardedX402EvmReceipt
      .mockResolvedValueOnce(receipt)
      .mockResolvedValueOnce(undefined)

    await expect(readX402EvmReceipt(
      NETWORK,
      ASSET,
      TRANSACTION_HASH,
      DISPATCHER,
      'production',
      PAYER,
      NONCE,
    )).resolves.toBeUndefined()
    expect(mocks.readGuardedX402EvmReceipt).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['block identity', { blockHash: `0x${'3'.repeat(64)}` }],
    ['block number', { blockNumber: 101n }],
    ['observed block timestamp', { observedBlockTimestamp: 1_788_120_001n }],
    ['authorization state', { authorizationState: false }],
  ])('returns no receipt when endpoints disagree on %s', async (_label, difference) => {
    setRpcConfig(['https://rpc.one.example', 'https://rpc.two.example'])
    mocks.readGuardedX402EvmReceipt
      .mockResolvedValueOnce(receipt)
      .mockResolvedValueOnce({ ...receipt, ...difference })

    await expect(readX402EvmReceipt(
      NETWORK,
      ASSET,
      TRANSACTION_HASH,
      DISPATCHER,
      'production',
      PAYER,
      NONCE,
    )).resolves.toBeUndefined()
    expect(mocks.readGuardedX402EvmReceipt).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['too many endpoints', ['https://rpc.one.example', 'https://rpc.two.example', 'https://rpc.three.example']],
    ['duplicate endpoints', ['https://rpc.one.example', 'https://rpc.one.example/']],
    ['non-HTTPS endpoint', ['http://rpc.one.example']],
    ['empty endpoint list', []],
  ])('rejects %s configuration', (_label, value) => {
    setRpcConfig(value)

    expect(configuredX402RpcUrls(NETWORK, 'production')).toEqual([])
    expect(configuredX402RpcUrl(NETWORK, 'production')).toBeUndefined()
  })

  it('allows one Base Sepolia endpoint only in sandbox', async () => {
    setRpcConfig(['https://rpc.sandbox.example'], SANDBOX_NETWORK)
    mocks.readGuardedX402EvmReceipt.mockResolvedValue(receipt)

    await expect(readX402EvmReceipt(
      SANDBOX_NETWORK,
      SANDBOX_ASSET,
      TRANSACTION_HASH,
      DISPATCHER,
      'sandbox',
      PAYER,
      NONCE,
    )).resolves.toEqual(receipt)
    expect(mocks.readGuardedX402EvmReceipt).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['production testnet', 'production', SANDBOX_NETWORK, SANDBOX_ASSET],
    ['sandbox mainnet', 'sandbox', NETWORK, ASSET],
    ['crossed mainnet network', 'production', NETWORK, SANDBOX_ASSET],
    ['crossed testnet network', 'sandbox', SANDBOX_NETWORK, ASSET],
  ] as const)('refuses %s before RPC', async (_label, environment, network, asset) => {
    setRpcConfig(['https://rpc.one.example', 'https://rpc.two.example'], network)

    await expect(readX402EvmReceipt(
      network,
      asset,
      TRANSACTION_HASH,
      DISPATCHER,
      environment,
      PAYER,
      NONCE,
    )).resolves.toBeUndefined()
    expect(mocks.readGuardedX402EvmReceipt).not.toHaveBeenCalled()
  })

  it('rejects malformed and oversized configuration', () => {
    vi.stubEnv('AE_X402_RPC_URLS_JSON', '{not-json')
    expect(configuredX402RpcUrls(NETWORK, 'production')).toEqual([])

    vi.stubEnv('AE_X402_RPC_URLS_JSON', 'x'.repeat(16_385))
    expect(configuredX402RpcUrls(NETWORK)).toEqual([])
  })
})

function setRpcConfig(value: unknown, network = NETWORK): void {
  vi.stubEnv('AE_X402_RPC_URLS_JSON', JSON.stringify({ [network]: value }))
}

function callTargets(): string[] {
  return mocks.readGuardedX402EvmReceipt.mock.calls
    .map(([input]) => (input as { target: URL }).target.href)
    .sort()
}
