import { describe, expect, it, vi } from 'vitest'

import { persistedInvocationAuthorityIsCurrent } from '../../../convex/moneyBillingAuthorization'
import {
  MemoryDb,
  credentialId,
  invocationRef,
  ownerId,
  principalId,
} from './money-ledger-test-harness'
import { seedCurrentMoneyInvocationAuthority } from './money-ledger-test-fixtures'

describe('money consequence delegation ancestry', () => {
  it.each([17, 32])(
    'accepts the same current invocation through %i generation-bound grants',
    async (grantCount) => {
      const db = currentAuthorityWithGrantCount(grantCount)

      await expect(current(db)).resolves.toBe(true)
      const before = structuredClone(snapshotTables(db))
      const insert = vi.spyOn(db, 'insert')
      const patch = vi.spyOn(db, 'patch')
      try {
        await expect(current(db)).resolves.toBe(true)
        expect(snapshotTables(db)).toEqual(before)
        expect(insert).not.toHaveBeenCalled()
        expect(patch).not.toHaveBeenCalled()
      } finally {
        insert.mockRestore()
        patch.mockRestore()
      }
    },
  )

  it('rejects 33 grants before a monetary consequence can be admitted', async () => {
    const db = currentAuthorityWithGrantCount(33)

    await expect(current(db)).resolves.toBe(false)
  })

  it('rejects a cycle before a monetary consequence can be admitted', async () => {
    const db = currentAuthorityWithGrantCount(1)
    const leaf = db.rows('authorityDelegationGrants')[0]
    if (leaf === undefined) throw new Error('delegation_leaf_missing')
    leaf.parentGrantRef = leaf.grantRef
    leaf.parentGeneration = leaf.generation

    await expect(current(db)).resolves.toBe(false)
  })
})

function current(db: MemoryDb): Promise<boolean> {
  return persistedInvocationAuthorityIsCurrent({ db } as never, {
    invocationRef,
    principalId,
    credentialId,
    grantRef: 'grant:money',
    grantGeneration: 1,
    operationRef: 'operation:money',
  })
}

function currentAuthorityWithGrantCount(grantCount: number): MemoryDb {
  if (!Number.isSafeInteger(grantCount) || grantCount < 1) {
    throw new Error('delegation_grant_count_invalid')
  }
  const db = new MemoryDb()
  seedCurrentMoneyInvocationAuthority(db)
  const leaf = db.rows('authorityDelegationGrants')[0]
  if (leaf === undefined) throw new Error('delegation_leaf_missing')
  let child = leaf
  for (let index = 1; index < grantCount; index += 1) {
    const grantRef = `grt_${index.toString(16).padStart(32, '0')}`
    const parent = {
      _id: `authority:delegation-grant:${index}`,
      grantRef,
      accountRef: ownerId,
      actorPrincipalRef: principalId,
      subjectPrincipalRef: principalId,
      scopes: ['market_operations:invoke'],
      resourceRefs: ['operation:money'],
      budgetLimit: 1_000,
      budgetUsed: 0,
      expiresAt: 8_000_000_000_000 + index,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: 0,
      createdBy: {
        actorPrincipalRef: principalId,
        activeAccountRef: ownerId,
        correlationRef: `ancestry:${index}`,
        idempotencyRef: `ancestry:${index}`,
      },
    }
    child.parentGrantRef = grantRef
    child.parentGeneration = 1
    db.seed('authorityDelegationGrants', parent)
    child = parent
  }
  return db
}

function snapshotTables(db: MemoryDb): Record<string, unknown> {
  return {
    authorityDelegationGrants: db.rows('authorityDelegationGrants'),
    moneyTransactions: db.rows('moneyTransactions'),
    moneyLedgerEntries: db.rows('moneyLedgerEntries'),
    moneyPayoutAllocations: db.rows('moneyPayoutAllocations'),
    moneyPayouts: db.rows('moneyPayouts'),
  }
}
