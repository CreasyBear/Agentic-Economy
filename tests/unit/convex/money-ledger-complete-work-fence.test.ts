import { describe, expect, it } from 'vitest'

import {
  MemoryDb,
  attemptRef,
  completionContext,
  completionHandler,
  invocationRef,
} from './money-ledger-test-harness'
import {
  seedBudget,
  seedInvocation,
  seedPaidCharge,
} from './money-ledger-test-fixtures'

const exhausted = { context: { invocationRef }, result: { kind: 'failed' } }

describe('exhausted Workpool completion money fence', () => {
  it('settles an accepted charge before projecting refusal', async () => {
    const db = new MemoryDb()
    seedInvocation(db)
    seedBudget(db)
    seedPaidCharge(db)

    await expect(
      completionHandler(completionContext(db), exhausted),
    ).resolves.toBeNull()
    expect(
      db
        .rows('capabilityOperationInvocations')
        .find((row) => row._id === 'invocation:money'),
    ).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'pre_release_failed' },
    })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'reversed' })
  })

  it('cleanly refuses exhausted work with no charge', async () => {
    const db = new MemoryDb()
    seedInvocation(db)

    await expect(
      completionHandler(completionContext(db), exhausted),
    ).resolves.toBeNull()
    expect(
      db
        .rows('capabilityOperationInvocations')
        .find((row) => row._id === 'invocation:money'),
    ).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'pre_release_failed' },
    })
  })

  it('never refunds when canonical control proves release possible', async () => {
    const db = new MemoryDb()
    seedInvocation(db)
    seedBudget(db)
    seedPaidCharge(db)
    db.seed('actionInvocationControls', {
      _id: 'control:money',
      invocationRef,
      currentAttemptRef: attemptRef,
      currentEffectGeneration: 1,
      control: { control: { state: 'leased', release: 'possibly_released' } },
    })

    await expect(
      completionHandler(completionContext(db), exhausted),
    ).resolves.toBeNull()
    expect(
      db
        .rows('capabilityOperationInvocations')
        .find((row) => row._id === 'invocation:money'),
    ).toMatchObject({ state: 'reconciliation_required' })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'applied' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
  })

  it('projects reconciliation_required when an accepted charge cannot be refunded', async () => {
    const db = new MemoryDb()
    seedInvocation(db)
    seedBudget(db)
    seedPaidCharge(db)
    db.remove('moneyAccounts', (row) => row._id === 'account:provider')

    await expect(
      completionHandler(completionContext(db), exhausted),
    ).resolves.toBeNull()
    expect(
      db
        .rows('capabilityOperationInvocations')
        .find((row) => row._id === 'invocation:money'),
    ).toMatchObject({ state: 'reconciliation_required' })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'applied' })
  })
})
