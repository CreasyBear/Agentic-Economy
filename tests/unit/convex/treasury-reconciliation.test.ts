/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { FORMANCE_SCHEMA, FORMANCE_SCHEMA_VERSION, PROMOTIONAL_FORMANCE_SCHEMA,
  type FormanceContext } from '@/modules/money/formance'
import type { TreasuryChainCheckpoint, TreasuryChainObservation, TreasuryTransfer } from '@/modules/money/treasury'
import { reconcileTreasuryDeposits } from '../../../convex/lib/money/treasury/deposits'
import { readTreasuryChainObservation, type TreasuryRpc } from '../../../convex/lib/money/treasury/chainObservation'
import type { JsonValue } from '@/modules/common/bounded-json'
import { internal } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'

const external = vi.hoisted(() => ({ sdk: vi.fn(), balance: vi.fn() }))
vi.mock('@formance/formance-sdk', async original => ({
  ...(await original<typeof import('@formance/formance-sdk')>()),
  SDK: class { constructor() { return external.sdk() } },
}))
vi.mock('@coinbase/cdp-sdk', async original => ({
  ...(await original<typeof import('@coinbase/cdp-sdk')>()),
  CdpClient: class { evm = { listTokenBalances: external.balance } },
}))

const modules = Object.fromEntries(Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
  .map(([path, load]) => [path.replace('../../../convex/', './'), load]))
const NOW = Date.UTC(2026, 9, 1, 12)
const WALLET = `0x${'1'.repeat(40)}`
const OTHER = `0x${'2'.repeat(40)}`
const ASSET = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
const NETWORK = 'eip155:84532'
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`
const nativeRef = (n: number) => `ae-p4:${n.toString(16).padStart(64, '0')}:treasury-deposit`

beforeEach(() => {
  external.sdk.mockReset()
  external.balance.mockReset()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  for (const [key, value] of Object.entries({
    AE_DEPLOYMENT_ENVIRONMENT: 'development', AE_X402_CUSTODY_ENABLED: 'true',
    AE_X402_CUSTODY_MAX_ATOMIC: '1', AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '100000',
    CDP_API_KEY_ID: 'fixture-key', CDP_API_KEY_SECRET: 'fixture-secret', CDP_WALLET_SECRET: 'fixture-secret',
    AE_X402_CDP_ACCOUNT_NAME: 'fixture-wallet', AE_X402_CDP_EXPECTED_EVM_ADDRESS: WALLET,
    AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-4111-8111-111111111111',
    AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-4222-8222-222222222222',
    AE_X402_CDP_POLICY_RULES_DIGEST: canonicalDigest('fixture-policy'), AE_X402_CDP_CREDENTIAL_GENERATION: '1',
  })) vi.stubEnv(key, value)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

function checkpoint(blockNumber = '100', balanceUnits = '100'): TreasuryChainCheckpoint {
  return { blockNumber, blockHash: hash(Number(blockNumber)), balanceUnits }
}
function transfer(index = 0, amountUnits = '5', payer = OTHER, recipient = WALLET): TreasuryTransfer {
  const material = { transactionHash: hash(200 + index), logIndex: index, blockNumber: '101',
    blockHash: hash(101), payer, recipient, amountUnits }
  return { ...material, evidenceDigest: canonicalDigest({ kind: 'ae.treasury-transfer:v1', network: NETWORK, asset: ASSET, ...material }) }
}
function observation(previous: TreasuryChainCheckpoint | null = checkpoint(), transfers = [transfer()]): TreasuryChainObservation {
  const balance = previous === null ? 0n : transfers.reduce((units, item) => units
    + (item.recipient === WALLET ? BigInt(item.amountUnits) : 0n)
    - (item.payer === WALLET ? BigInt(item.amountUnits) : 0n), BigInt(previous.balanceUnits))
  return { kind: 'observed', environment: 'sandbox', network: NETWORK, asset: ASSET, address: WALLET,
    fromBlock: previous === null ? '100' : (BigInt(previous.blockNumber) + 1n).toString(),
    checkpoint: checkpoint(previous === null ? '100' : '101', balance.toString()),
    blockTimestamp: NOW - 1000, transfers: previous === null ? [] : transfers, caughtUp: true, observedAt: NOW }
}
function backendFixture() {
  const backend = convexTest(schema, modules)
  let crashBeforeFinish = false
  const ctx = {
    runQuery: async (ref: never, args: never) =>
      await (backend.query as (target: never, payload: never) => Promise<unknown>)(ref, args),
    runMutation: async (ref: never, args: never) => {
      if (getFunctionName(ref) === 'moneyTreasuryReconciliation:finishBatch' && crashBeforeFinish) {
        crashBeforeFinish = false
        throw new Error('crash_after_native_posting')
      }
      return await (backend.mutation as (target: never, payload: never) => Promise<unknown>)(ref, args)
    },
  } as unknown as Parameters<typeof reconcileTreasuryDeposits>[0]
  const read = () => backend.query(internal.moneyTreasuryReconciliation.readProgress, {})
  const begin = (previousCheckpoint: TreasuryChainCheckpoint | null, next: TreasuryChainObservation) =>
    backend.mutation(internal.moneyTreasuryReconciliation.beginBatch, { previousCheckpoint, observation: next })
  const finish = (batchRef: string, transactionRefs: string[]) =>
    backend.mutation(internal.moneyTreasuryReconciliation.finishBatch, { batchRef, transactionRefs })
  const rows = () => backend.run(async db => ({ cursors: await db.db.query('moneyTreasuryCursors').collect(),
    batches: await db.db.query('moneyTreasuryBatches').collect() }))
  async function ready(balanceUnits = '100') {
    const next = observation(null)
    next.checkpoint.balanceUnits = balanceUnits
    const pending = await begin(null, next)
    if (pending.kind !== 'pending') throw new Error('fixture_opening_refused')
    expect(await finish(pending.batch.batchRef, balanceUnits === '0' ? [] : [nativeRef(1), nativeRef(99)]))
      .toEqual({ kind: 'completed', replayed: false })
    return next.checkpoint
  }
  return { backend, ctx, read, begin, finish, rows, ready, crashBeforeFinish: () => { crashBeforeFinish = true } }
}

/** External SDK fixture: native transaction identities/postings survive process-level controller failure. */
function ledgerFixture(options: { legacyActivity?: boolean; hideReadback?: boolean; health?: 'unhealthy' | 'missing_schema'; bufferUnits?: bigint } = {}) {
  type Transaction = { id: bigint; reference: string; template: string; metadata: Record<string, string>;
    postings: Array<{ source: string; destination: string; asset: string; amount: bigint }> }
  const transactions = new Map<string, Transaction>()
  const balances = new Map<string, bigint>()
  const custodyRef = canonicalDigest({ kind: 'ae.x402.custody-budget:v1', network: NETWORK, expectedEvmAddress: WALLET })
  const bufferAddress = `treasury:corporate:${canonicalDigest({ kind: 'ae.treasury-buffer-account:v1', custodyRef, custodyGeneration: 1 }).slice(7)}:committed`
  const initialBuffer = options.bufferUnits ?? 1n
  if (initialBuffer > 0n) balances.set(bufferAddress, initialBuffer)
  type Command = { reference: string; metadata: Record<string, string>; script: { template: string; vars: Record<string, string> } }
  function apply(command: Command, targetTransactions: Map<string, Transaction>, targetBalances: Map<string, bigint>) {
    const existing = targetTransactions.get(command.reference)
    if (existing !== undefined) {
      if (existing.metadata.command_digest !== command.metadata.command_digest) throw Object.assign(new Error('conflict'), { statusCode: 409 })
      return existing
    }
    const credit = command.script.template === 'TREASURY_CAPACITY_SYNCED'
    const source = credit ? 'world' : command.script.vars.source!
    const destination = credit ? command.script.vars.capacity! : command.script.vars.destination!
    const amount = BigInt(command.script.vars.amount!.split(' ')[1]!)
    if (!credit && (targetBalances.get(source) ?? 0n) < amount) throw new Error('insufficient_native_balance')
    const transaction: Transaction = { id: BigInt(targetTransactions.size + 1), reference: command.reference,
      template: command.script.template, metadata: command.metadata,
      postings: [{ source, destination, asset: 'USDC/6', amount }] }
    targetTransactions.set(command.reference, transaction)
    targetBalances.set(destination, (targetBalances.get(destination) ?? 0n) + amount)
    if (!credit) targetBalances.set(source, targetBalances.get(source)! - amount)
    return transaction
  }
  const ledger = {
    getSchema: async ({ version }: { version: string }) => {
      if (options.health === 'missing_schema') throw Object.assign(new Error('ledger_not_provisioned'), { statusCode: 404 })
      return { v2SchemaResponse: { data: { version, ...(version === FORMANCE_SCHEMA_VERSION ? FORMANCE_SCHEMA : PROMOTIONAL_FORMANCE_SCHEMA) } } }
    },
    listTransactions: async ({ query }: { query: { $match: { reference: string } } }) => ({
      v2TransactionsCursorResponse: { cursor: { data: options.hideReadback ? []
        : transactions.has(query.$match.reference) ? [transactions.get(query.$match.reference)] : [] } },
    }),
    createTransaction: async ({ v2PostTransaction: command }: { v2PostTransaction: Command }) =>
      ({ v2CreateTransactionResponse: { data: apply(command, transactions, balances) } }),
    createBulk: async ({ requestBody, atomic }: { atomic: boolean; requestBody: Array<{ data: Command }> }) => {
      if (!atomic) throw new Error('treasury_requires_atomic_native_bulk')
      const stagedTransactions = new Map(transactions)
      const stagedBalances = new Map(balances)
      const rows = requestBody.map(({ data }, index) => ({ responseType: 'CREATE_TRANSACTION', logID: index + 1,
        data: apply(data, stagedTransactions, stagedBalances) }))
      for (const [ref, tx] of stagedTransactions) transactions.set(ref, tx)
      for (const [address, units] of stagedBalances) balances.set(address, units)
      return { v2BulkResponse: { data: rows } }
    },
    getAccount: async ({ address }: { address: string }) => ({ v2AccountResponse: { data:
      options.legacyActivity ? { address, volumes: { 'USDC/6': { input: 20n, output: 20n, balance: 0n } } }
        : balances.has(address) ? { address, volumes: { 'USDC/6': {
          input: [...transactions.values()].flatMap(tx => tx.postings).reduce((sum, posting) => sum + (posting.destination === address ? posting.amount : 0n), address === bufferAddress ? initialBuffer : 0n),
          output: [...transactions.values()].flatMap(tx => tx.postings).reduce((sum, posting) => sum + (posting.source === address ? posting.amount : 0n), 0n),
          balance: balances.get(address),
        } } } : undefined } }),
  }
  const context = { configuration: { environment: 'sandbox', ledger: 'treasury-evaluation' },
    sdk: { ledger: { v2: ledger }, getVersions: async () => ({ getVersionsResponse: {
      versions: [{ name: 'ledger', version: 'v2.4.14', health: options.health !== 'unhealthy' }],
    } }) } } as unknown as FormanceContext
  return { context, transactions, balances, availableBalance: () => [...balances].find(([address]) => address.endsWith(':available'))?.[1] ?? 0n,
    bufferBalance: () => balances.get(bufferAddress) ?? 0n }
}

describe('treasury durable range and native posting recovery', () => {
  it('chooses one immutable range from concurrent different observations with the same predecessor', async () => {
    const f = backendFixture()
    const previous = await f.ready()
    const a = observation(previous, [transfer(0, '5')])
    const b = observation(previous, [transfer(1, '7')])
    const results = await Promise.all([f.begin(previous, a), f.begin(previous, b)])
    expect(results.map(result => result.kind)).toEqual(['pending', 'pending'])
    const first = results[0]
    if (first.kind !== 'pending') throw new Error('range_not_owned')
    expect(results[1]).toEqual(first)
    expect([a, b]).toContainEqual(first.batch.observation)
    const before = await f.rows()
    expect(before.cursors).toHaveLength(1)
    expect(before.batches.filter(batch => batch.state.kind === 'pending')).toHaveLength(1)
    expect(await f.begin(previous, b)).toEqual(first)
    expect(await f.rows()).toEqual(before)
  })

  it('retries native posting after a finish crash using the same pending range and references without reading the chain', async () => {
    const f = backendFixture()
    const previous = await f.ready()
    const ledger = ledgerFixture()
    const chainRead = vi.fn(async () => observation(previous))
    f.crashBeforeFinish()
    await expect(reconcileTreasuryDeposits(f.ctx, { formance: ledger.context, chainRead, admit: async () => true }))
      .rejects.toThrow('crash_after_native_posting')
    const pending = await f.read()
    expect(pending).toMatchObject({ kind: 'pending', batch: { previousCheckpoint: previous, state: { kind: 'pending' } } })
    const refs = [...ledger.transactions.keys()]
    expect(refs).toHaveLength(1)
    expect(ledger.availableBalance()).toBe(5n)
    expect(ledger.bufferBalance()).toBe(1n)
    chainRead.mockRejectedValue(new Error('pending_must_not_read_chain'))
    vi.mocked(Date.now).mockReturnValue(NOW + 60_000)
    expect(await reconcileTreasuryDeposits(f.ctx, { formance: ledger.context, chainRead, admit: async () => true }))
      .toMatchObject({ kind: 'completed', caughtUp: true })
    expect(chainRead).toHaveBeenCalledOnce()
    expect([...ledger.transactions.keys()]).toEqual(refs)
    expect(ledger.availableBalance()).toBe(5n)
    expect(ledger.bufferBalance()).toBe(1n)
    expect(await f.read()).toMatchObject({ kind: 'ready', checkpoint: observation(previous).checkpoint })
    const before = await f.rows()
    if (pending.kind !== 'pending') throw new Error('pending_missing')
    expect(await f.finish(pending.batch.batchRef, refs)).toEqual({ kind: 'completed', replayed: true })
    expect(await f.rows()).toEqual(before)
  })

  it('refuses legacy treasury activity even when current native and chain balances are both zero', async () => {
    const f = backendFixture()
    const ledger = ledgerFixture({ legacyActivity: true, bufferUnits: 0n })
    expect(await reconcileTreasuryDeposits(f.ctx, { formance: ledger.context, chainRead: async () => observation(null), admit: async () => true }))
      .toEqual({ kind: 'unavailable', code: 'treasury_legacy_cutover_required' })
    expect(await f.read()).toMatchObject({ kind: 'pending', batch: { previousCheckpoint: null } })
    expect(ledger.transactions.size).toBe(0)
    expect((await f.rows()).cursors[0]?.state.kind).toBe('opening')
  })

  it('establishes an empty clean opening checkpoint before booking a later positive deposit', async () => {
    vi.stubEnv('AE_X402_CUSTODY_MAX_ATOMIC', '10000')
    const f = backendFixture()
    const ledger = ledgerFixture({ bufferUnits: 0n })
    const opening = observation(null)
    expect(await reconcileTreasuryDeposits(f.ctx, { formance: ledger.context, chainRead: async () => opening, admit: async () => true }))
      .toMatchObject({ kind: 'completed', caughtUp: true })
    expect(await f.read()).toMatchObject({ kind: 'ready', checkpoint: opening.checkpoint })
    expect(ledger.transactions.size).toBe(0)
    const next = observation(opening.checkpoint)
    expect(await reconcileTreasuryDeposits(f.ctx, { formance: ledger.context, chainRead: async () => next, admit: async () => true }))
      .toMatchObject({ kind: 'completed', caughtUp: true })
    expect(await f.read()).toMatchObject({ kind: 'ready', checkpoint: { blockNumber: '101', balanceUnits: '5' }, bufferUnits: '5' })
    expect(ledger.transactions.size).toBe(2)
    expect([...ledger.balances.entries()]).toEqual([
      [expect.stringMatching(/^treasury:corporate:[a-f0-9]{64}:available$/u), 0n],
      [expect.stringMatching(/^treasury:corporate:[a-f0-9]{64}:committed$/u), 5n],
    ])
    expect((await f.rows()).batches.map(batch => batch.state)).toEqual([
      { kind: 'booked', transactionRefs: [], completedAt: NOW },
      { kind: 'booked', transactionRefs: [...ledger.transactions.keys()], completedAt: NOW },
    ])
  })

  it.each(['unhealthy', 'missing_schema'] as const)('retains an empty opening range when the native ledger is %s', async health => {
    const f = backendFixture()
    const ledger = ledgerFixture({ health, bufferUnits: 0n })
    expect(await reconcileTreasuryDeposits(f.ctx, { formance: ledger.context, chainRead: async () => observation(null), admit: async () => true }))
      .toMatchObject({ kind: 'unavailable' })
    expect(await f.read()).toMatchObject({ kind: 'pending', batch: { previousCheckpoint: null, state: { kind: 'pending' } } })
    expect((await f.rows()).cursors[0]?.state.kind).toBe('opening')
    expect(ledger.transactions.size).toBe(0)
  })

  it('retains and replays the identical atomic credit and buffer plan after native posting before finish', async () => {
    vi.stubEnv('AE_X402_CUSTODY_MAX_ATOMIC', '10000')
    const f = backendFixture()
    const previous = await f.ready('0')
    const ledger = ledgerFixture({ bufferUnits: 0n })
    f.crashBeforeFinish()
    await expect(reconcileTreasuryDeposits(f.ctx, { formance: ledger.context, chainRead: async () => observation(previous), admit: async () => true }))
      .rejects.toThrow('crash_after_native_posting')
    const refs = [...ledger.transactions.keys()]
    expect(refs).toHaveLength(2)
    expect([...ledger.balances.values()]).toEqual([0n, 5n])
    expect(await f.read()).toMatchObject({ kind: 'pending', batch: { previousBufferUnits: '0', bufferIncreaseUnits: '5' } })
    const chainRead = async () => { throw new Error('pending_buffer_plan_must_not_observe_again') }
    expect(await reconcileTreasuryDeposits(f.ctx, { formance: ledger.context, chainRead, admit: async () => true }))
      .toMatchObject({ kind: 'completed' })
    expect([...ledger.transactions.keys()]).toEqual(refs)
    expect([...ledger.balances.values()]).toEqual([0n, 5n])
    expect(await f.read()).toMatchObject({ kind: 'ready', bufferUnits: '5', checkpoint: { balanceUnits: '5' } })
  })

  it('the registered observation action finishes pending native recovery while CDP balance observation is unavailable', async () => {
    const f = backendFixture()
    const previous = await f.ready()
    const ledger = ledgerFixture()
    f.crashBeforeFinish()
    await expect(reconcileTreasuryDeposits(f.ctx, { formance: ledger.context, chainRead: async () => observation(previous), admit: async () => true }))
      .rejects.toThrow('crash_after_native_posting')
    const pending = await f.read()
    expect(pending.kind).toBe('pending')
    const refs = [...ledger.transactions.keys()]
    external.sdk.mockReturnValue(ledger.context.sdk)
    external.balance.mockRejectedValue(new Error('cdp_balance_unavailable'))
    vi.stubEnv('AE_FORMANCE_ENVIRONMENT', 'sandbox')
    vi.stubEnv('AE_FORMANCE_GATEWAY_URL', 'http://127.0.0.1:3069')
    vi.stubEnv('AE_FORMANCE_LEDGER', 'treasury-evaluation')
    await f.backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const workload = await f.backend.query(internal.workloadCron.admit, { name: 'observe x402 treasury' })
    expect(await f.backend.action(internal.moneyTreasuryObservation.observe, { workload }))
      .toMatchObject({ kind: 'skipped', reason: 'balance_failed', observations: [] })
    expect(await f.read()).toMatchObject({ kind: 'ready', checkpoint: observation(previous).checkpoint })
    expect([...ledger.transactions.keys()]).toEqual(refs)
    expect(ledger.availableBalance()).toBe(5n)
    expect(ledger.bufferBalance()).toBe(1n)
    expect(await f.backend.run(async ctx => await ctx.db.query('moneyTreasuryObservations').collect())).toEqual([])
  })

  it('requires an explicit cutover when the same wallet changes credential generation', async () => {
    const f = backendFixture()
    const previous = await f.ready()
    const before = await f.rows()
    vi.stubEnv('AE_X402_CDP_CREDENTIAL_GENERATION', '2')
    expect(await f.read()).toEqual({ kind: 'unavailable', code: 'treasury_custody_cutover_required' })
    expect(await f.begin(null, observation(null))).toEqual({ kind: 'unavailable', code: 'treasury_custody_cutover_required' })
    expect(await f.begin(previous, observation(previous))).toEqual({ kind: 'unavailable', code: 'treasury_custody_cutover_required' })
    expect(await f.rows()).toEqual(before)
  })

  it('refuses a switched or fresh native ledger before credits when its buffer disagrees with the retained cursor', async () => {
    const f = backendFixture()
    const previous = await f.ready()
    const ledger = ledgerFixture({ bufferUnits: 0n })
    expect(await reconcileTreasuryDeposits(f.ctx, { formance: ledger.context, chainRead: async () => observation(previous), admit: async () => true }))
      .toEqual({ kind: 'unavailable', code: 'treasury_buffer_continuity_conflict' })
    expect(ledger.transactions.size).toBe(0)
    expect(ledger.availableBalance()).toBe(0n)
    expect(ledger.bufferBalance()).toBe(0n)
    expect(await f.read()).toMatchObject({ kind: 'pending', batch: { previousCheckpoint: previous, previousBufferUnits: '1' } })
    expect((await f.rows()).cursors[0]?.state).toMatchObject({ kind: 'applying', checkpoint: previous })
  })

  it('keeps the range pending when native posting exists but readback is incomplete', async () => {
    const f = backendFixture()
    const previous = await f.ready()
    const ledger = ledgerFixture({ hideReadback: true })
    expect(await reconcileTreasuryDeposits(f.ctx, { formance: ledger.context, chainRead: async () => observation(previous), admit: async () => true }))
      .toEqual({ kind: 'unavailable', code: 'treasury_posting_unknown' })
    expect(ledger.transactions.size).toBe(1)
    expect(await f.read()).toMatchObject({ kind: 'pending', batch: { previousCheckpoint: previous } })
    const row = (await f.rows()).cursors[0]
    expect(row?.state).toMatchObject({ kind: 'applying', checkpoint: previous })
  })

  it('books only positive inbound external transfers across a mixed range', async () => {
    const f = backendFixture()
    const previous = await f.ready()
    const ledger = ledgerFixture()
    const next = observation(previous, [transfer(0, '5'), transfer(1, '2', WALLET, OTHER),
      transfer(2, '9', WALLET, WALLET), transfer(3, '0')])
    expect(await reconcileTreasuryDeposits(f.ctx, { formance: ledger.context, chainRead: async () => next, admit: async () => true }))
      .toMatchObject({ kind: 'completed', caughtUp: true })
    expect([...ledger.transactions.values()].map(tx => tx.postings)).toEqual([
      [{ source: 'world', destination: expect.any(String), asset: 'USDC/6', amount: 5n }],
    ])
    expect(ledger.availableBalance()).toBe(5n)
    expect(ledger.bufferBalance()).toBe(1n)
    expect(await f.read()).toMatchObject({ kind: 'ready', checkpoint: { balanceUnits: '103', blockNumber: '101' } })
  })

  it('refuses incomplete or changed native reference sets without advancing the cursor', async () => {
    const f = backendFixture()
    const previous = await f.ready()
    const pending = await f.begin(previous, observation(previous, [transfer(0), transfer(1)]))
    if (pending.kind !== 'pending') throw new Error('pending_missing')
    const before = await f.rows()
    expect(await f.finish(pending.batch.batchRef, [nativeRef(2)]))
      .toEqual({ kind: 'unavailable', code: 'treasury_posting_incomplete' })
    expect(await f.finish(pending.batch.batchRef, [nativeRef(2), nativeRef(2)]))
      .toEqual({ kind: 'unavailable', code: 'treasury_batch_conflict' })
    expect(await f.rows()).toEqual(before)
    expect(await f.finish(pending.batch.batchRef, [nativeRef(2), nativeRef(3)])).toEqual({ kind: 'completed', replayed: false })
    const completed = await f.rows()
    expect(await f.finish(pending.batch.batchRef, [nativeRef(2), nativeRef(4)]))
      .toEqual({ kind: 'unavailable', code: 'treasury_batch_conflict' })
    expect(await f.rows()).toEqual(completed)
  })

  it.each(['predecessor', 'block_gap', 'digest', 'conservation', 'duplicate', 'stale', 'future'] as const)(
    'refuses %s conflict while retaining the last checkpoint', async conflict => {
      const f = backendFixture()
      const previous = await f.ready()
      const supplied = conflict === 'predecessor' ? { ...previous, blockHash: hash(999) } : previous
      const next = observation(supplied)
      if (conflict === 'block_gap') next.fromBlock = '102'
      if (conflict === 'digest') next.transfers[0]!.evidenceDigest = canonicalDigest('wrong-transfer')
      if (conflict === 'conservation') next.checkpoint.balanceUnits = '106'
      if (conflict === 'duplicate') { next.transfers.push(next.transfers[0]!); next.checkpoint.balanceUnits = '110' }
      if (conflict === 'stale') next.observedAt = NOW - 5 * 60_000 - 1
      if (conflict === 'future') next.observedAt = NOW + 1
      const before = await f.rows()
      expect(await f.begin(supplied, next)).toEqual({ kind: 'unavailable',
        code: conflict === 'predecessor' ? 'treasury_checkpoint_changed' : 'treasury_observation_invalid' })
      expect(await f.rows()).toEqual(before)
      expect(await f.read()).toMatchObject({ kind: 'ready', checkpoint: previous })
    },
  )
})

function rpcFixture(conflict: 'none' | 'predecessor' | 'end_block' | 'missing_log') {
  const topicAddress = (address: string) => `0x${address.slice(2).padStart(64, '0')}`
  const log = { address: ASSET, transactionHash: hash(200), blockHash: hash(101), blockNumber: '0x65',
    logIndex: '0x0', removed: false, data: `0x${'5'.padStart(64, '0')}`,
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', topicAddress(OTHER), topicAddress(WALLET)] }
  const rpc: TreasuryRpc = async (target, method, params) => {
    if (method === 'eth_chainId') return `0x${(84532).toString(16)}`
    if (method === 'eth_getBlockByNumber') {
      const number = params[0] === 'finalized' ? 101 : Number(BigInt(String(params[0])))
      const changed = conflict === 'predecessor' && number === 100
        || conflict === 'end_block' && number === 101 && target.hostname === 'rpc-b.example'
      return { number: `0x${number.toString(16)}`, hash: changed ? hash(999) : hash(number),
        timestamp: `0x${((NOW - 1000) / 1000).toString(16)}` }
    }
    if (method === 'eth_call') return `0x${(105).toString(16).padStart(64, '0')}`
    if (method === 'eth_getLogs') {
      const filter = params[0] as { topics: unknown[] }
      return conflict === 'missing_log' || filter.topics[1] !== null ? [] : [log]
    }
    throw new Error(`unexpected_rpc:${method}`)
  }
  return { rpc, targets: [new URL('https://rpc-a.example'), new URL('https://rpc-b.example')] }
}

describe('treasury observation evidence at the external RPC boundary', () => {
  it('admits agreeing finalized range evidence into the real pending transaction', async () => {
    const f = backendFixture()
    const previous = await f.ready()
    const next = await readTreasuryChainObservation({ environment: 'sandbox', address: WALLET, checkpoint: previous, now: NOW }, rpcFixture('none'))
    expect(next).toMatchObject({ kind: 'observed', checkpoint: { blockNumber: '101', balanceUnits: '105' }, transfers: [transfer()] })
    if (next.kind !== 'observed') throw new Error('chain_fixture_not_observed')
    expect(await f.begin(previous, next)).toMatchObject({ kind: 'pending', batch: { observation: next } })
  })

  it.each(['predecessor', 'end_block', 'missing_log'] as const)('refuses %s RPC conflict without changing progress', async conflict => {
    const f = backendFixture()
    await f.ready()
    const before = await f.rows()
    const ledger = ledgerFixture()
    const chainRead: typeof readTreasuryChainObservation = async input =>
      await readTreasuryChainObservation({ ...input, now: NOW }, rpcFixture(conflict))
    expect(await reconcileTreasuryDeposits(f.ctx, { formance: ledger.context, chainRead, admit: async () => true }))
      .toEqual({ kind: 'unavailable', code: 'treasury_chain_evidence_conflict' })
    expect(await f.rows()).toEqual(before)
    expect(ledger.transactions.size).toBe(0)
  })

  it('refuses an intermediate-height fork log even when both RPCs agree on end block, log and conserved balance', async () => {
    const f = backendFixture()
    await f.ready()
    const before = await f.rows()
    const ledger = ledgerFixture()
    const externalRpc = rpcFixture('none')
    const rpc: TreasuryRpc = async (target, method, params) => {
      if (method === 'eth_getBlockByNumber' && (params[0] === 'finalized' || params[0] === '0x66')) {
        return { number: '0x66', hash: hash(102), timestamp: `0x${((NOW - 1000) / 1000).toString(16)}` }
      }
      const result = await externalRpc.rpc(target, method, params)
      return method === 'eth_getLogs' ? (result as Record<string, JsonValue>[]).map(log => ({ ...log, blockHash: hash(999) })) : result
    }
    const chainRead: typeof readTreasuryChainObservation = async input =>
      await readTreasuryChainObservation({ ...input, now: NOW }, { rpc, targets: externalRpc.targets })
    expect(await reconcileTreasuryDeposits(f.ctx, { formance: ledger.context, chainRead, admit: async () => true }))
      .toEqual({ kind: 'unavailable', code: 'treasury_chain_evidence_conflict' })
    expect(await f.rows()).toEqual(before)
    expect(ledger.transactions.size).toBe(0)
  })
})
