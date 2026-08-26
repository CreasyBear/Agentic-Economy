import { describe, expect, it } from 'vitest'

import {
  MemoryDb,
  authorityBoundChargeReconcileHandler,
  authorityBoundMarkerHandler,
  markerContext,
  markerHandler,
  now,
  principalId,
  reconcileHandler,
  reconciliationArgs,
  transactionRef,
} from './money-ledger-test-harness'
import {
  seedBudget,
  seedCurrentMoneyInvocationAuthority,
  seedPaidCharge,
} from './money-ledger-test-fixtures'

describe('charge outcome marker atomicity', () => {
  it.each([
    {
      name: 'expired credential',
      mutate: (db: MemoryDb) => {
        const row = db.rows('credentials')[0]
        if (row !== undefined) row.expiresAt = 1
      },
    },
    {
      name: 'stale credential generation',
      mutate: (db: MemoryDb) => {
        const row = db.rows('externalIdentityBindings')[0]
        if (row !== undefined) row.credentialGeneration = 2
      },
    },
    {
      name: 'delegation resource mismatch',
      mutate: (db: MemoryDb) => {
        const row = db.rows('authorityDelegationGrants')[0]
        if (row !== undefined) row.resourceRefs = ['operation:other']
      },
    },
    {
      name: 'delegation ancestry cycle',
      mutate: (db: MemoryDb) => {
        const row = db.rows('authorityDelegationGrants')[0]
        if (row !== undefined) {
          row.parentGrantRef = row.grantRef
          row.parentGeneration = row.generation
        }
      },
    },
    {
      name: 'cross-account delegation',
      mutate: (db: MemoryDb) => {
        const row = db.rows('authorityDelegationGrants')[0]
        if (row !== undefined) row.accountRef = 'account:foreign'
      },
    },
    {
      name: 'forged root provenance',
      mutate: (db: MemoryDb) => {
        const row = db.rows('authorityDelegationGrants')[0]
        if (row !== undefined) row.actorPrincipalRef = 'principal:forged-root'
      },
    },
  ])('denies $name without changing a charge journal', async ({ mutate }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    seedCurrentMoneyInvocationAuthority(db)
    mutate(db)
    const before = structuredClone(db.rows('moneyTransactions'))
    await expect(
      authorityBoundMarkerHandler(markerContext(db), {
        transactionRef,
        principalId,
        now,
      }),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'charge_reconciliation_required',
    })
    expect(db.rows('moneyTransactions')).toEqual(before)
  })

  it('rechecks the journal-bound invocation before charge consequence changes', async () => {
    const activeDb = new MemoryDb()
    seedBudget(activeDb)
    seedPaidCharge(activeDb)
    seedCurrentMoneyInvocationAuthority(activeDb)
    await expect(
      authorityBoundMarkerHandler(markerContext(activeDb), {
        transactionRef,
        principalId,
        now,
      }),
    ).resolves.toEqual({ kind: 'outcome_unknown', transactionRef })

    const revokedMarkerDb = new MemoryDb()
    seedBudget(revokedMarkerDb)
    seedPaidCharge(revokedMarkerDb)
    seedCurrentMoneyInvocationAuthority(revokedMarkerDb, 'revoked')
    const markerBefore = structuredClone(
      revokedMarkerDb.rows('moneyTransactions'),
    )
    await expect(
      authorityBoundMarkerHandler(markerContext(revokedMarkerDb), {
        transactionRef,
        principalId,
        now,
      }),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'charge_reconciliation_required',
    })
    expect(revokedMarkerDb.rows('moneyTransactions')).toEqual(markerBefore)

    const revokedReconcileDb = new MemoryDb()
    seedBudget(revokedReconcileDb)
    seedPaidCharge(revokedReconcileDb)
    seedCurrentMoneyInvocationAuthority(revokedReconcileDb, 'revoked')
    const reconcileBefore = structuredClone(
      revokedReconcileDb.rows('moneyTransactions'),
    )
    await expect(
      authorityBoundChargeReconcileHandler(
        markerContext(revokedReconcileDb),
        reconciliationArgs(),
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'charge_reconciliation_required',
    })
    expect(revokedReconcileDb.rows('moneyTransactions')).toEqual(
      reconcileBefore,
    )
  })

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
