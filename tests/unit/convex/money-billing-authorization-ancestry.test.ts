import { describe, expect, it, vi } from 'vitest'

import { persistedInvocationAuthorityIsCurrent } from '../../../convex/moneyBillingAuthorization'
import {
  MemoryDb,
  credentialId,
  invocationRef,
  ownerId,
  principalId,
  type Row,
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

  it.each([
    ['missing row', (db: MemoryDb) => db.remove('authorityDelegationGrants', () => true)],
    ['wrong account', (db: MemoryDb) => {
      delegationLeaf(db).accountRef = 'owner:wrong'
    }],
    ['expired row', (db: MemoryDb) => {
      delegationLeaf(db).expiresAt = 0
    }],
    ['overdrawn budget', (db: MemoryDb) => {
      delegationLeaf(db).budgetUsed = 1_001
    }],
    ['duplicate scopes', (db: MemoryDb) => {
      delegationLeaf(db).scopes = ['market_operations:invoke', 'market_operations:invoke']
    }],
    ['duplicate resources', (db: MemoryDb) => {
      delegationLeaf(db).resourceRefs = ['operation:money', 'operation:money']
    }],
  ] as const)('rejects a malformed ancestry %s', async (_, corrupt) => {
    const db = currentAuthorityWithGrantCount(1)
    corrupt(db)

    await expect(current(db)).resolves.toBe(false)
  })

  it.each([
    ['stale leaf generation', (leaf: Row) => { leaf.generation = 2 }],
    ['wrong leaf subject', (leaf: Row) => { leaf.subjectPrincipalRef = 'prn_wrong' }],
    ['missing invoke scope', (leaf: Row) => { leaf.scopes = ['market:read'] }],
    ['missing operation resource', (leaf: Row) => { leaf.resourceRefs = ['operation:other'] }],
  ] as const)('rejects %s before a monetary consequence', async (_, corrupt) => {
    const db = currentAuthorityWithGrantCount(1)
    corrupt(delegationLeaf(db))

    await expect(current(db)).resolves.toBe(false)
  })

  it('accepts ownership-rooted authority when active membership is absent', async () => {
    const db = currentAuthorityWithGrantCount(1)
    db.remove('memberships', () => true)
    db.seed('accountOwnerships', {
      _id: 'authority:ownership',
      ownershipRef: 'ownership:money-authority',
      accountRef: ownerId,
      ownerPrincipalRef: principalId,
      lifecycle: 'active',
    })

    await expect(current(db)).resolves.toBe(true)
  })

  it('denies an account that disappears between durable authority checks', async () => {
    const db = currentAuthorityWithGrantCount(1)
    const originalQuery = db.query.bind(db)
    let accountQueryCount = 0
    vi.spyOn(db, 'query').mockImplementation((table) => {
      const query = originalQuery(table)
      if (table === 'accounts' && ++accountQueryCount === 2) {
        vi.spyOn(query, 'unique').mockResolvedValue(null)
      }
      return query
    })

    await expect(current(db)).resolves.toBe(false)
  })

  it('denies a root issuer without active account membership or ownership', async () => {
    const db = currentAuthorityWithGrantCount(2)
    const root = delegationRoot(db)
    const rootPrincipalRef = 'prn_44444444444444444444444444444444'
    root.actorPrincipalRef = rootPrincipalRef
    db.seed('principals', {
      _id: 'authority:root-principal',
      principalRef: rootPrincipalRef,
      kind: 'human',
      lifecycle: 'active',
    })

    await expect(current(db)).resolves.toBe(false)
  })

  it.each([
    ['stale parent generation', (parent: Row, child: Row) => {
      child.parentGeneration = Number(parent.generation) + 1
    }],
    ['wrong delegate actor', (_parent: Row, child: Row) => {
      child.actorPrincipalRef = 'prn_wrong'
    }],
    ['non-narrowing expiry', (parent: Row, child: Row) => {
      child.expiresAt = parent.expiresAt
    }],
    ['widened budget', (parent: Row, child: Row) => {
      child.budgetLimit = Number(parent.budgetLimit) + 1
    }],
    ['widened scope', (parent: Row, child: Row) => {
      parent.scopes = ['market:read']
      child.scopes = ['market_operations:invoke']
    }],
    ['widened resource', (parent: Row, child: Row) => {
      parent.resourceRefs = ['operation:other']
      child.resourceRefs = ['operation:money']
    }],
  ] as const)('rejects a malformed delegation edge with %s', async (_, corrupt) => {
    const db = currentAuthorityWithGrantCount(2)
    corrupt(delegationRoot(db), delegationLeaf(db))

    await expect(current(db)).resolves.toBe(false)
  })

  it('accepts monotonically narrowed child authority from wildcard root scope and resource', async () => {
    const db = currentAuthorityWithGrantCount(2)
    const root = delegationRoot(db)
    root.scopes = ['*']
    root.resourceRefs = ['*']

    await expect(current(db)).resolves.toBe(true)
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

function delegationLeaf(db: MemoryDb): Row {
  const leaf = db.rows('authorityDelegationGrants')[0]
  if (leaf === undefined) throw new Error('delegation_leaf_missing')
  return leaf
}

function delegationRoot(db: MemoryDb): Row {
  const grants = db.rows('authorityDelegationGrants')
  const root = grants[grants.length - 1]
  if (root === undefined) throw new Error('delegation_root_missing')
  return root
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
