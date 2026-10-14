import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from 'undici'

const mocks = vi.hoisted(() => ({
  readGuardedX402EvmReceipt: vi.fn(),
}))

vi.mock('@/modules/capability-supply/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/capability-supply/server')>()),
  readGuardedX402EvmReceiptDetailed: async (input: unknown) => {
    const receipt = await mocks.readGuardedX402EvmReceipt(input)
    return receipt?.kind === 'failed' ? receipt : receipt === undefined ? { kind: 'failed', code: 'receipt_missing', method: 'eth_getTransactionReceipt' }
      : { kind: 'receipt', receipt }
  },
}))

import {
  configuredX402RpcUrl,
  configuredX402RpcUrls,
  readX402EvmReceipt, readX402EvmReceiptDetailed,
} from '@/modules/capability-execution/call-runtime'

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

  it.each([undefined, { retryCount: 0 }] as const)('requires both endpoints to agree with retry policy %s', async rpcRetry => {
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
      undefined,
      rpcRetry,
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
    for (const [input] of mocks.readGuardedX402EvmReceipt.mock.calls) {
      expect(input.transportRetryCount).toBe(rpcRetry?.retryCount)
    }
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

  it('accepts ordinary RPC head skew using the lower confirmation count and timestamp', async () => {
    setRpcConfig(['https://rpc.one.example', 'https://rpc.two.example'])
    mocks.readGuardedX402EvmReceipt
      .mockResolvedValueOnce({ ...receipt, confirmations: 13n, observedBlockTimestamp: receipt.observedBlockTimestamp + 2n })
      .mockResolvedValueOnce(receipt)

    await expect(readX402EvmReceipt(
      NETWORK, ASSET, TRANSACTION_HASH, DISPATCHER, 'production', PAYER, NONCE,
      { minimumConfirmations: 12, timeoutMs: 30_000 },
    )).resolves.toEqual(receipt)
  })

  it('does not borrow confirmations from an ahead-of-peer RPC', async () => {
    setRpcConfig(['https://rpc.one.example', 'https://rpc.two.example'])
    mocks.readGuardedX402EvmReceipt
      .mockResolvedValueOnce(receipt)
      .mockResolvedValueOnce({ ...receipt, confirmations: 11n })

    await expect(readX402EvmReceipt(
      NETWORK, ASSET, TRANSACTION_HASH, DISPATCHER, 'production', PAYER, NONCE,
      { minimumConfirmations: 12, timeoutMs: 30_000 },
    )).resolves.toBeUndefined()
  })

  it('keeps the earliest observed time for expiry proofs of an unused reverted authorization', async () => {
    setRpcConfig(['https://rpc.one.example', 'https://rpc.two.example'])
    const reverted = { ...receipt, status: 'reverted', authorizationState: false }
    mocks.readGuardedX402EvmReceipt
      .mockResolvedValueOnce({ ...reverted, confirmations: 13n, observedBlockTimestamp: receipt.observedBlockTimestamp + 2n })
      .mockResolvedValueOnce(reverted)

    await expect(readX402EvmReceipt(
      NETWORK, ASSET, TRANSACTION_HASH, DISPATCHER, 'production', PAYER, NONCE,
    )).resolves.toEqual(reverted)
  })

  it('refuses a failure proof if an RPC observes the nonce consumed at a later head', async () => {
    setRpcConfig(['https://rpc.one.example', 'https://rpc.two.example'])
    mocks.readGuardedX402EvmReceipt
      .mockResolvedValueOnce({ ...receipt, status: 'reverted', authorizationState: false })
      .mockResolvedValueOnce({ ...receipt, status: 'reverted', confirmations: 13n, observedBlockTimestamp: receipt.observedBlockTimestamp + 2n })

    await expect(readX402EvmReceipt(
      NETWORK, ASSET, TRANSACTION_HASH, DISPATCHER, 'production', PAYER, NONCE,
    )).resolves.toBeUndefined()
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


describe('classified required-provider failures', () => {
  beforeEach(() => { vi.resetAllMocks(); setRpcConfig(['https://rpc.one.example', 'https://rpc.two.example']) })
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
  it('honors the longest required provider Retry-After', async () => {
    mocks.readGuardedX402EvmReceipt.mockResolvedValueOnce({ kind: 'failed', code: 'rpc_timeout', method: 'eth_getTransactionReceipt' })
      .mockResolvedValueOnce({ kind: 'failed', code: 'rpc_rate_limited', method: 'eth_getTransactionReceipt', retryAfterMs: 30_000 })
    expect(await readX402EvmReceiptDetailed(NETWORK, ASSET, TRANSACTION_HASH, DISPATCHER, 'production', PAYER, NONCE,
      undefined, { retryCount: 0 })).toMatchObject({ kind: 'failed', code: 'rpc_rate_limited', retryAfterMs: 30_000 })
  })
  it.each(['missing_first', 'rate_limit_first'] as const)('preserves required-peer overload with completion order %s', async order => {
    vi.useFakeTimers()
    mocks.readGuardedX402EvmReceipt.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, order === 'missing_first' ? 0 : 1))
      return { kind: 'failed', code: 'receipt_missing', method: 'eth_getTransactionReceipt', provider: 'rpc_1', retryAfterMs: 30_000 }
    }).mockImplementationOnce(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, order === 'rate_limit_first' ? 0 : 1))
      return { kind: 'failed', code: 'rpc_rate_limited', method: 'eth_getTransactionReceipt', provider: 'rpc_2', retryAfterMs: 1_000 }
    })
    const pending = readX402EvmReceiptDetailed(NETWORK, ASSET, TRANSACTION_HASH, DISPATCHER, 'production', PAYER, NONCE,
      undefined, { retryCount: 0 })
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toMatchObject({ kind: 'failed', code: 'rpc_rate_limited', provider: 'rpc_2', retryAfterMs: 30_000 })
    expect(mocks.readGuardedX402EvmReceipt).toHaveBeenCalledTimes(2)
  })
  it.each(['receipt_conflict', 'rpc_authentication_failed'] as const)('keeps %s ahead of required-peer overload', async code => {
    mocks.readGuardedX402EvmReceipt.mockResolvedValueOnce({ kind: 'failed', code: 'rpc_rate_limited', method: 'eth_getTransactionReceipt', retryAfterMs: 30_000 })
      .mockResolvedValueOnce({ kind: 'failed', code, method: 'agreement' })
    expect(await readX402EvmReceiptDetailed(NETWORK, ASSET, TRANSACTION_HASH, DISPATCHER, 'production', PAYER, NONCE,
      undefined, { retryCount: 0 })).toMatchObject({ kind: 'failed', code, retryAfterMs: 30_000 })
  })
  it('preserves a known conflict when its peer never responds', async () => {
    vi.useFakeTimers()
    mocks.readGuardedX402EvmReceipt.mockResolvedValueOnce({ kind: 'failed', code: 'receipt_conflict', method: 'eth_getTransactionByHash' })
      .mockImplementationOnce(() => new Promise(() => undefined))
    const pending = readX402EvmReceiptDetailed(NETWORK, ASSET, TRANSACTION_HASH, DISPATCHER, 'production', PAYER, NONCE,
      undefined, { retryCount: 0, deadlineAt: Date.now() + 1_000 })
    await vi.advanceTimersByTimeAsync(1_001)
    expect(await pending).toMatchObject({ kind: 'failed', code: 'receipt_conflict' })
    expect(mocks.readGuardedX402EvmReceipt).toHaveBeenCalledTimes(2)
  })
})
