import { describe, expect, it, vi } from 'vitest'

import {
  FORMANCE_SCHEMA,
  FORMANCE_SCHEMA_VERSION,
  LEGACY_FORMANCE_SCHEMA_VERSION,
  readFormanceAccount,
  type FormanceContext,
} from '@/modules/money/formance'
import {
  adjustFormanceSpendingPeriod,
  formanceSpendingPeriodAccount,
  prepareFormanceManagedCallRelease,
  prepareFormanceManagedCallReservation,
  prepareFormanceManagedCallSettlement,
  prepareFormanceCapacitySync,
  syncFormanceCapacity,
  readFormanceSpendingPeriod,
  type FormanceManagedCallBooking,
} from '@/modules/money/formance-workflows'
import { currentUtcDayBounds, currentUtcMonthBounds } from '@/modules/common/freshness'

const DIGEST_A = `sha256:${'a'.repeat(64)}`
const DIGEST_B = `sha256:${'b'.repeat(64)}`

const periodAt = Date.UTC(2026, 1, 14, 0, 0, 0, 0)
const day = currentUtcDayBounds(periodAt)
const month = currentUtcMonthBounds(periodAt)

function managedCallBooking(
  spendingPeriods?: FormanceManagedCallBooking['spendingPeriods'],
): FormanceManagedCallBooking {
  return {
    callRef: 'call:one',
    quoteRef: 'quote:one',
    idempotencyKey: 'call-idempotency-one',
    accountRef: 'account:one',
    principalRef: 'principal:one',
    agentBudgetGeneration: 1,
    legalCustomerRef: 'legal-customer:one',
    legalCustomerGeneration: 1,
    treasuryRef: 'treasury:one',
    treasuryGeneration: 1,
    toolRef: 'tool:one',
    providerRef: 'provider:one',
    authorityGeneration: 1,
    policyGeneration: 1,
    buyerAmountUnits: '100',
    buyerRevenueUnits: '99',
    buyerTaxUnits: '1',
    providerAmountUnits: '50',
    quoteDigest: DIGEST_A,
    inputDigest: DIGEST_B,
    policyDigest: DIGEST_A,
    rateEvidenceDigest: DIGEST_B,
    treasuryEvidenceDigest: DIGEST_A,
    x402RequirementDigest: DIGEST_B,
    ...(spendingPeriods === undefined ? {} : { spendingPeriods }),
  }
}

function spendingPeriods(): NonNullable<FormanceManagedCallBooking['spendingPeriods']> {
  return {
    version: 'ae.spending-periods:v1',
    daily: { ...day, revision: 3, limitUnits: '1000' },
    monthly: { ...month, revision: 4, limitUnits: '5000' },
  }
}

function contextForAdjustment() {
  const transactions = new Map<string, {
    reference: string
    template: string
    metadata: Record<string, string>
  }>()
  const createTransaction = vi.fn(async (request: {
    v2PostTransaction: {
      reference: string
      template?: string
      metadata: Record<string, string>
      script: { template?: string }
    }
  }) => {
    const command = {
      reference: request.v2PostTransaction.reference,
      template: request.v2PostTransaction.script.template ?? '',
      metadata: request.v2PostTransaction.metadata,
    }
    transactions.set(command.reference, command)
    return {
      v2CreateTransactionResponse: {
        data: {
          reference: command.reference,
          template: command.template,
          metadata: command.metadata,
          postings: [],
        },
      },
    }
  })
  const ledger = {
    getSchema: vi.fn(async () => ({
      v2SchemaResponse: { data: { version: FORMANCE_SCHEMA_VERSION, ...FORMANCE_SCHEMA } },
    })),
    listTransactions: vi.fn(async ({ query }: { query: { $match: { reference: string } } }) => {
      const transaction = transactions.get(query.$match.reference)
      return {
        v2TransactionsCursorResponse: {
          cursor: {
            data: transaction === undefined ? [] : [{ id: 1n, ...transaction,
              postings: [] as Array<{ source: string; destination: string; asset: string; amount: bigint }>,
            }],
          },
        },
      }
    }),
    createTransaction,
  }
  const context = {
    configuration: {
      environment: 'sandbox',
      gatewayUrl: 'http://127.0.0.1:8080',
      ledger: 'test-ledger',
      requestTimeoutMs: 1_000,
    },
    sdk: { ledger: { v2: ledger } },
  } as unknown as FormanceContext
  return { context, ledger, createTransaction }
}

describe('native Formance spending-period workflows', () => {
  it('reuses treasury initialization across wallet changes without issuing capacity again', async () => {
    const input = {
      commandRef: 'capacity:treasury:one:1', idempotencyKey: 'capacity:treasury:one:1',
      kind: 'treasury_usdc' as const, subjectRef: 'treasury:one', generation: 1,
      targetUnits: '10000', policyDigest: DIGEST_A, externalEvidenceDigest: DIGEST_A,
    }
    const prepared = prepareFormanceCapacitySync(input)
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    if (prepared.command.variables.capacity === undefined) throw new Error('Missing capacity account')
    const posting = {
      source: 'world', destination: prepared.command.variables.capacity,
      asset: 'USDC/6', amount: 10000n,
    }
    const transaction = {
      id: 1n, reference: prepared.command.commandRef, template: prepared.command.template,
      metadata: prepared.command.metadata, postings: [posting],
    }
    const { context, ledger, createTransaction } = contextForAdjustment()
    ledger.listTransactions.mockImplementation(async () => ({
      v2TransactionsCursorResponse: { cursor: { data: [transaction] } },
    }))
    // Payment decreases, deposits increase and evidence-only refreshes all reuse
    // the original capacity; the caller reads the remaining native balance.
    for (const targetUnits of ['9000', '20000', '10000']) {
      await expect(syncFormanceCapacity(context, {
        ...input, targetUnits, externalEvidenceDigest: DIGEST_B,
      })).resolves.toMatchObject({ kind: 'completed', replayed: true })
    }
    await expect(syncFormanceCapacity(context, {
      ...input, policyDigest: DIGEST_B,
    })).resolves.toMatchObject({ kind: 'refused', code: 'formance_reference_conflict' })
    posting.destination = 'treasury:wrong:available'
    await expect(syncFormanceCapacity(context, input)).resolves.toMatchObject({
      kind: 'refused', code: 'formance_reference_conflict',
    })
    expect(createTransaction).not.toHaveBeenCalled()
  })

  it('keeps legacy command identities and adds both original periods to the same three reservations', () => {
    const legacy = prepareFormanceManagedCallReservation(managedCallBooking())
    expect(legacy.kind).toBe('prepared')
    if (legacy.kind !== 'prepared') throw new Error(legacy.code)
    expect(legacy.bulk.commands).toHaveLength(3)
    expect(legacy.bulk.commands[0]?.schemaVersion).toBe(LEGACY_FORMANCE_SCHEMA_VERSION)
    expect(legacy.bulk.commands[0]?.variables).not.toHaveProperty('daily_available')

    const periodAwareBooking = managedCallBooking(spendingPeriods())
    const reserved = prepareFormanceManagedCallReservation(periodAwareBooking)
    expect(reserved.kind).toBe('prepared')
    if (reserved.kind !== 'prepared') throw new Error(reserved.code)
    expect(reserved.bulk.commands).toHaveLength(3)
    expect(reserved.bulk.commands[0]?.schemaVersion).toBe(FORMANCE_SCHEMA_VERSION)
    expect(new Set(reserved.bulk.commands.map(({ commandRef }) => commandRef)).size).toBe(3)
    expect(reserved.bulk.commands[0]?.variables).toMatchObject({
      daily_available: formanceSpendingPeriodAccount('principal:one', 'day', day.periodStartAt).available,
      daily_reserved: formanceSpendingPeriodAccount('principal:one', 'day', day.periodStartAt).reserved,
      monthly_available: formanceSpendingPeriodAccount('principal:one', 'month', month.periodStartAt).available,
      monthly_reserved: formanceSpendingPeriodAccount('principal:one', 'month', month.periodStartAt).reserved,
      daily_amount: 'AUD/6 100',
      monthly_amount: 'AUD/6 100',
    })

    const released = prepareFormanceManagedCallRelease({
      booking: periodAwareBooking,
      externalEvidenceDigest: DIGEST_A,
      submissionProvenAbsent: true,
    })
    if (released.kind !== 'prepared') throw new Error(released.code)
    expect(released.bulk.commands[0]?.variables).toMatchObject({
      daily_reserved: formanceSpendingPeriodAccount('principal:one', 'day', day.periodStartAt).reserved,
      daily_available: formanceSpendingPeriodAccount('principal:one', 'day', day.periodStartAt).available,
      monthly_reserved: formanceSpendingPeriodAccount('principal:one', 'month', month.periodStartAt).reserved,
      monthly_available: formanceSpendingPeriodAccount('principal:one', 'month', month.periodStartAt).available,
    })

    const settled = prepareFormanceManagedCallSettlement({
      booking: periodAwareBooking,
      externalEvidenceDigest: DIGEST_A,
    })
    if (settled.kind !== 'prepared') throw new Error(settled.code)
    expect(settled.bulk.commands[0]?.variables).toMatchObject({
      daily_reserved: formanceSpendingPeriodAccount('principal:one', 'day', day.periodStartAt).reserved,
      daily_spent: formanceSpendingPeriodAccount('principal:one', 'day', day.periodStartAt).spent,
      monthly_reserved: formanceSpendingPeriodAccount('principal:one', 'month', month.periodStartAt).reserved,
      monthly_spent: formanceSpendingPeriodAccount('principal:one', 'month', month.periodStartAt).spent,
    })
  })

  it('refuses malformed periods before any native call', async () => {
    const valid = {
      principalRef: 'principal:one',
      periodKind: 'day' as const,
      periodStartAt: day.periodStartAt,
      periodEndAt: day.periodEndAt,
      revision: 1,
      previousLimitUnits: '0',
      targetLimitUnits: '100',
      authorityDigest: DIGEST_A,
    }
    const malformed = [
      { ...valid, periodStartAt: day.periodStartAt + 1 },
      { ...valid, periodEndAt: day.periodEndAt - 1 },
      { ...valid, periodKind: 'week' },
      { ...valid, principalRef: '' },
      { ...valid, revision: 0 },
      { ...valid, previousLimitUnits: '-1' },
      { ...valid, targetLimitUnits: '9007199254740992' },
      { ...valid, authorityDigest: 'not-a-digest' },
    ]
    const { context, createTransaction } = contextForAdjustment()
    for (const input of malformed) {
      await expect(adjustFormanceSpendingPeriod(context, input as never)).resolves.toEqual({
        kind: 'refused',
        code: 'formance_spending_period_adjustment_input_invalid',
        retryable: false,
      })
    }
    expect(createTransaction).not.toHaveBeenCalled()
  })

  it('replays an exact delta, conflicts on changed delta inputs, and preserves no-op zero semantics', async () => {
    const { context, createTransaction } = contextForAdjustment()
    const increase = {
      principalRef: 'principal:one',
      periodKind: 'day' as const,
      periodStartAt: day.periodStartAt,
      periodEndAt: day.periodEndAt,
      revision: 1,
      previousLimitUnits: '0',
      targetLimitUnits: '100',
      authorityDigest: DIGEST_A,
    }
    await expect(adjustFormanceSpendingPeriod(context, increase)).resolves.toMatchObject({
      kind: 'completed',
      replayed: false,
      transactionRefs: expect.arrayContaining([expect.stringContaining(':spending-period-adjustment')]),
    })
    await expect(adjustFormanceSpendingPeriod(context, increase)).resolves.toMatchObject({
      kind: 'completed',
      replayed: true,
    })

    await expect(adjustFormanceSpendingPeriod(context, {
      ...increase,
      targetLimitUnits: '90',
    })).resolves.toEqual({
      kind: 'refused',
      code: 'formance_reference_conflict',
      retryable: false,
    })

    const decrease = { ...increase, revision: 2, previousLimitUnits: '100', targetLimitUnits: '40' }
    await expect(adjustFormanceSpendingPeriod(context, decrease)).resolves.toMatchObject({
      kind: 'completed',
      replayed: false,
    })
    expect(createTransaction.mock.calls.map(([request]) => request.v2PostTransaction.script.template))
      .toEqual(['SPENDING_PERIOD_INCREASED', 'SPENDING_PERIOD_DECREASED'])

    const noOp = { ...decrease, revision: 3, previousLimitUnits: '40', targetLimitUnits: '40' }
    await expect(adjustFormanceSpendingPeriod(context, noOp)).resolves.toEqual({
      kind: 'completed',
      transactionRefs: [],
      replayed: false,
    })
    expect(createTransaction).toHaveBeenCalledTimes(2)
  })

  it('clamps a signed native capacity deficit without weakening buyer balance reads', async () => {
    const getAccount = vi.fn(async () => ({
      v2AccountResponse: {
        data: {
          address: 'spending_periods:abc:available',
          volumes: { 'AUD/6': { input: 0n, output: 50n, balance: -50n } },
        },
      },
    }))
    const context = {
      configuration: {
        environment: 'sandbox',
        gatewayUrl: 'http://127.0.0.1:8080',
        ledger: 'test-ledger',
        requestTimeoutMs: 1_000,
      },
      sdk: { ledger: { v2: { getAccount } } },
    } as unknown as FormanceContext

    await expect(readFormanceSpendingPeriod(context, {
      principalRef: 'principal:one',
      periodKind: 'day',
      periodStartAt: day.periodStartAt,
      periodEndAt: day.periodEndAt,
    })).resolves.toMatchObject({
      kind: 'available',
      units: '0',
      authoritativeForConsequences: false,
    })
    await expect(readFormanceAccount(context, 'spending_periods:abc:available')).resolves.toEqual({
      kind: 'setup_required',
      code: 'formance_unsafe_integer',
    })
  })
})
