import { describe, expect, it, vi } from 'vitest'

import {
  MemoryDb,
  markerContext,
  markerHandler,
  now,
  principalId,
  reconcileHandler,
  reconciliationArgs,
  transactionRef,
} from './money-ledger-test-harness'
import { seedBudget, seedPaidCharge } from './money-ledger-test-fixtures'

describe('charge outcome marker atomicity', () => {
  it('marks only a live reserved charge and replays idempotently', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    const args = { transactionRef, principalId, now }

    await expect(markerHandler(markerContext(db), args)).resolves.toEqual({
      kind: 'outcome_unknown',
      transactionRef,
    })
    expect(db.rows('moneyTransactions').find((row) => row._id === 'transaction:charge')).toMatchObject({
      state: 'outcome_unknown',
      budgetState: 'unknown',
    })
    const before = structuredClone(db.rows('moneyTransactions'))
    await expect(markerHandler(markerContext(db), args)).resolves.toEqual({
      kind: 'outcome_unknown',
      transactionRef,
    })
    expect(db.rows('moneyTransactions')).toEqual(before)
  })
  it('does not reopen a reversed charge and preserves exact refund replay', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    await expect(reconcileHandler({ db }, reconciliationArgs())).resolves.toEqual({
      kind: 'settled',
    })
    const beforeMarker = {
      transactions: structuredClone(db.rows('moneyTransactions')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    await expect(markerHandler(markerContext(db), {
      transactionRef,
      principalId,
      now,
    })).resolves.toMatchObject({
      kind: 'refused',
      code: 'charge_reconciliation_required',
    })
    expect({
      transactions: db.rows('moneyTransactions'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      entries: db.rows('moneyLedgerEntries'),
      payouts: db.rows('moneyPayouts'),
    }).toEqual(beforeMarker)
    await expect(reconcileHandler({ db }, reconciliationArgs('released'))).resolves.toEqual({
      kind: 'reconciliation_required',
    })
    await expect(reconcileHandler({ db }, reconciliationArgs())).resolves.toEqual({
      kind: 'settled',
    })
    expect(db.rows('moneyTransactions').filter((row) => row.kind === 'refund')).toHaveLength(1)
  })
})
