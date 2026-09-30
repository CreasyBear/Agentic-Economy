import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { createFormanceContext, installPackage4FormanceSchema, readFormanceTransactionByReference } from '@/modules/money/formance'
import {
  bookFormanceTreasuryDeposit, prepareFormanceTreasuryDeposit, readFormanceTreasuryBalances,
  type FormanceTreasuryDeposit,
} from '@/modules/money/formance-treasury'

describe.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')('native Formance treasury deposits', () => {
  it('books one exact incoming log under concurrency and replays its native receipt', async () => {
    const context = createFormanceContext({ environment: 'sandbox',
      ledger: `ae-treasury-${randomUUID().replaceAll('-', '')}`,
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:8080', requestTimeoutMs: 30_000 })
    expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })
    const deposit: FormanceTreasuryDeposit = {
      environment: 'sandbox', custodyRef: 'custody:native', custodyGeneration: 1,
      network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payer: `0x${'1'.repeat(40)}`, recipient: `0x${'2'.repeat(40)}`,
      transactionHash: `0x${'3'.repeat(64)}`, logIndex: 0,
      blockHash: `0x${'4'.repeat(64)}`, blockNumber: '100', amountUnits: '500',
      observationRef: 'observation:native', evidenceDigest: `sha256:${'5'.repeat(64)}`,
    }
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      bookFormanceTreasuryDeposit(context, { ...deposit, observationRef: `observation:native:${index}` })))
    expect(results.every(result => result.kind === 'completed')).toBe(true)
    expect(await readFormanceTreasuryBalances(context, deposit)).toMatchObject({ availableUnits: '500', committedUnits: '0' })
    expect(await bookFormanceTreasuryDeposit(context, { ...deposit, observationRef: 'observation:retry' }))
      .toMatchObject({ kind: 'completed', replayed: true })
    for (const change of [{ amountUnits: '501' }, { custodyGeneration: 2 }, { custodyRef: 'custody:other' }]) {
      expect(await bookFormanceTreasuryDeposit(context, { ...deposit, ...change }))
        .toMatchObject({ kind: 'refused', code: 'formance_reference_conflict' })
    }
    const prepared = prepareFormanceTreasuryDeposit(deposit)
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    expect(await readFormanceTransactionByReference(context, prepared.command.commandRef)).toMatchObject({
      kind: 'found', template: 'TREASURY_CAPACITY_SYNCED', metadata: prepared.command.metadata,
      postings: [{ source: 'world', destination: prepared.command.variables.capacity, asset: 'USDC/6', amountUnits: '500' }],
    })
    expect(await bookFormanceTreasuryDeposit(context, { ...deposit, logIndex: 1 }))
      .toMatchObject({ kind: 'completed', replayed: false })
    expect(await readFormanceTreasuryBalances(context, deposit)).toMatchObject({ availableUnits: '1000', committedUnits: '0' })
  })
})

// Native atomicity is a separate guarantee from the controller's Convex retry
// tests: corporate buffer cash remains in the ledger but cannot fund a Call.
describe.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')('native treasury cash buffer', () => {
  it('books a gross opening with its buffer atomically and retains that floor across deposit replay', async () => {
    const { bookFormanceTreasuryBatch } = await import('@/modules/money/formance-treasury')
    const context = createFormanceContext({ environment: 'sandbox',
      ledger: `ae-treasury-buffer-${randomUUID().replaceAll('-', '')}`,
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:8080', requestTimeoutMs: 30_000 })
    expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })
    const identity = { environment: 'sandbox' as const, custodyRef: 'custody:buffer', custodyGeneration: 1,
      network: 'eip155:84532', asset: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
      address: `0x${'2'.repeat(40)}`, bufferTargetUnits: '10000' }
    const now = Date.now()
    const opening = { batchRef: `sha256:${'1'.repeat(64)}`, custodyRef: identity.custodyRef, custodyGeneration: 1,
      previousCheckpoint: null, previousBufferUnits: '0', bufferIncreaseUnits: '10000',
      observation: { kind: 'observed' as const, environment: identity.environment, network: identity.network,
        asset: identity.asset, address: identity.address, fromBlock: '100',
        checkpoint: { blockNumber: '100', blockHash: `0x${'4'.repeat(64)}`, balanceUnits: '20000' },
        blockTimestamp: now, transfers: [], caughtUp: true, observedAt: now },
      state: { kind: 'pending' as const }, createdAt: now }
    const results = await Promise.all(Array.from({ length: 6 }, () => bookFormanceTreasuryBatch(context, identity, opening)))
    expect(results, JSON.stringify(results)).toEqual(Array.from({ length: 6 }, () => expect.objectContaining({ kind: 'completed' })))
    expect(await readFormanceTreasuryBalances(context, identity)).toMatchObject({
      availableUnits: '10000', committedUnits: '0', bufferUnits: '10000' })
    const result = results[0]!
    if (result.kind !== 'completed') throw new Error('native_opening_failed')
    expect(result.transactionRefs).toHaveLength(2)
    const buffer = await readFormanceTransactionByReference(context, result.transactionRefs[1]!)
    expect(buffer).toMatchObject({ kind: 'found', template: 'CALL_RESERVED_USDC',
      postings: [{ source: expect.stringMatching(/:available$/u), destination: expect.stringMatching(/:committed$/u),
        asset: 'USDC/6', amountUnits: '10000' }] })
    const next = { ...opening, batchRef: `sha256:${'2'.repeat(64)}`, previousCheckpoint: opening.observation.checkpoint,
      previousBufferUnits: '10000', bufferIncreaseUnits: '0', observation: { ...opening.observation,
        fromBlock: '101', checkpoint: { blockNumber: '101', blockHash: `0x${'5'.repeat(64)}`, balanceUnits: '20500' },
        transfers: [{ transactionHash: `0x${'6'.repeat(64)}`, logIndex: 0, blockNumber: '101', blockHash: `0x${'5'.repeat(64)}`,
          payer: `0x${'1'.repeat(40)}`, recipient: identity.address, amountUnits: '500', evidenceDigest: `sha256:${'7'.repeat(64)}` }],
      } }
    expect(await bookFormanceTreasuryBatch(context, identity, next)).toMatchObject({ kind: 'completed' })
    expect(await bookFormanceTreasuryBatch(context, identity, next)).toMatchObject({ kind: 'completed', replayed: true })
    expect(await readFormanceTreasuryBalances(context, identity)).toMatchObject({
      availableUnits: '10500', committedUnits: '0', bufferUnits: '10000' })
    const changed = { ...opening, bufferIncreaseUnits: '9999' }
    expect(await bookFormanceTreasuryBatch(context, identity, changed)).toMatchObject({ kind: 'refused' })
  })
})
