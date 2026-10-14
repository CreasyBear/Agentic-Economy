import { getFunctionName, type FunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eip3009ABI } from '@x402/evm'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, type Hex } from 'viem'
import { internal } from '../../../convex/_generated/api'
import * as treasuryCashAudit from '../../../convex/lib/money/treasury/cashAudit'
import { reconcileTreasurySnapshot } from '../../../convex/lib/money/treasury/snapshot'
import { readTreasuryChainObservation, type TreasuryRpc } from '../../../convex/lib/money/treasury/chainObservation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createFormanceContext } from '@/modules/money/formance'
import { prepareFormanceTreasuryBatch, treasuryBufferAccount } from '@/modules/money/formance-treasury'
import { capacityAccount, prepareFormanceFundingSettlement, prepareFormanceManagedCallReservation, prepareFormanceManagedCallSettlement } from '@/modules/money/formance-workflows'
import { quoteManagedX402BuyerAud } from '@/modules/money/public'
import { buildDevelopmentPublishedToolEvidence } from '../capability-supply/fixtures/development-published-tool-evidence'
import type { FormanceTreasuryAuditTransaction } from '@/modules/money/formance-treasury-audit'
import type { TreasuryChainCheckpoint, TreasuryChainObservation, TreasuryTransfer } from '@/modules/money/treasury'
import { convexTestWithMarketComponents } from '../../helpers/convex-fixtures'

// Only the native ledger, RPC and funding HTTP read boundaries are synthetic. The controller, complete
// Convex source reads, command builders, exact audit, seals and publisher execute.
const io = vi.hoisted(() => ({ metrics: vi.fn(), audit: vi.fn(), receipt: vi.fn() }))
vi.mock('@/modules/capability-execution/call-runtime', () => ({ readX402EvmReceiptDetailed: io.receipt }))
vi.mock('../../../convex/lib/money/formance/gateway', async original => ({
  ...await original<typeof import('../../../convex/lib/money/formance/gateway')>(),
  readFormanceTreasurySnapshot: io.metrics, readFormanceTreasuryAudit: io.audit,
}))
const fundingIo = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('undici', async original => ({
  ...await original<typeof import('undici')>(), fetch: fundingIo.fetch,
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
  vi.spyOn(treasuryCashAudit, 'auditTreasuryCash')
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
  async function payment() {
    const digest = canonicalDigest('snapshot-refresh-payment')
    const callRef = 'call:snapshot-refresh'; const quoteRef = 'quote:snapshot-refresh'
    const attemptRef = 'attempt:snapshot-refresh'; const createdAt = NOW - 10
    const tool = buildDevelopmentPublishedToolEvidence().tool
    const toolRef = `operation:v1:${'d'.repeat(64)}`
    const rate = quoteManagedX402BuyerAud({ environment: 'sandbox', requiredUsdcAtomicUnits: '5000000', observedAt: createdAt,
      referenceRate: { source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.2', fetchedAt: createdAt } })
    if (rate.kind !== 'quoted') throw new Error('fixture_rate_missing')
    await backend.run(async ctx => {
      await ctx.db.insert('capabilityQuotes', {
        quoteRef, principalId: 'principal:refresh', accountRef: 'account:refresh', credentialId: 'credential:refresh',
        applicationRef: 'application:refresh', environment: 'sandbox', grantRef: 'grant:refresh', grantGeneration: 1,
        grantPolicyDigest: digest, grantExpiresAt: NOW + 60_000, toolRef, toolVersion: tool.identity.publicationRevision,
        toolMaterialDigest: digest, currentToolDigest: digest, toolJson: JSON.stringify(tool), normalizedInputJson: '{}', inputDigest: digest,
        pricingJson: '{}', pricingDigest: digest, decisionAudUnits: '6000000', sourceUsdcUnits: '5000000',
        x402RequirementDigest: digest, x402RequirementJson: '{}', x402RequirementObservedAt: createdAt,
        rateEvidenceJson: JSON.stringify(rate.evidence), rateEvidenceDigest: rate.evidence.evidenceDigest,
        budgetPolicyRef: 'budget:refresh', budgetGeneration: 1, maximumSpendPerCallUnits: '6000000', formanceSchemaVersion: 'v1.3.0',
        policyGeneration: 1, legalCustomerRef: 'legal:refresh', legalCustomerGeneration: 1, buyerRevenueUnits: '5454545', buyerTaxUnits: '545455',
        accountAvailableUnits: '10000000', budgetAvailableUnits: '10000000', legalExposureAvailableUnits: '10000000', balanceUnits: '10000000',
        treasuryCustodyRef: identity.custodyRef, treasuryCustodyGeneration: 1, treasuryVersion: 1,
        treasuryEvidenceRef: 'treasury:refresh', treasuryEvidenceDigest: digest, treasurySpendableUnits: '10000000',
        commercialPolicyRefs: ['policy:refresh'], commercialPolicyDigest: digest, evidenceDigest: digest,
        state: 'consumed', consumedCallRef: callRef, expiresAt: NOW + 30_000, createdAt, updatedAt: createdAt,
      })
      await ctx.db.insert('capabilityCalls', {
        callRef, quoteRef, principalId: 'principal:refresh', ownerId: 'account:refresh', credentialId: 'credential:refresh', applicationRef: 'application:refresh',
        toolRef, idempotencyKey: callRef, environment: 'sandbox', grantRef: 'grant:refresh', grantGeneration: 1, policyDigest: digest,
        grantExpiresAt: NOW + 60_000, toolJson: JSON.stringify(tool), inputJson: '{}', inputDigest: digest, requestDigest: digest,
        state: 'pending', dispatchState: 'enqueued', formanceFinancialState: 'reservation_pending', attemptRef, createdAt, updatedAt: createdAt,
      })
    })
    const booking = await backend.query(internal.moneyManagedCall.readBooking, { callRef })
    if (booking.kind !== 'available') throw new Error('fixture_payment_booking_missing')
    const reserve = prepareFormanceManagedCallReservation(booking.booking)
    const paid = prepareFormanceManagedCallSettlement({ booking: booking.booking, externalEvidenceDigest: digest })
    if (reserve.kind !== 'prepared' || paid.kind !== 'prepared') throw new Error('fixture_payment_commands_missing')
    const reserveCommand = reserve.bulk.commands.find(row => row.template === 'CALL_RESERVED_USDC')!
    const paidCommand = paid.bulk.commands.find(row => row.template === 'PROVIDER_SETTLED')!
    const segment = (kind: string, reference: string) => canonicalDigest({ format: 'ae.formance-account-segment:v1', value: { kind, reference } }).slice(7)
    const committed = available.replace(/:available$/u, ':committed')
    const callSegment = segment('call', callRef)
    for (const [command, postings] of [
      [reserveCommand, [{ source: available, destination: committed, asset: 'USDC/6', amountUnits: '5000000' }]],
      [paidCommand, [{ source: committed, destination: `providers:${segment('provider', booking.booking.providerRef)}:settlement`, asset: 'USDC/6', amountUnits: '5000000' },
        { source: `provider_obligations:${callSegment}:accrued`, destination: `provider_obligations:${callSegment}:settled`, asset: 'USDC/6', amountUnits: '5000000' }]],
    ] as const) native.push({ id: String(native.length + 1), commandRef: command.commandRef, template: command.template,
      metadata: { ...command.metadata }, effectiveAt: createdAt, insertedAt: createdAt, reverted: false, revertedAt: null, postings })
    expect(await backend.mutation(internal.moneyManagedCall.attachReservation, { callRef,
      transactionRefs: reserve.bulk.commands.map(row => row.commandRef) })).toMatchObject({ kind: 'attached' })
    await backend.run(async ctx => {
      const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique()
      const obligation = await ctx.db.query('moneyProviderObligations').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique()
      if (call === null || obligation === null) throw new Error('fixture_payment_call_missing')
      await ctx.db.patch(call._id, { state: 'completed', formanceFinancialState: 'settled', formanceSettlementRefs: [paidCommand.commandRef], evidenceHash: digest })
      await ctx.db.patch(obligation._id, { state: 'settled', settlementTransactionRef: paidCommand.commandRef, settledAt: NOW })
      await ctx.db.insert('moneyX402PaymentAttempts', {
        dispatchRef: callRef, attemptRef, effectGeneration: 1, toolRef, inputDigest: digest,
        paymentIdentifier: 'payment:refresh', operationKeyDigest: digest, challengeDigest: digest,
        challengeJson: '{}', selectedRequirementJson: '{}', providerEndpoint: 'https://provider.example/tool', credentialRef: 'credential:cdp',
        scheme: 'exact', network: NETWORK, asset: ASSET, payTo: OTHER, amountUnits: '5000000', currency: 'USDC', exponent: 6,
        custodyRef: 'authorization-custody:refresh', custodyBudgetRef: identity.custodyRef, custodyGeneration: 1, custodyDailyMaximumUnits: '50000000',
        authorizationDigest: digest, paymentIdentityDigest: digest, paymentUnsignedMaterialDigest: digest,
        paymentSigningIdempotencyKey: '11111111-1111-4111-8111-111111111111', paymentPayer: PAYER, paymentNonce: hash(7),
        state: 'observed', preparedAt: createdAt, observedAt: createdAt, settlementStatus: 'settled', paymentResponseDigest: digest,
        evidenceRefs: [`chain:${NETWORK}:${hash(1)}`],
      })
    })
    expect(await backend.query(internal.moneyTreasuryReconciliation.readAttemptSources, { cutoffAt: NOW }))
      .toMatchObject({ kind: 'available', rows: [{ native: { kind: 'available' }, joinIssues: [] }] })
  }
  async function invalidFunding(updatedAt = NOW - 1, principalUnits = '100') {
    await backend.run(ctx => ctx.db.insert('moneyFundingCommands', {
      commandRef: 'funding:refresh', accountRef: 'account:refresh', legalCustomerRef: 'legal:refresh', actorPrincipalRef: 'principal:refresh',
      environment: 'sandbox', currency: 'AUD', exponent: 6, principalUnits, serviceFeeUnits: '10', taxUnits: '1', totalUnits: '111',
      commercialPolicyDigest: canonicalDigest('funding-refresh'), commercialPolicyRefs: [], idempotencyKey: 'funding:refresh', inputDigest: canonicalDigest('funding-refresh'),
      successReturnRef: 'https://ae.example/complete', providerRecoveryDeadlineAt: NOW + 1_000,
      state: 'pending', createdAt: NOW - 10, updatedAt,
    }))
  }
  return { backend, native, opening, range, controller, reconcile, reconcileLive, chainRead, report, alerts, payment, invalidFunding }
}

describe('treasury snapshot cutoff reconciliation', () => {
  it.each(['rpc_rate_limited', 'receipt_conflict', 'ledger_audit', 'ledger_metrics', 'source_identity'] as const)(
    'does not refresh a newly booked checkpoint for %s', async fault => {
      const f = await fixture()
      if (fault === 'rpc_rate_limited' || fault === 'receipt_conflict') {
        await f.payment()
        io.receipt.mockResolvedValue({ kind: 'failed', code: fault, method: 'eth_getTransactionReceipt' })
      } else if (fault === 'ledger_audit') io.audit.mockResolvedValue({ kind: 'unavailable', code: 'treasury_ledger_unavailable' })
      else if (fault === 'ledger_metrics') io.metrics.mockResolvedValue({ kind: 'unavailable', code: 'treasury_ledger_unavailable' })
      else await f.invalidFunding(NOW - 1, '101')
      const read = f.chainRead.getMockImplementation()!
      f.chainRead.mockImplementationOnce(async () => {
        const next = await f.range(f.opening.checkpoint, NOW + 10, NOW + 12, '1')
        return { ...next.observation, observedAt: NOW }
      }).mockImplementation(read)
      const result = await f.reconcileLive()
      const report = await f.report()
      if (process.env.AE_TREASURY_REFRESH_MEASUREMENT === '1') console.info('TREASURY_REFRESH_MEASUREMENT', JSON.stringify({
        fault, wholeAudits: io.metrics.mock.calls.length, cashAudits: vi.mocked(treasuryCashAudit.auditTreasuryCash).mock.calls.length,
        nativeAuditReads: io.audit.mock.calls.length, chainReads: f.chainRead.mock.calls.length, receiptReads: io.receipt.mock.calls.length,
        result, snapshotAt: report?.snapshotAt, checks: report?.checks,
        published: (await f.backend.run(ctx => ctx.db.query('moneyTreasurySnapshots').collect())).length,
      }))
      expect(result).toMatchObject({ kind: 'published' })
      expect(f.chainRead).toHaveBeenCalledTimes(1)
      expect(io.metrics).toHaveBeenCalledTimes(1)
      expect(io.audit).toHaveBeenCalledTimes(2)
      expect(report).toMatchObject({ snapshotAt: NOW, checks: { cash: { kind: 'unavailable' } } })
      if (fault === 'rpc_rate_limited' || fault === 'receipt_conflict') expect(report).toMatchObject({ checks: {
        cash: { kind: 'unavailable', code: 'treasury_payment_attribution_required' },
        settlements: { kind: 'unavailable', code: fault === 'rpc_rate_limited' ? 'treasury_payment_rpc_rate_limited' : 'treasury_payment_receipt_conflict' },
      } })
      expect(await f.backend.run(ctx => ctx.db.query('moneyTreasurySnapshots').collect())).toHaveLength(1)
      expect(await f.backend.run(ctx => ctx.db.query('moneyPaymentReadinessWork').collect())).toHaveLength(0)
    })

  it.each([NOW - 1, NOW + 10])('repairs the exact checkpoint booking race created at %s', async createdAt => {
    const f = await fixture()
    const read = f.chainRead.getMockImplementation()!
    f.chainRead.mockImplementationOnce(async () => {
      const next = await f.range(f.opening.checkpoint, createdAt, NOW + 12, '1')
      if (createdAt < NOW) {
        expect(await f.backend.query(internal.moneyTreasuryReconciliation.readBatchSources, { cutoffAt: NOW }))
          .toEqual({ kind: 'unavailable', code: 'treasury_source_cutoff_changed' })
        expect(await f.backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW }))
          .toMatchObject({ progress: { kind: 'unavailable', code: 'treasury_source_cutoff_changed' } })
      }
      return { ...next.observation, observedAt: NOW }
    }).mockImplementation(read)
    const result = await f.reconcileLive()
    const report = await f.report()
    if (process.env.AE_TREASURY_REFRESH_MEASUREMENT === '1') console.info('TREASURY_REFRESH_MEASUREMENT', JSON.stringify({
      fault: createdAt < NOW ? 'precutoff_booking_race' : 'healthy_checkpoint_race',
      wholeAudits: io.metrics.mock.calls.length, cashAudits: vi.mocked(treasuryCashAudit.auditTreasuryCash).mock.calls.length,
      nativeAuditReads: io.audit.mock.calls.length, chainReads: f.chainRead.mock.calls.length, receiptReads: io.receipt.mock.calls.length,
      result, snapshotAt: report?.snapshotAt, checks: report?.checks,
      published: (await f.backend.run(ctx => ctx.db.query('moneyTreasurySnapshots').collect())).length,
    }))
    expect(result).toMatchObject({ kind: 'published' })
    expect(f.chainRead).toHaveBeenCalledTimes(2)
    expect(io.metrics).toHaveBeenCalledTimes(2)
    expect(io.audit).toHaveBeenCalledTimes(4)
    expect(report).toMatchObject({ snapshotAt: NOW + 12, checks: { cash: { kind: 'matched' },
      funding: { kind: 'matched' }, settlements: { kind: 'matched' }, reservations: { kind: 'matched' } } })
    expect(await f.backend.run(ctx => ctx.db.query('moneyTreasurySnapshots').collect())).toHaveLength(1)
    expect(await f.backend.run(ctx => ctx.db.query('moneyTreasuryBatches').collect())).toHaveLength(2)
  })

  it.each(['ledger_audit', 'source_cutoff'] as const)('keeps a pre-cutoff booking race unavailable with %s', async fault => {
    const f = await fixture()
    if (fault === 'ledger_audit') io.audit.mockResolvedValue({ kind: 'unavailable', code: 'treasury_ledger_unavailable' })
    else await f.invalidFunding(NOW + 11)
    f.chainRead.mockImplementationOnce(async () => {
      const next = await f.range(f.opening.checkpoint, NOW - 1, NOW + 12, '1')
      return { ...next.observation, observedAt: NOW }
    })
    const result = await f.reconcileLive()
    const report = await f.report()
    if (process.env.AE_TREASURY_REFRESH_MEASUREMENT === '1') console.info('TREASURY_REFRESH_MEASUREMENT', JSON.stringify({
      fault: `precutoff_${fault}`, wholeAudits: io.metrics.mock.calls.length, cashAudits: vi.mocked(treasuryCashAudit.auditTreasuryCash).mock.calls.length,
      nativeAuditReads: io.audit.mock.calls.length, chainReads: f.chainRead.mock.calls.length, receiptReads: io.receipt.mock.calls.length,
      result, snapshotAt: report?.snapshotAt, checks: report?.checks,
      published: (await f.backend.run(ctx => ctx.db.query('moneyTreasurySnapshots').collect())).length,
    }))
    expect(result).toMatchObject({ kind: 'published' })
    expect(f.chainRead).toHaveBeenCalledTimes(1)
    expect(report!.checks.cash.kind).toBe('unavailable')
  })

  it('requests readiness recovery immediately after a matched publication and coalesces its replay', async () => {
    const f = await fixture()
    expect(await f.reconcile()).toMatchObject({ kind: 'published' })
    const before = await f.backend.run(async ctx => ({ work: await ctx.db.query('moneyPaymentReadinessWork').unique(),
      scheduled: await ctx.db.system.query('_scheduled_functions').collect() }))
    expect(before.work).toMatchObject({ environment: 'sandbox', requestedVersion: NOW, attemptsInWindow: 1, job: { kind: 'queued' } })
    expect(before.scheduled).toHaveLength(1)
    expect(await f.reconcile()).toMatchObject({ kind: 'published', replayed: true })
    expect(await f.backend.run(async ctx => ({ work: await ctx.db.query('moneyPaymentReadinessWork').unique(),
      scheduled: await ctx.db.system.query('_scheduled_functions').collect() }))).toEqual(before)
  })

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

describe('treasury checkpoint refresh funding result guard', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubEnv('STRIPE_READBACK_KEY', '')
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    vi.stubEnv('STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID', '')
    vi.stubEnv('STRIPE_CHECKOUT_HOST', '')
    fundingIo.fetch.mockRejectedValue(new Error('fixture_funding_provider_unavailable'))
  })

  it.each([
    ['processor_configuration', NOW - 1], ['processor_configuration', NOW + 10],
    ['processor_read', NOW - 1], ['processor_read', NOW + 10],
    ['native_mismatch', NOW - 1], ['native_mismatch', NOW + 10],
  ] as const)('retains completed funding %s at the original cutoff for a range created at %s', async (fault, createdAt) => {
    const f = await fixture()
    await f.invalidFunding()
    if (fault === 'processor_read') {
      vi.stubEnv('STRIPE_READBACK_KEY', 'rk_test_funding_review_fixture')
      await f.backend.run(async ctx => {
        const row = await ctx.db.query('moneyFundingCommands').unique()
        if (row === null) throw new Error('fixture_funding_missing')
        await ctx.db.patch(row._id, { principalUnits: '1000000', serviceFeeUnits: '100000', taxUnits: '10000',
          totalUnits: '1110000', externalRef: 'cs_test_funding_review' })
      })
    } else if (fault === 'native_mismatch') {
      const evidenceDigest = canonicalDigest('funding-review-native-evidence')
      const prepared = prepareFormanceFundingSettlement({ commandRef: 'funding:refresh', idempotencyKey: 'funding:refresh',
        accountRef: 'account:refresh', processorRef: 'cs_test_funding_review', principalUnits: '100', serviceFeeUnits: '10',
        taxUnits: '1', totalUnits: '111', policyDigest: canonicalDigest('funding-refresh'), externalEvidenceDigest: evidenceDigest })
      if (prepared.kind !== 'prepared') throw new Error('fixture_funding_command_missing')
      const segment = (kind: string, reference: string) => canonicalDigest({ format: 'ae.formance-account-segment:v1', value: { kind, reference } }).slice(7)
      const processor = `processor:${segment('processor', 'cs_test_funding_review')}:settlement`
      f.native.push({ id: 'funding-review-native', commandRef: prepared.command.commandRef, template: prepared.command.template,
        metadata: { ...prepared.command.metadata, command_digest: 'f'.repeat(64) },
        effectiveAt: NOW - 1, insertedAt: NOW - 1, reverted: false, revertedAt: null, postings: [
          { source: 'world', destination: processor, asset: 'AUD/6', amountUnits: '111' },
          { source: processor, destination: `accounts:${segment('account', 'account:refresh')}:available`, asset: 'AUD/6', amountUnits: '100' },
          { source: processor, destination: 'platform:revenue:sales', asset: 'AUD/6', amountUnits: '10' },
          { source: processor, destination: 'platform:tax:gst', asset: 'AUD/6', amountUnits: '1' },
        ] })
      await f.backend.run(async ctx => {
        const row = await ctx.db.query('moneyFundingCommands').unique()
        if (row === null) throw new Error('fixture_funding_missing')
        await ctx.db.patch(row._id, { state: 'succeeded', externalRef: 'cs_test_funding_review', evidenceDigest,
          appliedTransactionRef: prepared.command.commandRef })
      })
    }
    const fundingSources = await f.backend.query(internal.moneyTreasuryReconciliation.readFundingSources, { cutoffAt: NOW })
    expect(fundingSources).toMatchObject({ kind: 'available', rows: [{ commandRef: 'funding:refresh' }] })
    const read = f.chainRead.getMockImplementation()!
    f.chainRead.mockImplementationOnce(async () => {
      const next = await f.range(f.opening.checkpoint, createdAt, NOW + 12, '1')
      return { ...next.observation, observedAt: NOW }
    }).mockImplementation(read)
    const controller = f.controller()
    const mutations = vi.spyOn(controller, 'runMutation')
    expect(await f.reconcileLive(controller)).toMatchObject({ kind: 'published' })
    const report = await f.report()
    expect(report?.checks.funding).toMatchObject(fault === 'native_mismatch'
      ? { kind: 'mismatch', code: 'treasury_funding_native_binding_invalid' }
      : { kind: 'unavailable', code: fault === 'processor_read'
        ? 'treasury_funding_processor_read_unavailable' : 'treasury_funding_processor_unavailable' })
    if (process.env.AE_TREASURY_FUNDING_REVIEW_EVIDENCE === '1') console.info('FUNDING_REVIEW_FIX_EVIDENCE', JSON.stringify({
      fault, createdAt, fundingSource: fundingSources.kind, funding: report?.checks.funding, snapshotAt: report?.snapshotAt,
      chainReads: f.chainRead.mock.calls.length, wholeAudits: io.metrics.mock.calls.length, nativeAuditReads: io.audit.mock.calls.length,
      blockedProviderReads: fundingIo.fetch.mock.calls.length, mutations: mutations.mock.calls.map(([ref]) => getFunctionName(ref)),
    }))
    expect(f.chainRead).toHaveBeenCalledTimes(1)
    expect(io.metrics).toHaveBeenCalledTimes(1)
    expect(io.audit).toHaveBeenCalledTimes(2)
    expect(report).toMatchObject({ snapshotAt: NOW, checks: { cash: { kind: 'unavailable' } } })
    expect(mutations.mock.calls.map(([ref]) => getFunctionName(ref))).toEqual(['moneyTreasuryReconciliation:publishSnapshot'])
    expect(await f.backend.run(ctx => ctx.db.query('moneyTreasurySnapshots').collect())).toHaveLength(1)
    expect(await f.backend.run(ctx => ctx.db.query('moneyPaymentReadinessWork').collect())).toHaveLength(0)
    expect(await f.backend.query(internal.moneyTreasuryReconciliation.readFundingSources, { cutoffAt: NOW })).toEqual(fundingSources)
    expect(fundingIo.fetch).toHaveBeenCalledTimes(fault === 'processor_read' ? 1 : 0)
    if (fault === 'processor_read') expect(fundingIo.fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' })
  })

  it.each([NOW - 1, NOW + 10])('allows attention funding to repair the booked range created at %s', async createdAt => {
    const f = await fixture()
    await f.invalidFunding()
    vi.stubEnv('STRIPE_READBACK_KEY', 'rk_test_funding_review_fixture')
    const read = f.chainRead.getMockImplementation()!
    f.chainRead.mockImplementationOnce(async () => {
      const next = await f.range(f.opening.checkpoint, createdAt, NOW + 12, '1')
      return { ...next.observation, observedAt: NOW }
    }).mockImplementation(read)
    expect(await f.reconcileLive()).toMatchObject({ kind: 'published' })
    expect(f.chainRead).toHaveBeenCalledTimes(2)
    expect(io.metrics).toHaveBeenCalledTimes(2)
    expect(io.audit).toHaveBeenCalledTimes(4)
    expect(await f.report()).toMatchObject({ snapshotAt: NOW + 12, checks: { cash: { kind: 'matched' },
      funding: { kind: 'attention', code: 'treasury_funding_source_incomplete' } } })
    expect(await f.backend.run(ctx => ctx.db.query('moneyTreasurySnapshots').collect())).toHaveLength(1)
    expect(await f.backend.run(ctx => ctx.db.query('moneyPaymentReadinessWork').collect())).toHaveLength(0)
    expect(fundingIo.fetch).not.toHaveBeenCalled()
  })

  it('retains a completed signing reservation contradiction alongside a repairable checkpoint conflict', async () => {
    const f = await fixture()
    await f.payment()
    await f.backend.run(async ctx => {
      const attempt = await ctx.db.query('moneyX402PaymentAttempts').unique()
      if (attempt === null) throw new Error('fixture_attempt_missing')
      await ctx.db.patch(attempt._id, { paymentSigningClaimedAt: NOW - 1 })
    })
    expect(await f.backend.query(internal.moneyTreasuryReconciliation.readAttemptSources, { cutoffAt: NOW }))
      .toMatchObject({ kind: 'available', rows: [{ material: { paymentSigningClaimedAt: NOW - 1 }, joinIssues: [] }] })
    expect(await f.backend.query(internal.moneyTreasuryReconciliation.readSpendReservationSources, { cutoffAt: NOW }))
      .toMatchObject({ kind: 'available', rows: [] })
    io.receipt.mockResolvedValue({ kind: 'receipt', receipt: {
      transactionHash: hash(1), status: 'success', confirmations: 12n, blockHash: hash(115), blockNumber: 115n,
      observedBlockTimestamp: BigInt(Math.floor((NOW - 1_000) / 1_000)), authorizationState: true,
      transactionTo: ASSET, transactionInput: encodeFunctionData({ abi: eip3009ABI, functionName: 'transferWithAuthorization',
        args: [PAYER as Hex, OTHER as Hex, 5_000_000n, 0n, 9_999_999_999n, hash(7) as Hex, 27, hash(3) as Hex, hash(4) as Hex] }),
      logs: [{ address: ASSET, data: encodeAbiParameters([{ type: 'uint256' }], [5_000_000n]),
        topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: PAYER as Hex, to: OTHER as Hex } }) }],
    } })
    const read = f.chainRead.getMockImplementation()!
    f.chainRead.mockImplementationOnce(async () => {
      const next = await f.range(f.opening.checkpoint, NOW + 10, NOW + 12, '1')
      return { ...next.observation, observedAt: NOW }
    }).mockImplementation(read)
    const controller = f.controller()
    const mutations = vi.spyOn(controller, 'runMutation')
    expect(await f.reconcileLive(controller)).toMatchObject({ kind: 'published' })
    const report = await f.report()
    expect(report?.checks.reservations).toMatchObject({ kind: 'mismatch', code: 'treasury_signing_liability_conflict' })
    if (process.env.AE_TREASURY_FUNDING_REVIEW_EVIDENCE === '1') console.info('FUNDING_REVIEW_FIX_EVIDENCE', JSON.stringify({
      fault: 'reservation_mismatch', reservations: report?.checks.reservations, cash: report?.checks.cash,
      snapshotAt: report?.snapshotAt, chainReads: f.chainRead.mock.calls.length, wholeAudits: io.metrics.mock.calls.length,
      nativeAuditReads: io.audit.mock.calls.length, receiptReads: io.receipt.mock.calls.length,
      mutations: mutations.mock.calls.map(([ref]) => getFunctionName(ref)),
    }))
    expect(f.chainRead).toHaveBeenCalledTimes(1)
    expect(io.metrics).toHaveBeenCalledTimes(1)
    expect(io.audit).toHaveBeenCalledTimes(2)
    expect(io.receipt).toHaveBeenCalledTimes(1)
    expect(report).toMatchObject({ snapshotAt: NOW, checks: {
      cash: { kind: 'unavailable', code: 'treasury_chain_readback_conflict' }, funding: { kind: 'matched' }, settlements: { kind: 'matched' },
    } })
    expect(mutations.mock.calls.map(([ref]) => getFunctionName(ref))).toEqual(['moneyTreasuryReconciliation:publishSnapshot'])
    expect(await f.backend.run(ctx => ctx.db.query('moneyTreasurySnapshots').collect())).toHaveLength(1)
    expect(await f.backend.run(ctx => ctx.db.query('moneyPaymentReadinessWork').collect())).toHaveLength(0)
    expect(fundingIo.fetch).not.toHaveBeenCalled()
  })
})
