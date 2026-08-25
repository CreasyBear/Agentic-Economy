import { describe, expect, it, vi } from 'vitest'

import { qualifiedUseMaterialDigest } from '@/modules/money/public'
import { requireCanonicalPayoutAuthority } from '../../../convex/moneyQualifiedUsePayout'

import {
  MemoryDb,
  attemptRef,
  credentialId,
  freeTierQualifiedUseArgs,
  invocationRef,
  now,
  principalId,
  qualifiedUseArgs,
  qualifiedUseHandler,
  reconcileHandler,
  reconciliationArgs,
  sourceDigest,
  transactionRef,
} from './money-ledger-test-harness'
import {
  canonicalQualifiedUseAccountRef,
  canonicalQualifiedUseGrantRef,
  rebindSeededCharge,
  seedBudget,
  seedCanonicalFreeTierCharge,
  seedCanonicalQualifiedUseAuthority,
  seedDailyAllocationComposition,
  seedPaidCharge,
  settleSeededChargeBudget,
} from './money-ledger-test-fixtures'

describe('exact invocation money reconciliation', () => {
  it('allocates matching production Qualified Use into one daily payout', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)

    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({
      kind: 'recorded',
    })
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(1)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(1)
    expect(db.rows('moneyPayouts')).toHaveLength(1)
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      cadence: 'daily',
      businessId: 'business:money',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
      periodStart: '1970-01-01T00:00:00.000Z',
      periodEnd: '1970-01-02T00:00:00.000Z',
      state: 'held_threshold',
      minimumPayoutUnits: '0',
      owningAccountRef: canonicalQualifiedUseAccountRef,
      authorityPrincipalRef: principalId,
      authorityGrantRef: canonicalQualifiedUseGrantRef,
      authorityGrantGeneration: 1,
      authorityResourceRefs: ['operation:money'],
    })
    expect(db.rows('moneyPayoutAllocations')[0]).toMatchObject({
      qualifiedUseRef: `qualified-use:v1:${invocationRef}:${attemptRef}:1`,
      transactionRef,
      usageRef: `${invocationRef}:usage`,
      businessId: 'business:money',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
      qualifiedAt: now,
      sourceDigest,
      materialDigest: qualifiedUseMaterialDigest({
        invocationRef,
        attemptRef,
        effectGeneration: 1,
        businessId: 'business:money',
        operationRef: 'operation:money',
        publicationRef: 'publication:money',
        publicationRevision: 1,
        contractDigest: 'sha256:contract-qualified',
        bindingDigest: 'sha256:binding-qualified',
        principalClass: 'agent_key',
        requestDigest: 'sha256:request-qualified',
        responseDigest: 'sha256:response-qualified',
        evidenceRefs: ['evidence:qualified'],
      }),
      owningAccountRef: canonicalQualifiedUseAccountRef,
      authorityPrincipalRef: principalId,
      authorityGrantRef: canonicalQualifiedUseGrantRef,
      authorityGrantGeneration: 1,
      authorityResourceRef: 'operation:money',
    })
    expect(db.rows('qualifiedUseReceipts')[0]).toMatchObject({
      owningAccountRef: canonicalQualifiedUseAccountRef,
      authorityPrincipalRef: principalId,
      authorityGrantRef: canonicalQualifiedUseGrantRef,
      authorityGrantGeneration: 1,
      authorityResourceRef: 'operation:money',
    })
    expect(db.rows('authorityDelegationSnapshots')).toHaveLength(0)
    expect(db.rows('authorityDelegationSnapshotAncestors')).toHaveLength(0)
    expect(db.rows('authorityDelegationGrants')[0]).toMatchObject({
      budgetUsed: 1,
      revision: 1,
    })
  })

  it('replays exactly and pools a second event by UTC day', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const firstArgs = qualifiedUseArgs()

    await expect(
      qualifiedUseHandler({ db }, firstArgs),
    ).resolves.toMatchObject({ kind: 'recorded' })
    await expect(
      qualifiedUseHandler({ db }, firstArgs),
    ).resolves.toMatchObject({ kind: 'replayed' })
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(1)
    expect(db.rows('moneyPayouts')).toHaveLength(1)
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
    })

    const secondInvocationRef = 'operation-invocation:test-money:second'
    const secondAttemptRef = `${secondInvocationRef}:attempt:1`
    const secondTransactionRef = `operation-money:${secondInvocationRef}:${secondAttemptRef}:1`
    const secondQualifiedAt = now + 1
    rebindSeededCharge(
      db,
      secondInvocationRef,
      secondAttemptRef,
      secondTransactionRef,
      secondQualifiedAt,
    )
    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({
          invocationRef: secondInvocationRef,
          attemptRef: secondAttemptRef,
          transactionRef: secondTransactionRef,
          usageRef: `${secondInvocationRef}:usage`,
          qualifiedAt: secondQualifiedAt,
          responseDigest: 'sha256:response-qualified-second',
        }),
      ),
    ).resolves.toMatchObject({ kind: 'recorded' })
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(2)
    expect(db.rows('moneyPayouts')).toHaveLength(1)
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '200',
      rakeUnits: '2',
      providerNetUnits: '198',
    })

    const thirdInvocationRef = 'operation-invocation:test-money:third'
    const thirdAttemptRef = `${thirdInvocationRef}:attempt:1`
    const thirdTransactionRef = `operation-money:${thirdInvocationRef}:${thirdAttemptRef}:1`
    const thirdQualifiedAt = Date.UTC(1970, 0, 2)
    rebindSeededCharge(
      db,
      thirdInvocationRef,
      thirdAttemptRef,
      thirdTransactionRef,
      thirdQualifiedAt,
    )
    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({
          invocationRef: thirdInvocationRef,
          attemptRef: thirdAttemptRef,
          transactionRef: thirdTransactionRef,
          usageRef: `${thirdInvocationRef}:usage`,
          qualifiedAt: thirdQualifiedAt,
          responseDigest: 'sha256:response-qualified-third',
        }),
      ),
    ).resolves.toMatchObject({ kind: 'recorded' })
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(3)
    expect(db.rows('moneyPayouts')).toHaveLength(2)
    expect(
      new Set(db.rows('moneyPayouts').map((row) => row.payoutRef)).size,
    ).toBe(2)
    expect(
      db.rows('moneyPayouts').find(
        (row) => row.periodStart === '1970-01-02T00:00:00.000Z',
      ),
    ).toMatchObject({
      periodEnd: '1970-01-03T00:00:00.000Z',
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
    })
  })
  it.each([
    { name: 'transfer_pending', payoutState: 'transfer_pending' },
    { name: 'outcome_unknown', payoutState: 'outcome_unknown' },
    { name: 'paid', payoutState: 'paid' },
    { name: 'reversed', payoutState: 'reversed' },
  ])('replays an exact allocation after $name', async ({ payoutState }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const payout = db.rows('moneyPayouts')[0]
    if (payout === undefined) throw new Error('allocation_fixture_missing')
    payout.state = payoutState
    const before = {
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    const insert = vi.spyOn(db, 'insert')
    const patch = vi.spyOn(db, 'patch')
    try {
      await expect(
        qualifiedUseHandler({ db }, qualifiedUseArgs()),
      ).resolves.toMatchObject({ kind: 'replayed' })
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
      expect({
        allocations: db.rows('moneyPayoutAllocations'),
        payouts: db.rows('moneyPayouts'),
      }).toEqual(before)
    } finally {
      insert.mockRestore()
      patch.mockRestore()
    }
  })
  it('replays an exact allocation after a canonical refund without re-accrual', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    const before = {
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    const insert = vi.spyOn(db, 'insert')
    const patch = vi.spyOn(db, 'patch')
    try {
      await expect(
        qualifiedUseHandler({ db }, qualifiedUseArgs()),
      ).resolves.toMatchObject({ kind: 'replayed' })
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
      expect({
        allocations: db.rows('moneyPayoutAllocations'),
        payouts: db.rows('moneyPayouts'),
      }).toEqual(before)
    } finally {
      insert.mockRestore()
      patch.mockRestore()
    }
  })

  it('rejects a substituted eligibility principal before any allocation write', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({ principalId: 'principal:substitute' }),
      ),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(0)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(0)
  })

  it.each([
    {
      name: 'revoked grant',
      mutate: (db: MemoryDb) => {
        const grant = db.rows('authorityDelegationGrants')[0]
        if (grant === undefined) throw new Error('authority_fixture_missing')
        grant.lifecycle = 'revoked'
      },
    },
    {
      name: 'stale generation',
      mutate: (db: MemoryDb) => {
        const grant = db.rows('authorityDelegationGrants')[0]
        if (grant === undefined) throw new Error('authority_fixture_missing')
        grant.generation = 2
      },
    },
    {
      name: 'expired grant',
      mutate: (db: MemoryDb) => {
        const grant = db.rows('authorityDelegationGrants')[0]
        if (grant === undefined) throw new Error('authority_fixture_missing')
        grant.expiresAt = 0
      },
    },
    {
      name: 'inactive Account',
      mutate: (db: MemoryDb) => {
        const account = db.rows('accounts')[0]
        if (account === undefined) throw new Error('authority_fixture_missing')
        account.lifecycle = 'suspended'
      },
    },
    {
      name: 'uncovered invocation operation',
      mutate: (db: MemoryDb) => {
        const invocation = db.rows('capabilityOperationInvocations')[0]
        if (invocation === undefined) throw new Error('authority_fixture_missing')
        invocation.operationRef = 'operation:not-covered'
      },
    },
  ])('holds Qualified Use on $name authority', async ({ mutate }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    mutate(db)

    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).rejects.toThrow('qualified_use_authority_invalid')
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(0)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(0)
  })

  it.each([
    {
      name: 'revoked ancestor',
      parent: {
        generation: 2,
        revision: 2,
        lifecycle: 'revoked',
        revokedAt: now + 1,
      },
      childParentGeneration: 2,
    },
    {
      name: 'stale parent generation',
      parent: { generation: 1, revision: 1, lifecycle: 'active' },
      childParentGeneration: 2,
    },
    {
      name: 'malformed widened ancestry',
      parent: {
        generation: 1,
        revision: 1,
        lifecycle: 'active',
        scopes: ['market.operations.read'],
      },
      childParentGeneration: 1,
    },
  ])('holds Qualified Use on $name', async ({ parent, childParentGeneration }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const leaf = db.rows('authorityDelegationGrants')[0]
    if (leaf === undefined) throw new Error('authority_fixture_missing')
    const parentGrantRef = 'grt_55555555555555555555555555555555'
    const parentRow = {
      _id: `authority-grant:${parentGrantRef}`,
      grantRef: parentGrantRef,
      accountRef: canonicalQualifiedUseAccountRef,
      actorPrincipalRef: principalId,
      subjectPrincipalRef: principalId,
      scopes: ['market.operations.invoke'],
      resourceRefs: ['operation:money'],
      budgetLimit: 2_000,
      budgetUsed: 1,
      expiresAt: Number.MAX_SAFE_INTEGER,
      createdAt: 0,
      createdBy: {
        actorPrincipalRef: principalId,
        activeAccountRef: canonicalQualifiedUseAccountRef,
        correlationRef: `correlation:${parentGrantRef}`,
        idempotencyRef: `create:${parentGrantRef}`,
      },
      ...parent,
    }
    if (parent.lifecycle === 'revoked') {
      Object.assign(parentRow, {
        revokedBy: {
          actorPrincipalRef: principalId,
          activeAccountRef: canonicalQualifiedUseAccountRef,
          correlationRef: `revoke:${parentGrantRef}`,
          idempotencyRef: `revoke:${parentGrantRef}`,
        },
      })
    }
    db.seed('authorityDelegationGrants', parentRow)
    leaf.parentGrantRef = parentGrantRef
    leaf.parentGeneration = childParentGeneration

    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).rejects.toThrow('qualified_use_authority_invalid')
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(0)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(0)
  })

  it('holds Qualified Use on a cyclic grant ancestry', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const leaf = db.rows('authorityDelegationGrants')[0]
    if (leaf === undefined) throw new Error('authority_fixture_missing')
    leaf.parentGrantRef = leaf.grantRef
    leaf.parentGeneration = leaf.generation

    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).rejects.toThrow('qualified_use_authority_invalid')
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(0)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(0)
  })

  it('rejects a payout whose existing immutable Account provenance conflicts', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await qualifiedUseHandler({ db }, qualifiedUseArgs())
    const nextInvocationRef = 'operation-invocation:test-money:mixed-account'
    const nextAttemptRef = `${nextInvocationRef}:attempt:1`
    const nextTransactionRef = `operation-money:${nextInvocationRef}:${nextAttemptRef}:1`
    rebindSeededCharge(db, nextInvocationRef, nextAttemptRef, nextTransactionRef, now + 1)
    const otherAccountRef = 'acc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const otherGrantRef = 'grt_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    seedCanonicalQualifiedUseAuthority(db, nextInvocationRef, {
      accountRef: otherAccountRef,
      grantRef: otherGrantRef,
    })
    const nextInvocation = db.rows('capabilityOperationInvocations').find(
      (row) => row.invocationRef === nextInvocationRef,
    )
    if (nextInvocation === undefined) throw new Error('authority_fixture_missing')
    nextInvocation.grantRef = otherGrantRef
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs({
        invocationRef: nextInvocationRef,
        attemptRef: nextAttemptRef,
        transactionRef: nextTransactionRef,
        usageRef: `${nextInvocationRef}:usage`,
        qualifiedAt: now + 1,
        responseDigest: 'sha256:mixed-account',
      })),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(1)
  })

  it('derives Account from the invocation grant despite caller-shaped legacy IDs', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const invocation = db.rows('capabilityOperationInvocations')[0]
    if (invocation === undefined) throw new Error('authority_fixture_missing')
    invocation.ownerId = 'acc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    invocation.credentialId = 'acc_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    expect(db.rows('qualifiedUseReceipts')[0]?.owningAccountRef).toBe(
      canonicalQualifiedUseAccountRef,
    )
  })

  it('holds legacy or revoked payout provenance at the settlement seam', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await qualifiedUseHandler({ db }, qualifiedUseArgs())
    const payout = db.rows('moneyPayouts')[0]
    const allocation = db.rows('moneyPayoutAllocations')[0]
    if (payout === undefined || allocation === undefined)
      throw new Error('payout_fixture_missing')

    await expect(
      requireCanonicalPayoutAuthority({ db } as never, payout as never),
    ).resolves.toEqual({
      owningAccountRef: canonicalQualifiedUseAccountRef,
      authorityPrincipalRef: principalId,
      authorityGrantRef: canonicalQualifiedUseGrantRef,
      authorityGrantGeneration: 1,
      authorityResourceRefs: ['operation:money'],
    })
    delete allocation.owningAccountRef
    await expect(
      requireCanonicalPayoutAuthority({ db } as never, payout as never),
    ).rejects.toThrow('qualified_use_authority_invalid')
    allocation.owningAccountRef = canonicalQualifiedUseAccountRef
    delete payout.authorityGrantRef
    await expect(
      requireCanonicalPayoutAuthority({ db } as never, payout as never),
    ).rejects.toThrow('qualified_use_authority_invalid')
    payout.authorityGrantRef = canonicalQualifiedUseGrantRef
    const grant = db.rows('authorityDelegationGrants')[0]
    if (grant === undefined) throw new Error('authority_fixture_missing')
    grant.lifecycle = 'revoked'
    await expect(
      requireCanonicalPayoutAuthority({ db } as never, payout as never),
    ).rejects.toThrow('qualified_use_authority_invalid')
  })

  it('rejects replay when persisted authority provenance is changed', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const args = qualifiedUseArgs()
    await qualifiedUseHandler({ db }, args)
    const receipt = db.rows('qualifiedUseReceipts')[0]
    if (receipt === undefined) throw new Error('receipt_fixture_missing')
    receipt.authorityGrantGeneration = 99

    await expect(qualifiedUseHandler({ db }, args)).rejects.toThrow(
      'qualified_use_payout_allocation_invalid',
    )
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(1)
  })

  it('rejects a sandbox source behind a production Qualified Use receipt atomically', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const transaction = db.rows('moneyTransactions').find(
      (row) => row._id === 'transaction:charge',
    )
    if (transaction === undefined) throw new Error('charge_fixture_missing')
    transaction.budgetEnvironment = 'sandbox'
    for (const row of db.rows('moneyCredentialBudgetStates'))
      row.environment = 'sandbox'
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(0)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(0)
  })

  it('rejects replay when the recorded payout is missing or drifted', async () => {
    const missing = new MemoryDb()
    seedBudget(missing)
    seedPaidCharge(missing)
    settleSeededChargeBudget(missing, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db: missing }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    missing.remove('moneyPayouts', () => true)
    await expect(
      qualifiedUseHandler({ db: missing }, qualifiedUseArgs()),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect(missing.rows('moneyPayoutAllocations')).toHaveLength(1)

    const drifted = new MemoryDb()
    seedBudget(drifted)
    seedPaidCharge(drifted)
    settleSeededChargeBudget(drifted, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db: drifted }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const payout = drifted.rows('moneyPayouts')[0]
    if (payout === undefined) throw new Error('payout_fixture_missing')
    payout.periodEnd = '1970-01-03T00:00:00.000Z'
    await expect(
      qualifiedUseHandler({ db: drifted }, qualifiedUseArgs()),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
  })

  it.each([
    {
      name: 'noncanonical source reversal',
      mutate: (db: MemoryDb) => {
        const transaction = db.rows('moneyTransactions').find(
          (row) => row._id === 'transaction:charge',
        )
        if (transaction === undefined) throw new Error('charge_fixture_missing')
        transaction.state = 'reversed'
      },
    },
    {
      name: 'journal source digest drift',
      mutate: (db: MemoryDb) => {
        const provider = db.rows('moneyLedgerEntries').find(
          (row) => row._id === 'entry:provider',
        )
        if (provider === undefined) throw new Error('provider_entry_missing')
        provider.sourceDigest = 'sha256:replay-drift'
      },
    },
  ])('rejects replay after $name', async ({ mutate }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const before = {
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    mutate(db)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect({
      allocations: db.rows('moneyPayoutAllocations'),
      payouts: db.rows('moneyPayouts'),
    }).toEqual(before)
  })

  it('records the 1000th daily allocation with bounded source reads', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    seedDailyAllocationComposition(db, 999)
    const query = vi.spyOn(db, 'query')
    try {
      await expect(
        qualifiedUseHandler({ db }, qualifiedUseArgs()),
      ).resolves.toMatchObject({ kind: 'recorded' })
      expect(db.rows('moneyPayoutAllocations')).toHaveLength(1_000)
      expect(
        query.mock.calls.filter(([table]) => table === 'moneyPayoutAllocations'),
      ).toHaveLength(4)
    } finally {
      query.mockRestore()
    }
  })

  it('refuses the 1001st daily allocation before any write', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    seedDailyAllocationComposition(db)
    const before = {
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    const insert = vi.spyOn(db, 'insert')
    const patch = vi.spyOn(db, 'patch')
    try {
      await expect(
        qualifiedUseHandler({ db }, qualifiedUseArgs()),
      ).rejects.toThrow('qualified_use_payout_allocation_invalid')
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
      expect(db.rows('moneyPayoutAllocations')).toHaveLength(1_000)
      expect({
        allocations: db.rows('moneyPayoutAllocations'),
        payouts: db.rows('moneyPayouts'),
      }).toEqual(before)
    } finally {
      insert.mockRestore()
      patch.mockRestore()
    }
  })

  it('replays reversed canonical free-tier use without payout rows', async () => {
    const db = new MemoryDb()
    const fixture = seedCanonicalFreeTierCharge(db)
    const args = freeTierQualifiedUseArgs(fixture)
    await expect(
      qualifiedUseHandler({ db }, args),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const transaction = db.rows('moneyTransactions').find(
      (row) => row._id === 'transaction:free-tier',
    )
    if (transaction === undefined) throw new Error('free_tier_transaction_missing')
    transaction.state = 'reversed'
    await expect(
      qualifiedUseHandler({ db }, args),
    ).resolves.toMatchObject({ kind: 'replayed' })
    await expect(
      qualifiedUseHandler(
        { db },
        freeTierQualifiedUseArgs(fixture, {
          responseDigest: 'sha256:free-tier-changed',
        }),
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'qualified_use_identity_conflict',
    })
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(1)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(0)
  })

  it('refuses paid replay when its allocation is missing', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const args = qualifiedUseArgs()
    await expect(
      qualifiedUseHandler({ db }, args),
    ).resolves.toMatchObject({ kind: 'recorded' })
    db.remove('moneyPayoutAllocations', () => true)
    await expect(
      qualifiedUseHandler({ db }, args),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(1)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(1)
  })

  it('refuses malformed free-tier linkage atomically', async () => {
    const db = new MemoryDb()
    const fixture = seedCanonicalFreeTierCharge(db)
    const usage = db.rows('moneyUsageEvents').find(
      (row) => row._id === 'usage:free-tier',
    )
    if (usage === undefined) throw new Error('free_tier_usage_missing')
    usage.amountUnits = '1'
    const insert = vi.spyOn(db, 'insert')
    try {
      await expect(
        qualifiedUseHandler({ db }, freeTierQualifiedUseArgs(fixture)),
      ).rejects.toThrow('qualified_use_payout_allocation_invalid')
      expect(insert).not.toHaveBeenCalled()
      expect(db.rows('qualifiedUseReceipts')).toHaveLength(0)
      expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
      expect(db.rows('moneyPayouts')).toHaveLength(0)
    } finally {
      insert.mockRestore()
    }
  })

  it('keeps provider-direct Qualified Use evidence without allocating payout', async () => {
    const db = new MemoryDb()
    seedCanonicalQualifiedUseAuthority(db)

    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({ transactionRef: undefined }),
      ),
    ).resolves.toMatchObject({ kind: 'recorded' })
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(1)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(0)
  })

  it.each([
    {
      name: 'business',
      mutate: (_db: MemoryDb) => undefined,
      args: { businessId: 'business:other' },
    },
    {
      name: 'currency',
      mutate: (db: MemoryDb) => {
        const provider = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:provider')
        if (provider === undefined) throw new Error('provider_entry_missing')
        provider.currency = 'EUR'
      },
      args: {},
    },
    {
      name: 'amount',
      mutate: (db: MemoryDb) => {
        const usage = db.rows('moneyUsageEvents').find((row) => row._id === 'usage:money')
        if (usage === undefined) throw new Error('usage_fixture_missing')
        usage.amountUnits = '101'
      },
      args: {},
    },
    {
      name: 'journal provenance',
      mutate: (db: MemoryDb) => {
        const provider = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:provider')
        if (provider === undefined) throw new Error('provider_entry_missing')
        provider.sourceDigest = 'sha256:other-source'
      },
      args: {},
    },
    {
      name: 'reversed source',
      mutate: (db: MemoryDb) => {
        const transaction = db.rows('moneyTransactions').find((row) => row._id === 'transaction:charge')
        if (transaction === undefined) throw new Error('transaction_fixture_missing')
        transaction.state = 'reversed'
      },
      args: {},
    },
    {
      name: 'refunded source',
      mutate: (db: MemoryDb) => {
        const usage = db.rows('moneyUsageEvents').find((row) => row._id === 'usage:money')
        if (usage === undefined) throw new Error('usage_fixture_missing')
        usage.chargeState = 'refunded'
      },
      args: {},
    },
  ])('fails closed on $name journal identity drift', async ({ mutate, args }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    mutate(db)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs(args)),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(0)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(0)
  })
})
