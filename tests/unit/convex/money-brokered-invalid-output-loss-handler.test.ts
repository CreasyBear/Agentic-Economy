import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  accountRefForProvider,
  accountRefForRake,
  pricingConfigDigest,
} from '@/modules/money/public'
import {
  materializeRuntimePublishedOperation,
  type PublishedOperation,
} from '@/modules/capability-supply/public'
import {
  recordBrokeredInvalidOutputLossHandler,
} from '../../../convex/moneyBrokeredInvalidOutputLoss'
import {
  markBrokeredInvocationChargeOutcomeUnknown,
  reserveBrokeredInvocationCharge,
} from '../../../convex/moneyLedger'
import {
  MemoryDb,
  authorizationArgs,
  authorizationAuthorityMaterial,
  authorizationOperation,
  type Row,
} from './money-ledger-test-harness'
import { seedAuthorizationFixture } from './money-ledger-test-fixtures'

type Handler = {
  _handler: (ctx: { db: MemoryDb }, args: Record<string, unknown>) => Promise<unknown>
}

type DirectHandler = (
  ctx: { db: MemoryDb },
  args: Record<string, unknown>,
) => Promise<unknown>

const reserveHandler =
  (reserveBrokeredInvocationCharge as unknown as Handler)._handler
const markUnknownHandler =
  (markBrokeredInvocationChargeOutcomeUnknown as unknown as Handler)._handler
const lossHandler =
  recordBrokeredInvalidOutputLossHandler as unknown as DirectHandler

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
  if (
    invocation === undefined
    || offering === undefined
    || grant === undefined
    || control === undefined
  )
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
      expectedAccountVersion: 1,
    },
  }
}

function lossArgs(fixture: Readonly<{ args: Record<string, unknown> }>): Record<string, unknown> {
  return {
    ...fixture.args,
    externalRef: 'settlement:invalid-output:1',
    invalidOutputEvidenceRef: 'evidence:invalid-output:1',
    invalidOutputEvidenceDigest: 'sha256:invalid-output:1',
    reconciliationEvidenceRefs: ['evidence:reconcile:1'],
  }
}

const snapshotTables = [
  'moneyAccounts',
  'moneyTransactions',
  'moneyLedgerEntries',
  'moneyUsageEvents',
  'moneyCredentialBudgetStates',
] as const

function snapshot(db: MemoryDb): Record<string, Row[]> {
  return Object.fromEntries(
    snapshotTables.map((table) => [table, structuredClone(db.rows(table))]),
  ) as Record<string, Row[]>
}

async function settledFixture(): Promise<{
  db: MemoryDb
  fixture: ReturnType<typeof brokeredFixture>
  args: Record<string, unknown>
}> {
  const db = new MemoryDb()
  const fixture = brokeredFixture(db)
  await reserveHandler({ db }, fixture.args)
  const args = lossArgs(fixture)
  await lossHandler({ db }, args)
  return { db, fixture, args }
}

describe('brokered invalid-output loss handler', () => {
  it('refuses non-finite timestamps before any database access or writes', async () => {
    const db = new MemoryDb()
    const fixture = brokeredFixture(db)
    const args = lossArgs(fixture)
    const before = snapshot(db)

    for (const observedAt of [Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(lossHandler({ db }, { ...args, observedAt })).resolves.toMatchObject({
        kind: 'refused',
        code: 'charge_reconciliation_required',
      })
      expect(snapshot(db)).toEqual(before)
    }
  })

  it('releases the buyer authorization and books provider amount only in the loss account', async () => {
    const db = new MemoryDb()
    const fixture = brokeredFixture(db)
    const beforeProvider = db.rows('moneyAccounts').find(
      (row) => row.accountRef === accountRefForProvider('business:money', 'USD'),
    )
    const beforeRake = db.rows('moneyAccounts').find(
      (row) => row.accountRef === accountRefForRake('USD'),
    )
    if (beforeProvider === undefined || beforeRake === undefined)
      throw new Error('brokered_accounts_missing')

    await expect(reserveHandler({ db }, fixture.args)).resolves.toMatchObject({
      kind: 'accepted',
    })
    const result = await lossHandler({ db }, lossArgs(fixture))

    expect(result).toMatchObject({
      kind: 'settled',
      chargeTransactionRef: fixture.args.transactionRef,
      lossTransactionRef:
        `operation-money-loss:${fixture.args.invocationRef}:${fixture.args.attemptRef}:1`,
    })
    expect(db.rows('moneyAccounts')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        accountKind: 'operator_credit',
        balanceUnits: '1000',
        heldUnits: '0',
      }),
      expect.objectContaining({
        accountKind: 'provider_earnings',
        balanceUnits: beforeProvider.balanceUnits,
      }),
      expect.objectContaining({
        accountKind: 'ae_rake',
        balanceUnits: beforeRake.balanceUnits,
      }),
      expect.objectContaining({
        accountRef: 'ae:external-loss:USD',
        accountKind: 'ae_external_loss',
        balanceUnits: fixture.provider.units,
        heldUnits: '0',
        recoveryDueUnits: '0',
      }),
    ]))
    expect(db.rows('moneyTransactions')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'charge',
        state: 'reversed',
        budgetState: 'released',
        externalRef: 'settlement:invalid-output:1',
      }),
      expect.objectContaining({
        kind: 'external_loss',
        amountUnits: fixture.provider.units,
        externalRef: 'settlement:invalid-output:1',
      }),
    ]))
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyLedgerEntries')).toEqual([
      expect.objectContaining({
        entryType: 'external_loss',
        direction: 'credit',
        amountUnits: fixture.provider.units,
        accountRef: 'ae:external-loss:USD',
      }),
    ])
    expect(db.rows('moneyUsageEvents')).toHaveLength(0)
    expect(db.rows('moneyCredentialBudgetStates')).toEqual(expect.arrayContaining([
      expect.objectContaining({ reservedUnits: '0', reservedCount: 0 }),
    ]))
  })

  it('replays exactly without writes and refuses changed settlement evidence without writes', async () => {
    const { db, args } = await settledFixture()
    const beforeReplay = snapshot(db)
    await expect(lossHandler({ db }, args)).resolves.toMatchObject({ kind: 'settled' })
    expect(snapshot(db)).toEqual(beforeReplay)

    const beforeExternalRefConflict = snapshot(db)
    await expect(lossHandler({
      db,
    }, { ...args, externalRef: 'settlement:invalid-output:changed' })).resolves.toMatchObject({
      kind: 'refused',
      code: 'charge_reconciliation_required',
    })
    expect(snapshot(db)).toEqual(beforeExternalRefConflict)

    const beforeEvidenceConflict = snapshot(db)
    await expect(lossHandler({
      db,
    }, {
      ...args,
      invalidOutputEvidenceDigest: 'sha256:invalid-output:changed',
    })).resolves.toMatchObject({
      kind: 'refused',
      code: 'charge_reconciliation_required',
    })
    expect(snapshot(db)).toEqual(beforeEvidenceConflict)
  })

  it('converges from an outcome-unknown buyer charge', async () => {
    const db = new MemoryDb()
    const fixture = brokeredFixture(db)
    await reserveHandler({ db }, fixture.args)
    await expect(markUnknownHandler({ db }, fixture.args)).resolves.toMatchObject({
      kind: 'outcome_unknown',
    })

    await expect(lossHandler({ db }, lossArgs(fixture))).resolves.toMatchObject({
      kind: 'settled',
    })
    expect(db.rows('moneyTransactions')).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: 'reversed', budgetState: 'released' }),
      expect.objectContaining({ kind: 'external_loss', amountUnits: fixture.provider.units }),
    ]))
    expect(db.rows('moneyAccounts')).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountKind: 'operator_credit', heldUnits: '0' }),
      expect.objectContaining({ accountKind: 'ae_external_loss', balanceUnits: fixture.provider.units }),
    ]))
  })

  it('refuses malformed and extra replay journal material without writes', async () => {
    const malformed = await settledFixture()
    const malformedTransaction = malformed.db.rows('moneyTransactions').find(
      (row) => row.kind === 'external_loss',
    )
    if (malformedTransaction === undefined) throw new Error('loss_transaction_missing')
    malformedTransaction.inputDigest = 'sha256:tampered'
    const malformedBefore = snapshot(malformed.db)
    await expect(lossHandler({ db: malformed.db }, malformed.args)).resolves.toMatchObject({
      kind: 'refused',
      code: 'charge_reconciliation_required',
    })
    expect(snapshot(malformed.db)).toEqual(malformedBefore)

    const extra = await settledFixture()
    const lossEntry = extra.db.rows('moneyLedgerEntries')[0]
    if (lossEntry === undefined) throw new Error('loss_entry_missing')
    extra.db.seed('moneyLedgerEntries', {
      ...lossEntry,
      _id: 'moneyLedgerEntries:extra',
      entryRef: `${String(lossEntry.entryRef)}:extra`,
    })
    const extraBefore = snapshot(extra.db)
    await expect(lossHandler({ db: extra.db }, extra.args)).resolves.toMatchObject({
      kind: 'refused',
      code: 'charge_reconciliation_required',
    })
    expect(snapshot(extra.db)).toEqual(extraBefore)
  })
})
