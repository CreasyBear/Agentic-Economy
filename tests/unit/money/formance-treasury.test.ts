import { describe, expect, it, vi } from 'vitest'

import { PROMOTIONAL_FORMANCE_SCHEMA, PROMOTIONAL_FORMANCE_SCHEMA_VERSION, type FormanceContext } from '@/modules/money/formance'
import {
  bookFormanceTreasuryDeposit,
  prepareFormanceTreasuryDeposit,
  readFormanceTreasuryBalances,
  type FormanceTreasuryDeposit,
} from '@/modules/money/formance-treasury'

const deposit: FormanceTreasuryDeposit = {
  environment: 'sandbox', custodyRef: 'custody:one', custodyGeneration: 1,
  network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  payer: `0x${'1'.repeat(40)}`, recipient: `0x${'2'.repeat(40)}`,
  transactionHash: `0x${'3'.repeat(64)}`, logIndex: 0,
  blockHash: `0x${'4'.repeat(64)}`, blockNumber: '100', amountUnits: '500',
  observationRef: 'observation:one', evidenceDigest: `sha256:${'5'.repeat(64)}`,
}

function ledgerHarness() {
  type Transaction = {
    id: bigint; reference: string; template: string; metadata: Record<string, string>
    postings: Array<{ source: string; destination: string; asset: string; amount: bigint }>
  }
  const transactions = new Map<string, Transaction>()
  const balances = new Map<string, bigint>()
  let loseResponse = false
  const ledger = {
    getSchema: vi.fn(async () => ({ v2SchemaResponse: {
      data: { version: PROMOTIONAL_FORMANCE_SCHEMA_VERSION, ...PROMOTIONAL_FORMANCE_SCHEMA },
    } })),
    listTransactions: vi.fn(async ({ query }: { query: { $match: { reference: string } } }) => ({
      v2TransactionsCursorResponse: { cursor: { data: transactions.has(query.$match.reference)
        ? [transactions.get(query.$match.reference)] : [] } },
    })),
    createTransaction: vi.fn(async (request: { idempotencyKey: string; v2PostTransaction: {
      reference: string; metadata: Record<string, string>; script: { template: string; vars: Record<string, string> }
    } }) => {
      const command = request.v2PostTransaction
      const existing = transactions.get(command.reference)
      if (existing !== undefined) {
        if (existing.metadata.command_digest !== command.metadata.command_digest) {
          throw Object.assign(new Error('conflict'), { statusCode: 409 })
        }
        return { v2CreateTransactionResponse: { data: existing } }
      }
      const destination = command.script.vars.capacity!
      const amount = BigInt(command.script.vars.amount!.split(' ')[1]!)
      const transaction: Transaction = { id: BigInt(transactions.size + 1),
        reference: command.reference, template: command.script.template, metadata: command.metadata,
        postings: [{ source: 'world', destination, asset: 'USDC/6', amount }] }
      transactions.set(command.reference, transaction)
      balances.set(destination, (balances.get(destination) ?? 0n) + amount)
      if (loseResponse) throw new Error('connection lost after commit')
      return { v2CreateTransactionResponse: { data: transaction } }
    }),
    getAccount: vi.fn(async ({ address }: { address: string }) => ({ v2AccountResponse: {
      data: balances.has(address) ? { address, volumes: { 'USDC/6': {
        input: balances.get(address), output: 0n, balance: balances.get(address),
      } } } : undefined,
    } })),
  }
  const context = { configuration: { environment: 'sandbox', ledger: 'treasury-test' },
    sdk: { ledger: { v2: ledger } } } as unknown as FormanceContext
  return { context, ledger, transactions, balances, loseResponse: () => { loseResponse = true } }
}

describe('verified treasury ledger deposits', () => {
  it('credits once across duplicate observations and casing changes', async () => {
    const harness = ledgerHarness()
    expect(await bookFormanceTreasuryDeposit(harness.context, deposit)).toMatchObject({ kind: 'completed', replayed: false })
    expect(await bookFormanceTreasuryDeposit(harness.context, {
      ...deposit, observationRef: 'observation:two', asset: deposit.asset.toLowerCase(),
    })).toMatchObject({ kind: 'completed', replayed: true })
    expect(harness.transactions.size).toBe(1)
    expect(await readFormanceTreasuryBalances(harness.context, deposit))
      .toMatchObject({ kind: 'available', availableUnits: '500', committedUnits: '0', authoritativeForConsequences: false })
  })

  it('uses one native reference under concurrent delivery', async () => {
    const harness = ledgerHarness()
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      bookFormanceTreasuryDeposit(harness.context, { ...deposit, observationRef: `observation:${index}` })))
    expect(results.every(result => result.kind === 'completed')).toBe(true)
    expect(harness.transactions.size).toBe(1)
    expect(await readFormanceTreasuryBalances(harness.context, deposit)).toMatchObject({ availableUnits: '500' })
  })

  it('recovers a committed posting after response loss and a local retry', async () => {
    const harness = ledgerHarness()
    harness.loseResponse()
    expect(await bookFormanceTreasuryDeposit(harness.context, deposit)).toMatchObject({ kind: 'completed', replayed: true })
    expect(await bookFormanceTreasuryDeposit(harness.context, deposit)).toMatchObject({ kind: 'completed', replayed: true })
    expect(harness.transactions.size).toBe(1)
    expect(await readFormanceTreasuryBalances(harness.context, deposit)).toMatchObject({ availableUnits: '500' })
  })

  it.each([
    { amountUnits: '501' }, { custodyRef: 'custody:two' }, { custodyGeneration: 2 },
    { recipient: `0x${'6'.repeat(40)}` }, { evidenceDigest: `sha256:${'6'.repeat(64)}` },
    { blockHash: `0x${'7'.repeat(64)}` },
  ])('refuses changed immutable facts for the same transfer: %j', async change => {
    const harness = ledgerHarness()
    await bookFormanceTreasuryDeposit(harness.context, deposit)
    expect(await bookFormanceTreasuryDeposit(harness.context, { ...deposit, ...change }))
      .toEqual({ kind: 'refused', code: 'formance_reference_conflict', retryable: false })
    expect(harness.transactions.size).toBe(1)
    expect(harness.ledger.createTransaction).toHaveBeenCalledTimes(1)
  })

  it('credits distinct logs from one transaction independently', async () => {
    const harness = ledgerHarness()
    await bookFormanceTreasuryDeposit(harness.context, deposit)
    expect(await bookFormanceTreasuryDeposit(harness.context, { ...deposit, logIndex: 1 }))
      .toMatchObject({ kind: 'completed', replayed: false })
    expect(harness.transactions.size).toBe(2)
    expect(await readFormanceTreasuryBalances(harness.context, deposit)).toMatchObject({ availableUnits: '1000' })
  })

  it.each([
    { amountUnits: '0' }, { amountUnits: '01' }, { amountUnits: '9007199254740992' },
    { blockNumber: '-1' }, { blockNumber: '01' }, { logIndex: -1 }, { logIndex: 1.5 },
    { custodyGeneration: 0 }, { network: 'eip155:1' }, { asset: `0x${'8'.repeat(40)}` },
    { transactionHash: 'invalid' }, { blockHash: 'invalid' }, { evidenceDigest: 'invalid' },
    { recipient: deposit.payer }, { observationRef: '' },
  ])('never submits invalid evidence: %j', async change => {
    const harness = ledgerHarness()
    expect(await bookFormanceTreasuryDeposit(harness.context, { ...deposit, ...change }))
      .toMatchObject({ kind: 'refused', code: 'formance_treasury_deposit_input_invalid' })
    expect(harness.ledger.createTransaction).not.toHaveBeenCalled()
    expect(harness.ledger.listTransactions).not.toHaveBeenCalled()
  })

  it('refuses cross-environment posting before submission', async () => {
    const harness = ledgerHarness()
    const input: FormanceTreasuryDeposit = { ...deposit, environment: 'production', network: 'eip155:8453',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }
    expect(await bookFormanceTreasuryDeposit(harness.context, input)).toMatchObject({
      kind: 'refused', code: 'formance_treasury_environment_mismatch',
    })
    expect(harness.ledger.createTransaction).not.toHaveBeenCalled()
  })

  it('checks actual posting evidence even when command metadata matches', async () => {
    const harness = ledgerHarness()
    await bookFormanceTreasuryDeposit(harness.context, deposit)
    const transaction = [...harness.transactions.values()][0]!
    transaction.postings[0]!.amount = 999n
    expect(await bookFormanceTreasuryDeposit(harness.context, deposit)).toMatchObject({
      kind: 'refused', code: 'formance_treasury_deposit_evidence_conflict',
    })
  })

  it('keeps post-write readback uncertainty recoverable', async () => {
    const harness = ledgerHarness()
    harness.ledger.listTransactions.mockResolvedValueOnce({ v2TransactionsCursorResponse: { cursor: { data: [] } } })
      .mockRejectedValueOnce(new Error('readback offline'))
    expect(await bookFormanceTreasuryDeposit(harness.context, deposit)).toMatchObject({ kind: 'outcome_unknown' })
    expect(await bookFormanceTreasuryDeposit(harness.context, deposit)).toMatchObject({ kind: 'completed', replayed: true })
    expect(harness.transactions.size).toBe(1)
  })

  it('reads available and committed independently, treats absence as zero and preserves source failure', async () => {
    const harness = ledgerHarness()
    expect(await readFormanceTreasuryBalances(harness.context, deposit)).toMatchObject({ availableUnits: '0', committedUnits: '0', hasActivity: false })
    const prepared = prepareFormanceTreasuryDeposit(deposit)
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    const address = prepared.command.variables.capacity!
    harness.balances.set(address, 400n)
    harness.balances.set(address.replace(':available', ':committed'), 100n)
    expect(await readFormanceTreasuryBalances(harness.context, deposit)).toMatchObject({ availableUnits: '400', committedUnits: '100' })
    harness.ledger.getAccount.mockRejectedValueOnce(new Error('offline'))
    expect(await readFormanceTreasuryBalances(harness.context, deposit)).toMatchObject({ kind: 'unavailable' })
  })

  it.each(['available', 'committed'])('detects prior activity on a zero-balance %s account', async suffix => {
    const harness = ledgerHarness()
    harness.ledger.getAccount.mockImplementation(async ({ address }: { address: string }) => ({
      v2AccountResponse: { data: { address, volumes: { 'USDC/6': {
        input: address.endsWith(`:${suffix}`) ? 500n : 0n,
        output: address.endsWith(`:${suffix}`) ? 500n : 0n,
        balance: 0n,
      } } } },
    }))
    expect(await readFormanceTreasuryBalances(harness.context, deposit)).toMatchObject({
      kind: 'available', availableUnits: '0', committedUnits: '0', hasActivity: true,
    })
  })
})
