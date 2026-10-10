import { getFunctionName, type FunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { internal } from '../../../convex/_generated/api'
import { reconcileTreasurySnapshot } from '../../../convex/lib/money/treasury/snapshot'
import { readTreasuryChainObservation, type TreasuryRpc } from '../../../convex/lib/money/treasury/chainObservation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createFormanceContext } from '@/modules/money/formance'
import { prepareFormanceTreasuryBatch, treasuryBufferAccount } from '@/modules/money/formance-treasury'
import { capacityAccount } from '@/modules/money/formance-workflows'
import type { FormanceTreasuryAuditTransaction } from '@/modules/money/formance-treasury-audit'
import type { TreasuryChainCheckpoint, TreasuryChainObservation, TreasuryTransfer } from '@/modules/money/treasury'
import { convexTestWithMarketComponents } from '../../helpers/convex-fixtures'

// Only the native ledger and RPC read boundaries are synthetic. The controller, complete
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
    return { checkpoint, observation: batch.observation, batchRef: batch.batchRef, finish }
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
        if (getFunctionName(ref) === 'moneyTreasuryReconciliation:readSnapshotContext' && ++contextReads === 3) {
          barrier = Promise.resolve().then(beforeVerification)
          verificationBarrier = barrier
        }
        await barrier
        return await backend.query(ref, args)
      },
      runMutation: backend.mutation.bind(backend),
    } as unknown as Parameters<typeof reconcileTreasurySnapshot>[0]
  }
  const chainRead = vi.fn(async (input: { checkpoint?: TreasuryChainCheckpoint }): Promise<TreasuryChainObservation | { kind: 'unavailable'; code: string }> => {
    if (input.checkpoint === undefined) return { kind: 'unavailable', code: 'fixture_checkpoint_missing' }
    const row = await backend.run(async ctx => (await ctx.db.query('moneyTreasuryBatches').take(40))
      .find(batch => canonicalDigest(batch.observation.checkpoint) === canonicalDigest(input.checkpoint)))
    if (row === undefined) return { kind: 'unavailable', code: 'fixture_checkpoint_missing' }
    return { kind: 'observed', environment: identity.environment, network: NETWORK, asset: ASSET, address: PAYER,
      fromBlock: String(BigInt(input.checkpoint.blockNumber) + 1n), checkpoint: input.checkpoint,
      blockTimestamp: row.observation.blockTimestamp, observedAt: Date.now(), caughtUp: true, transfers: [] }
  })
  const formance = createFormanceContext({ environment: 'sandbox', ledger: 'cutoff-fixture', gatewayUrl: 'http://127.0.0.1:3069', requestTimeoutMs: 5_000 })
  const reconcile = (ctx = controller(), now = Date.now()) => reconcileTreasurySnapshot(ctx, { formance, now, chainRead, admit: async () => true })
  const reconcileLive = (ctx = controller()) => reconcileTreasurySnapshot(ctx, { formance, chainRead, admit: async () => true })
  const report = () => backend.run(ctx => ctx.db.query('moneyTreasurySnapshots')
    .withIndex('by_environment_and_snapshotAt', q => q.eq('environment', 'sandbox')).order('desc').first())
  const alerts = () => backend.run(ctx => ctx.db.query('moneyTreasuryAlerts').take(12))
  return { backend, native, opening, range, controller, reconcile, reconcileLive, chainRead, report, alerts }
}

describe('treasury snapshot cutoff reconciliation', () => {
  it.each([0, 19])('keeps a pre-cutoff balance audit stable when an older observation is created %s ms later', async delay => {
    const f = await fixture()
    await f.backend.run(async ctx => {
      const row = await ctx.db.query('moneyTreasuryObservations').first()
      if (row === null) throw new Error('fixture_observation_missing')
      await ctx.db.patch(row._id, { observedAt: NOW - 10, recordedAt: NOW - 10 })
    })
    const before = await f.backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW })
    if (before.kind !== 'available') throw new Error('fixture_context_missing')
    expect(await f.reconcile(f.controller(async () => {
      vi.mocked(Date.now).mockReturnValue(NOW + delay)
      expect(await f.backend.mutation(internal.moneyTreasury.recordObservation, {
        environment: 'sandbox', custodyRef: before.identity.custodyRef, custodyGeneration: 1, network: NETWORK,
        asset: 'USDC', exponent: 6, totalUnits: '15000000', bufferUnits: '5000000',
        observationRef: 'observation:late-recorded', evidenceRef: 'evidence:late-recorded',
        evidenceDigest: canonicalDigest('late-recorded-balance'), observedAt: NOW - 1,
      })).toMatchObject({ kind: 'accepted' })
    }), NOW)).toMatchObject({ kind: 'published' })
    expect(await f.backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW })).toEqual(before)
    expect(await f.report()).toMatchObject({ snapshotAt: NOW,
      chain: { observedAt: NOW, blockTimestamp: NOW - 1_020 }, checks: {
        cash: { kind: 'matched' }, settlements: { kind: 'matched' }, funding: { kind: 'matched' }, reservations: { kind: 'matched' },
      } })
    expect(await f.backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW + 20 }))
      .toMatchObject({ observation: { observedAt: NOW - 1, evidenceRef: 'evidence:late-recorded' } })
    const retained = await f.backend.run(ctx => ctx.db.query('moneyTreasuryObservations')
      .withIndex('by_observationRef', q => q.eq('observationRef', 'observation:late-recorded')).unique())
    expect(retained).toMatchObject({ observedAt: NOW - 1, recordedAt: NOW + delay })
    expect(retained!._creationTime).toBeGreaterThan(NOW)
    if (delay === 0) expect(retained!._creationTime).toBeLessThan(NOW + 1)
  })

  it.each([25, 26])('bounds %s excluded observations and recovers only at a complete new cutoff', async count => {
    const f = await fixture()
    await f.backend.run(async ctx => {
      const row = await ctx.db.query('moneyTreasuryObservations').first()
      if (row === null) throw new Error('fixture_observation_missing')
      await ctx.db.patch(row._id, { observedAt: NOW - 100, recordedAt: NOW - 100 })
    })
    const context = await f.backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW })
    if (context.kind !== 'available') throw new Error('fixture_context_missing')
    // Historical audit evidence must have been observed by its cutoff, before
    // the later inserts whose native creation clocks this case excludes.
    if (count === 25) {
      const proofAtCutoff = await f.chainRead({ checkpoint: f.opening.checkpoint })
      f.chainRead.mockResolvedValueOnce(proofAtCutoff)
    }
    vi.mocked(Date.now).mockReturnValue(NOW + 1)
    for (let index = 0; index < count; index += 1) await f.backend.mutation(internal.moneyTreasury.recordObservation, {
      environment: 'sandbox', custodyRef: context.identity.custodyRef, custodyGeneration: 1, network: NETWORK,
      asset: 'USDC', exponent: 6, totalUnits: '15000000', bufferUnits: '5000000',
      observationRef: `observation:bridge:${index}`, evidenceRef: `evidence:bridge:${index}`,
      evidenceDigest: canonicalDigest({ index }), observedAt: NOW - 1,
    })
    if (count === 26) {
      expect(await f.reconcile(f.controller(), NOW))
        .toEqual({ kind: 'unavailable', code: 'treasury_observation_history_incomplete' })
      expect(await f.report()).toBeNull()
    } else {
      expect(await f.reconcile(f.controller(), NOW)).toMatchObject({ kind: 'published' })
      expect(Object.values((await f.report())!.checks).every(check => check.kind === 'matched')).toBe(true)
      expect(await f.backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW })).toEqual(context)
    }
    vi.mocked(Date.now).mockReturnValue(NOW + 100)
    expect(await f.reconcile()).toMatchObject({ kind: 'published' })
    expect(Object.values((await f.report())!.checks).every(check => check.kind === 'matched')).toBe(true)
    expect(await f.backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW + 100 }))
      .toMatchObject({ observation: { observedAt: NOW - 1, evidenceRef: `evidence:bridge:${count - 1}` } })
  })

  it.each([NOW + 1, NOW - 1])('refuses a conflicting retained observation clock %s without publishing', async recordedAt => {
    const f = await fixture()
    await f.backend.run(async ctx => {
      const row = await ctx.db.query('moneyTreasuryObservations').first()
      if (row === null) throw new Error('fixture_observation_missing')
      await ctx.db.patch(row._id, { recordedAt })
    })
    expect(await f.reconcile(f.controller(), NOW))
      .toEqual({ kind: 'unavailable', code: 'treasury_observation_cutoff_conflict' })
    expect(await f.report()).toBeNull()
    expect(await f.backend.run(ctx => ctx.db.query('moneyTreasuryObservations').first()))
      .toMatchObject({ observedAt: NOW, recordedAt })
  })

  it.each([-1, NOW - 0.5])('refuses a corrupt eligible observation time %s', async observedAt => {
    const f = await fixture()
    await f.backend.run(async ctx => {
      const row = await ctx.db.query('moneyTreasuryObservations').first()
      if (row === null) throw new Error('fixture_observation_missing')
      await ctx.db.patch(row._id, { observedAt })
    })
    expect(await f.reconcile(f.controller(), NOW))
      .toEqual({ kind: 'unavailable', code: 'treasury_observation_cutoff_conflict' })
    expect(await f.report()).toBeNull()
  })

  it('proves absence at the old cutoff without borrowing a later observation clock', async () => {
    const f = await fixture()
    await f.backend.run(async ctx => {
      const row = await ctx.db.query('moneyTreasuryObservations').first()
      if (row === null) throw new Error('fixture_observation_missing')
      await ctx.db.delete(row._id)
    })
    const context = await f.backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW })
    if (context.kind !== 'available') throw new Error('fixture_context_missing')
    expect(context.observation).toBeNull()
    await f.reconcile(f.controller(async () => {
      vi.mocked(Date.now).mockReturnValue(NOW + 1)
      await f.backend.mutation(internal.moneyTreasury.recordObservation, {
        environment: 'sandbox', custodyRef: context.identity.custodyRef, custodyGeneration: 1, network: NETWORK,
        asset: 'USDC', exponent: 6, totalUnits: '15000000', bufferUnits: '5000000',
        observationRef: 'observation:later-only', evidenceRef: 'evidence:later-only',
        evidenceDigest: canonicalDigest('later-only-balance'), observedAt: NOW - 1,
      })
    }), NOW)
    expect(await f.backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW })).toEqual(context)
    expect((await f.report())!.alerts).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'observation_stale' })]))
    expect(await f.backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW + 2 }))
      .toMatchObject({ observation: { observedAt: NOW - 1 } })
  })

  it('keeps a genuine eligible observation change unavailable', async () => {
    const f = await fixture()
    await f.reconcile(f.controller(async () => {
      await f.backend.run(async ctx => {
        const row = await ctx.db.query('moneyTreasuryObservations').first()
        if (row === null) throw new Error('fixture_observation_missing')
        await ctx.db.patch(row._id, { totalUnits: '14999999' })
      })
    }), NOW)
    expect(Object.values((await f.report())!.checks))
      .toEqual(Array(4).fill({ kind: 'unavailable', code: 'treasury_sources_changed_during_audit' }))
  })

  it.each(['0', '5000000'])('keeps an exact historical audit matched across a post-cutoff range with deposit %s', async deposit => {
    const f = await fixture()
    expect(await f.reconcile(f.controller(async () => {
      await f.range(f.opening.checkpoint, NOW + 1, NOW + 3, deposit)
    }), NOW)).toMatchObject({ kind: 'published' })
    expect(await f.report()).toMatchObject({ snapshotAt: NOW, chain: { observedAt: NOW, totalUnits: '15000000' },
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
    expect(await f.backend.query(internal.moneyReadiness.readSourceChecks, { environment: 'sandbox' }))
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
    const proof = await f.chainRead({ checkpoint: f.opening.checkpoint })
    if (proof.kind !== 'observed') throw new Error('fixture_proof_missing')
    f.chainRead.mockResolvedValue({ ...proof, observedAt: NOW - 25 * 60_000 })
    await f.reconcile()
    expect(await f.report()).toMatchObject({ snapshotAt: NOW, chain: { kind: 'unavailable', code: 'treasury_chain_observation_stale' },
      checks: { cash: { kind: 'unavailable', code: 'treasury_chain_observation_stale' } } })
    expect(await f.backend.query(internal.moneyReadiness.readSourceChecks, { environment: 'sandbox' }))
      .toMatchObject({ treasury: { kind: 'failed', code: 'treasury_reconciliation_required' } })
  })

  it('uses a real fresh proof of an unchanged finalized checkpoint without rewriting a 25-minute-old booked batch', async () => {
    const f = await fixture(NOW - 25 * 60_000)
    const before = await f.backend.run(ctx => ctx.db.query('moneyTreasuryBatches').collect())
    await f.reconcileLive()
    expect(await f.report()).toMatchObject({ snapshotAt: NOW,
      chain: { kind: 'available', observedAt: NOW, blockTimestamp: NOW - 25 * 60_000 - 1_000 },
      checks: { cash: { kind: 'matched' }, funding: { kind: 'matched' }, settlements: { kind: 'matched' }, reservations: { kind: 'matched' } } })
    expect(await f.backend.run(ctx => ctx.db.query('moneyTreasuryBatches').collect())).toEqual(before)
  })

  it.each(['empty', 'net_zero_transfer', 'rpc_conflict', 'missing_logs'] as const)(
    'audits an advancing finalized range through the real reader with %s RPC evidence', async evidence => {
      const initialAt = NOW - 65 * 60_000
      const f = await fixture(initialAt)
      const before = await f.backend.run(ctx => ctx.db.query('moneyTreasuryBatches').collect())
      const targets = [new URL('https://first.example'), new URL('https://second.example')]
      const rpc: TreasuryRpc = async (target, method, params) => {
        if (method === 'eth_chainId') return '0x14a34'
        if (method === 'eth_getBlockByNumber') {
          const old = params[0] === '0x64'
          return { number: old ? '0x64' : '0x6e',
            hash: hash(old ? 100 : evidence === 'rpc_conflict' && target.hostname === 'second.example' ? 111 : 110),
            timestamp: `0x${Math.floor((old ? initialAt - 1_000 : NOW - 60_000) / 1_000).toString(16)}` }
        }
        if (method === 'eth_call') return `0x${(15_000_000n).toString(16).padStart(64, '0')}`
        if (method === 'eth_getLogs') {
          if (evidence === 'missing_logs') return null
          if (evidence !== 'net_zero_transfer') return []
          const addressTopic = `0x${PAYER.slice(2).padStart(64, '0')}`
          return [{ address: ASSET, removed: false, transactionHash: hash(1_110), blockHash: hash(110),
            blockNumber: '0x6e', logIndex: '0x0', data: hash(1), topics: [
              '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', addressTopic, addressTopic] }]
        }
        throw new Error('unexpected_rpc_method')
      }
      f.chainRead.mockImplementation(async input => readTreasuryChainObservation({
        environment: 'sandbox', address: PAYER, ...input,
      }, { rpc, targets }))
      await f.reconcileLive()
      expect(f.chainRead).toHaveBeenCalledTimes(1)
      if (evidence === 'empty') {
        expect(await f.report()).toMatchObject({ snapshotAt: NOW,
          chain: { kind: 'available', observedAt: NOW, blockNumber: '110', blockHash: hash(110), blockTimestamp: NOW - 60_000, totalUnits: '15000000' },
          checks: { cash: { kind: 'matched' }, settlements: { kind: 'matched' }, funding: { kind: 'matched' }, reservations: { kind: 'matched' } } })
        expect(await f.backend.query(internal.moneyReadiness.readSourceChecks, { environment: 'sandbox' }))
          .toMatchObject({ treasury: { kind: 'passed' } })
      } else {
        expect(await f.report()).toMatchObject({ chain: { kind: 'unavailable' }, checks: { cash: { kind: 'unavailable' } } })
      }
      expect(await f.backend.run(ctx => ctx.db.query('moneyTreasuryBatches').collect())).toEqual(before)
    })

  it.each(['unavailable', 'advanced_same_hash', 'regressed', 'oversized', 'hash', 'balance', 'environment', 'network', 'asset', 'address', 'block_clock', 'range', 'not_caught_up', 'future_probe'] as const)(
    'refuses %s RPC evidence instead of falling back to a green booked clock', async fault => {
      const f = await fixture()
      const proof = await f.chainRead({ checkpoint: f.opening.checkpoint })
      if (proof.kind !== 'observed') throw new Error('fixture_proof_missing')
      const invalid = structuredClone(proof)
      if (fault === 'advanced_same_hash') invalid.checkpoint.blockNumber = '101'
      if (fault === 'regressed') invalid.checkpoint.blockNumber = '99'
      if (fault === 'oversized') {
        invalid.checkpoint.blockNumber = '2101'; invalid.checkpoint.blockHash = hash(2101); invalid.blockTimestamp += 1
      }
      if (fault === 'hash') invalid.checkpoint.blockHash = hash(101)
      if (fault === 'balance') invalid.checkpoint.balanceUnits = '15000001'
      if (fault === 'environment') invalid.environment = 'production'
      if (fault === 'network') invalid.network = 'eip155:8453'
      if (fault === 'asset') invalid.asset = OTHER
      if (fault === 'address') invalid.address = OTHER
      if (fault === 'block_clock') invalid.blockTimestamp += 1
      if (fault === 'range') invalid.fromBlock = '100'
      if (fault === 'not_caught_up') invalid.caughtUp = false
      if (fault === 'future_probe') invalid.observedAt = NOW + 1
      f.chainRead.mockResolvedValue(fault === 'unavailable' ? { kind: 'unavailable', code: 'treasury_chain_unavailable' } : invalid)
      await f.reconcile()
      expect((await f.report())!.checks.cash.kind).toBe('unavailable')
      expect((await f.report())!.chain.kind).toBe('unavailable')
    })

  it('preserves the original finalized block deadline despite a fresh identical RPC proof', async () => {
    const f = await fixture(NOW - 60 * 60_000 + 1_000)
    await f.reconcileLive()
    expect(await f.report()).toMatchObject({ chain: { kind: 'unavailable', code: 'treasury_chain_observation_stale' },
      checks: { cash: { kind: 'unavailable', code: 'treasury_chain_observation_stale' } } })
  })

  it('takes the actual delayed probe start as the cutoff and keeps it through delayed completion', async () => {
    const f = await fixture()
    const read = f.chainRead.getMockImplementation()!
    f.chainRead.mockImplementation(async input => {
      vi.mocked(Date.now).mockReturnValue(NOW + 1_000)
      const proof = await read(input)
      vi.mocked(Date.now).mockReturnValue(NOW + 41_000)
      return proof
    })
    await f.reconcileLive()
    expect(await f.report()).toMatchObject({ snapshotAt: NOW + 1_000, chain: { observedAt: NOW + 1_000 },
      checks: { cash: { kind: 'matched' } } })
  })

  it('rechecks every source at a new real cutoff after the exact advanced checkpoint finishes booking', async () => {
    const f = await fixture()
    const read = f.chainRead.getMockImplementation()!
    f.chainRead.mockImplementationOnce(async () => {
      const next = await f.range(f.opening.checkpoint, NOW + 10, NOW + 12, '1')
      return { ...next.observation, observedAt: NOW }
    }).mockImplementation(read)
    await f.reconcileLive()
    expect(f.chainRead).toHaveBeenCalledTimes(2)
    expect(await f.report()).toMatchObject({ snapshotAt: NOW + 12, chain: { observedAt: NOW + 12, blockNumber: '110' },
      checks: { cash: { kind: 'matched' }, funding: { kind: 'matched' }, settlements: { kind: 'matched' }, reservations: { kind: 'matched' } } })
  })

  it('does not hide an eligible source change behind a newly booked checkpoint retry', async () => {
    const f = await fixture()
    f.chainRead.mockImplementationOnce(async () => {
      const next = await f.range(f.opening.checkpoint, NOW + 10, NOW + 12)
      return { kind: 'observed', environment: 'sandbox', network: NETWORK, asset: ASSET, address: PAYER,
        fromBlock: '101', checkpoint: next.checkpoint, blockTimestamp: NOW - 990,
        observedAt: NOW, caughtUp: true, transfers: [] }
    })
    await f.reconcileLive(f.controller(async () => {
      await f.backend.run(async ctx => {
        const observation = await ctx.db.query('moneyTreasuryObservations').first()
        if (observation === null) throw new Error('fixture_observation_missing')
        await ctx.db.patch(observation._id, { totalUnits: '15000001' })
      })
    }))
    expect(f.chainRead).toHaveBeenCalledTimes(1)
    expect(Object.values((await f.report())!.checks)).toEqual(Array(4).fill({ kind: 'unavailable', code: 'treasury_sources_changed_during_audit' }))
  })

  it('stops after one full retry when finalized progress advances again', async () => {
    const f = await fixture()
    let at = NOW
    f.chainRead.mockImplementation(async input => {
      if (input.checkpoint === undefined) throw new Error('fixture_checkpoint_missing')
      const observedAt = at
      at += 12
      const next = await f.range(input.checkpoint, at - 2, at, '1')
      return { ...next.observation, observedAt }
    })
    await f.reconcileLive()
    expect(f.chainRead).toHaveBeenCalledTimes(2)
    expect(await f.backend.run(ctx => ctx.db.query('moneyTreasurySnapshots').collect())).toHaveLength(1)
    expect(await f.report()).toMatchObject({ snapshotAt: NOW + 12,
      checks: { cash: { kind: 'unavailable', code: 'treasury_chain_readback_conflict' } } })
  })
})
