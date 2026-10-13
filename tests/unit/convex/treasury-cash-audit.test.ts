import { describe, expect, it, vi } from 'vitest'
import { eip3009ABI } from '@x402/evm'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, type Hex } from 'viem'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  capacityAccount, prepareFormanceManagedCallReservation, prepareFormanceManagedCallRelease,
  prepareFormanceManagedCallSettlement, prepareFormancePaidCallRemedy, type FormanceManagedCallBooking,
} from '@/modules/money/formance-workflows'
import { prepareFormanceTreasuryBatch, treasuryBufferAccount } from '@/modules/money/formance-treasury'
import type { FormanceMoneyCommand } from '@/modules/money/formance'
import type { FormanceTreasuryAuditTransaction } from '@/modules/money/formance-treasury-audit'
import type { TreasuryBatch, TreasuryIdentity, TreasuryTransfer } from '@/modules/money/treasury'
import type { X402EvmReceipt } from '@/modules/capability-supply/server'
import { auditTreasuryCash } from '../../../convex/lib/money/treasury/cashAudit'
import { readX402EvmReceiptDetailed as readX402EvmReceipt } from '@/modules/capability-execution/call-runtime'

vi.mock('@/modules/capability-execution/call-runtime', () => ({ readX402EvmReceiptDetailed: vi.fn() }))

type Input = Parameters<typeof auditTreasuryCash>[0]
type CallSource = Input['calls'][number]
type AttemptSource = Input['attempts'][number]
type Reservation = Input['reservations'][number]
const NOW = Date.UTC(2026, 9, 1, 12)
const hash = (value: number): Hex => `0x${value.toString(16).padStart(64, '0')}`
const PAYER: Hex = `0x${'1'.repeat(40)}`
const PAYEE: Hex = `0x${'2'.repeat(40)}`
const ASSET: Hex = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
const NETWORK = 'eip155:84532'
const PAYMENT = '5000000'
const evidence = canonicalDigest('independent-treasury-payment-evidence')
const identity: TreasuryIdentity = {
  environment: 'sandbox', custodyRef: 'custody:cash-audit', custodyGeneration: 1,
  network: NETWORK, asset: ASSET, address: PAYER, bufferTargetUnits: '1000000',
}
const available = capacityAccount('treasury_usdc', identity.custodyRef, identity.custodyGeneration)
const committed = available.replace(/:available$/u, ':committed')
const segment = (kind: string, reference: string) => canonicalDigest({
  format: 'ae.formance-account-segment:v1', value: { kind, reference },
}).slice(7)

// Real builders supply immutable native envelopes. The chart, direction and
// amounts below are independent expectations, never copied from builder variables.
function nativeRow(command: FormanceMoneyCommand, postings: FormanceTreasuryAuditTransaction['postings'], id: number): FormanceTreasuryAuditTransaction {
  return { id: String(id), commandRef: command.commandRef, template: command.template, metadata: { ...command.metadata },
    effectiveAt: NOW - 1_600, insertedAt: NOW - 1_500, reverted: false, revertedAt: null, postings }
}
const usdc = (source: string, destination: string, amountUnits = PAYMENT) => ({ source, destination, asset: 'USDC/6', amountUnits })
function commands(result: ReturnType<typeof prepareFormanceManagedCallReservation>) {
  if (result.kind !== 'prepared') throw new Error(result.code)
  return result.bulk.commands
}
function commandFor(rows: readonly FormanceMoneyCommand[], template: string) {
  const command = rows.find(row => row.template === template)
  if (command === undefined) throw new Error(`missing_fixture_command:${template}`)
  return command
}
function batch(previous: TreasuryBatch | undefined, balanceUnits: string, transfers: TreasuryTransfer[] = []): TreasuryBatch {
  const value: TreasuryBatch = {
    batchRef: previous === undefined ? 'batch:cash-opening' : 'batch:cash-range',
    custodyRef: identity.custodyRef, custodyGeneration: identity.custodyGeneration,
    previousCheckpoint: previous?.observation.checkpoint ?? null,
    previousBufferUnits: previous === undefined ? '0' : '1000000',
    bufferIncreaseUnits: previous === undefined && balanceUnits !== '0' ? '1000000' : '0',
    observation: { kind: 'observed', ...identity, fromBlock: previous === undefined ? '100' : '101',
      checkpoint: { blockNumber: previous === undefined ? '100' : '110', blockHash: hash(previous === undefined ? 100 : 110), balanceUnits },
      blockTimestamp: NOW - 20_000, transfers, caughtUp: true, observedAt: NOW - 2_000 },
    state: { kind: 'pending' }, createdAt: NOW - 3_000,
  }
  const prepared = prepareFormanceTreasuryBatch(identity, value)
  if (prepared.kind !== 'prepared') throw new Error(prepared.code)
  value.state = { kind: 'booked', transactionRefs: prepared.commands.map(row => row.commandRef), completedAt: NOW - 1_000 }
  return value
}
function openingNative(opening: TreasuryBatch): FormanceTreasuryAuditTransaction[] {
  const prepared = prepareFormanceTreasuryBatch(identity, opening)
  if (prepared.kind !== 'prepared') throw new Error(prepared.code)
  return prepared.commands.map((command, index) => nativeRow(command, command.template === 'TREASURY_CAPACITY_SYNCED'
    ? [usdc('world', available, opening.observation.checkpoint.balanceUnits)]
    : [usdc(available, treasuryBufferAccount(identity), '1000000')], index + 1))
}
function ledger(availableUnits: string, committedUnits: string, bufferUnits = '1000000'): Input['ledger'] {
  return { kind: 'available', observedAt: NOW, availableUnits, committedUnits, bufferUnits,
    payments24hUnits: '0', payments7dUnits: '0', paymentBasis: 'gross_provider_payments',
    purchasedAvailableAudUnits: '0', purchasedReservedAudUnits: '0', promotionalAvailableAudUnits: '0', promotionalReservedAudUnits: '0' }
}
function transfer(transactionHash = hash(1), blockNumber = '105', amountUnits = PAYMENT): TreasuryTransfer {
  return { transactionHash, logIndex: 0, blockNumber, blockHash: hash(Number(blockNumber)), payer: PAYER,
    recipient: PAYEE, amountUnits, evidenceDigest: canonicalDigest({ transactionHash, blockNumber, amountUnits }) }
}
function booking(suffix = 'one'): FormanceManagedCallBooking {
  return { callRef: `call:cash:${suffix}`, quoteRef: `quote:cash:${suffix}`, idempotencyKey: `call:cash:${suffix}:key`,
    accountRef: `account:cash:${suffix}`, principalRef: `principal:cash:${suffix}`, agentBudgetGeneration: 1,
    legalCustomerRef: `customer:cash:${suffix}`, legalCustomerGeneration: 1,
    treasuryRef: identity.custodyRef, treasuryGeneration: identity.custodyGeneration,
    toolRef: `tool:cash:${suffix}`, providerRef: `provider:cash:${suffix}`, authorityGeneration: 1, policyGeneration: 1,
    buyerAmountUnits: '100', buyerRevenueUnits: '99', buyerTaxUnits: '1', providerAmountUnits: PAYMENT,
    quoteDigest: evidence, inputDigest: evidence, policyDigest: evidence, rateEvidenceDigest: evidence,
    treasuryEvidenceDigest: evidence, x402RequirementDigest: evidence }
}
function receipt(material: AttemptSource['material'], transactionHash: string, height = 105n): X402EvmReceipt {
  return { transactionHash, status: 'success', confirmations: 12n, blockHash: hash(Number(height)), blockNumber: height,
    observedBlockTimestamp: BigInt(Math.floor((NOW - 1_000) / 1_000)), authorizationState: true,
    transactionTo: ASSET, transactionInput: encodeFunctionData({ abi: eip3009ABI, functionName: 'transferWithAuthorization',
      args: [PAYER, PAYEE, BigInt(material.amountUnits), 0n, 9_999_999_999n, material.paymentNonce as Hex, 27, hash(3), hash(4)] }),
    logs: [{ address: ASSET, data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(material.amountUnits)]),
      topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: PAYER, to: PAYEE } }) as readonly Hex[] }] }
}
type Mode = 'settled' | 'paid-error' | 'reserved' | 'released'
function fixture(mode: Mode = 'settled', options: { nativePaid?: boolean; chainPaid?: boolean; suffix?: string } = {}) {
  const b = booking(options.suffix)
  const reserveCommand = commandFor(commands(prepareFormanceManagedCallReservation(b)), 'CALL_RESERVED_USDC')
  const finalization = { booking: b, externalEvidenceDigest: evidence }
  const paidCommand = commandFor(commands(mode === 'paid-error' ? prepareFormancePaidCallRemedy(finalization)
    : prepareFormanceManagedCallSettlement(finalization)), 'PROVIDER_SETTLED')
  const releaseCommands = commands(prepareFormanceManagedCallRelease({ ...finalization, submissionProvenAbsent: true }))
  const releaseCommand = commandFor(releaseCommands, 'CALL_RELEASED_USDC')
  const nativePaid = options.nativePaid ?? (mode === 'settled' || mode === 'paid-error')
  const chainPaid = options.chainPaid ?? (mode === 'settled' || mode === 'paid-error')
  const opening = batch(undefined, '100000000')
  const range = batch(opening, chainPaid ? '95000000' : '100000000', chainPaid ? [transfer()] : [])
  const transactions = openingNative(opening)
  transactions.push(nativeRow(reserveCommand, [usdc(available, committed)], transactions.length + 1))
  const callSegment = segment('call', b.callRef)
  const obligationAccrued = `provider_obligations:${callSegment}:accrued`
  if (nativePaid) transactions.push(nativeRow(paidCommand, [
    usdc(committed, `providers:${segment('provider', b.providerRef)}:settlement`),
    usdc(obligationAccrued, `provider_obligations:${callSegment}:settled`),
  ], transactions.length + 1))
  if (mode === 'released') transactions.push(nativeRow(releaseCommand, [
    usdc(committed, available), usdc(obligationAccrued, 'platform:expense:providers'),
  ], transactions.length + 1))
  if (mode === 'paid-error') {
    const buyerRelease = commandFor(commands(prepareFormancePaidCallRemedy(finalization)), 'CALL_RELEASED_AUD')
    transactions.push(nativeRow(buyerRelease, [{ source: `calls:${callSegment}:buyer_reserved`,
      destination: `accounts:${segment('account', b.accountRef)}:available`, asset: 'AUD/6', amountUnits: b.buyerAmountUnits }], transactions.length + 1))
  }
  const call: CallSource = { call: {
    callRef: b.callRef, quoteRef: b.quoteRef, accountRef: b.accountRef, principalRef: b.principalRef,
    toolRef: b.toolRef, inputDigest: b.inputDigest, attemptRef: `attempt:${b.callRef}`,
    state: mode === 'reserved' ? 'reconciliation_required' : 'completed',
    financialState: mode === 'paid-error' || mode === 'released' ? 'released' : mode,
    createdAt: NOW - 10_000, updatedAt: NOW - 1_000, reservationRefs: [reserveCommand.commandRef],
    settlementRefs: nativePaid ? [paidCommand.commandRef] : [], releaseRefs: mode === 'released' ? [releaseCommand.commandRef] : [], evidenceHash: evidence,
  }, native: { kind: 'available', expectedEnvironment: 'sandbox', booking: b }, joinIssues: [], obligation: {
    obligationRef: `obligation:${b.callRef}`, callRef: b.callRef, toolRef: b.toolRef, providerRef: b.providerRef,
    buyerAccountRef: b.accountRef, providerAmountUnits: PAYMENT, state: nativePaid ? 'settled' : mode === 'released' ? 'released' : 'accrued',
    ...(nativePaid ? { settlementTransactionRef: paidCommand.commandRef, settledAt: NOW - 1_000 } : {}),
    evidenceRefs: [], createdAt: NOW - 10_000, updatedAt: NOW - 1_000,
  } }
  const material: AttemptSource['material'] = {
    dispatchRef: b.callRef, attemptRef: call.call.attemptRef!, effectGeneration: 1, toolRef: b.toolRef, inputDigest: b.inputDigest,
    paymentIdentifier: `payment:${b.callRef}`, challengeDigest: evidence, scheme: 'exact',
    network: NETWORK, asset: ASSET, payTo: PAYEE, amountUnits: PAYMENT, currency: 'USDC', exponent: 6,
    custodyRef: `authorization-custody:${b.callRef}`, custodyBudgetRef: identity.custodyRef, custodyGeneration: 1,
    authorizationDigest: evidence, spendReservationRef: `spend:${b.callRef}`, paymentIdentityDigest: evidence,
    paymentUnsignedMaterialDigest: evidence, paymentSigningIdempotencyKey: '11111111-1111-4111-8111-111111111111',
    paymentPayer: PAYER, paymentNonce: hash(7), state: nativePaid || chainPaid ? 'observed' : 'prepared', preparedAt: NOW - 9_000,
    ...(nativePaid || chainPaid ? { settlementStatus: 'settled' as const, paymentResponseDigest: evidence } : {}),
    evidenceRefs: nativePaid || chainPaid ? [`chain:${NETWORK}:${hash(1)}`] : [],
  }
  const attempt: AttemptSource = { material, call: call.call, quote: null, obligation: call.obligation, native: call.native, joinIssues: [] }
  const reservation: Reservation = { reservationRef: material.spendReservationRef!, platformBudgetRef: 'platform:cash-audit',
    custodyBudgetRef: identity.custodyRef, custodyRef: material.custodyRef, custodyGeneration: 1, environment: 'sandbox',
    network: NETWORK, asset: ASSET, currency: 'USDC', exponent: 6, dispatchRef: b.callRef, attemptRef: material.attemptRef,
    effectGeneration: 1, authorizationDigest: evidence, paymentIdentityDigest: evidence, paymentUnsignedMaterialDigest: evidence,
    paymentSigningIdempotencyKey: material.paymentSigningIdempotencyKey!, typedDataDigest: evidence,
    normalizedPayTo: PAYEE, amountUnits: PAYMENT, reservedAt: NOW - 8_000, policyRevision: 'fixture-policy', initialScreeningCheckRef: 'screening:cash-audit',
    state: nativePaid || chainPaid ? 'settled' : mode === 'released' ? 'unused' : 'liability',
    ...(nativePaid || chainPaid ? { settledAt: NOW - 1_000, resolutionEvidenceDigest: evidence }
      : mode === 'released' ? { resolvedAt: NOW - 1_000, resolutionEvidenceDigest: evidence, unusedProof: 'definitively_not_signed' as const } : {}),
  }
  const input: Input = { identity, snapshotAt: NOW,
    progress: { kind: 'ready', identity, checkpoint: range.observation.checkpoint, blockTimestamp: range.observation.blockTimestamp, bufferUnits: '1000000' },
    batches: [opening, range], calls: [call], attempts: [attempt], reservations: [reservation], transactions,
    ledger: nativePaid ? ledger('94000000', '0') : mode === 'released' ? ledger('99000000', '0') : ledger('94000000', PAYMENT) }
  const reader = vi.fn(async (value: AttemptSource['material'], tx: string) => receipt(value, tx, chainPaid ? 105n : 115n))
  return { input, call, attempt, reservation, opening, range, transactions, reader }
}

describe('independent treasury cash reconciliation behavior', () => {
  it('matches a booked empty opening without inventing deposits, commitments or payment receipts', async () => {
    const opening = batch(undefined, '0')
    const reader = vi.fn(async () => undefined)
    const result = await auditTreasuryCash({ identity, snapshotAt: NOW,
      progress: { kind: 'ready', identity, checkpoint: opening.observation.checkpoint, blockTimestamp: opening.observation.blockTimestamp, bufferUnits: '0' },
      batches: [opening], calls: [], attempts: [], reservations: [], transactions: [], ledger: ledger('0', '0', '0') }, reader)
    expect(result).toMatchObject({ cash: { kind: 'matched', expectedUnits: '0', observedUnits: '0' },
      settlements: { kind: 'matched', checkedCount: 0 }, reservations: { kind: 'matched', expectedUnits: '0' },
      rawCashDifferenceUnits: '0', cashTimingAdjustmentUnits: '0', deposits: [], depositsComplete: true })
    expect(reader).not.toHaveBeenCalled()
  })

  it.each([
    { blockAge: 32 * 60_000, readAge: 2_000, expected: 'matched' },
    { blockAge: 60 * 60_000 - 1, readAge: 2_000, expected: 'matched' },
    { blockAge: 60 * 60_000, readAge: 2_000, expected: 'unavailable' },
    { blockAge: 32 * 60_000, readAge: 20 * 60_000, expected: 'unavailable' },
  ])('checks finalized-block age $blockAge and observation age $readAge independently', async ({ blockAge, readAge, expected }) => {
    const opening = batch(undefined, '0')
    opening.observation.blockTimestamp = NOW - blockAge
    opening.observation.observedAt = NOW - readAge
    const result = await auditTreasuryCash({ identity, snapshotAt: NOW,
      progress: { kind: 'ready', identity, checkpoint: opening.observation.checkpoint,
        blockTimestamp: opening.observation.blockTimestamp, bufferUnits: '0' },
      batches: [opening], calls: [], attempts: [], reservations: [], transactions: [], ledger: ledger('0', '0', '0') })
    expect(result.cash).toMatchObject(expected === 'matched' ? { kind: 'matched', differenceUnits: '0' }
      : { kind: 'unavailable', code: 'treasury_chain_observation_stale' })
  })

  it.each(['settled', 'paid-error'] as const)('matches exact Provider cash for %s, independently of buyer release', async mode => {
    const f = fixture(mode)
    const result = await auditTreasuryCash(f.input, f.reader)
    expect(result).toMatchObject({ cash: { kind: 'matched', expectedUnits: '95000000', observedUnits: '95000000' },
      settlements: { kind: 'matched', checkedCount: 1, expectedUnits: PAYMENT }, reservations: { kind: 'matched', expectedUnits: '0' },
      rawCashDifferenceUnits: '0', cashTimingAdjustmentUnits: '0', inFlight: { kind: 'available', count: 0 } })
    expect(f.reader).toHaveBeenCalledWith(f.attempt.material, hash(1), expect.any(Number))
    expect(result.deposits).toEqual([{ transactionRef: f.opening.state.kind === 'booked' ? f.opening.state.transactionRefs[0] : '',
      amountUnits: '100000000', bookedAt: NOW - 1_500, chainTransactionHash: null }])
  })

  it('subtracts a finalized payment not yet natively booked and retains the recovery task', async () => {
    const f = fixture('reserved', { chainPaid: true, nativePaid: false })
    const result = await auditTreasuryCash(f.input, f.reader)
    expect(result).toMatchObject({ cash: { kind: 'matched', expectedUnits: '95000000', observedUnits: '95000000' },
      rawCashDifferenceUnits: '-5000000', cashTimingAdjustmentUnits: '-5000000',
      settlements: { kind: 'attention', code: 'treasury_settlement_booking_pending', evidenceRefs: [f.call.call.callRef] },
      reservations: { kind: 'attention' }, inFlight: { kind: 'available', count: 1, amountUnits: PAYMENT } })
  })

  it('adds a native payment beyond the retained finality checkpoint without claiming raw cash equality', async () => {
    const f = fixture('settled', { chainPaid: false })
    const result = await auditTreasuryCash(f.input, f.reader)
    expect(result).toMatchObject({ cash: { kind: 'matched', expectedUnits: '100000000', observedUnits: '100000000' },
      settlements: { kind: 'matched', expectedUnits: PAYMENT }, rawCashDifferenceUnits: PAYMENT, cashTimingAdjustmentUnits: PAYMENT })
  })

  it('reports a normal receipt outage as unavailable rather than inventing an orphan theft', async () => {
    const f = fixture()
    const result = await auditTreasuryCash(f.input, async () => undefined)
    expect(result).toMatchObject({ settlements: { kind: 'unavailable', code: 'treasury_payment_receipt_unavailable' },
      cash: { kind: 'unavailable', code: 'treasury_payment_attribution_required' } })
  })

  it.each(['missing', 'throwing'])('recovers one transient %s receipt read with exact verified evidence', async first => {
    const f = fixture()
    const reader = vi.fn<NonNullable<Parameters<typeof auditTreasuryCash>[1]>>()
    if (first === 'throwing') reader.mockRejectedValueOnce(Error('fixture RPC outage'))
    else reader.mockResolvedValueOnce(undefined)
    reader.mockResolvedValueOnce(receipt(f.attempt.material, hash(1)))
    const result = await auditTreasuryCash(f.input, reader)
    expect(reader).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ cash: { kind: 'matched' }, settlements: { kind: 'matched' } })
  })

  it('retains unavailable after two missing reads and never retries conflicting returned evidence', async () => {
    const f = fixture()
    const missing = vi.fn(async () => undefined)
    expect((await auditTreasuryCash(f.input, missing)).settlements).toMatchObject({
      kind: 'unavailable', code: 'treasury_payment_receipt_unavailable',
    })
    expect(missing).toHaveBeenCalledTimes(2)
    const conflict = vi.fn(async () => ({ ...receipt(f.attempt.material, hash(1)), status: 'reverted' as const }))
    expect((await auditTreasuryCash(f.input, conflict)).settlements.kind).toBe('mismatch')
    expect(conflict).toHaveBeenCalledOnce()
  })

  it('does not start a retry after the overall receipt deadline', async () => {
    const f = fixture()
    let now = NOW
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    const reader = vi.fn(async () => { now += 120_000; return undefined })
    const result = await auditTreasuryCash(f.input, reader).finally(() => clock.mockRestore())
    expect(reader).toHaveBeenCalledOnce()
    expect(result.settlements).toMatchObject({ kind: 'unavailable', code: 'treasury_payment_rpc_deadline_exceeded' })
  })

  it('rechecks the deadline after a delayed retry timer resumes', async () => {
    vi.useFakeTimers()
    let now = NOW
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      const f = fixture()
      const reader = vi.fn(async () => undefined)
      const pending = auditTreasuryCash(f.input, reader)
      await vi.advanceTimersByTimeAsync(0)
      now += 120_000
      await vi.advanceTimersByTimeAsync(250)
      const result = await pending
      expect(reader).toHaveBeenCalledOnce()
      expect(result.settlements).toMatchObject({ kind: 'unavailable', code: 'treasury_payment_readback_incomplete' })
    } finally { clock.mockRestore(); vi.useRealTimers() }
  })

  it('charges retries against the same 250-read audit cap', async () => {
    vi.useFakeTimers()
    try {
      const fixtures = Array.from({ length: 127 }, (_, index) => {
        const value = fixture('settled', { suffix: `retry-cap-${index}` })
        value.attempt.material.evidenceRefs = [`chain:${NETWORK}:${hash(1_000 + index)}`]
        value.attempt.material.paymentNonce = hash(2_000 + index)
        return value
      })
      const opening = batch(undefined, '1000000000')
      const range = batch(opening, '365000000', fixtures.map((_, index) => transfer(hash(1_000 + index))))
      const seen = new Set<string>()
      const reader = vi.fn(async (material: AttemptSource['material'], tx: string) => {
        if (!seen.has(tx)) { seen.add(tx); return undefined }
        return receipt(material, tx)
      })
      const pending = auditTreasuryCash({ identity, snapshotAt: NOW,
        progress: { kind: 'ready', identity, checkpoint: range.observation.checkpoint, blockTimestamp: range.observation.blockTimestamp, bufferUnits: '1000000' },
        batches: [opening, range], calls: fixtures.map(value => value.call), attempts: fixtures.map(value => value.attempt),
        reservations: fixtures.map(value => value.reservation), ledger: ledger('364000000', '0'),
        transactions: [...openingNative(opening), ...fixtures.flatMap(value => value.transactions.slice(2))]
          .map((row, index) => ({ ...row, id: String(index + 1) })),
      }, reader)
      await vi.runAllTimersAsync()
      const result = await pending
      expect(reader).toHaveBeenCalledTimes(250)
      expect(result.settlements).toMatchObject({ kind: 'unavailable', code: 'treasury_payment_readback_incomplete' })
      expect(result.cash.kind).toBe('unavailable')
    } finally { vi.useRealTimers() }
  })

  it.each([false, true])('respects RPC concurrency and total readback budget with elapsed deadline=%s', async deadlineExpires => {
    const fixtures = Array.from({ length: 6 }, (_, index) => {
      const value = fixture('settled', { suffix: `serial-${index}` })
      value.attempt.material.evidenceRefs = [`chain:${NETWORK}:${hash(1_000 + index)}`]
      value.attempt.material.paymentNonce = hash(2_000 + index)
      return value
    })
    const opening = batch(undefined, '100000000')
    const range = batch(opening, '70000000', fixtures.map((_, index) => transfer(hash(1_000 + index))))
    let active = 0
    let now = NOW
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    const reader = vi.fn(async (material: AttemptSource['material'], tx: string) => {
      if (active > 0) return undefined
      active += 1
      try {
        await new Promise<void>(resolve => setTimeout(resolve, 1))
        if (deadlineExpires) now += 61_000
        return receipt(material, tx)
      } finally { active -= 1 }
    })
    const result = await auditTreasuryCash({ identity, snapshotAt: NOW,
      progress: { kind: 'ready', identity, checkpoint: range.observation.checkpoint, blockTimestamp: range.observation.blockTimestamp, bufferUnits: '1000000' },
      batches: [opening, range], calls: fixtures.map(value => value.call), attempts: fixtures.map(value => value.attempt),
      reservations: fixtures.map(value => value.reservation), ledger: ledger('69000000', '0'),
      transactions: [...openingNative(opening), ...fixtures.flatMap(value => value.transactions.slice(2))]
        .map((row, index) => ({ ...row, id: String(index + 1) })),
    }, reader).finally(() => clock.mockRestore())
    expect(result).toMatchObject(deadlineExpires ? {
      cash: { kind: 'unavailable' }, settlements: { kind: 'unavailable', code: 'treasury_payment_readback_incomplete' },
      reservations: { kind: 'matched', expectedUnits: '0' },
    } : { cash: { kind: 'matched', differenceUnits: '0' },
      settlements: { kind: 'matched', checkedCount: 6, expectedUnits: '30000000' },
      reservations: { kind: 'matched', expectedUnits: '0' } })
    expect(reader).toHaveBeenCalledTimes(deadlineExpires ? 2 : 6)
    expect(active).toBe(0)
  })

  it.each([11n, 12n])('uses current receipt evidence with %s confirmations without waiting for a later block', async confirmations => {
    const f = fixture()
    vi.mocked(readX402EvmReceipt).mockImplementation(async (...args) => args[7] === undefined
      ? { kind: 'receipt', receipt: { ...receipt(f.attempt.material, hash(1)), confirmations } }
      : { kind: 'failed', code: 'receipt_missing', method: 'eth_getTransactionReceipt' })
    const result = await auditTreasuryCash(f.input)
    expect(result.settlements).toMatchObject(confirmations === 12n
      ? { kind: 'matched', checkedCount: 1, expectedUnits: PAYMENT }
      : { kind: 'unavailable', code: 'treasury_payment_receipt_immature' })
    expect(result.cash.kind).toBe(confirmations === 12n ? 'matched' : 'unavailable')
    expect(vi.mocked(readX402EvmReceipt).mock.calls.every(args => args[8]?.retryCount === 0)).toBe(true)
  })

  it.each([false, true])('isolates a throwing RPC receipt boundary with confirmed orphan=%s', async hasOrphan => {
    const f = fixture()
    if (hasOrphan) {
      f.range.observation.transfers.push(transfer(hash(9), '106', '1000000'))
      f.range.observation.checkpoint.balanceUnits = '94000000'
    }
    const result = await auditTreasuryCash(f.input, async () => { throw new Error('external_rpc_unavailable') })
    expect(result.settlements).toMatchObject(hasOrphan
      ? { kind: 'mismatch', code: 'treasury_settlement_evidence_conflict', evidenceRefs: [`chain:${NETWORK}:${hash(9)}`] }
      : { kind: 'unavailable', code: 'treasury_payment_rpc_transport_unavailable' })
    expect(result.cash.kind).not.toBe('matched')
  })

  it('refuses more than 250 payment candidates without attempting an unbounded RPC traversal', async () => {
    const fixtures = Array.from({ length: 251 }, (_, index) => {
      const value = fixture('reserved', { chainPaid: true, nativePaid: false, suffix: `bounded-${index}` })
      value.attempt.material.evidenceRefs = [`chain:${NETWORK}:${hash(1_000 + index)}`]
      value.attempt.material.paymentNonce = hash(2_000 + index)
      return value
    })
    const opening = batch(undefined, '1300000000')
    const range = batch(opening, '45000000', fixtures.map((_, index) => transfer(hash(1_000 + index))))
    const openingRows = openingNative(opening)
    const transactions = [...openingRows, ...fixtures.flatMap(value => value.transactions.slice(2))]
      .map((row, index) => ({ ...row, id: String(index + 1) }))
    const reader = vi.fn(async (material: AttemptSource['material'], tx: string) => receipt(material, tx))
    const result = await auditTreasuryCash({ identity, snapshotAt: NOW,
      progress: { kind: 'ready', identity, checkpoint: range.observation.checkpoint, blockTimestamp: range.observation.blockTimestamp, bufferUnits: '1000000' },
      batches: [opening, range], transactions, calls: fixtures.map(value => value.call),
      attempts: fixtures.map(value => value.attempt), reservations: fixtures.map(value => value.reservation),
      ledger: ledger('44000000', '1255000000') }, reader)
    expect(result.settlements.kind).toBe('unavailable')
    expect(result.cash.kind).not.toBe('matched')
    expect(reader).not.toHaveBeenCalled()
  })

  it('retains a confirmed orphan outgoing contradiction despite an unrelated receipt outage', async () => {
    const f = fixture()
    const orphan = transfer(hash(9), '106', '1000000')
    f.range.observation.transfers.push(orphan)
    f.range.observation.checkpoint.balanceUnits = '94000000'
    const result = await auditTreasuryCash(f.input, async () => undefined)
    expect(result.settlements).toMatchObject({ kind: 'mismatch', code: 'treasury_settlement_evidence_conflict',
      evidenceRefs: [`chain:${NETWORK}:${hash(9)}`] })
    expect(result.cash.kind).not.toBe('matched')
  })

  it('refuses released cash with a still-live exact signing liability instead of matching committed zero', async () => {
    const f = fixture('released')
    f.reservation.state = 'liability'
    const result = await auditTreasuryCash(f.input, f.reader)
    expect(result.reservations).toMatchObject({ kind: 'mismatch', code: 'treasury_signing_liability_conflict', evidenceRefs: [f.reservation.reservationRef] })
    expect(f.reader).not.toHaveBeenCalled()
  })

  it('does not use buyer release as a Provider payment when exact native Provider cash is absent', async () => {
    const f = fixture('paid-error', { nativePaid: false })
    const result = await auditTreasuryCash(f.input, f.reader)
    expect(result.settlements).toMatchObject({ kind: 'attention', code: 'treasury_settlement_booking_pending' })
    expect(result.reservations.kind).not.toBe('matched')
    expect(result.cashTimingAdjustmentUnits).toBe('-5000000')
  })

  it('refuses duplicate transaction/log evidence before reading receipts', async () => {
    const f = fixture()
    f.range.observation.transfers.push({ ...f.range.observation.transfers[0]! })
    const result = await auditTreasuryCash(f.input, f.reader)
    expect(result).toMatchObject({ cash: { kind: 'unavailable', code: 'treasury_chain_transfer_duplicate' },
      settlements: { kind: 'unavailable', code: 'treasury_chain_transfer_duplicate' } })
    expect(f.reader).not.toHaveBeenCalled()
  })

  it('refuses two Calls attributing the same verified transaction hash', async () => {
    const first = fixture()
    const second = fixture('settled', { suffix: 'two' })
    const result = await auditTreasuryCash({ ...first.input, calls: [...first.input.calls, ...second.input.calls],
      attempts: [...first.input.attempts, ...second.input.attempts], reservations: [...first.input.reservations, ...second.input.reservations],
      transactions: [...first.transactions, ...second.transactions.slice(2).map((row, index) => ({ ...row, id: String(first.transactions.length + index + 1) }))] }, first.reader)
    expect(result.settlements).toMatchObject({ kind: 'mismatch', code: 'treasury_settlement_evidence_conflict', evidenceRefs: [second.call.call.callRef] })
    expect(result.cash.kind).not.toBe('matched')
  })

  it('flags opposite unowned native movements even when their sum leaves raw cash at zero', async () => {
    const f = fixture()
    const orphan = (id: string, source: string, destination: string): FormanceTreasuryAuditTransaction => ({
      id, commandRef: `manual:${id}`, template: null, metadata: {}, effectiveAt: NOW - 1_000, insertedAt: NOW - 900,
      reverted: false, revertedAt: null, postings: [usdc(source, destination, '1000000')],
    })
    const result = await auditTreasuryCash({ ...f.input, transactions: [...f.transactions,
      orphan('90', available, 'world'), orphan('91', 'world', available)] }, f.reader)
    expect(result.rawCashDifferenceUnits).toBe('0')
    expect(result.cash).toMatchObject({ kind: 'mismatch', code: 'treasury_cash_movement_unattributed', evidenceRefs: ['manual:90', 'manual:91'] })
  })

  it('retains overdue reserved cash as attention even when no payment candidate exists', async () => {
    const f = fixture('reserved')
    f.call.call.createdAt = NOW - 31 * 60_000
    const result = await auditTreasuryCash(f.input, f.reader)
    expect(result).toMatchObject({ cash: { kind: 'matched' }, settlements: { kind: 'matched', checkedCount: 0 },
      reservations: { kind: 'attention', code: 'treasury_reservation_overdue', evidenceRefs: [f.call.call.callRef], pendingUnits: PAYMENT },
      inFlight: { kind: 'available', count: 1, oldestAt: f.call.call.createdAt, overdueCount: 1, overdueUnits: PAYMENT } })
    expect(f.reader).not.toHaveBeenCalled()
  })

  it.each(['cash_amount', 'missing_obligation', 'reverted', 'wrong_evidence'] as const)('refuses %s native Provider proof through real matchers', async fault => {
    const f = fixture()
    const paidIndex = f.transactions.findIndex(row => row.template === 'PROVIDER_SETTLED')
    const original = f.transactions[paidIndex]!
    f.transactions[paidIndex] = fault === 'cash_amount' ? { ...original, postings: [{ ...original.postings[0]!, amountUnits: '5000001' }, original.postings[1]!] }
      : fault === 'missing_obligation' ? { ...original, postings: [original.postings[0]!] }
        : fault === 'reverted' ? { ...original, reverted: true, revertedAt: NOW - 500 }
          : { ...original, metadata: { ...original.metadata, external_evidence_digest: canonicalDigest('unrelated-native-evidence').slice(7) } }
    const result = await auditTreasuryCash(f.input, f.reader)
    expect(result.settlements).toMatchObject({ kind: 'mismatch', code: 'treasury_settlement_evidence_conflict' })
    expect(result.cash.kind).not.toBe('matched')
  })
})


describe('classified treasury receipt failures', () => {
  it.each(['receipt_conflict', 'rpc_authentication_failed', 'rpc_invalid_response', 'receipt_immature'] as const)(
    'does not retry %s or turn it into missing evidence', async code => {
      const f = fixture()
      const reader = vi.fn(async () => ({ kind: 'failed' as const, code, method: 'agreement' as const }))
      const result = await auditTreasuryCash(f.input, reader)
      expect(reader).toHaveBeenCalledOnce()
      expect(result.settlements).toMatchObject({ kind: 'unavailable', code: `treasury_payment_${code}` })
      expect(result.cash.kind).not.toBe('matched')
    },
  )

  it('honors a bounded provider retry delay within the original read budget', async () => {
    vi.useFakeTimers()
    try {
      const f = fixture()
      const reader = vi.fn<NonNullable<Parameters<typeof auditTreasuryCash>[1]>>()
        .mockResolvedValueOnce({ kind: 'failed', code: 'rpc_rate_limited', method: 'eth_getTransactionReceipt', retryAfterMs: 1_000 })
        .mockResolvedValueOnce({ kind: 'receipt', receipt: receipt(f.attempt.material, hash(1)) })
      const pending = auditTreasuryCash(f.input, reader)
      await vi.advanceTimersByTimeAsync(999)
      expect(reader).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(1)
      expect((await pending).settlements.kind).toBe('matched')
      expect(reader).toHaveBeenCalledTimes(2)
      expect(reader.mock.calls[0]?.[2]).toBe(reader.mock.calls[1]?.[2])
    } finally { vi.useRealTimers() }
  })

  it('returns at the absolute deadline even if an injected receipt read ignores cancellation', async () => {
    vi.useFakeTimers()
    try {
      const f = fixture()
      const reader = vi.fn(async () => new Promise<undefined>(() => undefined))
      const pending = auditTreasuryCash(f.input, reader)
      await vi.advanceTimersByTimeAsync(120_001)
      expect((await pending).settlements).toMatchObject({ kind: 'unavailable', code: 'treasury_payment_rpc_deadline_exceeded' })
      expect(reader).toHaveBeenCalledOnce()
    } finally { vi.useRealTimers() }
  })
})


it('preserves real provider disagreement through the cash audit without retrying it into a pass', async () => {
  const supply = await import('@/modules/capability-supply/server')
  const actual = await vi.importActual<typeof import('@/modules/capability-execution/call-runtime')>('@/modules/capability-execution/call-runtime')
  const f = fixture()
  vi.stubEnv('AE_X402_RPC_URLS_JSON', JSON.stringify({ [NETWORK]: ['https://rpc.one.example', 'https://rpc.two.example'] }))
  const first = receipt(f.attempt.material, hash(1))
  const peer = vi.spyOn(supply, 'readGuardedX402EvmReceiptDetailed')
    .mockResolvedValueOnce({ kind: 'receipt', receipt: first })
    .mockResolvedValueOnce({ kind: 'receipt', receipt: { ...first, blockHash: hash(999) } })
    .mockResolvedValue({ kind: 'receipt', receipt: first })
  try {
    const result = await auditTreasuryCash(f.input, async (attempt, transactionHash, deadlineAt) =>
      await actual.readX402EvmReceiptDetailed(attempt.network, attempt.asset, transactionHash, {} as never,
        'sandbox', attempt.paymentPayer!, attempt.paymentNonce!, undefined, { retryCount: 0, ...(deadlineAt === undefined ? {} : { deadlineAt }) }))
    expect(result.settlements).toEqual({ kind: 'unavailable', code: 'treasury_payment_receipt_conflict' })
    expect(result.cash.kind).not.toBe('matched')
    expect(peer).toHaveBeenCalledTimes(2)
  } finally { peer.mockRestore(); vi.unstubAllEnvs() }
})


it('delivers a terminal conflict through the real wrapper and audit before a stalled peer can consume the deadline', async () => {
  vi.useFakeTimers()
  const supply = await import('@/modules/capability-supply/server')
  const actual = await vi.importActual<typeof import('@/modules/capability-execution/call-runtime')>('@/modules/capability-execution/call-runtime')
  const f = fixture()
  vi.stubEnv('AE_X402_RPC_URLS_JSON', JSON.stringify({ [NETWORK]: ['https://rpc.one.example', 'https://rpc.two.example'] }))
  const peer = vi.spyOn(supply, 'readGuardedX402EvmReceiptDetailed')
    .mockResolvedValueOnce({ kind: 'failed', code: 'receipt_conflict', method: 'eth_getTransactionByHash' })
    .mockImplementationOnce(() => new Promise(() => undefined))
  try {
    const pending = auditTreasuryCash(f.input, async (attempt, transactionHash, deadlineAt) =>
      await actual.readX402EvmReceiptDetailed(attempt.network, attempt.asset, transactionHash, {} as never,
        'sandbox', attempt.paymentPayer!, attempt.paymentNonce!, undefined,
        { retryCount: 0, ...(deadlineAt === undefined ? {} : { deadlineAt }) }))
    await vi.advanceTimersByTimeAsync(1)
    expect((await pending).settlements).toEqual({ kind: 'unavailable', code: 'treasury_payment_receipt_conflict' })
    expect(peer).toHaveBeenCalledTimes(2)
    expect(peer.mock.calls[1]?.[0].signal?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(peer).toHaveBeenCalledTimes(2)
  } finally { peer.mockRestore(); vi.unstubAllEnvs(); vi.useRealTimers() }
})
