import { getFunctionName, type FunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { internal } from '../../../convex/_generated/api'
import { reconcileTreasurySnapshot } from '../../../convex/lib/money/treasury/snapshot'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createFormanceContext } from '@/modules/money/formance'
import { prepareFormanceTreasuryBatch, treasuryBufferAccount } from '@/modules/money/formance-treasury'
import { capacityAccount } from '@/modules/money/formance-workflows'
import type { FormanceTreasuryAuditTransaction } from '@/modules/money/formance-treasury-audit'
import type { TreasuryChainCheckpoint, TreasuryTransfer } from '@/modules/money/treasury'
import { convexTestWithMarketComponents } from '../../helpers/convex-fixtures'

// Only the native ledger read boundary is synthetic. The controller, complete
// Convex source reads, command builders, exact audit, seals and publisher execute.
const io = vi.hoisted(() => ({ metrics: vi.fn(), audit: vi.fn() }))
vi.mock('../../../convex/lib/money/formance/gateway', async original => ({
  ...await original<typeof import('../../../convex/lib/money/formance/gateway')>(),
  readFormanceTreasurySnapshot: io.metrics, readFormanceTreasuryAudit: io.audit,
}))

const NOW = Date.UTC(2026, 9, 1, 12)
const PAYER = `0x${'1'.repeat(40)}`
const OTHER = `0x${'2'.repeat(40)}`
const ASSET = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
const NETWORK = 'eip155:84532'
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`
const sourceEnvironment = {
  AE_DEPLOYMENT_ENVIRONMENT: 'development', AE_X402_CUSTODY_ENABLED: 'true',
  AE_X402_CUSTODY_MAX_ATOMIC: '5000000', AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '50000000',
  AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC: '50000000', AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC: '5000000',
  CDP_API_KEY_ID: 'fixture-key', CDP_API_KEY_SECRET: 'fixture-secret', CDP_WALLET_SECRET: 'fixture-wallet-secret',
  AE_X402_CDP_ACCOUNT_NAME: 'fixture-wallet', AE_X402_CDP_EXPECTED_EVM_ADDRESS: PAYER,
  AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-4111-8111-111111111111',
  AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-4222-8222-222222222222',
  AE_X402_CDP_POLICY_RULES_DIGEST: canonicalDigest('snapshot-cutoff-policy'), AE_X402_CDP_CREDENTIAL_GENERATION: '1',
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  for (const [name, value] of Object.entries(sourceEnvironment)) vi.stubEnv(name, value)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetAllMocks() })

async function fixture(initialAt = NOW - 20) {
  const backend = convexTestWithMarketComponents()
  const context = await backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW })
  if (context.kind !== 'available') throw new Error('fixture_identity_missing')
  const identity = context.identity
  const available = capacityAccount('treasury_usdc', identity.custodyRef, 1)
  const buffer = treasuryBufferAccount(identity)
  const native: FormanceTreasuryAuditTransaction[] = []
  let verificationBarrier: Promise<void> | undefined
  async function range(previous: TreasuryChainCheckpoint | null, createdAt: number, completedAt?: number, depositUnits = '0') {
    const block = previous === null ? 100 : Number(previous.blockNumber) + 10
    const checkpoint = { blockNumber: String(block), blockHash: hash(block),
      balanceUnits: (BigInt(previous?.balanceUnits ?? '15000000') + BigInt(depositUnits)).toString() }
    const material = { transactionHash: hash(block + 1_000), logIndex: 0, blockNumber: String(block), blockHash: hash(block),
      payer: OTHER, recipient: PAYER, amountUnits: depositUnits }
    const transfers: TreasuryTransfer[] = depositUnits === '0' ? [] : [{ ...material,
      evidenceDigest: canonicalDigest({ kind: 'ae.treasury-transfer:v1', network: NETWORK, asset: ASSET, ...material }) }]
    vi.mocked(Date.now).mockReturnValue(createdAt)
    const pending = await backend.mutation(internal.moneyTreasuryReconciliation.beginBatch, { previousCheckpoint: previous,
      observation: { kind: 'observed', environment: 'sandbox', network: NETWORK, asset: ASSET, address: PAYER,
        fromBlock: previous === null ? '100' : String(Number(previous.blockNumber) + 1), checkpoint,
        observedAt: createdAt, blockTimestamp: createdAt - 1_000, caughtUp: true, transfers } })
    if (pending.kind !== 'pending') throw new Error('fixture_range_missing')
    const batch = pending.batch
    const commands = prepareFormanceTreasuryBatch(identity, batch)
    if (commands.kind !== 'prepared') throw new Error('fixture_native_commands_missing')
    const nativeCommands = commands.commands
    async function finish(at: number) {
      for (const command of nativeCommands) {
        // Independent expected chart and amounts, with real immutable identities.
        const capacity = command.template === 'TREASURY_CAPACITY_SYNCED'
        native.push({ id: String(native.length + 1), commandRef: command.commandRef, template: command.template,
          metadata: { ...command.metadata }, effectiveAt: at - 1, insertedAt: at - 1, reverted: false, revertedAt: null,
          postings: [{ source: capacity ? 'world' : available, destination: capacity ? available : buffer,
            asset: 'USDC/6', amountUnits: capacity ? (previous === null ? '15000000' : depositUnits) : '5000000' }] })
      }
      vi.mocked(Date.now).mockReturnValue(at)
      expect(await backend.mutation(internal.moneyTreasuryReconciliation.finishBatch, {
        batchRef: batch.batchRef, transactionRefs: nativeCommands.map(command => command.commandRef),
      })).toMatchObject({ kind: 'completed' })
    }
    if (completedAt !== undefined) await finish(completedAt)
    return { checkpoint, batchRef: batch.batchRef, finish }
  }
  const opening = await range(null, initialAt, initialAt + 2)
  vi.mocked(Date.now).mockReturnValue(NOW)
  await backend.run(ctx => ctx.db.insert('moneyTreasuryObservations', { observationRef: 'observation:cutoff',
    environment: 'sandbox', custodyRef: identity.custodyRef, custodyGeneration: 1, network: NETWORK,
    asset: 'USDC', exponent: 6, totalUnits: '15000000', bufferUnits: '5000000',
    evidenceRef: 'evidence:cutoff', evidenceDigest: canonicalDigest('cutoff-balance'), observedAt: NOW, recordedAt: NOW }))
  io.metrics.mockImplementation(async (_ctx: unknown, input: { snapshotAt: number }) => {
    const balances = new Map<string, bigint>()
    for (const row of native.filter(row => row.insertedAt <= input.snapshotAt)) for (const posting of row.postings) {
      balances.set(posting.source, (balances.get(posting.source) ?? 0n) - BigInt(posting.amountUnits))
      balances.set(posting.destination, (balances.get(posting.destination) ?? 0n) + BigInt(posting.amountUnits))
    }
    return { kind: 'available', snapshotAt: input.snapshotAt,
      treasury: { availableUnits: String(balances.get(available) ?? 0n), committedUnits: '0', bufferUnits: String(balances.get(buffer) ?? 0n) },
      settledUsdc: { last24hUnits: '0', last7dUnits: '0' }, liabilityAud: {
        purchasedAvailableUnits: '0', purchasedReservedUnits: '0', promotionalAvailableUnits: '0', promotionalReservedUnits: '0',
      } }
  })
  io.audit.mockImplementation(async (_ctx: unknown, input: { snapshotAt: number }) => {
    await verificationBarrier
    return structuredClone({ kind: 'available', snapshotAt: input.snapshotAt, complete: true,
      transactions: native.filter(row => row.insertedAt <= input.snapshotAt) })
  })
  function controller(beforeVerification?: () => Promise<void>) {
    let contextReads = 0
    let barrier: Promise<void> | undefined
    return {
      runQuery: async (ref: FunctionReference<'query', 'internal'>, args: never) => {
        if (getFunctionName(ref) === 'moneyTreasuryReconciliation:readSnapshotContext' && ++contextReads === 2) {
          barrier = Promise.resolve().then(beforeVerification)
          verificationBarrier = barrier
        }
        await barrier
        return await backend.query(ref, args)
      },
      runMutation: backend.mutation.bind(backend),
    } as unknown as Parameters<typeof reconcileTreasurySnapshot>[0]
  }
  const formance = createFormanceContext({ environment: 'sandbox', ledger: 'cutoff-fixture', gatewayUrl: 'http://127.0.0.1:3069', requestTimeoutMs: 5_000 })
  const reconcile = (ctx = controller(), now = Date.now()) => reconcileTreasurySnapshot(ctx, { formance, now, admit: async () => true })
  const report = () => backend.run(ctx => ctx.db.query('moneyTreasurySnapshots')
    .withIndex('by_environment_and_snapshotAt', q => q.eq('environment', 'sandbox')).order('desc').first())
  const alerts = () => backend.run(ctx => ctx.db.query('moneyTreasuryAlerts').take(12))
  return { backend, native, opening, range, controller, reconcile, report, alerts }
}

describe('treasury snapshot cutoff reconciliation', () => {
  it.each(['0', '5000000'])('keeps an exact historical audit matched across a post-cutoff range with deposit %s', async deposit => {
    const f = await fixture()
    expect(await f.reconcile(f.controller(async () => {
      await f.range(f.opening.checkpoint, NOW + 1, NOW + 3, deposit)
    }), NOW)).toMatchObject({ kind: 'published' })
    expect(await f.report()).toMatchObject({ snapshotAt: NOW, chain: { observedAt: NOW - 20, totalUnits: '15000000' },
      ledger: { availableUnits: '10000000', bufferUnits: '5000000' }, checks: {
        cash: { kind: 'matched', differenceUnits: '0' }, settlements: { kind: 'matched' },
        funding: { kind: 'matched' }, reservations: { kind: 'matched' },
      } })
  })

  it('keeps actual retained history changes unavailable', async () => {
    const f = await fixture()
    await f.reconcile(f.controller(async () => {
      await f.backend.run(async ctx => {
        const row = await ctx.db.query('moneyTreasuryBatches').first()
        if (row === null || row.state.kind !== 'booked') throw new Error('fixture_retained_batch_missing')
        await ctx.db.patch(row._id, { state: { ...row.state, transactionRefs: [] } })
      })
    }), NOW)
    const report = await f.report()
    expect(Object.values(report!.checks)).toEqual(Array(4).fill({ kind: 'unavailable', code: 'treasury_sources_changed_during_audit' }))
  })

  it('keeps conflicting native facts unavailable through a later audit', async () => {
    const f = await fixture()
    await f.reconcile(f.controller(async () => {
      const row = f.native[0]!
      f.native[0] = { ...row, metadata: { ...row.metadata, command_digest: 'f'.repeat(64) } }
    }), NOW)
    expect(Object.values((await f.report())!.checks)).toEqual(Array(4).fill({ kind: 'unavailable', code: 'treasury_sources_changed_during_audit' }))
    vi.mocked(Date.now).mockReturnValue(NOW + 1)
    await f.reconcile()
    expect((await f.report())!.checks.cash).toMatchObject({ kind: 'unavailable', code: 'treasury_deposit_evidence_conflict' })
  })

  it('refuses missing retained history even while native balances remain available', async () => {
    const f = await fixture()
    await f.reconcile(f.controller(async () => {
      await f.backend.run(async ctx => {
        const row = await ctx.db.query('moneyTreasuryBatches').first()
        if (row === null) throw new Error('fixture_retained_batch_missing')
        await ctx.db.delete(row._id)
      })
    }), NOW)
    expect(Object.values((await f.report())!.checks)).toEqual(Array(4).fill({ kind: 'unavailable', code: 'treasury_sources_changed_during_audit' }))
    vi.mocked(Date.now).mockReturnValue(NOW + 1)
    await f.reconcile()
    expect(await f.report()).toMatchObject({ ledger: { kind: 'available' }, checks: { cash: { kind: 'unavailable' } } })
  })

  it('fails a late posting at the old cutoff and recovers alerts only after a complete new audit', async () => {
    const f = await fixture()
    const pending = await f.range(f.opening.checkpoint, NOW - 1)
    vi.mocked(Date.now).mockReturnValue(NOW)
    await f.reconcile(f.controller(() => pending.finish(NOW + 2)), NOW)
    expect(Object.values((await f.report())!.checks)).toEqual(Array(4).fill({ kind: 'unavailable', code: 'treasury_sources_changed_during_audit' }))
    expect(await f.alerts()).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'reconciliation_unavailable', state: 'open' })]))
    vi.mocked(Date.now).mockReturnValue(NOW + 3)
    await f.reconcile()
    expect(Object.values((await f.report())!.checks).every(check => check.kind === 'matched')).toBe(true)
    expect(await f.alerts()).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'reconciliation_unavailable', state: 'resolved', resolvedAt: NOW + 3 })]))
    expect(await f.backend.query(internal.moneyReadiness.readSourceChecks, { environment: 'sandbox', now: NOW + 3 }))
      .toMatchObject({ treasury: { kind: 'passed', validUntil: NOW + 10 * 60_000 } })
  })

  it('replays concurrent workers once across a shared post-cutoff observer', async () => {
    const f = await fixture()
    let advance: Promise<void> | undefined
    const observe = () => advance ??= f.range(f.opening.checkpoint, NOW + 1, NOW + 3).then(() => undefined)
    const results = await Promise.all([f.reconcile(f.controller(observe), NOW), f.reconcile(f.controller(observe), NOW)])
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'published', replayed: false }), expect.objectContaining({ kind: 'published', replayed: true }),
    ]))
    expect(Object.values((await f.report())!.checks).every(check => check.kind === 'matched')).toBe(true)
    expect(await f.backend.run(ctx => ctx.db.query('moneyTreasurySnapshots').take(2))).toHaveLength(1)
  })

  it('refuses an overlong cursor bridge and recovers through a new complete cutoff', async () => {
    const f = await fixture()
    await f.reconcile(f.controller(async () => {
      let previous = f.opening.checkpoint
      for (let index = 0; index < 26; index += 1) {
        previous = (await f.range(previous, NOW + index * 3 + 1, NOW + index * 3 + 3)).checkpoint
      }
    }), NOW)
    expect(await f.backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW }))
      .toMatchObject({ progress: { kind: 'unavailable', code: 'treasury_source_history_incomplete' } })
    expect(Object.values((await f.report())!.checks)).toEqual(Array(4).fill({ kind: 'unavailable', code: 'treasury_sources_changed_during_audit' }))
    vi.mocked(Date.now).mockReturnValue(NOW + 100)
    await f.reconcile()
    expect(Object.values((await f.report())!.checks).every(check => check.kind === 'matched')).toBe(true)
  })

  it('does not refresh an old chain observation using a fresh balance or snapshot timestamp', async () => {
    const f = await fixture(NOW - 25 * 60_000)
    await f.reconcile()
    expect(await f.report()).toMatchObject({ snapshotAt: NOW, chain: { observedAt: NOW - 25 * 60_000 },
      checks: { cash: { kind: 'unavailable', code: 'treasury_chain_observation_stale' } } })
    expect(await f.backend.query(internal.moneyReadiness.readSourceChecks, { environment: 'sandbox', now: NOW }))
      .toMatchObject({ treasury: { kind: 'failed', code: 'treasury_reconciliation_required' } })
  })
})
