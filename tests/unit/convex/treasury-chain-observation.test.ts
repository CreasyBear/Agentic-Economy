import { describe, expect, it } from 'vitest'
import { toEventSelector } from 'viem'
import { readTreasuryChainObservation, type TreasuryRpc } from '../../../convex/lib/money/treasury/chainObservation'
import type { JsonValue } from '@/modules/common/bounded-json'

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
  it('rejects duplicate provider origins before any RPC request', async () => {
    const external = fixture()
    expect(await readTreasuryChainObservation({ environment: 'production', address, now }, {
      rpc: external.rpc, targets: [targets[0]!, new URL('https://rpc-a.example/other-key')],
    })).toMatchObject({ kind: 'unavailable', code: 'treasury_chain_configuration_invalid' })
    expect(external.calls).toHaveLength(0)
  })
})
