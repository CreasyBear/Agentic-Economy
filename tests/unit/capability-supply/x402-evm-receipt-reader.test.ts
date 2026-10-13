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

import { readGuardedX402EvmReceipt, readGuardedX402EvmReceiptDetailed, readGuardedX402UnusedAuthorization } from '@/modules/capability-supply/server'
import { decodeFunctionData } from 'viem'
import { eip3009ABI } from '@x402/evm'

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

  it.each([undefined, 0] as const)('bounds actual failed RPC attempts with transport retry count %s', async transportRetryCount => {
    mocks.fetch.mockImplementation(async () => new Response('quota exhausted', { status: 429 }))
    await expect(readGuardedX402EvmReceipt({
      target: new URL('https://rpc.example.test'), aeEnvironment: 'production',
      network: BASE_MAINNET_NETWORK, asset: BASE_MAINNET_USDC_ADDRESS,
      transactionHash, payer, nonce, dispatcher: {} as never,
      ...(transportRetryCount === undefined ? {} : { transportRetryCount }),
    })).resolves.toBeUndefined()
    expect(mocks.fetch).toHaveBeenCalledTimes(transportRetryCount === undefined ? 4 : 1)
    expect(mocks.fetch.mock.calls.every(([, init]) => JSON.parse(String((init as RequestInit).body)).method === 'eth_getTransactionReceipt')).toBe(true)
  })

  it('reads mined transaction evidence and the confirmation head after the receipt wait completes', async () => {
    installSuccessfulRpc(BASE_SEPOLIA_USDC_ADDRESS)
    const respond = mocks.fetch.getMockImplementation()!
    let receiptReturned = false
    mocks.fetch.mockImplementation(async (target: URL, init: RequestInit) => {
      const request = JSON.parse(String(init.body)) as { method: string }
      if (request.method === 'eth_getTransactionReceipt') {
        await new Promise(resolve => setTimeout(resolve, 20))
        receiptReturned = true
      }
      const response = await respond(target, init) as Response
      if (request.method === 'eth_getTransactionByHash' && !receiptReturned) {
        const body = await response.json() as { result: Record<string, unknown> }
        return rpcResult({ ...body.result, blockHash: null, blockNumber: null, transactionIndex: null })
      }
      if (request.method === 'eth_getBlockByNumber' && !receiptReturned) {
        const body = await response.json() as { result: Record<string, unknown> }
        return rpcResult({ ...body.result, number: '0x64' })
      }
      return response
    })
    await expect(readGuardedX402EvmReceipt({
      target: new URL('https://rpc.example.test'), aeEnvironment: 'sandbox',
      network: BASE_SEPOLIA_NETWORK, asset: BASE_SEPOLIA_USDC_ADDRESS,
      transactionHash, payer, nonce, dispatcher: {} as never,
      minimumConfirmations: 12, confirmationTimeoutMs: 1_000,
    })).resolves.toMatchObject({ confirmations: 13n, authorizationState: true })
  })

  it.each([
    ['still pending', { blockHash: null, blockNumber: null, transactionIndex: null }],
    ['in a different block', { blockHash: `0x${'8'.repeat(64)}` }],
  ])('refuses a transaction that is %s after receipt confirmation', async (_label, transactionFields) => {
    installSuccessfulRpc(BASE_SEPOLIA_USDC_ADDRESS)
    const respond = mocks.fetch.getMockImplementation()!
    mocks.fetch.mockImplementation(async (target: URL, init: RequestInit) => {
      const request = JSON.parse(String(init.body)) as { method: string }
      const response = await respond(target, init) as Response
      if (request.method !== 'eth_getTransactionByHash') return response
      const body = await response.json() as { result: Record<string, unknown> }
      return rpcResult({ ...body.result, ...transactionFields })
    })
    await expect(readGuardedX402EvmReceipt({
      target: new URL('https://rpc.example.test'), aeEnvironment: 'sandbox',
      network: BASE_SEPOLIA_NETWORK, asset: BASE_SEPOLIA_USDC_ADDRESS,
      transactionHash, payer, nonce, dispatcher: {} as never,
      minimumConfirmations: 12, confirmationTimeoutMs: 1_000,
    })).resolves.toBeUndefined()
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

  it('waits for the caller confirmation threshold through the bounded reader', async () => {
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

describe('expired unused x402 authorization proof', () => {
  const input = {
    target: new URL('https://rpc.example.test'), aeEnvironment: 'sandbox' as const,
    network: BASE_SEPOLIA_NETWORK, asset: BASE_SEPOLIA_USDC_ADDRESS,
    payer, nonce, dispatcher: {} as never, expiresAt: 1_788_120_000_000,
  }
  const block = { hash: blockHash, number: '0x70', timestamp: '0x6a948bc0' }

  beforeEach(() => {
    mocks.fetch.mockReset()
    mocks.isPublicHttpTarget.mockResolvedValue(true)
  })

  it('proves an unused authorization at the exclusive expiry bound using the exact safe block hash', async () => {
    mocks.fetch.mockResolvedValueOnce(rpcResult(block))
      .mockResolvedValueOnce(rpcResult(`0x${'0'.repeat(64)}`))
    await expect(readGuardedX402UnusedAuthorization(input)).resolves.toEqual({
      blockHash, blockNumber: 112n, blockTimestamp: 1_788_120_000n, authorizationState: false,
    })
    const requests = mocks.fetch.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    expect(requests[0]).toMatchObject({ method: 'eth_getBlockByNumber', params: ['safe', false] })
    expect(requests[1]).toMatchObject({ method: 'eth_call', params: [
      { to: BASE_SEPOLIA_USDC_ADDRESS }, { blockHash, requireCanonical: true },
    ] })
    expect(decodeFunctionData({ abi: eip3009ABI, data: requests[1].params[0].data })).toMatchObject({
      functionName: 'authorizationState', args: [payer, nonce],
    })
  })

  it('does not round a millisecond expiry down to an earlier safe block', async () => {
    mocks.fetch.mockResolvedValueOnce(rpcResult(block))
    await expect(readGuardedX402UnusedAuthorization({ ...input, expiresAt: input.expiresAt + 1 })).resolves.toBeUndefined()
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['used nonce', `0x${'0'.repeat(63)}1`], ['invalid boolean', '0x00'],
    ['missing state', null], ['non-boolean word', `0x${'0'.repeat(63)}2`],
  ])('refuses %s', async (_label, state) => {
    mocks.fetch.mockResolvedValueOnce(rpcResult(block)).mockResolvedValueOnce(rpcResult(state))
    await expect(readGuardedX402UnusedAuthorization(input)).resolves.toBeUndefined()
  })

  it.each([
    ['missing safe block', null], ['missing hash', { ...block, hash: null }],
    ['invalid number', { ...block, number: '0x00' }], ['invalid timestamp', { ...block, timestamp: '-1' }],
  ])('refuses %s without falling back to latest', async (_label, value) => {
    mocks.fetch.mockResolvedValueOnce(rpcResult(value))
    await expect(readGuardedX402UnusedAuthorization(input)).resolves.toBeUndefined()
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('refuses a block that loses canonical status before the nonce read', async () => {
    mocks.fetch.mockResolvedValueOnce(rpcResult(block)).mockResolvedValueOnce(new Response(JSON.stringify({
      jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'block is not canonical' },
    })))
    await expect(readGuardedX402UnusedAuthorization(input)).resolves.toBeUndefined()
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['wrong chain', { network: BASE_MAINNET_NETWORK }], ['wrong asset', { asset: BASE_MAINNET_USDC_ADDRESS }],
    ['invalid payer', { payer: 'no' }], ['invalid nonce', { nonce: '0x12' }],
    ['HTTP target', { target: new URL('http://rpc.example.test') }],
    ['invalid expiry', { expiresAt: Number.NaN }],
  ])('refuses %s before RPC', async (_label, change) => {
    await expect(readGuardedX402UnusedAuthorization({ ...input, ...change })).resolves.toBeUndefined()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('refuses private network targets', async () => {
    mocks.isPublicHttpTarget.mockResolvedValueOnce(false)
    await expect(readGuardedX402UnusedAuthorization(input)).resolves.toBeUndefined()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})


describe('classified bounded receipt reads', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.isPublicHttpTarget.mockResolvedValue(true) })
  const input = () => ({ target: new URL('https://rpc.example.test/private-api-key'), aeEnvironment: 'sandbox' as const,
    network: BASE_SEPOLIA_NETWORK, asset: BASE_SEPOLIA_USDC_ADDRESS, transactionHash, payer, nonce,
    dispatcher: {} as never, transportRetryCount: 0 as const })

  it('polls missing then immature evidence until twelve confirmations under the original deadline', async () => {
    vi.useFakeTimers()
    try {
      installSuccessfulRpc(BASE_SEPOLIA_USDC_ADDRESS)
      const successful = mocks.fetch.getMockImplementation()!
      let receipts = 0
      mocks.fetch.mockImplementation(async (target: URL, init: RequestInit) => {
        const { method } = JSON.parse(String(init.body))
        if (method === 'eth_getTransactionReceipt' && ++receipts === 1) return rpcResult(null)
        if (method === 'eth_getBlockByNumber') {
          const response = await successful(target, init)
          const payload = await response.json()
          return rpcResult({ ...payload.result, number: receipts === 2 ? '0x64' : '0x6f' })
        }
        return await successful(target, init)
      })
      const pending = readGuardedX402EvmReceiptDetailed({ ...input(), minimumConfirmations: 12,
        confirmationTimeoutMs: 5_000, deadlineAt: Date.now() + 5_000 })
      await vi.advanceTimersByTimeAsync(1)
      expect(receipts).toBe(1)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(receipts).toBe(2)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(await pending).toMatchObject({ kind: 'receipt', receipt: { confirmations: 12n } })
      const calls = mocks.fetch.mock.calls.length
      await vi.advanceTimersByTimeAsync(10_000)
      expect(mocks.fetch).toHaveBeenCalledTimes(calls)
    } finally { vi.useRealTimers() }
  })

  it.each(['missing', 'immature'] as const)('stops permanently %s evidence before the original deadline with no late HTTP', async fault => {
    vi.useFakeTimers()
    try {
      installSuccessfulRpc(BASE_SEPOLIA_USDC_ADDRESS)
      const successful = mocks.fetch.getMockImplementation()!
      mocks.fetch.mockImplementation(async (target: URL, init: RequestInit) => {
        const { method } = JSON.parse(String(init.body))
        if (method === 'eth_getTransactionReceipt' && fault === 'missing') return rpcResult(null)
        if (method === 'eth_getBlockByNumber') {
          const payload = await (await successful(target, init)).json()
          return rpcResult({ ...payload.result, number: '0x64' })
        }
        return await successful(target, init)
      })
      const pending = readGuardedX402EvmReceiptDetailed({ ...input(), minimumConfirmations: 12,
        confirmationTimeoutMs: 60_000, deadlineAt: Date.now() + 1_500 })
      await vi.advanceTimersByTimeAsync(1_001)
      expect(await pending).toMatchObject({ kind: 'failed', code: fault === 'missing' ? 'receipt_missing' : 'receipt_immature' })
      const calls = mocks.fetch.mock.calls.length
      await vi.advanceTimersByTimeAsync(60_000)
      expect(mocks.fetch).toHaveBeenCalledTimes(calls)
      expect(mocks.fetch.mock.calls.some(([, init]) => JSON.parse(String(init.body)).method === 'eth_call')).toBe(false)
    } finally { vi.useRealTimers() }
  })

  it.each(['authentication', 'malformed'] as const)('does not retry %s when twelve confirmations are requested', async fault => {
    mocks.fetch.mockResolvedValue(fault === 'authentication' ? new Response('private', { status: 401 }) : new Response('{invalid'))
    const { transportRetryCount, ...defaultRetryInput } = input()
    void transportRetryCount
    const result = await readGuardedX402EvmReceiptDetailed({ ...defaultRetryInput,
      minimumConfirmations: 12, confirmationTimeoutMs: 60_000 })
    expect(result).toMatchObject({ kind: 'failed', code: fault === 'authentication' ? 'rpc_authentication_failed' : 'rpc_invalid_response' })
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })

  it.each([[401, 'rpc_authentication_failed'], [403, 'rpc_authentication_failed'],
    [429, 'rpc_rate_limited'], [503, 'rpc_transport_unavailable']] as const)(
    'classifies HTTP %s without leaking target or response content', async (status, code) => {
      mocks.fetch.mockResolvedValue(new Response('private-provider-detail', { status, headers: { 'retry-after': '2' } }))
      const result = await readGuardedX402EvmReceiptDetailed(input())
      expect(result).toMatchObject({ kind: 'failed', code, httpStatus: status, retryAfterMs: 2_000,
        provider: 'rpc_1', method: 'eth_getTransactionReceipt' })
      expect(JSON.stringify(result)).not.toMatch(/private-api-key|private-provider-detail/)
      expect(mocks.fetch).toHaveBeenCalledOnce()
    },
  )

  it('never hides authentication failure behind nested transport retry', async () => {
    mocks.fetch.mockResolvedValue(new Response('denied', { status: 401 }))
    const { transportRetryCount: _retry, ...defaultInput } = input()
    expect(await readGuardedX402EvmReceiptDetailed(defaultInput)).toMatchObject({ code: 'rpc_authentication_failed' })
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })

  it.each(['invalid-json', 'wrong-id', 'contradictory-envelope', 'missing-receipt'])(
    'preserves protocol failure identity: %s', async mode => {
      mocks.fetch.mockResolvedValue(new Response(mode === 'invalid-json' ? '{' : JSON.stringify(
        mode === 'wrong-id' ? { jsonrpc: '2.0', id: 8, result: null }
          : mode === 'contradictory-envelope' ? { jsonrpc: '2.0', id: 1, result: null, error: { code: 429 } }
            : { jsonrpc: '2.0', id: 1, result: null }), { status: 200 }))
      expect(await readGuardedX402EvmReceiptDetailed(input())).toMatchObject({ kind: 'failed',
        code: mode === 'missing-receipt' ? 'receipt_missing' : 'rpc_invalid_response' })
      expect(mocks.fetch).toHaveBeenCalledOnce()
    },
  )

  it('preserves a receipt/transaction contradiction without calling nonce state or retrying', async () => {
    installSuccessfulRpc(BASE_SEPOLIA_USDC_ADDRESS)
    const respond = mocks.fetch.getMockImplementation()!
    mocks.fetch.mockImplementation(async (target: URL, init: RequestInit) => {
      const response = await respond(target, init) as Response
      if (JSON.parse(String(init.body)).method !== 'eth_getTransactionByHash') return response
      const body = await response.json()
      return rpcResult({ ...body.result, blockHash: `0x${'8'.repeat(64)}` })
    })
    expect(await readGuardedX402EvmReceiptDetailed(input())).toMatchObject({ code: 'receipt_conflict' })
    expect(mocks.fetch.mock.calls.map(([, init]) => JSON.parse(String(init.body)).method)).not.toContain('eth_call')
  })

  it('bounds DNS and starts no late HTTP request after the shared deadline', async () => {
    vi.useFakeTimers()
    try {
      let release!: (value: boolean) => void
      mocks.isPublicHttpTarget.mockImplementationOnce(() => new Promise<boolean>(resolve => { release = resolve }))
      const pending = readGuardedX402EvmReceiptDetailed({ ...input(), deadlineAt: Date.now() + 20 })
      await vi.advanceTimersByTimeAsync(21)
      expect(await pending).toMatchObject({ code: 'rpc_deadline_exceeded', method: 'dns' })
      release(true)
      await Promise.resolve()
      expect(mocks.fetch).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })

  it.each(['fetch', 'body'])('aborts a stalled %s at the caller deadline', async mode => {
    vi.useFakeTimers()
    try {
      const cancel = vi.fn()
      if (mode === 'fetch') mocks.fetch.mockImplementation(() => new Promise(() => undefined))
      else mocks.fetch.mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 200 }))
      const pending = readGuardedX402EvmReceiptDetailed({ ...input(), deadlineAt: Date.now() + 20 })
      await vi.advanceTimersByTimeAsync(21)
      expect(await pending).toMatchObject({ code: 'rpc_deadline_exceeded' })
      const init = mocks.fetch.mock.calls[0]?.[1] as RequestInit | undefined
      expect(init?.signal?.aborted).toBe(true)
      if (mode === 'body') expect(cancel).toHaveBeenCalledOnce()
    } finally { vi.useRealTimers() }
  })
})
