import { describe, expect, it, vi } from 'vitest'

import {
  PROMOTIONAL_FORMANCE_SCHEMA,
  PROMOTIONAL_FORMANCE_SCHEMA_VERSION,
  LEGACY_FORMANCE_SCHEMA_VERSION,
  PERIOD_FORMANCE_SCHEMA_VERSION,
  readFormanceAccount,
  validateFormanceMoneyCommand,
  type FormanceContext,
  type FormanceMoneyCommand,
} from '@/modules/money/formance'
import {
  adjustFormanceSpendingPeriod,
  formanceSpendingPeriodAccount,
  prepareFormancePromotionalCreditGrant,
  prepareFormancePromotionalCreditExpiry,
  prepareFormanceManagedCallRelease,
  prepareFormanceManagedCallReservation,
  prepareFormanceManagedCallSettlement,
  prepareFormancePaidCallRemedy,
  prepareFormanceCapacitySync,
  syncFormanceCapacity,
  readFormanceSpendingPeriod,
  readFormanceManagedCallSettlement,
  readFormanceManagedCallReservation,
  readFormanceManagedCallRelease,
  refundFormanceSettledSale,
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
      v2SchemaResponse: { data: { version: PROMOTIONAL_FORMANCE_SCHEMA_VERSION, ...PROMOTIONAL_FORMANCE_SCHEMA } },
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
    expect(reserved.bulk.commands[0]?.schemaVersion).toBe(PERIOD_FORMANCE_SCHEMA_VERSION)
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

type SettlementPosting = { source: string; destination: string; asset: string; amount: bigint }
type SettlementRow = {
  id: bigint; reference: string; template: string; metadata: Record<string, string>;
  postings: SettlementPosting[]; reverted?: boolean
}

function managedCallNativePostings(command: FormanceMoneyCommand): SettlementPosting[] {
  // These are the required financial legs, specified independently of the
  // production matcher. Canonical builders supply only the command envelope.
  let legs: readonly (readonly [string, string, string])[]
  switch (command.template) {
    case 'BUYER_SALE_SETTLED': legs = [
        ['call_reserved', 'revenue', 'revenue_amount'], ['call_reserved', 'tax', 'tax_amount'],
        ['legal_reserved', 'legal_settled', 'exposure_amount'],
        ...(command.variables.agent_reserved === undefined
          ? [['daily_reserved', 'daily_spent', 'daily_amount'], ['monthly_reserved', 'monthly_spent', 'monthly_amount']] as const
          : [['agent_reserved', 'agent_spent', 'budget_amount']] as const),
      ]; break
    case 'PROVIDER_SETTLED': legs = [
        ['treasury_committed', 'provider_settlement', 'amount'], ['obligation_accrued', 'obligation_settled', 'amount'],
      ]; break
    case 'CALL_RESERVED_AUD': legs = [
        ['account_available', 'call_reserved', 'buyer_amount'], ['legal_available', 'legal_reserved', 'exposure_amount'],
        ...(command.variables.agent_available === undefined
          ? [['daily_available', 'daily_reserved', 'daily_amount'], ['monthly_available', 'monthly_reserved', 'monthly_amount']] as const
          : [['agent_available', 'agent_reserved', 'budget_amount']] as const),
      ]; break
    case 'PROVIDER_OBLIGATION_ACCRUED': legs = [['expense', 'obligation', 'amount']]; break
    case 'CALL_RELEASED_AUD': legs = [
        ['call_reserved', 'account_available', 'buyer_amount'], ['legal_reserved', 'legal_available', 'exposure_amount'],
        ...(command.variables.agent_reserved === undefined
          ? [['daily_reserved', 'daily_available', 'daily_amount'], ['monthly_reserved', 'monthly_available', 'monthly_amount']] as const
          : [['agent_reserved', 'agent_available', 'budget_amount']] as const),
      ]; break
    case 'CALL_RELEASED_USDC': legs = [
        ['treasury_committed', 'treasury_available', 'amount'], ['obligation_accrued', 'expense', 'amount'],
      ]; break
    case 'CALL_RESERVED_USDC':
    case 'CALL_PROMO_RESERVED':
    case 'CALL_PROMO_RELEASED':
    case 'CALL_PROMO_SETTLED': legs = [['source', 'destination', 'amount']]; break
    default: throw new Error('Unexpected managed Call template')
  }
  return legs.flatMap(([sourceKey, destinationKey, amountKey]) => {
    const source = command.variables[sourceKey]
    const destination = command.variables[destinationKey]
    const monetary = command.variables[amountKey]?.match(/^(AUD|USDC)\/6 (0|[1-9]\d*)$/u)
    if (source === undefined || destination === undefined || monetary?.[1] === undefined || monetary[2] === undefined) {
      throw new Error('Missing expected settlement leg')
    }
    return monetary[2] === '0' ? [] : [{ source, destination, asset: `${monetary[1]}/6`, amount: BigInt(monetary[2]) }]
  })
}

function managedCallNativeFixture(booking = managedCallBooking(), stage: 'reservation' | 'settlement' | 'release' | 'paid_remedy' = 'settlement') {
  const externalEvidenceDigest = `sha256:${'c'.repeat(64)}`
  const prepared = stage === 'reservation' ? prepareFormanceManagedCallReservation(booking)
    : stage === 'release' ? prepareFormanceManagedCallRelease({ booking, externalEvidenceDigest, submissionProvenAbsent: true })
    : stage === 'paid_remedy' ? prepareFormancePaidCallRemedy({ booking, externalEvidenceDigest })
    : prepareFormanceManagedCallSettlement({ booking, externalEvidenceDigest })
  if (prepared.kind !== 'prepared') throw new Error(prepared.code)
  const rows = new Map<string, SettlementRow>(prepared.bulk.commands.map((command, index) => [command.commandRef, {
    id: BigInt(index + 1), reference: command.commandRef, template: command.template,
    metadata: { ...command.metadata }, postings: managedCallNativePostings(command),
  }]))
  const ledger = {
    listTransactions: vi.fn(async ({ query }: { query: { $match: { reference: string } } }) => {
      const row = rows.get(query.$match.reference)
      return { v2TransactionsCursorResponse: { cursor: { data: row === undefined ? [] : [row] } } }
    }),
    createBulk: vi.fn(), createTransaction: vi.fn(),
  }
  const context = {
    configuration: {
      environment: 'sandbox', gatewayUrl: 'http://127.0.0.1:8080', ledger: 'test-ledger', requestTimeoutMs: 1_000,
    }, sdk: { ledger: { v2: ledger } },
  } as unknown as FormanceContext
  const refs = prepared.bulk.commands.map(command => command.commandRef)
  const rowAt = (index: number) => {
    const row = rows.get(refs[index] ?? '')
    if (row === undefined) throw new Error('Missing fixture settlement')
    return row
  }
  const noWrites = () => {
    expect(ledger.createBulk).not.toHaveBeenCalled()
    expect(ledger.createTransaction).not.toHaveBeenCalled()
  }
  return { booking, context, rows, refs, rowAt, ledger, noWrites }
}

describe('read-only original managed Call settlement proof', () => {
  it.each(['legacy', 'period', 'promotional'] as const)('confirms complete %s accounting using native evidence, without writing', async kind => {
    const booking: FormanceManagedCallBooking = {
      ...managedCallBooking(kind === 'legacy' ? undefined : spendingPeriods()),
      ...(kind === 'promotional' ? { promotionalCreditAllocation: {
        version: 'ae.promotional-credit-allocation:v1' as const, purchasedUnits: '40',
        grants: [{ grantRef: 'promo:one', amountUnits: '60', expiresAt: periodAt + 1 }],
      } } : {}),
    }
    const fixture = managedCallNativeFixture(booking)
    // Posting order is not financial meaning. The original native digest is
    // deliberately different from the booking's requirement digest.
    fixture.rowAt(0).postings.reverse()
    const before = structuredClone([...fixture.rows])
    const results = await Promise.all(Array.from({ length: 3 }, async () =>
      await readFormanceManagedCallSettlement(fixture.context, booking)))
    for (const result of results) expect(result).toEqual({ kind: 'confirmed', transactionRefs: fixture.refs })
    expect(await readFormanceManagedCallSettlement(fixture.context, booking)).toEqual(results[0])
    expect([...fixture.rows]).toEqual(before)
    fixture.noWrites()
  })

  it.each([
    ['Call', { callRef: 'call:changed' }], ['Quote', { quoteRef: 'quote:changed' }],
    ['idempotency key', { idempotencyKey: 'changed-key' }], ['account', { accountRef: 'account:changed' }],
    ['amount', { buyerAmountUnits: '101', buyerRevenueUnits: '100' }],
    ['Provider amount', { providerAmountUnits: '51' }], ['generation', { treasuryGeneration: 2 }],
  ] satisfies readonly (readonly [string, Partial<FormanceManagedCallBooking>])[])(
    'refuses changed original %s instead of submitting a replacement', async (_label, patch) => {
      const fixture = managedCallNativeFixture()
      expect(await readFormanceManagedCallSettlement(fixture.context, { ...fixture.booking, ...patch })).toEqual({
        kind: 'refused', code: 'formance_settled_sale_evidence_invalid',
      })
      fixture.noWrites()
    },
  )

  it('refuses malformed booking before reading native state', async () => {
    const fixture = managedCallNativeFixture()
    expect(await readFormanceManagedCallSettlement(fixture.context, { ...fixture.booking, buyerTaxUnits: '-1' })).toEqual({
      kind: 'refused', code: 'formance_settled_sale_evidence_invalid',
    })
    expect(fixture.ledger.listTransactions).not.toHaveBeenCalled()
    fixture.noWrites()
  })

  it.each([0, 1])('refuses missing settlement member %i without treating absence as permission', async index => {
    const fixture = managedCallNativeFixture()
    fixture.rows.delete(fixture.refs[index] ?? '')
    const result = await readFormanceManagedCallSettlement(fixture.context, fixture.booking)
    expect(result).toEqual({ kind: 'refused', code: 'formance_settled_sale_evidence_invalid' })
    expect(result).not.toHaveProperty('submissionProvenAbsent')
    fixture.noWrites()
  })

  it('requires every original metadata value on every settlement member', async () => {
    const baseline = managedCallNativeFixture()
    for (const index of [0, 1]) for (const key of Object.keys(baseline.rowAt(index).metadata)) {
      const fixture = managedCallNativeFixture()
      fixture.rowAt(index).metadata[key] = key === 'external_evidence_digest' ? 'd'.repeat(64) : 'changed'
      expect(await readFormanceManagedCallSettlement(fixture.context, fixture.booking), `${index}:${key}`).toEqual({
        kind: 'refused', code: 'formance_settled_sale_evidence_invalid',
      })
      fixture.noWrites()
    }
  })

  it('refuses a missing promotional grant posting even when buyer and Provider settlements exist', async () => {
    const booking: FormanceManagedCallBooking = { ...managedCallBooking(spendingPeriods()), promotionalCreditAllocation: {
      version: 'ae.promotional-credit-allocation:v1', purchasedUnits: '40',
      grants: [{ grantRef: 'promo:one', amountUnits: '60', expiresAt: periodAt + 1 }],
    } }
    const fixture = managedCallNativeFixture(booking)
    fixture.rows.delete(fixture.refs[2] ?? '')
    expect(await readFormanceManagedCallSettlement(fixture.context, booking)).toEqual({
      kind: 'refused', code: 'formance_settled_sale_evidence_invalid',
    })
    fixture.noWrites()
  })

  it.each(['amount', 'source', 'destination', 'asset', 'missing', 'extra', 'template'] as const)(
    'refuses native %s conflict despite matching command metadata', async alteration => {
      const fixture = managedCallNativeFixture()
      const row = fixture.rowAt(1)
      const first = row.postings[0]
      if (first === undefined) throw new Error('Missing Provider posting')
      if (alteration === 'amount') first.amount += 1n
      if (alteration === 'source') first.source = 'accounts:wrong'
      if (alteration === 'destination') first.destination = 'accounts:wrong'
      if (alteration === 'asset') first.asset = 'AUD/6'
      if (alteration === 'missing') row.postings.pop()
      if (alteration === 'extra') row.postings.push({ ...first })
      if (alteration === 'template') row.template = 'CALL_RELEASED_USDC'
      expect(await readFormanceManagedCallSettlement(fixture.context, fixture.booking)).toEqual({
        kind: 'refused', code: 'formance_settled_sale_evidence_invalid',
      })
      fixture.noWrites()
    },
  )

  it.each(['reverted', 'unsafe', 'duplicate'] as const)('rejects %s native evidence through the maintained reader', async kind => {
    const fixture = managedCallNativeFixture()
    const row = fixture.rowAt(1)
    if (kind === 'reverted') row.reverted = true
    if (kind === 'unsafe') row.id = BigInt(Number.MAX_SAFE_INTEGER) + 1n
    if (kind === 'duplicate') fixture.ledger.listTransactions.mockImplementation(async ({ query }) => {
      const candidate = fixture.rows.get(query.$match.reference)
      return { v2TransactionsCursorResponse: { cursor: { data: candidate === undefined ? [] : [candidate, candidate] } } }
    })
    const codes = { reverted: 'formance_reference_reverted', unsafe: 'formance_unsafe_integer', duplicate: 'formance_reference_conflict' }
    expect(await readFormanceManagedCallSettlement(fixture.context, fixture.booking)).toEqual({ kind: 'refused', code: codes[kind] })
    fixture.noWrites()
  })

  it.each([0, 1])('keeps source failure at member %i unavailable, with no absence claim or write', async index => {
    const fixture = managedCallNativeFixture()
    fixture.ledger.listTransactions.mockImplementation(async ({ query }) => {
      if (query.$match.reference === fixture.refs[index]) throw new Error('Native boundary unavailable')
      const row = fixture.rows.get(query.$match.reference)
      return { v2TransactionsCursorResponse: { cursor: { data: row === undefined ? [] : [row] } } }
    })
    expect(await readFormanceManagedCallSettlement(fixture.context, fixture.booking)).toEqual({
      kind: 'unavailable', code: 'formance_read_unavailable',
    })
    // The existing write/refund surface retains its own pre-write failure
    // contract even though the shared read does not assert submission absence.
    expect(await refundFormanceSettledSale(fixture.context, {
      booking: fixture.booking, originalSettlementRefs: fixture.refs, reportDigest: DIGEST_A,
    })).toEqual({ kind: 'unavailable', code: 'formance_read_unavailable', submissionProvenAbsent: true })
    fixture.noWrites()
  })
})


function reservationBooking(kind: 'legacy' | 'period' | 'mixed' | 'all_promotional'): FormanceManagedCallBooking {
  return { ...managedCallBooking(kind === 'legacy' ? undefined : spendingPeriods()),
    ...(kind === 'mixed' || kind === 'all_promotional' ? { promotionalCreditAllocation: {
      version: 'ae.promotional-credit-allocation:v1' as const,
      purchasedUnits: kind === 'mixed' ? '40' : '0',
      grants: [{ grantRef: 'promo:one', amountUnits: kind === 'mixed' ? '60' : '100', expiresAt: periodAt + 1 }],
    } } : {}),
  }
}

function maximumReservationBooking(): FormanceManagedCallBooking {
  return { ...managedCallBooking(spendingPeriods()), promotionalCreditAllocation: {
    version: 'ae.promotional-credit-allocation:v1', purchasedUnits: '0',
    grants: Array.from({ length: 100 }, (_value, index) => ({
      grantRef: `promo:${index}`, amountUnits: '1', expiresAt: periodAt + 1,
    })),
  } }
}

describe('read-only original managed Call reservation proof', () => {
  it.each(['legacy', 'period', 'mixed', 'all_promotional'] as const)(
    'confirms exact original %s booking without money writes or capacity claims', async kind => {
      const fixture = managedCallNativeFixture(reservationBooking(kind), 'reservation')
      fixture.rowAt(0).postings.reverse()
      const before = structuredClone([...fixture.rows])
      const results = await Promise.all([0, 1].map(async () =>
        await readFormanceManagedCallReservation(fixture.context, fixture.booking)))
      for (const result of results) expect(result).toEqual({ kind: 'confirmed', transactionRefs: fixture.refs })
      expect(await readFormanceManagedCallReservation(fixture.context, fixture.booking)).toEqual(results[0])
      expect([...fixture.rows]).toEqual(before)
      fixture.noWrites()
    },
  )

  it('recognizes original reservation history after later settlement without reading current spendability', async () => {
    const booking = reservationBooking('mixed')
    const fixture = managedCallNativeFixture(booking, 'reservation')
    const settled = managedCallNativeFixture(booking)
    for (const [reference, row] of settled.rows) fixture.rows.set(reference, row)
    const before = structuredClone([...fixture.rows])
    expect(await readFormanceManagedCallReservation(fixture.context, booking)).toEqual({
      kind: 'confirmed', transactionRefs: fixture.refs,
    })
    expect(fixture.ledger.listTransactions.mock.calls.map(([args]) => args.query.$match.reference)).toEqual(fixture.refs)
    expect([...fixture.rows]).toEqual(before)
    fixture.noWrites()
  })

  it.each([
    ['Call', { callRef: 'call:other' }], ['Quote', { quoteRef: 'quote:other' }],
    ['idempotency', { idempotencyKey: 'other-key' }], ['buyer', { accountRef: 'account:other' }],
    ['amount', { buyerAmountUnits: '101', buyerRevenueUnits: '100' }],
    ['generation', { treasuryGeneration: 2 }], ['requirement digest', { x402RequirementDigest: DIGEST_A }],
  ] satisfies readonly (readonly [string, Partial<FormanceManagedCallBooking>])[])(
    'refuses changed original %s rather than matching native history to new material', async (_label, patch) => {
      const fixture = managedCallNativeFixture(managedCallBooking(), 'reservation')
      expect(await readFormanceManagedCallReservation(fixture.context, { ...fixture.booking, ...patch })).toEqual({
        kind: 'refused', code: 'formance_reservation_evidence_invalid',
      })
      fixture.noWrites()
    },
  )

  it('refuses invalid booking before native reads', async () => {
    const fixture = managedCallNativeFixture(managedCallBooking(), 'reservation')
    expect(await readFormanceManagedCallReservation(fixture.context, { ...fixture.booking, providerAmountUnits: '-1' })).toEqual({
      kind: 'refused', code: 'formance_reservation_evidence_invalid',
    })
    expect(fixture.ledger.listTransactions).not.toHaveBeenCalled()
    fixture.noWrites()
  })

  it.each([0, 1, 2, 3])('refuses missing native member %i without a partial confirmation or absence claim', async index => {
    const fixture = managedCallNativeFixture(reservationBooking('mixed'), 'reservation')
    fixture.rows.delete(fixture.refs[index] ?? '')
    const result = await readFormanceManagedCallReservation(fixture.context, fixture.booking)
    expect(result).toEqual({ kind: 'refused', code: 'formance_reservation_evidence_invalid' })
    expect(result).not.toHaveProperty('submissionProvenAbsent')
    fixture.noWrites()
  })

  it('checks every expected metadata value for buyer, treasury, obligation and promotional members', async () => {
    const baseline = managedCallNativeFixture(reservationBooking('mixed'), 'reservation')
    for (const index of [0, 1, 2, 3]) for (const key of Object.keys(baseline.rowAt(index).metadata)) {
      const fixture = managedCallNativeFixture(reservationBooking('mixed'), 'reservation')
      fixture.rowAt(index).metadata[key] = 'changed'
      expect(await readFormanceManagedCallReservation(fixture.context, fixture.booking), `${index}:${key}`).toEqual({
        kind: 'refused', code: 'formance_reservation_evidence_invalid',
      })
      fixture.noWrites()
    }
  })

  it.each(['amount', 'source', 'destination', 'asset', 'missing', 'extra', 'template'] as const)(
    'checks native %s for all four reservation templates despite exact metadata', async alteration => {
      for (const index of [0, 1, 2, 3]) {
        const fixture = managedCallNativeFixture(reservationBooking('mixed'), 'reservation')
        const row = fixture.rowAt(index)
        const first = row.postings[0]
        if (first === undefined) throw new Error('Missing reservation posting')
        if (alteration === 'amount') first.amount += 1n
        if (alteration === 'source') first.source = 'accounts:wrong'
        if (alteration === 'destination') first.destination = 'accounts:wrong'
        if (alteration === 'asset') first.asset = first.asset === 'AUD/6' ? 'USDC/6' : 'AUD/6'
        if (alteration === 'missing') row.postings.pop()
        if (alteration === 'extra') row.postings.push({ ...first })
        if (alteration === 'template') row.template = 'PROVIDER_SETTLED'
        expect(await readFormanceManagedCallReservation(fixture.context, fixture.booking)).toEqual({
          kind: 'refused', code: 'formance_reservation_evidence_invalid',
        })
        fixture.noWrites()
      }
    },
  )

  it.each(['reverted', 'unsafe', 'duplicate'] as const)('rejects %s original transaction through the native reader', async kind => {
    const fixture = managedCallNativeFixture(reservationBooking('mixed'), 'reservation')
    const row = fixture.rowAt(2)
    if (kind === 'reverted') row.reverted = true
    if (kind === 'unsafe') row.id = BigInt(Number.MAX_SAFE_INTEGER) + 1n
    if (kind === 'duplicate') fixture.ledger.listTransactions.mockImplementation(async ({ query }) => {
      const candidate = fixture.rows.get(query.$match.reference)
      return { v2TransactionsCursorResponse: { cursor: { data: candidate === undefined ? [] : [candidate, candidate] } } }
    })
    const codes = { reverted: 'formance_reference_reverted', unsafe: 'formance_unsafe_integer', duplicate: 'formance_reference_conflict' }
    expect(await readFormanceManagedCallReservation(fixture.context, fixture.booking)).toEqual({ kind: 'refused', code: codes[kind] })
    fixture.noWrites()
  })

  it('preserves source failure as unavailable without proving original submission absent', async () => {
    const fixture = managedCallNativeFixture(managedCallBooking(), 'reservation')
    fixture.ledger.listTransactions.mockRejectedValue(new Error('Native boundary unavailable'))
    expect(await readFormanceManagedCallReservation(fixture.context, fixture.booking)).toEqual({
      kind: 'unavailable', code: 'formance_read_unavailable',
    })
    fixture.noWrites()
  })

  it('supports all 100 grants in ordered batches with no more than eight native reads in flight', async () => {
    const fixture = managedCallNativeFixture(maximumReservationBooking(), 'reservation')
    let active = 0
    let maximumActive = 0
    fixture.ledger.listTransactions.mockImplementation(async ({ query }) => {
      active++
      maximumActive = Math.max(maximumActive, active)
      await Promise.resolve()
      active--
      const row = fixture.rows.get(query.$match.reference)
      return { v2TransactionsCursorResponse: { cursor: { data: row === undefined ? [] : [row] } } }
    })
    expect(fixture.refs).toHaveLength(103)
    expect(await readFormanceManagedCallReservation(fixture.context, fixture.booking)).toEqual({
      kind: 'confirmed', transactionRefs: fixture.refs,
    })
    expect(maximumActive).toBe(8)
    expect(active).toBe(0)
    expect(fixture.ledger.listTransactions.mock.calls.map(([args]) => args.query.$match.reference)).toEqual(fixture.refs)
    fixture.noWrites()
  })

  it.each([7, 8])('finishes the failed batch at member %i and never reads subsequent batches', async index => {
    const fixture = managedCallNativeFixture(maximumReservationBooking(), 'reservation')
    fixture.rows.delete(fixture.refs[index] ?? '')
    expect(await readFormanceManagedCallReservation(fixture.context, fixture.booking)).toEqual({
      kind: 'refused', code: 'formance_reservation_evidence_invalid',
    })
    expect(fixture.ledger.listTransactions).toHaveBeenCalledTimes(index === 7 ? 8 : 16)
    fixture.noWrites()
  })
})

describe('read-only original unpaid managed Call release proof', () => {
  it.each(['legacy', 'period', 'mixed', 'all_promotional'] as const)(
    'confirms complete %s release with original native digest, repeated/concurrent reads and no writes', async kind => {
      const fixture = managedCallNativeFixture(reservationBooking(kind), 'release')
      fixture.rowAt(0).postings.reverse()
      const before = structuredClone([...fixture.rows])
      expect(fixture.rowAt(0).metadata.external_evidence_digest).not.toBe(fixture.booking.x402RequirementDigest.slice(7))
      const results = await Promise.all([0, 1].map(async () =>
        await readFormanceManagedCallRelease(fixture.context, fixture.booking)))
      for (const result of results) expect(result).toEqual({ kind: 'confirmed', transactionRefs: fixture.refs })
      expect(await readFormanceManagedCallRelease(fixture.context, fixture.booking)).toEqual(results[0])
      expect([...fixture.rows]).toEqual(before)
      fixture.noWrites()
    },
  )

  it('refuses paid-result remedy although its buyer and promotional releases are identical', async () => {
    const booking = reservationBooking('mixed')
    const unpaid = managedCallNativeFixture(booking, 'release')
    const paid = managedCallNativeFixture(booking, 'paid_remedy')
    expect(paid.rowAt(0)).toEqual(unpaid.rowAt(0))
    expect(paid.rowAt(2)).toEqual(unpaid.rowAt(2))
    expect(paid.rowAt(1).template).toBe('PROVIDER_SETTLED')
    expect(await readFormanceManagedCallRelease(paid.context, booking)).toEqual({
      kind: 'refused', code: 'formance_release_evidence_invalid',
    })
    paid.noWrites()
  })

  it('confirms accounting history after later grant expiry without claiming current capacity or original authority', async () => {
    const fixture = managedCallNativeFixture(reservationBooking('mixed'), 'release')
    fixture.rows.set('later-expiry', { id: 90n, reference: 'later-expiry', template: 'PROMO_EXPIRED', metadata: {},
      postings: [{ source: fixture.rowAt(2).postings[0]!.destination, destination: 'world', asset: 'AUD/6', amount: 60n }] })
    const before = structuredClone([...fixture.rows])
    const result = await readFormanceManagedCallRelease(fixture.context, fixture.booking)
    expect(result).toEqual({ kind: 'confirmed', transactionRefs: fixture.refs })
    expect(result).not.toHaveProperty('submissionProvenAbsent')
    expect(result).not.toHaveProperty('authorizationProvenExpiredUnused')
    expect(fixture.ledger.listTransactions.mock.calls.map(([args]) => args.query.$match.reference)).toEqual(fixture.refs)
    expect([...fixture.rows]).toEqual(before)
    fixture.noWrites()
  })

  it.each([
    ['Call', { callRef: 'call:other' }], ['Quote', { quoteRef: 'quote:other' }],
    ['idempotency', { idempotencyKey: 'other-key' }], ['buyer', { accountRef: 'account:other' }],
    ['amount', { buyerAmountUnits: '101', buyerRevenueUnits: '100' }],
    ['Provider amount', { providerAmountUnits: '51' }], ['generation', { treasuryGeneration: 2 }],
    ['requirement digest', { x402RequirementDigest: DIGEST_A }],
  ] satisfies readonly (readonly [string, Partial<FormanceManagedCallBooking>])[])(
    'refuses changed original %s without a replacement release', async (_label, patch) => {
      const fixture = managedCallNativeFixture(managedCallBooking(), 'release')
      expect(await readFormanceManagedCallRelease(fixture.context, { ...fixture.booking, ...patch })).toEqual({
        kind: 'refused', code: 'formance_release_evidence_invalid',
      })
      fixture.noWrites()
    },
  )

  it('refuses invalid booking before any native read', async () => {
    const fixture = managedCallNativeFixture(managedCallBooking(), 'release')
    expect(await readFormanceManagedCallRelease(fixture.context, { ...fixture.booking, providerAmountUnits: '-1' })).toEqual({
      kind: 'refused', code: 'formance_release_evidence_invalid',
    })
    expect(fixture.ledger.listTransactions).not.toHaveBeenCalled()
    fixture.noWrites()
  })

  it.each([0, 1, 2])('refuses missing release member %i with no absence inference', async index => {
    const fixture = managedCallNativeFixture(reservationBooking('mixed'), 'release')
    fixture.rows.delete(fixture.refs[index] ?? '')
    const result = await readFormanceManagedCallRelease(fixture.context, fixture.booking)
    expect(result).toEqual({ kind: 'refused', code: 'formance_release_evidence_invalid' })
    expect(result).not.toHaveProperty('submissionProvenAbsent')
    fixture.noWrites()
  })

  it('checks every expected metadata value on every release member', async () => {
    const baseline = managedCallNativeFixture(reservationBooking('mixed'), 'release')
    for (const index of [0, 1, 2]) for (const key of Object.keys(baseline.rowAt(index).metadata)) {
      const fixture = managedCallNativeFixture(reservationBooking('mixed'), 'release')
      fixture.rowAt(index).metadata[key] = key === 'external_evidence_digest' ? 'd'.repeat(64) : 'changed'
      expect(await readFormanceManagedCallRelease(fixture.context, fixture.booking), `${index}:${key}`).toEqual({
        kind: 'refused', code: 'formance_release_evidence_invalid',
      })
      fixture.noWrites()
    }
  })

  it.each(['', 'not-a-digest', 'a'.repeat(63)])('refuses malformed native external digest %s before reading other members', async digest => {
    const fixture = managedCallNativeFixture(reservationBooking('mixed'), 'release')
    fixture.rowAt(0).metadata.external_evidence_digest = digest
    expect(await readFormanceManagedCallRelease(fixture.context, fixture.booking)).toEqual({
      kind: 'refused', code: 'formance_release_evidence_invalid',
    })
    expect(fixture.ledger.listTransactions).toHaveBeenCalledTimes(1)
    fixture.noWrites()
  })

  it.each(['amount', 'source', 'destination', 'asset', 'missing', 'extra', 'template'] as const)(
    'refuses %s conflicts for every release posting despite exact command metadata', async alteration => {
      for (const kind of ['legacy', 'mixed'] as const) {
        const baseline = managedCallNativeFixture(reservationBooking(kind), 'release')
        for (const [member, reference] of baseline.refs.entries()) {
          for (const postingIndex of baseline.rows.get(reference)!.postings.keys()) {
            const fixture = managedCallNativeFixture(reservationBooking(kind), 'release')
            const row = fixture.rowAt(member)
            const posting = row.postings[postingIndex]!
            if (alteration === 'amount') posting.amount += 1n
            if (alteration === 'source') posting.source = 'accounts:wrong'
            if (alteration === 'destination') posting.destination = 'accounts:wrong'
            if (alteration === 'asset') posting.asset = posting.asset === 'AUD/6' ? 'USDC/6' : 'AUD/6'
            if (alteration === 'missing') row.postings.splice(postingIndex, 1)
            if (alteration === 'extra') row.postings.push({ ...posting })
            if (alteration === 'template') row.template = 'PROVIDER_SETTLED'
            expect(await readFormanceManagedCallRelease(fixture.context, fixture.booking), `${kind}:${member}:${postingIndex}`).toEqual({
              kind: 'refused', code: 'formance_release_evidence_invalid',
            })
            fixture.noWrites()
          }
        }
      }
    },
  )

  it.each(['reverted', 'unsafe', 'duplicate', 'reference'] as const)(
    'rejects %s native rows through the maintained reference reader', async kind => {
      const fixture = managedCallNativeFixture(reservationBooking('mixed'), 'release')
      if (kind === 'reverted') fixture.rowAt(1).reverted = true
      if (kind === 'unsafe') fixture.rowAt(1).postings[0]!.amount = BigInt(Number.MAX_SAFE_INTEGER) + 1n
      if (kind === 'reference') fixture.rowAt(1).reference = 'ae-p4:wrong'
      if (kind === 'duplicate') fixture.ledger.listTransactions.mockImplementation(async ({ query }) => {
        const row = fixture.rows.get(query.$match.reference)
        return { v2TransactionsCursorResponse: { cursor: { data: row === undefined ? [] : [row, row] } } }
      })
      const codes = { reverted: 'formance_reference_reverted', unsafe: 'formance_unsafe_integer',
        duplicate: 'formance_reference_conflict', reference: 'formance_reference_conflict' }
      expect(await readFormanceManagedCallRelease(fixture.context, fixture.booking)).toEqual({ kind: 'refused', code: codes[kind] })
      fixture.noWrites()
    },
  )

  it.each([0, 1, 2])('keeps unavailable native member %i unavailable without writes or absence claims', async index => {
    const fixture = managedCallNativeFixture(reservationBooking('mixed'), 'release')
    fixture.ledger.listTransactions.mockImplementation(async ({ query }) => {
      if (query.$match.reference === fixture.refs[index]) throw new Error('Native boundary unavailable')
      const row = fixture.rows.get(query.$match.reference)
      return { v2TransactionsCursorResponse: { cursor: { data: row === undefined ? [] : [row] } } }
    })
    const result = await readFormanceManagedCallRelease(fixture.context, fixture.booking)
    expect(result).toEqual({ kind: 'unavailable', code: 'formance_read_unavailable' })
    expect(result).not.toHaveProperty('submissionProvenAbsent')
    fixture.noWrites()
  })

  it('reads all 100 original grants in order with at most eight native requests in flight', async () => {
    const fixture = managedCallNativeFixture(maximumReservationBooking(), 'release')
    let active = 0
    let maximumActive = 0
    fixture.ledger.listTransactions.mockImplementation(async ({ query }) => {
      active++
      maximumActive = Math.max(maximumActive, active)
      await Promise.resolve()
      active--
      const row = fixture.rows.get(query.$match.reference)
      return { v2TransactionsCursorResponse: { cursor: { data: row === undefined ? [] : [row] } } }
    })
    expect(fixture.refs).toHaveLength(102)
    expect(await readFormanceManagedCallRelease(fixture.context, fixture.booking)).toEqual({
      kind: 'confirmed', transactionRefs: fixture.refs,
    })
    expect(maximumActive).toBe(8)
    expect(active).toBe(0)
    expect(fixture.ledger.listTransactions.mock.calls.map(([args]) => args.query.$match.reference)).toEqual(fixture.refs)
    fixture.noWrites()
  })

  it.each([0, 7, 8])('stops after the failed batch at member %i', async index => {
    const fixture = managedCallNativeFixture(maximumReservationBooking(), 'release')
    fixture.rows.delete(fixture.refs[index] ?? '')
    expect(await readFormanceManagedCallRelease(fixture.context, fixture.booking)).toEqual({
      kind: 'refused', code: 'formance_release_evidence_invalid',
    })
    expect(fixture.ledger.listTransactions).toHaveBeenCalledTimes(index === 0 ? 1 : index === 7 ? 8 : 16)
    fixture.noWrites()
  })
})

describe('promotional funding ledger commands', () => {
  it.each(['0', '40', '100'])('books only purchased consideration when promotional units are %s', promo => {
    const purchased = (100n - BigInt(promo)).toString()
    const booking = { ...managedCallBooking(spendingPeriods()), promotionalCreditAllocation: {
      version: 'ae.promotional-credit-allocation:v1' as const, purchasedUnits: purchased,
      grants: promo === '0' ? [] : [{ grantRef: 'promo:one', amountUnits: promo, expiresAt: periodAt + 1 }],
    } }
    const reserve = prepareFormanceManagedCallReservation(booking)
    const settle = prepareFormanceManagedCallSettlement({ booking, externalEvidenceDigest: DIGEST_A })
    const release = prepareFormanceManagedCallRelease({ booking, externalEvidenceDigest: DIGEST_A, submissionProvenAbsent: true })
    if (reserve.kind !== 'prepared' || settle.kind !== 'prepared' || release.kind !== 'prepared') throw new Error('promo_command_refused')
    for (const prepared of [reserve, settle, release]) {
      expect(prepared.bulk.commands.every(command => validateFormanceMoneyCommand(command) === undefined)).toBe(true)
      expect(prepared.bulk.commands.every(command => command.schemaVersion === 'v1.5.0')).toBe(true)
    }
    expect(reserve.bulk.commands[0]?.variables).toMatchObject({ buyer_amount: `AUD/6 ${purchased}`, daily_amount: 'AUD/6 100', monthly_amount: 'AUD/6 100', exposure_amount: 'AUD/6 100' })
    const expectedTax = purchased === '100' ? '1' : '0'
    expect(settle.bulk.commands[0]?.variables).toMatchObject({ revenue_amount: `AUD/6 ${BigInt(purchased) - BigInt(expectedTax)}`, tax_amount: `AUD/6 ${expectedTax}`, exposure_amount: 'AUD/6 100' })
    expect(settle.bulk.commands[1]?.template).toBe('PROVIDER_SETTLED')
    if (promo !== '0') {
      expect(reserve.bulk.commands[3]?.variables).toMatchObject({ amount: `AUD/6 ${promo}` })
      expect(settle.bulk.commands[2]?.variables).toMatchObject({ amount: `AUD/6 ${promo}`, destination: 'platform:expense:marketing' })
      expect(release.bulk.commands[2]?.variables.destination).toBe(reserve.bulk.commands[3]?.variables.source)
      expect(release.bulk.commands[2]?.variables.source).toBe(reserve.bulk.commands[3]?.variables.destination)
    }
    expect(prepareFormanceManagedCallRelease({ booking, externalEvidenceDigest: DIGEST_A, submissionProvenAbsent: true })).toEqual(release)
  })

  it('binds grant and expiry amounts to stable references and prevents another issuance revision', () => {
    const input = { grantRef: 'promo:one', accountRef: 'account:one', amountUnits: '100', expiresAt: periodAt + 1, commandDigest: DIGEST_A }
    const issued = prepareFormancePromotionalCreditGrant(input)
    const changed = prepareFormancePromotionalCreditGrant({ ...input, amountUnits: '200' })
    const expired = prepareFormancePromotionalCreditExpiry({ ...input, revision: 1 })
    if (issued.kind !== 'prepared' || changed.kind !== 'prepared' || expired.kind !== 'prepared') throw new Error('promo_grant_refused')
    expect(validateFormanceMoneyCommand(issued.command)).toBeUndefined()
    expect(issued.command.commandRef).toBe(changed.command.commandRef)
    expect(issued.command.metadata.command_digest).not.toBe(changed.command.metadata.command_digest)
    expect(issued.command.variables.destination).toBe(expired.command.variables.source)
    expect(issued.command.variables).not.toHaveProperty('source')
    expect(expired.command.variables).not.toHaveProperty('destination')
    expect(PROMOTIONAL_FORMANCE_SCHEMA.transactions?.PROMO_GRANTED?.script).toContain('source = @world')
    expect(PROMOTIONAL_FORMANCE_SCHEMA.transactions?.PROMO_EXPIRED?.script).toContain('destination = @world')
    expect(prepareFormancePromotionalCreditGrant({ ...input, revision: 2 })).toMatchObject({ kind: 'refused' })
    expect(prepareFormancePromotionalCreditExpiry({ ...input, revision: 2 })).not.toEqual(expired)
  })
})
