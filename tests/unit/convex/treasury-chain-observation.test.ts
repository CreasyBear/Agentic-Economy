import { afterEach, describe, expect, it, vi } from 'vitest'
import { toEventSelector } from 'viem'
import { readTreasuryChainObservation, type TreasuryRpc } from '../../../convex/lib/money/treasury/chainObservation'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import type { JsonValue } from '@/modules/common/bounded-json'

afterEach(() => vi.restoreAllMocks())

const now = 1_790_000_000_000
const address = `0x${'1'.repeat(40)}`
const other = `0x${'2'.repeat(40)}`
const asset = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const targets = [new URL('https://rpc-a.example'), new URL('https://rpc-b.example')]
const hash = (value: number) => `0x${value.toString(16).padStart(64, '0')}`
const word = (value: bigint) => `0x${value.toString(16).padStart(64, '0')}`
const checkpoint = { blockNumber: '100', blockHash: hash(100), balanceUnits: '500' }
function log(payer = other, recipient = address, amount = 100n, index = 0) {
  return { address: asset, removed: false, transactionHash: hash(300 + index), blockHash: hash(101),
    blockNumber: '0x65', logIndex: `0x${index.toString(16)}`, data: word(amount),
    topics: [toEventSelector('Transfer(address,address,uint256)'),
      `0x${payer.slice(2).padStart(64, '0')}`, `0x${recipient.slice(2).padStart(64, '0')}`] }
}
function fixture(options: { head?: number; balance?: bigint; logs?: ReturnType<typeof log>[];
  override?: (target: URL, method: string, params: readonly unknown[], normal: JsonValue) => JsonValue } = {}) {
  const calls: { origin: string; method: string; params: readonly unknown[] }[] = []
  const rpc: TreasuryRpc = async (target, method, params) => {
    calls.push({ origin: target.origin, method, params })
    let result: JsonValue
    if (method === 'eth_chainId') result = '0x2105'
    else if (method === 'eth_getBlockByNumber') {
      const number = params[0] === 'finalized' ? options.head ?? 101 : Number(BigInt(String(params[0])))
      result = { number: `0x${number.toString(16)}`, hash: hash(number), timestamp: `0x${Math.floor(now / 1000 - 60).toString(16)}` }
    } else if (method === 'eth_call') result = word(options.balance ?? 600n)
    else if (method === 'eth_getLogs') {
      const query = params[0] as { topics: (string | null)[] }
      result = (options.logs ?? [log()]).filter(entry => query.topics.length === 3
        ? entry.topics[2] === query.topics[2] : entry.topics[1] === query.topics[1])
    } else throw new Error(`unexpected_rpc:${method}`)
    return options.override?.(target, method, params, result) ?? result
  }
  return { calls, rpc }
}
async function read(options: Parameters<typeof fixture>[0] = {}, previous: typeof checkpoint | undefined = checkpoint) {
  const external = fixture(options)
  const result = await readTreasuryChainObservation({ environment: 'production', address, now,
    ...(previous === undefined ? {} : { checkpoint: previous }) }, { rpc: external.rpc, targets })
  return { result, calls: external.calls }
}

describe('treasury finalized chain evidence', () => {
  it('cancels a stalled DNS preflight and refuses late results without waiting for lookup completion', async () => {
    const controller = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    let started!: () => void
    const lookupStarted = new Promise<void>(resolve => { started = resolve })
    const pending: Array<(value: readonly { address: string }[]) => void> = []
    const dns = vi.spyOn(defaultDnsResolver, 'lookup').mockImplementation(async () => {
      started()
      return await new Promise(resolve => pending.push(resolve))
    })
    const result = readTreasuryChainObservation({ environment: 'production', address, now }, { targets })
    await lookupStarted
    controller.abort(new Error('fixture_deadline'))
    expect(await result).toEqual({ kind: 'unavailable', code: 'treasury_chain_unavailable' })
    expect(dns).toHaveBeenCalledTimes(4)
    for (const resolve of pending) resolve([{ address: '8.8.8.8' }])
    // Late preflight results cannot initiate HTTP (which would resolve DNS again
    // through the real Undici Agent's guarded lookup).
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(dns).toHaveBeenCalledTimes(4)
  })

  it('cancels connection DNS after public preflight and destroys pending Undici requests', async () => {
    const controller = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    let started!: () => void
    const lookupStarted = new Promise<void>(resolve => { started = resolve })
    const pending: Array<(value: readonly { address: string }[]) => void> = []
    let lookups = 0
    const dns = vi.spyOn(defaultDnsResolver, 'lookup').mockImplementation(async () => {
      lookups += 1
      if (lookups <= 4) return [{ address: '8.8.8.8' }]
      started()
      return await new Promise(resolve => pending.push(resolve))
    })
    const result = readTreasuryChainObservation({ environment: 'production', address, now }, { targets })
    await lookupStarted
    controller.abort(new Error('fixture_connection_deadline'))
    expect(await result).toEqual({ kind: 'unavailable', code: 'treasury_chain_unavailable' })
    expect(dns.mock.calls.length).toBeGreaterThan(4)
    // Drain our external fixture after cancellation; the non-public address also
    // ensures a late callback cannot open a real network connection in this test.
    for (const resolve of pending) resolve([{ address: '127.0.0.1' }])
  })

  it.each([
    ['https://127.0.0.1', 'https://127.0.0.2'],
    ['https://[::1]', 'https://[fc00::1]'],
  ])('refuses private IP literal RPC targets before network I/O: %s', async (first, second) => {
    const dns = vi.spyOn(defaultDnsResolver, 'lookup')
    expect(await readTreasuryChainObservation({ environment: 'production', address, now }, {
      targets: [new URL(first), new URL(second)],
    })).toEqual({ kind: 'unavailable', code: 'treasury_chain_unavailable' })
    expect(dns).not.toHaveBeenCalled()
  })

  it('pins both providers to the finalized block hash and returns the exact incoming event', async () => {
    const { result, calls } = await read()
    expect(result).toMatchObject({ kind: 'observed', caughtUp: true, fromBlock: '101',
      checkpoint: { blockNumber: '101', balanceUnits: '600' }, transfers: [{ payer: other, recipient: address, amountUnits: '100' }] })
    expect(calls.filter(call => call.method === 'eth_call').map(call => call.params[1]))
      .toEqual([{ blockHash: hash(101), requireCanonical: true }, { blockHash: hash(101), requireCanonical: true }])
    expect(calls.filter(call => call.method === 'eth_getBlockByNumber').every(call => !['latest', 'safe'].includes(String(call.params[0])))).toBe(true)
  })
  it('includes outbound transfers and deduplicates a self-transfer without inflating the balance', async () => {
    const { result } = await read({ logs: [log(), log(address, other, 40n, 1), log(address, address, 30n, 2)], balance: 560n })
    expect(result).toMatchObject({ kind: 'observed', checkpoint: { balanceUnits: '560' } })
    if (result.kind !== 'observed') throw new Error(result.code)
    expect(result.transfers).toHaveLength(3)
  })
  it.each([32 * 60, 60 * 60 - 1, 60 * 60])('bounds finalized-block age separately from read freshness at %i seconds', async age => {
    const { result } = await read({ override: (_target, method, _params, normal) => method === 'eth_getBlockByNumber'
      ? { ...(normal as Record<string, JsonValue>), timestamp: `0x${(now / 1000 - age).toString(16)}` } : normal })
    expect(result.kind).toBe(age < 60 * 60 ? 'observed' : 'unavailable')
    if (result.kind === 'observed') expect(result).toMatchObject({ observedAt: now, blockTimestamp: now - age * 1000 })
  })

  it('opens an empty wallet without fabricating historical transfers', async () => {
    const external = fixture({ balance: 0n })
    const result = await readTreasuryChainObservation({ environment: 'production', address, now }, { rpc: external.rpc, targets })
    expect(result).toMatchObject({ kind: 'observed', transfers: [], fromBlock: '101', checkpoint: { balanceUnits: '0' } })
    expect(external.calls.some(call => call.method === 'eth_getLogs')).toBe(false)
  })
  it.each([
    ['missing logs', { balance: 600n, logs: [] }],
    ['wrong chain', { override: (_target: URL, method: string, _params: readonly unknown[], normal: JsonValue) => method === 'eth_chainId' ? '0x1' : normal }],
    ['provider disagreement', { override: (target: URL, method: string, _params: readonly unknown[], normal: JsonValue) => target.origin === targets[1]!.origin && method === 'eth_call' ? word(601n) : normal }],
    ['checkpoint fork', { override: (_target: URL, method: string, params: readonly unknown[], normal: JsonValue) => method === 'eth_getBlockByNumber' && params[0] === '0x64' ? { ...(normal as Record<string, JsonValue>), hash: hash(999) } : normal }],
    ['noncanonical event block', { override: (_target: URL, method: string, _params: readonly unknown[], normal: JsonValue) => method === 'eth_getLogs' ? (normal as Record<string, JsonValue>[]).map(row => ({ ...row, blockHash: hash(999) })) : normal }],
    ['removed log', { override: (_target: URL, method: string, _params: readonly unknown[], normal: JsonValue) => method === 'eth_getLogs' ? (normal as Record<string, JsonValue>[]).map(row => ({ ...row, removed: true })) : normal }],
    ['stale finalized head', { override: (_target: URL, method: string, params: readonly unknown[], normal: JsonValue) => method === 'eth_getBlockByNumber' && params[0] === 'finalized' ? { ...(normal as Record<string, JsonValue>), timestamp: '0x1' } : normal }],
  ])('refuses %s without treating it as an empty balance', async (_name, options) => {
    expect((await read(options)).result).toMatchObject({ kind: 'unavailable' })
  })
  it('caps catch-up ranges and keeps incomplete history explicit', async () => {
    const { result, calls } = await read({ head: 5000, balance: 500n, logs: [] })
    expect(result).toMatchObject({ kind: 'observed', caughtUp: false, fromBlock: '101', checkpoint: { blockNumber: '2100' } })
    expect(calls.filter(call => call.method === 'eth_getLogs').map(call => (call.params[0] as { toBlock: string }).toBlock))
      .toEqual(['0x834', '0x834', '0x834', '0x834'])
  })
  it.each(['https://rpc-a.example/other-key', 'https://RPC-A.example:8443/key', 'https://rpc-a.example./key'])(
    'rejects the same provider hostname %s before any RPC request', async duplicate => {
    const external = fixture()
    expect(await readTreasuryChainObservation({ environment: 'production', address, now }, {
      rpc: external.rpc, targets: [targets[0]!, new URL(duplicate)],
    })).toMatchObject({ kind: 'unavailable', code: 'treasury_chain_configuration_invalid' })
    expect(external.calls).toHaveLength(0)
  })
})
