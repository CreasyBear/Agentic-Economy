import { RateLimiter } from '@convex-dev/rate-limiter'
import { describe, expect, it, vi } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  projectProviderEarnings,
  pricingConfigDigest,
  type PricingConfig,
} from '@/modules/money/public'
import { accountFromRow } from '../../../convex/moneyCanonicalAccounts'
import {
  domainMoneyEntries,
  domainMoneyTransaction,
} from '../../../convex/moneyChargeJournal'
import {
  finalizeBrokeredInvocationCharge,
  markBrokeredInvocationChargeOutcomeUnknown,
  releaseBrokeredInvocationCharge,
  reserveBrokeredInvocationCharge,
} from '../../../convex/moneyLedger'

import {
  MemoryDb,
  accountVersionHandler,
  authorizeHandler,
  authorizationAuthorityMaterial,
  authorizationArgs,
  authorizationOperation,
  now,
  reconcileHandler,
  reconciliationArgs,
  transactionRef,
  type Row,
} from './money-ledger-test-harness'
import {
  materializeRuntimePublishedOperation,
  type PublishedOperation,
} from '@/modules/capability-supply/public'
import {
  seedAuthorizationFixture,
} from './money-ledger-test-fixtures'

type Handler = {
  _handler: (ctx: { db: MemoryDb }, args: Record<string, unknown>) => Promise<unknown>
}
const reserveBrokeredHandler =
  (reserveBrokeredInvocationCharge as unknown as Handler)._handler
const finalizeBrokeredHandler =
  (finalizeBrokeredInvocationCharge as unknown as Handler)._handler
const releaseBrokeredHandler =
  (releaseBrokeredInvocationCharge as unknown as Handler)._handler
const markBrokeredUnknownHandler =
  (markBrokeredInvocationChargeOutcomeUnknown as unknown as Handler)._handler

function brokeredFixture(db: MemoryDb): Readonly<{
  args: Record<string, unknown>
  total: { currency: string; units: string; exponent: number }
  provider: { currency: string; units: string; exponent: number }
  fee: { currency: string; units: string; exponent: number }
}> {
  seedAuthorizationFixture(db)
  const provider = { currency: 'USD', units: '100', exponent: 2 }
  const fee = { currency: 'USD', units: '10', exponent: 2 }
  const total = { currency: 'USD', units: '110', exponent: 2 }
  const config = {
    version: 'pricing:v2' as const,
    unit: 'call' as const,
    paidAmount: total,
    providerAmount: provider,
    platformFee: fee,
  }
  const priceDigest = pricingConfigDigest(config)
  const identity = {
    ...authorizationOperation.identity,
    price: { kind: 'fixed' as const, amount: total },
    priceDigest,
    pricingConfig: config,
  }
  const operation = {
    ...authorizationOperation,
    materialDigest: canonicalDigest(identity as never),
    identity,
    priceDigest,
    pricingConfig: config,
    offering: {
      ...authorizationOperation.offering,
      presentation: {
        ...authorizationOperation.offering.presentation,
        price: { kind: 'fixed' as const, amount: total },
      },
    },
  } as PublishedOperation
  const descriptor = materializeRuntimePublishedOperation(operation)
  const authorityMaterial = {
    ...authorizationAuthorityMaterial,
    targetDigest: canonicalDigest(operation.identity as never),
    consequence: descriptor.consequenceClass,
    limits: { amount: total },
  }
  const authority = {
    ...authorityMaterial,
    decisionDigest: canonicalDigest(authorityMaterial as never),
  }
  const invocation = db.rows('capabilityOperationInvocations').find(
    (row) => row._id === 'authorization:invocation',
  )
  const offering = db.rows('capabilityOfferings').find(
    (row) => row._id === 'offering:money',
  )
  const grant = db.rows('agentAccessGrants').find(
    (row) => row._id === 'grant:money',
  )
  const control = db.rows('actionInvocationControls').find(
    (row) => row._id === 'authorization:control',
  )
  if (invocation === undefined || offering === undefined || grant === undefined || control === undefined)
    throw new Error('brokered_fixture_missing')
  invocation.operationJson = JSON.stringify(operation)
  invocation.authority = authority
  const offeringPresentation = offering.presentation as Record<string, unknown>
  offeringPresentation.price = { kind: 'fixed', amount: total }
  const policy = grant.policy as Record<string, unknown>
  const budget = policy.budget as Record<string, unknown>
  budget.maximumSpendPerInvocation = total
  const authorityBinding = control.authorityBinding as Record<string, unknown>
  Object.assign(authorityBinding, {
    contractVersion: descriptor.version,
    digest: authority.decisionDigest,
    targetDigest: authority.targetDigest,
    consequence: authority.consequence,
    limits: authority.limits,
  })
  const controlValue = control.control as Record<string, unknown>
  controlValue.action = {
    id: authorizationOperation.operationId,
    contractVersion: descriptor.version,
  }
  controlValue.acceptedAuthority = authority.acceptedBasis
  controlValue.authority = {
    reference: authority.reference,
    expiresAt: authority.expiresAt,
  }
  control.preparedTargetDigest = authority.targetDigest
  return {
    total,
    provider,
    fee,
    args: {
      ...authorizationArgs(),
      amount: total,
      authorityMaximumSpend: total,
      priceDigest,
      priceSourceDigest: priceDigest,
      sourceDigest: operation.materialDigest,
    },
  }
}

function repriceAuthorizationFixture(
  db: MemoryDb,
  pricingConfig: PricingConfig,
): Record<string, unknown> {
  const invocation = db.rows('capabilityOperationInvocations').find(
    (row) => row._id === 'authorization:invocation',
  )
  const offering = db.rows('capabilityOfferings').find(
    (row) => row._id === 'offering:money',
  )
  const grant = db.rows('agentAccessGrants').find(
    (row) => row._id === 'grant:money',
  )
  const control = db.rows('actionInvocationControls').find(
    (row) => row._id === 'authorization:control',
  )
  if (invocation === undefined || offering === undefined || grant === undefined || control === undefined)
    throw new Error('reprice_fixture_missing')
  const currentOperation = JSON.parse(String(invocation.operationJson)) as PublishedOperation
  const amount = pricingConfig.paidAmount
  const priceDigest = pricingConfigDigest(pricingConfig)
  const identity = {
    ...currentOperation.identity,
    price: { kind: 'fixed' as const, amount },
    priceDigest,
    pricingConfig,
  }
  const operation = {
    ...currentOperation,
    materialDigest: canonicalDigest(identity as never),
    identity,
    priceDigest,
    pricingConfig,
    offering: {
      ...currentOperation.offering,
      presentation: {
        ...currentOperation.offering.presentation,
        price: { kind: 'fixed' as const, amount },
      },
    },
  } as PublishedOperation
  const descriptor = materializeRuntimePublishedOperation(operation)
  const previousAuthority = invocation.authority as Record<string, unknown>
  const { decisionDigest: _decisionDigest, ...authorityMaterial } = previousAuthority
  const authorityWithMaterial = {
    ...authorityMaterial,
    targetDigest: canonicalDigest(operation.identity as never),
    consequence: descriptor.consequenceClass,
    limits: { amount },
  }
  const authority = {
    ...authorityWithMaterial,
    decisionDigest: canonicalDigest(authorityWithMaterial as never),
  }
  const authorityRecord = authority as Record<string, unknown>
  invocation.operationJson = JSON.stringify(operation)
  invocation.authority = authority
  const offeringPresentation = offering.presentation as Record<string, unknown>
  offeringPresentation.price = { kind: 'fixed', amount }
  const policy = grant.policy as Record<string, unknown>
  const budget = policy.budget as Record<string, unknown>
  budget.maximumSpendPerInvocation = amount
  const authorityBinding = control.authorityBinding as Record<string, unknown>
  Object.assign(authorityBinding, {
    contractVersion: descriptor.version,
    digest: authority.decisionDigest,
    targetDigest: authority.targetDigest,
    consequence: authority.consequence,
    limits: authority.limits,
  })
  const controlValue = control.control as Record<string, unknown>
  controlValue.action = {
    id: operation.operationId,
    contractVersion: descriptor.version,
  }
  controlValue.acceptedAuthority = authorityRecord.acceptedBasis
  controlValue.authority = {
    reference: authorityRecord.reference,
    expiresAt: authorityRecord.expiresAt,
  }
  control.preparedTargetDigest = authority.targetDigest
  return {
    ...authorizationArgs(),
    amount,
    authorityMaximumSpend: amount,
    priceDigest,
    priceSourceDigest: priceDigest,
    sourceDigest: operation.materialDigest,
  }
}

describe('brokered buyer charge reservations', () => {
  it('holds the buyer total without creating ledger, provider, rake, or usage effects', async () => {
    const db = new MemoryDb()
    const fixture = brokeredFixture(db)
    const result = await reserveBrokeredHandler({ db }, fixture.args)

    expect(result).toMatchObject({
      kind: 'accepted',
      chargeState: 'paid',
      amount: fixture.total,
      providerNet: fixture.provider,
      rake: fixture.fee,
    })
    expect(db.rows('moneyLedgerEntries')).toHaveLength(0)
    expect(db.rows('moneyUsageEvents')).toHaveLength(0)
    expect(db.rows('moneyTransactions')).toEqual([
      expect.objectContaining({
        state: 'pending',
        budgetState: 'reserved',
        amountUnits: fixture.total.units,
      }),
    ])
    expect(db.rows('moneyAccounts')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        accountKind: 'operator_credit',
        balanceUnits: '1000',
        heldUnits: fixture.total.units,
        version: 2,
      }),
      expect.objectContaining({
        accountKind: 'provider_earnings',
        balanceUnits: '0',
      }),
      expect.objectContaining({ accountKind: 'ae_rake', balanceUnits: '0' }),
    ]))
  })

  it('subtracts all held totals before admitting another reservation', async () => {
    const db = new MemoryDb()
    const fixture = brokeredFixture(db)
    const operator = db.rows('moneyAccounts').find(
      (row) => row.accountKind === 'operator_credit',
    )
    if (operator === undefined) throw new Error('brokered_operator_missing')
    operator.heldUnits = '950'
    db.seed('moneyTransactions', {
      _id: 'held:prior',
      transactionRef: 'held:prior',
      kind: 'charge',
      idempotencyKey: 'held:prior',
      inputDigest: 'held:input',
      principalId: 'principal:test-money',
      accountId: 'owner:test-money',
      currency: 'USD',
      credentialId: 'credential:test-money',
      budgetState: 'reserved',
      amountUnits: '950',
      exponent: 2,
      state: 'pending',
      expectedAccountVersion: 1,
      createdAt: 999,
      updatedAt: 999,
    })

    await expect(reserveBrokeredHandler({ db }, fixture.args)).resolves.toMatchObject({
      kind: 'refused',
      code: 'insufficient_credit',
    })
    expect(db.rows('moneyTransactions')).toHaveLength(1)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(0)
  })

  it('finalizes the charge and externally settles the provider without duplication', async () => {
    const db = new MemoryDb()
    const fixture = brokeredFixture(db)
    await expect(reserveBrokeredHandler({ db }, fixture.args)).resolves.toMatchObject({
      kind: 'accepted',
    })
    const finalArgs = {
      ...fixture.args,
      externalRef: 'x402:settlement:one',
      reconciliationEvidenceRefs: ['x402:verified:one'],
    }
    await expect(finalizeBrokeredHandler({ db }, finalArgs)).resolves.toMatchObject({
      kind: 'accepted',
      providerNet: fixture.provider,
      rake: fixture.fee,
    })
    expect(db.rows('moneyLedgerEntries')).toHaveLength(4)
    expect(db.rows('moneyUsageEvents')).toHaveLength(1)
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyTransactions')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'charge',
        state: 'applied',
        budgetState: 'settled',
        externalRef: 'x402:settlement:one',
        amountUnits: fixture.total.units,
      }),
      expect.objectContaining({
        kind: 'payout_accrual',
        state: 'applied',
        principalId: 'business:business:money',
        externalRef: 'x402:settlement:one',
        amountUnits: fixture.provider.units,
      }),
    ]))
    const chargeTransaction = db.rows('moneyTransactions').find(
      (row) => row.kind === 'charge',
    )
    const payoutTransaction = db.rows('moneyTransactions').find(
      (row) => row.kind === 'payout_accrual',
    )
    if (chargeTransaction === undefined || payoutTransaction === undefined)
      throw new Error('brokered_transactions_missing')
    const providerAccountRef = accountRefForProvider('business:money', 'USD')
    const providerCredit = db.rows('moneyLedgerEntries').find(
      (row) =>
        row.transactionRef === chargeTransaction.transactionRef &&
        row.accountRef === providerAccountRef &&
        row.direction === 'credit',
    )
    const providerDebit = db.rows('moneyLedgerEntries').find(
      (row) =>
        row.transactionRef === payoutTransaction.transactionRef &&
        row.accountRef === providerAccountRef &&
        row.direction === 'debit',
    )
    expect(providerCredit).toMatchObject({
      entryType: 'payout_accrual',
      amountUnits: fixture.provider.units,
      transactionRef: chargeTransaction.transactionRef,
    })
    expect(providerDebit).toMatchObject({
      entryType: 'payout_accrual',
      amountUnits: fixture.provider.units,
      transactionRef: payoutTransaction.transactionRef,
    })
    expect(providerDebit?.transactionRef).not.toBe(providerCredit?.transactionRef)
    expect(db.rows('moneyAccounts')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        accountKind: 'operator_credit',
        balanceUnits: '890',
        heldUnits: '0',
      }),
      expect.objectContaining({
        accountKind: 'provider_earnings',
        balanceUnits: '0',
        recoveryDueUnits: '0',
        version: 3,
      }),
      expect.objectContaining({ accountKind: 'ae_rake', balanceUnits: '10' }),
    ]))
    const projection = projectProviderEarnings({
      businessId: 'business:money',
      currency: 'USD',
      accounts: db.rows('moneyAccounts').flatMap((row) => {
        const account = accountFromRow(row as never)
        return account === undefined ? [] : [account]
      }),
      entries: domainMoneyEntries(db.rows('moneyLedgerEntries') as never) ?? [],
      transactions: db.rows('moneyTransactions').map((row) =>
        domainMoneyTransaction(row as never),
      ),
      evidence: 'labelled_local_dev',
    })
    expect(projection).toMatchObject({
      kind: 'ok',
      providerNet: fixture.provider,
      paidOut: fixture.provider,
      held: { currency: 'USD', units: '0', exponent: 2 },
    })
    const afterFirstFinalize = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      usage: structuredClone(db.rows('moneyUsageEvents')),
    }
    await expect(finalizeBrokeredHandler({ db }, finalArgs)).resolves.toMatchObject({
      kind: 'accepted',
      providerNet: fixture.provider,
      rake: fixture.fee,
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      entries: db.rows('moneyLedgerEntries'),
      transactions: db.rows('moneyTransactions'),
      usage: db.rows('moneyUsageEvents'),
    }).toEqual(afterFirstFinalize)
  })

  const replayCorruptions: ReadonlyArray<{
    label: string
    mutate: (db: MemoryDb) => void
  }> = [
    {
      label: 'missing payout transaction',
      mutate: (db) => {
        db.remove('moneyTransactions', (row) => row.kind === 'payout_accrual')
      },
    },
    {
      label: 'tampered provider debit',
      mutate: (db) => {
        const debit = db.rows('moneyLedgerEntries').find(
          (row) => row.entryType === 'payout_accrual' && row.direction === 'debit',
        )
        if (debit === undefined) throw new Error('brokered_provider_debit_missing')
        debit.accountRef = 'provider:tampered'
      },
    },
    {
      label: 'duplicate payout transaction',
      mutate: (db) => {
        const payout = db.rows('moneyTransactions').find(
          (row) => row.kind === 'payout_accrual',
        )
        if (payout === undefined) throw new Error('brokered_payout_transaction_missing')
        db.seed('moneyTransactions', {
          ...payout,
          _id: 'moneyTransactions:duplicate-payout',
        })
      },
    },
    {
      label: 'duplicate provider debit',
      mutate: (db) => {
        const debit = db.rows('moneyLedgerEntries').find(
          (row) => row.entryType === 'payout_accrual' && row.direction === 'debit',
        )
        if (debit === undefined) throw new Error('brokered_provider_debit_missing')
        db.seed('moneyLedgerEntries', {
          ...debit,
          _id: 'moneyLedgerEntries:duplicate-payout',
        })
      },
    },
  ]

  for (const { label, mutate } of replayCorruptions) {
    it(`refuses a brokered replay with ${label} without writes`, async () => {
      const db = new MemoryDb()
      const fixture = brokeredFixture(db)
      await reserveBrokeredHandler({ db }, fixture.args)
      const finalArgs = {
        ...fixture.args,
        externalRef: 'x402:settlement:replay-integrity',
        reconciliationEvidenceRefs: ['x402:verified:replay-integrity'],
      }
      await expect(finalizeBrokeredHandler({ db }, finalArgs)).resolves.toMatchObject({
        kind: 'accepted',
      })
      mutate(db)
      const before = {
        accounts: structuredClone(db.rows('moneyAccounts')),
        entries: structuredClone(db.rows('moneyLedgerEntries')),
        transactions: structuredClone(db.rows('moneyTransactions')),
        usage: structuredClone(db.rows('moneyUsageEvents')),
      }
      await expect(finalizeBrokeredHandler({ db }, finalArgs)).resolves.toMatchObject({
        kind: 'refused',
        code: 'charge_reconciliation_required',
      })
      expect({
        accounts: db.rows('moneyAccounts'),
        entries: db.rows('moneyLedgerEntries'),
        transactions: db.rows('moneyTransactions'),
        usage: db.rows('moneyUsageEvents'),
      }).toEqual(before)
    })
  }

  it('refuses a conflicting external settlement reference', async () => {
    const db = new MemoryDb()
    const fixture = brokeredFixture(db)
    await reserveBrokeredHandler({ db }, fixture.args)
    await expect(finalizeBrokeredHandler({ db }, {
      ...fixture.args,
      externalRef: 'x402:settlement:one',
    })).resolves.toMatchObject({ kind: 'accepted' })
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      usage: structuredClone(db.rows('moneyUsageEvents')),
    }
    await expect(finalizeBrokeredHandler({ db }, {
      ...fixture.args,
      externalRef: 'x402:settlement:two',
    })).resolves.toMatchObject({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      entries: db.rows('moneyLedgerEntries'),
      transactions: db.rows('moneyTransactions'),
      usage: db.rows('moneyUsageEvents'),
    }).toEqual(before)
  })

  it('releases before submission with no monetary effect and reverses only once', async () => {
    const db = new MemoryDb()
    const fixture = brokeredFixture(db)
    await reserveBrokeredHandler({ db }, fixture.args)
    await expect(releaseBrokeredHandler({ db }, fixture.args)).resolves.toMatchObject({
      kind: 'released',
      transactionRef: fixture.args.transactionRef,
    })
    expect(db.rows('moneyLedgerEntries')).toHaveLength(0)
    expect(db.rows('moneyUsageEvents')).toHaveLength(0)
    expect(db.rows('moneyTransactions')).toEqual([
      expect.objectContaining({ state: 'reversed', budgetState: 'released' }),
    ])
    await expect(releaseBrokeredHandler({ db }, fixture.args)).resolves.toMatchObject({
      kind: 'released',
    })
    expect(db.rows('moneyLedgerEntries')).toHaveLength(0)
  })

  it('keeps unknown reservations until explicit reconciliation evidence arrives', async () => {
    const db = new MemoryDb()
    const fixture = brokeredFixture(db)
    await reserveBrokeredHandler({ db }, fixture.args)
    await expect(markBrokeredUnknownHandler({ db }, fixture.args)).resolves.toMatchObject({
      kind: 'outcome_unknown',
    })
    await expect(releaseBrokeredHandler({ db }, fixture.args)).resolves.toMatchObject({
      kind: 'refused',
      code: 'charge_reconciliation_required',
    })
    expect(db.rows('moneyTransactions')).toEqual([
      expect.objectContaining({ state: 'outcome_unknown', budgetState: 'unknown' }),
    ])
    expect(db.rows('moneyAccounts')).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountKind: 'operator_credit', heldUnits: fixture.total.units }),
    ]))
    await expect(finalizeBrokeredHandler({ db }, {
      ...fixture.args,
      externalRef: 'x402:settlement:unknown',
    })).resolves.toMatchObject({
      kind: 'refused',
      code: 'charge_reconciliation_required',
    })
    await expect(finalizeBrokeredHandler({ db }, {
      ...fixture.args,
      externalRef: 'x402:settlement:unknown',
      reconciliationEvidenceRefs: ['x402:verified:unknown'],
    })).resolves.toMatchObject({ kind: 'accepted' })
  })
})

describe('money authorization rate ownership', () => {
  it('does not consume the agent-access limiter while reserving a free budget admission', async () => {
    const db = new MemoryDb()
    seedAuthorizationFixture(db)
    const limit = vi
      .spyOn(RateLimiter.prototype, 'limit')
      .mockResolvedValue({ ok: true })
    try {
      await expect(
        authorizeHandler({ db }, authorizationArgs()),
      ).resolves.toMatchObject({ kind: 'accepted', chargeState: 'free_tier' })
      expect(limit).not.toHaveBeenCalled()
      expect(
        db
          .rows('moneyCredentialBudgetStates')
          .find((row) => row.windowKind === 'concurrency'),
      ).toMatchObject({ reservedCount: 1 })
    } finally {
      limit.mockRestore()
    }
  })
})

describe('money authorization free-tier charge linkage', () => {
  it('links the free-tier usage to its zero charge and replays idempotently', async () => {
    const db = new MemoryDb()
    seedAuthorizationFixture(db)

    await expect(
      authorizeHandler({ db }, authorizationArgs()),
    ).resolves.toMatchObject({
      kind: 'accepted',
      chargeState: 'free_tier',
      amount: { currency: 'USD', units: '0', exponent: 2 },
      transactionRef,
    })
    expect(db.rows('moneyTransactions')).toEqual([
      expect.objectContaining({
        transactionRef,
        amountUnits: '0',
        state: 'applied',
        budgetState: 'reserved',
      }),
    ])
    expect(db.rows('moneyUsageEvents')).toEqual([
      expect.objectContaining({
        transactionRef,
        chargeState: 'free_tier',
        amountUnits: '0',
      }),
    ])

    const afterFirstAuthorization = {
      transactions: structuredClone(db.rows('moneyTransactions')),
      usage: structuredClone(db.rows('moneyUsageEvents')),
      summaries: structuredClone(db.rows('moneyCredentialUsageSummaries')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
    }
    await expect(
      authorizeHandler({ db }, authorizationArgs()),
    ).resolves.toMatchObject({
      kind: 'accepted',
      chargeState: 'free_tier',
      transactionRef,
    })
    expect({
      transactions: db.rows('moneyTransactions'),
      usage: db.rows('moneyUsageEvents'),
      summaries: db.rows('moneyCredentialUsageSummaries'),
      budgets: db.rows('moneyCredentialBudgetStates'),
    }).toEqual(afterFirstAuthorization)

    await expect(
      reconcileHandler({ db }, reconciliationArgs('released')),
    ).resolves.toEqual({ kind: 'settled' })
    expect(db.rows('moneyTransactions')).toEqual([
      expect.objectContaining({
        transactionRef,
        amountUnits: '0',
        state: 'applied',
        budgetState: 'settled',
      }),
    ])
  })
})

describe('money authorization account version', () => {
  it('reads the operator version advanced by a prior top-up', async () => {
    const db = new MemoryDb()
    db.seed('moneyAccounts', {
      _id: 'account:operator-version',
      accountRef: accountRefForOwner('owner:version', 'USD'),
      accountKind: 'operator_credit',
      accountId: 'owner:version',
      currency: 'USD',
      exponent: 2,
      balanceUnits: '1000',
      version: 1,
      recoveryDueUnits: '0',
      state: 'active',
      createdAt: now,
      updatedAt: now,
    })

    await expect(
      accountVersionHandler(
        { db },
        { ownerId: 'owner:version', currency: 'USD' },
      ),
    ).resolves.toBe(1)
    await expect(
      accountVersionHandler(
        { db },
        { ownerId: 'owner:other', currency: 'USD' },
      ),
    ).resolves.toBeNull()
  })
  it('materializes canonical provider and rake accounts for a first authorization', async () => {
    const db = new MemoryDb()
    seedAuthorizationFixture(db)
    db.remove('moneyAccounts', (row) => row.accountKind !== 'operator_credit')

    await expect(
      authorizeHandler({ db }, authorizationArgs()),
    ).resolves.toMatchObject({ kind: 'accepted', chargeState: 'free_tier' })

    expect(db.rows('moneyAccounts')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountRef: accountRefForProvider('business:money', 'USD'),
          accountKind: 'provider_earnings',
          businessId: 'business:money',
          balanceUnits: '0',
        }),
        expect.objectContaining({
          accountRef: accountRefForRake('USD'),

          accountKind: 'ae_rake',
          balanceUnits: '0',
        }),
      ]),
    )
  })
  it('does not persist insufficient usage and accepts the identical charge after top-up', async () => {
    const db = new MemoryDb()
    const args = brokeredFixture(db).args
    const operator = db.rows('moneyAccounts').find(
      (row) => row._id === 'authorization:operator',
    )
    if (operator === undefined) throw new Error('operator_fixture_missing')
    operator.balanceUnits = '0'
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      usage: structuredClone(db.rows('moneyUsageEvents')),
      summaries: structuredClone(db.rows('moneyCredentialUsageSummaries')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
      transactions: structuredClone(db.rows('moneyTransactions')),
    }
    await expect(authorizeHandler({ db }, args)).resolves.toMatchObject({
      kind: 'refused',
      code: 'insufficient_credit',
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      usage: db.rows('moneyUsageEvents'),
      summaries: db.rows('moneyCredentialUsageSummaries'),
      entries: db.rows('moneyLedgerEntries'),
      transactions: db.rows('moneyTransactions'),
    }).toEqual(before)
    operator.balanceUnits = '10000'
    operator.version = 2
    const accepted = await authorizeHandler({
      db,
    }, {
      ...args,
      expectedAccountVersion: 2,
    })
    expect(accepted).toMatchObject({
      kind: 'accepted',
      chargeState: 'paid',
      providerNet: { currency: 'USD', units: '100', exponent: 2 },
      rake: { currency: 'USD', units: '10', exponent: 2 },
    })
    expect(db.rows('moneyUsageEvents')).toHaveLength(1)
    expect(db.rows('moneyUsageEvents')[0]).toMatchObject({ chargeState: 'paid' })
    expect(db.rows('moneyTransactions')).toHaveLength(1)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(3)
  })
})

describe('money authorization offering liveness', () => {
  it('refuses after the offering is unpublished between claim and charge without money writes', async () => {
    const db = new MemoryDb()
    const fixture = brokeredFixture(db)
    const offering = db.rows('capabilityOfferings').find(
      (row) => row._id === 'offering:money',
    )
    if (offering === undefined) throw new Error('offering_fixture_missing')
    offering.status = 'inactive'
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      usage: structuredClone(db.rows('moneyUsageEvents')),
      summaries: structuredClone(db.rows('moneyCredentialUsageSummaries')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
      transactions: structuredClone(db.rows('moneyTransactions')),
    }

    await expect(authorizeHandler({ db }, fixture.args)).resolves.toMatchObject({
      kind: 'refused',
      code: 'price_unavailable',
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      usage: db.rows('moneyUsageEvents'),
      summaries: db.rows('moneyCredentialUsageSummaries'),
      entries: db.rows('moneyLedgerEntries'),
      transactions: db.rows('moneyTransactions'),
    }).toEqual(before)
  })
})

describe('sealed charge journal', () => {
  async function authorizePaidCharge(db: MemoryDb): Promise<void> {
    const fixture = brokeredFixture(db)
    await expect(authorizeHandler({ db }, fixture.args)).resolves.toMatchObject({
      kind: 'accepted',
      chargeState: 'paid',
    })
  }

  it('stores a journalDigest after a paid charge', async () => {
    const db = new MemoryDb()
    await authorizePaidCharge(db)
    expect(db.rows('moneyTransactions')).toEqual([
      expect.objectContaining({
        digestFormat: 'charge-journal:v1',
        journalDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      }),
    ])
  })

  it.each([
    {
      name: 'a digest that does not match the loaded journal',
      mutate: (transaction: Row) => {
        transaction.journalDigest =
          'sha256:0000000000000000000000000000000000000000000000000000000000000000'
        transaction.digestFormat = 'charge-journal:v1'
      },
    },
    {
      name: 'an empty journalDigest',
      mutate: (transaction: Row) => {
        transaction.journalDigest = ''
        transaction.digestFormat = 'charge-journal:v1'
      },
    },
    {
      name: 'inputDigest reused as journalDigest',
      mutate: (transaction: Row) => {
        transaction.journalDigest = transaction.inputDigest
        transaction.digestFormat = 'charge-journal:v1'
      },
    },
    {
      name: 'usage observedAt that does not match transaction createdAt',
      mutate: (_transaction: Row, usage: Row) => {
        usage.observedAt = now + 1
      },
    },
  ])('refuses reconciliation for $name', async ({ mutate }) => {
    const db = new MemoryDb()
    await authorizePaidCharge(db)
    const transaction = db.rows('moneyTransactions').find(
      (row) => row.kind === 'charge',
    )
    const usage = db.rows('moneyUsageEvents')[0]
    if (transaction === undefined || usage === undefined)
      throw new Error('sealed_journal_fixture_missing')
    mutate(transaction, usage)
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
      transactions: structuredClone(db.rows('moneyTransactions')),
    }
    await expect(
      reconcileHandler({ db }, reconciliationArgs('not_released')),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    expect({
      accounts: db.rows('moneyAccounts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      entries: db.rows('moneyLedgerEntries'),
      transactions: db.rows('moneyTransactions'),
    }).toEqual(before)
  })
})

describe('durable nonzero charge pricing pair admission', () => {
  it('refuses a one-atomic pairless paid amount before any money writes', async () => {
    const db = new MemoryDb()
    brokeredFixture(db)
    const args = repriceAuthorizationFixture(db, {
      version: 'pricing:v2',
      unit: 'call',
      paidAmount: { currency: 'USD', units: '1', exponent: 2 },
    })
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      usage: structuredClone(db.rows('moneyUsageEvents')),
      summaries: structuredClone(db.rows('moneyCredentialUsageSummaries')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
      transactions: structuredClone(db.rows('moneyTransactions')),
    }

    await expect(authorizeHandler({ db }, args)).resolves.toMatchObject({
      kind: 'refused',
      code: 'rake_not_configured',
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      usage: db.rows('moneyUsageEvents'),
      summaries: db.rows('moneyCredentialUsageSummaries'),
      entries: db.rows('moneyLedgerEntries'),
      transactions: db.rows('moneyTransactions'),
    }).toEqual(before)
  })

  it('accepts the exact non-divisible provider and ceil fee pair', async () => {
    const db = new MemoryDb()
    brokeredFixture(db)
    const args = repriceAuthorizationFixture(db, {
      version: 'pricing:v2',
      unit: 'call',
      paidAmount: { currency: 'USD', units: '2', exponent: 2 },
      providerAmount: { currency: 'USD', units: '1', exponent: 2 },
      platformFee: { currency: 'USD', units: '1', exponent: 2 },
    })

    await expect(authorizeHandler({ db }, args)).resolves.toMatchObject({
      kind: 'accepted',
      chargeState: 'paid',
      providerNet: { currency: 'USD', units: '1', exponent: 2 },
      rake: { currency: 'USD', units: '1', exponent: 2 },
    })
  })
})
