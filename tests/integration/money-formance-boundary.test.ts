import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  createFormanceContext,
  executeFormanceMoneyCommand,
  installPackage4FormanceSchema,
  LEGACY_FORMANCE_SCHEMA_VERSION,
  readFormanceAccount,
  readFormanceHealth,
  readFormanceStatementPage,
  readFormanceTransactionByReference,
  type FormanceConfiguration,
} from '@/modules/money/formance'
import {
  currentUtcDayBounds,
  currentUtcMonthBounds,
} from '@/modules/common/utc-calendar'
import {
  bookFormanceFundingReversal,
  bookFormanceFundingSettlement,
  bookFormanceBuyerAdjustment,
  canRebindFormanceLegalCustomer,
  adjustFormanceSpendingPeriod,
  formanceSpendingPeriodAccount,
  prepareFormanceManagedCallReservation,
  readFormanceDisplayBalance,
  readFormanceSpendingPeriod,
  releaseFormanceManagedCall,
  reverseFormanceProviderSettlement,
  reserveFormanceManagedCall,
  settleFormanceManagedCall,
  syncFormanceCapacity,
} from '@/modules/money/formance-workflows'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from '@/modules/money/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const integrationEnabled = process.env.AE_FORMANCE_INTEGRATION === 'true'

describe.runIf(integrationEnabled)('Package 4 real Formance boundary', () => {
  it('enforces daily and monthly bounds natively and releases only original period usage', async () => {
    const ledger = `ae-period-bounds-${digest(`${Date.now()}:${process.pid}`).slice(0, 16)}`
    const context = createFormanceContext({ environment: 'sandbox', ledger,
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:3069', requestTimeoutMs: 10_000 })
    await context.sdk.ledger.v2.createLedger({ ledger, v2CreateLedgerRequest: { metadata: { purpose: 'alpha-period-design-proof' } } })
    const send = (units: number, source: string, destination: string) =>
      `send [AUD/6 ${units}] (\n  source = ${source}\n  destination = ${destination}\n)\n`
    const transact = async (reference: string, plain: string) => await context.sdk.ledger.v2.createTransaction({
      ledger, idempotencyKey: reference,
      v2PostTransaction: { reference, metadata: { purpose: 'alpha-period-design-proof' }, runtime: 'machine', script: { plain } },
    })
    const reserve = (day: string, month: string, call: string) =>
      send(100, '@buyer:available', `@calls:${call}:funds`)
      + send(100, `@agent:daily:${day}`, `@calls:${call}:daily`)
      + send(100, `@agent:monthly:${month}`, `@calls:${call}:monthly`)
    const balance = async (address: string) => (await context.sdk.ledger.v2.getAccount({ ledger, address, expand: 'volumes' }))
      .v2AccountResponse?.data.volumes?.['AUD/6']?.balance
    await transact('period-funding', send(1_000, '@world', '@buyer:available'))
    await transact('initial-periods', send(100, '@world', '@agent:daily:day1') + send(200, '@world', '@agent:monthly:month1'))
    const concurrent = await Promise.allSettled(['one', 'two'].map(call => transact(call, reserve('day1', 'month1', call))))
    expect(concurrent.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(concurrent.filter(result => result.status === 'rejected')).toMatchObject([{ reason: { errorCode: 'INSUFFICIENT_FUND' } }])
    const winner = concurrent[0]?.status === 'fulfilled' ? 'one' : 'two'
    await expect(balance('buyer:available')).resolves.toBe(900n)
    await expect(balance('agent:daily:day1')).resolves.toBe(0n)
    await expect(balance('agent:monthly:month1')).resolves.toBe(100n)
    await transact('new-days', send(100, '@world', '@agent:daily:day2') + send(100, '@world', '@agent:daily:day3'))
    await transact('next-day', reserve('day2', 'month1', 'three'))
    await expect(transact('month-exhausted', reserve('day3', 'month1', 'four')))
      .rejects.toMatchObject({ errorCode: 'INSUFFICIENT_FUND' })
    await transact('new-month', send(100, '@world', '@agent:daily:day4') + send(200, '@world', '@agent:monthly:month2'))
    await transact('next-month', reserve('day4', 'month2', 'five'))
    // The authorized limit delta is -150 (200 -> 50), not a fresh allowance.
    // Only this control adjustment can overdraw; purchase sources cannot.
    const decrease = send(150, '@agent:monthly:month2 allowing unbounded overdraft', '@agent:retired')
    const decreased = await transact('policy-decrease', decrease)
    expect((await transact('policy-decrease', decrease)).v2CreateTransactionResponse?.data.id)
      .toBe(decreased.v2CreateTransactionResponse?.data.id)
    await expect(balance('agent:monthly:month2')).resolves.toBe(-50n)
    await transact('new-day5', send(100, '@world', '@agent:daily:day5'))
    await expect(transact('lowered-limit', reserve('day5', 'month2', 'six')))
      .rejects.toMatchObject({ errorCode: 'INSUFFICIENT_FUND' })
    const release = send(100, `@calls:${winner}:funds`, '@buyer:available')
      + send(100, `@calls:${winner}:daily`, '@agent:daily:day1')
      + send(100, `@calls:${winner}:monthly`, '@agent:monthly:month1')
    const firstRelease = await transact('release-original', release)
    const replay = await transact('release-original', release)
    expect(replay.v2CreateTransactionResponse?.data.id).toBe(firstRelease.v2CreateTransactionResponse?.data.id)
    await expect(balance('buyer:available')).resolves.toBe(800n)
    await expect(balance('agent:daily:day1')).resolves.toBe(100n)
    await expect(balance('agent:monthly:month1')).resolves.toBe(100n)
    await expect(balance('agent:monthly:month2')).resolves.toBe(-50n)
    await transact('release-after-decrease', send(100, '@calls:five:funds', '@buyer:available')
      + send(100, '@calls:five:daily', '@agent:daily:day4')
      + send(100, '@calls:five:monthly', '@agent:monthly:month2'))
    await expect(balance('agent:monthly:month2')).resolves.toBe(50n)
    await expect(transact('still-limited', reserve('day5', 'month2', 'seven')))
      .rejects.toMatchObject({ errorCode: 'INSUFFICIENT_FUND' })
    const increase = send(100, '@world', '@agent:monthly:month2')
    const increased = await transact('policy-increase', increase)
    expect((await transact('policy-increase', increase)).v2CreateTransactionResponse?.data.id)
      .toBe(increased.v2CreateTransactionResponse?.data.id)
    await transact('after-increase', reserve('day5', 'month2', 'eight'))
    await expect(balance('agent:monthly:month2')).resolves.toBe(50n)
  })

  it('reserves, captures, and releases both original periods through workflow-native transactions', async () => {
    const runDigest = digest(`period-workflow:${Date.now()}:${process.pid}`)
    const context = createFormanceContext({
      environment: 'sandbox',
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:8080',
      ledger: `ae-period-workflow-${runDigest.slice(0, 16)}`,
      requestTimeoutMs: 30_000,
    })
    expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })

    const policyDigest = `sha256:${digest('period-workflow-policy')}`
    const evidenceDigest = `sha256:${digest('period-workflow-evidence')}`
    const periodStartAt = Date.UTC(2026, 1, 14)
    const daily = currentUtcDayBounds(periodStartAt)
    const monthly = currentUtcMonthBounds(periodStartAt)
    const periods = {
      version: 'ae.spending-periods:v1' as const,
      daily: { ...daily, revision: 1, limitUnits: '100' },
      monthly: { ...monthly, revision: 1, limitUnits: '200' },
    }

    for (const period of [
      {
        principalRef: 'principal:period-workflow',
        periodKind: 'day' as const,
        periodStartAt: daily.periodStartAt,
        periodEndAt: daily.periodEndAt,
        targetLimitUnits: periods.daily.limitUnits,
      },
      {
        principalRef: 'principal:period-workflow',
        periodKind: 'month' as const,
        periodStartAt: monthly.periodStartAt,
        periodEndAt: monthly.periodEndAt,
        targetLimitUnits: periods.monthly.limitUnits,
      },
    ]) {
      expect(await adjustFormanceSpendingPeriod(context, {
        ...period,
        revision: 1,
        previousLimitUnits: '0',
        authorityDigest: policyDigest,
      })).toMatchObject({ kind: 'completed', replayed: false })
    }

    const accountRef = 'account:period-workflow'
    const legalCustomerRef = 'legal:period-workflow'
    const treasuryRef = 'custody:period-workflow'
    expect(await bookFormanceFundingSettlement(context, {
      commandRef: 'period-workflow:funding',
      idempotencyKey: 'period-workflow:funding',
      accountRef,
      processorRef: 'stripe:period-workflow',
      principalUnits: '1000',
      serviceFeeUnits: '1',
      taxUnits: '1',
      totalUnits: '1002',
      policyDigest,
      externalEvidenceDigest: evidenceDigest,
    })).toMatchObject({ kind: 'completed' })
    for (const capacity of [
      { kind: 'legal_customer_exposure' as const, subjectRef: legalCustomerRef, targetUnits: '1000' },
      { kind: 'treasury_usdc' as const, subjectRef: treasuryRef, targetUnits: '1000' },
    ]) {
      expect(await syncFormanceCapacity(context, {
        commandRef: `period-workflow:capacity:${capacity.kind}`,
        idempotencyKey: `period-workflow:capacity:${capacity.kind}`,
        ...capacity,
        generation: 1,
        policyDigest,
        externalEvidenceDigest: evidenceDigest,
      })).toMatchObject({ kind: 'completed' })
    }

    const bookings = [0, 1].map((index) => ({
      ...managedCallBooking(index, policyDigest),
      callRef: `invocation:period-workflow:${index}`,
      quoteRef: `commitment:period-workflow:${index}`,
      idempotencyKey: `invoke:period-workflow:${index}`,
      accountRef,
      principalRef: 'principal:period-workflow',
      legalCustomerRef,
      treasuryRef,
      buyerAmountUnits: '100',
      buyerRevenueUnits: '99',
      buyerTaxUnits: '1',
      providerAmountUnits: '50',
      spendingPeriods: periods,
    }))
    const concurrent = await Promise.all(bookings.map(async (booking) =>
      await reserveFormanceManagedCall(context, booking)))
    expect(concurrent.filter((result) => result.kind === 'completed')).toHaveLength(1)
    expect(concurrent.filter((result) => result.kind !== 'completed')).toHaveLength(1)
    const winnerIndex = concurrent.findIndex((result) => result.kind === 'completed')
    if (winnerIndex < 0) throw new Error('period_workflow_reservation_missing')
    const winner = bookings[winnerIndex]!
    expect(await readFormanceSpendingPeriod(context, {
      principalRef: winner.principalRef,
      periodKind: 'day',
      periodStartAt: daily.periodStartAt,
      periodEndAt: daily.periodEndAt,
    })).toMatchObject({ kind: 'available', units: '0' })
    expect(await readFormanceSpendingPeriod(context, {
      principalRef: winner.principalRef,
      periodKind: 'month',
      periodStartAt: monthly.periodStartAt,
      periodEndAt: monthly.periodEndAt,
    })).toMatchObject({ kind: 'available', units: '100' })

    expect(await releaseFormanceManagedCall(context, {
      booking: winner,
      externalEvidenceDigest: evidenceDigest,
      submissionProvenAbsent: true,
    })).toMatchObject({ kind: 'completed', replayed: false })
    expect(await releaseFormanceManagedCall(context, {
      booking: winner,
      externalEvidenceDigest: evidenceDigest,
      submissionProvenAbsent: true,
    })).toMatchObject({ kind: 'completed', replayed: true })
    expect(await readFormanceSpendingPeriod(context, {
      principalRef: winner.principalRef,
      periodKind: 'day',
      periodStartAt: daily.periodStartAt,
      periodEndAt: daily.periodEndAt,
    })).toMatchObject({ kind: 'available', units: '100' })
    expect(await readFormanceSpendingPeriod(context, {
      principalRef: winner.principalRef,
      periodKind: 'month',
      periodStartAt: monthly.periodStartAt,
      periodEndAt: monthly.periodEndAt,
    })).toMatchObject({ kind: 'available', units: '200' })

    const captured = bookings[(winnerIndex + 1) % bookings.length]!
    expect(await reserveFormanceManagedCall(context, captured)).toMatchObject({ kind: 'completed' })
    expect(await settleFormanceManagedCall(context, {
      booking: captured,
      externalEvidenceDigest: evidenceDigest,
    })).toMatchObject({ kind: 'completed', replayed: false })
    expect(await settleFormanceManagedCall(context, {
      booking: captured,
      externalEvidenceDigest: evidenceDigest,
    })).toMatchObject({ kind: 'completed', replayed: true })
    expect(await readFormanceSpendingPeriod(context, {
      principalRef: captured.principalRef,
      periodKind: 'day',
      periodStartAt: daily.periodStartAt,
      periodEndAt: daily.periodEndAt,
    })).toMatchObject({ kind: 'available', units: '0' })
    expect(await readFormanceSpendingPeriod(context, {
      principalRef: captured.principalRef,
      periodKind: 'month',
      periodStartAt: monthly.periodStartAt,
      periodEndAt: monthly.periodEndAt,
    })).toMatchObject({ kind: 'available', units: '100' })
    const dailySpent = formanceSpendingPeriodAccount(
      captured.principalRef,
      'day',
      daily.periodStartAt,
    ).spent
    expect(await readFormanceAccount(context, dailySpent))
      .toMatchObject({ kind: 'completed', volumes: { 'AUD/6': { balanceUnits: '100' } } })
  })

  it('lets shared legal exposure capacity choose one v1.4 winner across distinct principals', async () => {
    const runDigest = digest(`legal-capacity-contention:${Date.now()}:${process.pid}`)
    const context = createFormanceContext({
      environment: 'sandbox',
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:3069',
      ledger: `ae-legal-capacity-${runDigest.slice(0, 16)}`,
      requestTimeoutMs: 30_000,
    })
    expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })

    const policyDigest = `sha256:${digest('legal-capacity-policy')}`
    const externalEvidenceDigest = `sha256:${digest('legal-capacity-evidence')}`
    const periodStartAt = Date.UTC(2026, 1, 14)
    const daily = currentUtcDayBounds(periodStartAt)
    const monthly = currentUtcMonthBounds(periodStartAt)
    const periodLimitUnits = '1000'
    const legalCustomerRef = 'legal:shared-capacity'
    const treasuryRef = 'custody:shared-capacity'
    const spendingPeriods = () => ({
      version: 'ae.spending-periods:v1' as const,
      daily: { ...daily, revision: 1, limitUnits: periodLimitUnits },
      monthly: { ...monthly, revision: 1, limitUnits: periodLimitUnits },
    })

    for (const principalRef of ['principal:legal-contention:one', 'principal:legal-contention:two']) {
      for (const period of [
        { periodKind: 'day' as const, bounds: daily },
        { periodKind: 'month' as const, bounds: monthly },
      ]) {
        expect(await adjustFormanceSpendingPeriod(context, {
          principalRef,
          periodKind: period.periodKind,
          periodStartAt: period.bounds.periodStartAt,
          periodEndAt: period.bounds.periodEndAt,
          revision: 1,
          previousLimitUnits: '0',
          targetLimitUnits: periodLimitUnits,
          authorityDigest: policyDigest,
        })).toMatchObject({ kind: 'completed', replayed: false })
      }
    }

    const accounts = [
      'account:legal-contention:one',
      'account:legal-contention:two',
    ]
    for (const [index, accountRef] of accounts.entries()) {
      expect(await bookFormanceFundingSettlement(context, {
        commandRef: `legal-contention:funding:${index}`,
        idempotencyKey: `legal-contention:funding:${index}`,
        accountRef,
        processorRef: `stripe:legal-contention:${index}`,
        principalUnits: '1000',
        serviceFeeUnits: '1',
        taxUnits: '1',
        totalUnits: '1002',
        policyDigest,
        externalEvidenceDigest,
      })).toMatchObject({ kind: 'completed', replayed: false })
    }
    expect(await syncFormanceCapacity(context, {
      commandRef: 'legal-contention:capacity:legal',
      idempotencyKey: 'legal-contention:capacity:legal',
      kind: 'legal_customer_exposure',
      subjectRef: legalCustomerRef,
      generation: 1,
      targetUnits: '100',
      policyDigest,
      externalEvidenceDigest,
    })).toMatchObject({ kind: 'completed', replayed: false })
    expect(await syncFormanceCapacity(context, {
      commandRef: 'legal-contention:capacity:treasury',
      idempotencyKey: 'legal-contention:capacity:treasury',
      kind: 'treasury_usdc',
      subjectRef: treasuryRef,
      generation: 1,
      targetUnits: '1000',
      policyDigest,
      externalEvidenceDigest,
    })).toMatchObject({ kind: 'completed', replayed: false })

    const bookings = accounts.map((accountRef, index) => ({
      ...managedCallBooking(index, policyDigest),
      callRef: `invocation:legal-contention:${index}`,
      quoteRef: `commitment:legal-contention:${index}`,
      idempotencyKey: `invoke:legal-contention:${index}`,
      accountRef,
      principalRef: `principal:legal-contention:${index === 0 ? 'one' : 'two'}`,
      legalCustomerRef,
      treasuryRef,
      buyerAmountUnits: '100',
      buyerRevenueUnits: '99',
      buyerTaxUnits: '1',
      providerAmountUnits: '50',
      spendingPeriods: spendingPeriods(),
    }))
    const results = await Promise.all(bookings.map(async (booking) =>
      await reserveFormanceManagedCall(context, booking)))
    expect(results.filter((result) => result.kind === 'completed')).toHaveLength(1)
    expect(results.filter((result) => result.kind !== 'completed')).toHaveLength(1)
    const winnerIndex = results.findIndex((result) => result.kind === 'completed')
    if (winnerIndex < 0) throw new Error('legal_capacity_winner_missing')
    const loserIndex = winnerIndex === 0 ? 1 : 0
    const winner = bookings[winnerIndex]!
    const loser = bookings[loserIndex]!

    const loserPrepared = prepareFormanceManagedCallReservation(loser)
    if (loserPrepared.kind !== 'prepared') throw new Error(loserPrepared.code)
    const loserReferences = await Promise.all(loserPrepared.bulk.commands.map(
      async ({ commandRef }) => await readFormanceTransactionByReference(context, commandRef),
    ))
    expect(loserReferences.every((read) => read.kind === 'absent')).toBe(true)

    const readAccountUnits = async (accountRef: string) => await readFormanceDisplayBalance(context, {
      balanceKind: 'account_aud',
      subjectRef: accountRef,
      now: 2_000,
    })
    const readPeriodUnits = async (booking: typeof winner, periodKind: 'day' | 'month') => {
      const period = periodKind === 'day' ? booking.spendingPeriods!.daily : booking.spendingPeriods!.monthly
      return await readFormanceSpendingPeriod(context, {
        principalRef: booking.principalRef,
        periodKind,
        periodStartAt: period.periodStartAt,
        periodEndAt: period.periodEndAt,
      })
    }
    expect(await readAccountUnits(winner.accountRef)).toMatchObject({ kind: 'available', units: '900' })
    expect(await readAccountUnits(loser.accountRef)).toMatchObject({ kind: 'available', units: '1000' })
    expect(await readPeriodUnits(winner, 'day')).toMatchObject({ kind: 'available', units: '900' })
    expect(await readPeriodUnits(winner, 'month')).toMatchObject({ kind: 'available', units: '900' })
    expect(await readPeriodUnits(loser, 'day')).toMatchObject({ kind: 'available', units: '1000' })
    expect(await readPeriodUnits(loser, 'month')).toMatchObject({ kind: 'available', units: '1000' })
    expect(await readFormanceDisplayBalance(context, {
      balanceKind: 'legal_customer_exposure',
      subjectRef: legalCustomerRef,
      generation: 1,
      now: 2_000,
    })).toMatchObject({ kind: 'available', units: '0' })
    expect(await readFormanceDisplayBalance(context, {
      balanceKind: 'treasury_usdc',
      subjectRef: treasuryRef,
      generation: 1,
      now: 2_000,
    })).toMatchObject({ kind: 'available', units: '950' })

    const releaseInput = {
      booking: winner,
      externalEvidenceDigest,
      submissionProvenAbsent: true as const,
    }
    expect(await releaseFormanceManagedCall(context, releaseInput))
      .toMatchObject({ kind: 'completed', replayed: false })
    expect(await releaseFormanceManagedCall(context, releaseInput))
      .toMatchObject({ kind: 'completed', replayed: true })
    expect(await readFormanceDisplayBalance(context, {
      balanceKind: 'legal_customer_exposure',
      subjectRef: legalCustomerRef,
      generation: 1,
      now: 3_000,
    })).toMatchObject({ kind: 'available', units: '100' })

    expect(await reserveFormanceManagedCall(context, loser))
      .toMatchObject({ kind: 'completed', replayed: false })
    expect(await reserveFormanceManagedCall(context, loser))
      .toMatchObject({ kind: 'completed', replayed: true })
    expect(await readFormanceDisplayBalance(context, {
      balanceKind: 'legal_customer_exposure',
      subjectRef: legalCustomerRef,
      generation: 1,
      now: 4_000,
    })).toMatchObject({ kind: 'available', units: '0' })
  })

  it('installs and verifies the strict schema, then writes and replays by exact reference', async () => {
    const runDigest = digest(`package4-pr2:${Date.now()}:${process.pid}`)
    const configuration: FormanceConfiguration = {
      environment: 'sandbox',
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:8080',
      ledger: `ae-package4-pr2-${runDigest.slice(0, 16)}`,
      requestTimeoutMs: 10_000,
    }
    const context = createFormanceContext(configuration)

    const installed = await installPackage4FormanceSchema(context)
    expect(installed).toMatchObject({
      kind: 'completed',
      ledger: configuration.ledger,
      schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
      replayed: false,
    })
    expect(await installPackage4FormanceSchema(context)).toMatchObject({
      kind: 'completed',
      replayed: true,
    })
    expect(await readFormanceHealth(context)).toMatchObject({
      kind: 'ready',
      gatewayVersion: PACKAGE4_FORMANCE_REQUIREMENTS.gatewayVersion,
      ledgerVersion: PACKAGE4_FORMANCE_REQUIREMENTS.ledgerVersion,
      schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
    })

    const accountDigest = digest('account')
    const processorDigest = digest('processor')
    const commandDigest = digest('funding-command')
    const idempotencyDigest = digest('funding-idempotency')
    const reference = `ae-p4:${commandDigest}`
    const command = {
      commandRef: reference,
      idempotencyKey: idempotencyDigest,
      schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
      template: 'FUNDING_SETTLED' as const,
      variables: {
        processor: `processor:${processorDigest}:settlement`,
        account: `accounts:${accountDigest}:available`,
        revenue: 'platform:revenue:sales',
        tax: 'platform:tax:gst',
        principal_amount: 'AUD/6 25000000000',
        service_fee_amount: 'AUD/6 1250000000',
        tax_amount: 'AUD/6 125000000',
        total_amount: 'AUD/6 26375000000',
      },
      metadata: {
        command_digest: commandDigest,
        idempotency_digest: idempotencyDigest,
        account_digest: accountDigest,
      },
    }

    expect(await executeFormanceMoneyCommand(context, command)).toEqual({
      kind: 'completed',
      transactionRefs: [reference],
      replayed: false,
    })
    expect(await executeFormanceMoneyCommand(context, command)).toEqual({
      kind: 'completed',
      transactionRefs: [reference],
      replayed: true,
    })
    expect(await readFormanceTransactionByReference(context, reference)).toMatchObject({
      kind: 'found',
      reference,
      template: 'FUNDING_SETTLED',
      metadata: {
        command_digest: commandDigest,
        idempotency_digest: idempotencyDigest,
      },
    })
    expect(await readFormanceAccount(context, `accounts:${accountDigest}:available`)).toEqual({
      kind: 'completed',
      address: `accounts:${accountDigest}:available`,
      volumes: {
        'AUD/6': {
          inputUnits: '25000000000',
          outputUnits: '0',
          balanceUnits: '25000000000',
        },
      },
    })
    expect(await readFormanceAccount(context, 'platform:revenue:sales')).toMatchObject({
      kind: 'completed',
      volumes: { 'AUD/6': { balanceUnits: '1250000000' } },
    })
    expect(await readFormanceAccount(context, 'platform:tax:gst')).toMatchObject({
      kind: 'completed',
      volumes: { 'AUD/6': { balanceUnits: '125000000' } },
    })
  })

  it('settles zero-tax Calls with the existing template and conserves balances on release and replay', async () => {
    const runDigest = digest(`managed-zero-tax:${Date.now()}:${process.pid}`)
    const context = createFormanceContext({
      environment: 'sandbox',
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:8080',
      ledger: `ae-zero-tax-${runDigest.slice(0, 16)}`,
      requestTimeoutMs: 10_000,
    })
    expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })
    const policyDigest = `sha256:${digest('zero-call-tax-policy')}`
    const externalEvidenceDigest = `sha256:${digest('zero-tax-sandbox-evidence')}`
    const booking = {
      ...managedCallBooking(0, policyDigest),
      buyerAmountUnits: '3000000',
      buyerRevenueUnits: '3000000',
      buyerTaxUnits: '0',
      providerAmountUnits: '2000000',
    }
    expect(await bookFormanceFundingSettlement(context, {
      commandRef: 'zero-tax:funding',
      idempotencyKey: 'zero-tax:funding',
      accountRef: booking.accountRef,
      processorRef: 'stripe:zero-tax-sandbox',
      principalUnits: '100000000',
      serviceFeeUnits: '5000000',
      taxUnits: '500000',
      totalUnits: '105500000',
      policyDigest,
      externalEvidenceDigest,
    })).toMatchObject({ kind: 'completed', replayed: false })
    for (const capacity of [
      { kind: 'agent_budget' as const, subjectRef: booking.principalRef, targetUnits: '100000000' },
      { kind: 'legal_customer_exposure' as const, subjectRef: booking.legalCustomerRef, targetUnits: '100000000' },
      { kind: 'treasury_usdc' as const, subjectRef: booking.treasuryRef, targetUnits: '10000000' },
    ]) {
      expect(await syncFormanceCapacity(context, {
        commandRef: `zero-tax:capacity:${capacity.kind}`,
        idempotencyKey: `zero-tax:capacity:${capacity.kind}`,
        ...capacity,
        generation: 1,
        policyDigest,
        externalEvidenceDigest,
      })).toMatchObject({ kind: 'completed' })
    }
    const gstBefore = await readFormanceAccount(context, 'platform:tax:gst')
    expect(gstBefore).toMatchObject({ kind: 'completed', volumes: { 'AUD/6': { balanceUnits: '500000' } } })
    expect(await readFormanceDisplayBalance(context, {
      balanceKind: 'account_aud', subjectRef: booking.accountRef, now: Date.now(),
    })).toMatchObject({ kind: 'available', units: '100000000' })

    expect(await reserveFormanceManagedCall(context, booking)).toMatchObject({ kind: 'completed', replayed: false })
    expect(await reserveFormanceManagedCall(context, booking)).toMatchObject({ kind: 'completed', replayed: true })
    const settlementInput = { booking, externalEvidenceDigest }
    const settled = await settleFormanceManagedCall(context, settlementInput)
    expect(settled).toMatchObject({ kind: 'completed', replayed: false })
    if (settled.kind !== 'completed' || settled.transactionRefs[0] === undefined) {
      throw new Error('Zero-tax buyer settlement reference missing')
    }
    expect(await readFormanceTransactionByReference(context, settled.transactionRefs[0]))
      .toMatchObject({ kind: 'found', template: 'BUYER_SALE_SETTLED' })
    expect(await settleFormanceManagedCall(context, settlementInput)).toMatchObject({ kind: 'completed', replayed: true })
    expect(await readFormanceAccount(context, 'platform:revenue:sales'))
      .toMatchObject({ kind: 'completed', volumes: { 'AUD/6': { balanceUnits: '8000000' } } })
    // Loading GST remains; neither the zero posting nor its replay changes its volumes.
    expect(await readFormanceAccount(context, 'platform:tax:gst')).toEqual(gstBefore)

    const releasedBooking = {
      ...managedCallBooking(1, policyDigest),
      buyerAmountUnits: booking.buyerAmountUnits,
      buyerRevenueUnits: booking.buyerRevenueUnits,
      buyerTaxUnits: '0',
      providerAmountUnits: booking.providerAmountUnits,
    }
    expect(await reserveFormanceManagedCall(context, releasedBooking)).toMatchObject({ kind: 'completed', replayed: false })
    const releaseInput = { booking: releasedBooking, externalEvidenceDigest, submissionProvenAbsent: true as const }
    expect(await releaseFormanceManagedCall(context, releaseInput)).toMatchObject({ kind: 'completed', replayed: false })
    expect(await releaseFormanceManagedCall(context, releaseInput)).toMatchObject({ kind: 'completed', replayed: true })
    for (const balance of [
      { balanceKind: 'account_aud' as const, subjectRef: booking.accountRef, units: '97000000' },
      { balanceKind: 'agent_budget' as const, subjectRef: booking.principalRef, generation: 1, units: '97000000' },
      { balanceKind: 'legal_customer_exposure' as const, subjectRef: booking.legalCustomerRef, generation: 1, units: '97000000' },
      { balanceKind: 'treasury_usdc' as const, subjectRef: booking.treasuryRef, generation: 1, units: '8000000' },
    ]) {
      const { units, ...query } = balance
      expect(await readFormanceDisplayBalance(context, { ...query, now: Date.now() }))
        .toMatchObject({ kind: 'available', units })
    }
    for (const call of [booking, releasedBooking]) {
      expect(await readFormanceAccount(context, `calls:${accountSegmentDigest('call', call.callRef)}:buyer_reserved`))
        .toMatchObject({ kind: 'completed', volumes: { 'AUD/6': { balanceUnits: '0' } } })
    }
    expect(await readFormanceAccount(context, `providers:${accountSegmentDigest('provider', booking.providerRef)}:settlement`))
      .toMatchObject({ kind: 'completed', volumes: { 'USDC/6': { balanceUnits: '2000000' } } })
    expect(await readFormanceAccount(context, 'platform:tax:gst')).toEqual(gstBefore)
    expect(await readFormanceAccount(context, 'platform:revenue:sales'))
      .toMatchObject({ kind: 'completed', volumes: { 'AUD/6': { balanceUnits: '8000000' } } })
  })

  it('refuses schema drift before a transaction can be submitted', async () => {
    const runDigest = digest(`package4-pr2-drift:${Date.now()}:${process.pid}`)
    const context = createFormanceContext({
      environment: 'sandbox',
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:8080',
      ledger: `ae-package4-drift-${runDigest.slice(0, 16)}`,
      requestTimeoutMs: 10_000,
    })
    await context.sdk.ledger.v2.createLedger({
      ledger: context.configuration.ledger,
      v2CreateLedgerRequest: { metadata: { purpose_digest: runDigest } },
    }, { retries: { strategy: 'none' } })
    await context.sdk.ledger.v2.insertSchema({
      idempotencyKey: digest('drift-schema'),
      ledger: context.configuration.ledger,
      version: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
      v2SchemaData: {
        chart: { world: { dotSelf: {} } },
        queries: {},
        transactions: {},
      },
    }, { retries: { strategy: 'none' } })

    expect(await installPackage4FormanceSchema(context)).toEqual({
      kind: 'setup_required',
      code: 'formance_schema_drift',
    })

    const commandDigest = digest('drift-command')
    const idempotencyDigest = digest('drift-idempotency')
    const reference = `ae-p4:${commandDigest}`
    expect(await executeFormanceMoneyCommand(context, {
      commandRef: reference,
      idempotencyKey: idempotencyDigest,
      schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
      template: 'FUNDING_SETTLED',
      variables: {
        processor: `processor:${digest('processor')}:settlement`,
        account: `accounts:${digest('account')}:available`,
        amount: 'AUD/6 1',
      },
      metadata: { command_digest: commandDigest, idempotency_digest: idempotencyDigest },
    })).toEqual({ kind: 'refused', code: 'formance_schema_drift', retryable: false })
    expect(await readFormanceTransactionByReference(context, reference)).toEqual({
      kind: 'absent',
      reference,
    })
  })

  it('books verified funding and controlled capacities through named workflows', async () => {
    const runDigest = digest(`package4-pr3:${Date.now()}:${process.pid}`)
    const context = createFormanceContext({
      environment: 'sandbox',
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:8080',
      ledger: `ae-package4-pr3-${runDigest.slice(0, 16)}`,
      requestTimeoutMs: 10_000,
    })
    expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })

    const policyDigest = `sha256:${digest('policy')}`
    const evidenceDigest = `sha256:${digest('stripe-readback')}`
    const funding = {
      commandRef: 'account-funding:inert-one',
      idempotencyKey: 'account-funding:inert-one',
      accountRef: 'account:one',
      processorRef: 'stripe:payment-intent:one',
      principalUnits: '100000000',
      serviceFeeUnits: '5000000',
      taxUnits: '500000',
      totalUnits: '105500000',
      policyDigest,
      externalEvidenceDigest: evidenceDigest,
    }
    const settled = await bookFormanceFundingSettlement(context, funding)
    expect(settled).toMatchObject({ kind: 'completed', replayed: false })
    expect(await bookFormanceFundingSettlement(context, funding))
      .toMatchObject({ kind: 'completed', replayed: true })
    expect(await bookFormanceFundingSettlement(context, {
      ...funding,
      principalUnits: '99000000',
      totalUnits: '104500000',
    })).toEqual({ kind: 'refused', code: 'formance_reference_conflict', retryable: false })

    expect(await readFormanceDisplayBalance(context, {
      balanceKind: 'account_aud',
      subjectRef: funding.accountRef,
      now: 1_000,
    })).toEqual({
      kind: 'available',
      balanceKind: 'account_aud',
      subjectRef: funding.accountRef,
      currency: 'AUD',
      exponent: 6,
      units: funding.principalUnits,
      observedAt: 1_000,
      source: 'formance_live_read',
      authoritativeForConsequences: false,
    })

    const capacities = [
      {
        commandRef: 'capacity:agent:v1',
        idempotencyKey: 'capacity:agent:v1',
        kind: 'agent_budget' as const,
        subjectRef: 'principal:shared-agent',
        generation: 1,
        targetUnits: '50000000',
      },
      {
        commandRef: 'capacity:legal:v1',
        idempotencyKey: 'capacity:legal:v1',
        kind: 'legal_customer_exposure' as const,
        subjectRef: 'legal-customer:one',
        generation: 1,
        targetUnits: '75000000',
      },
      {
        commandRef: 'capacity:treasury:v1',
        idempotencyKey: 'capacity:treasury:v1',
        kind: 'treasury_usdc' as const,
        subjectRef: 'custody:corporate',
        generation: 1,
        targetUnits: '25000000',
      },
    ].map((capacity) => ({ ...capacity, policyDigest, externalEvidenceDigest: evidenceDigest }))

    for (const capacity of capacities) {
      expect(await syncFormanceCapacity(context, capacity))
        .toMatchObject({ kind: 'completed', replayed: false })
      expect(await syncFormanceCapacity(context, capacity))
        .toMatchObject({ kind: 'completed', replayed: true })
    }
    expect(await syncFormanceCapacity(context, {
      ...capacities[0]!,
      commandRef: 'capacity:agent:conflicting-command',
      idempotencyKey: 'capacity:agent:conflicting-command',
      targetUnits: '49000000',
    })).toEqual({ kind: 'refused', code: 'formance_reference_conflict', retryable: false })
    expect(await readFormanceDisplayBalance(context, {
      balanceKind: 'agent_budget',
      subjectRef: 'principal:shared-agent',
      generation: 1,
      now: 2_000,
    })).toMatchObject({ kind: 'available', currency: 'AUD', units: '50000000' })

    expect(await syncFormanceCapacity(context, {
      ...capacities[0]!,
      commandRef: 'capacity:agent:v2',
      idempotencyKey: 'capacity:agent:v2',
      generation: 2,
      targetUnits: '40000000',
    })).toMatchObject({ kind: 'completed', replayed: false })
    expect(await readFormanceDisplayBalance(context, {
      balanceKind: 'agent_budget',
      subjectRef: 'principal:shared-agent',
      generation: 2,
      now: 3_000,
    })).toMatchObject({ kind: 'available', units: '40000000' })

    const concurrentCapacity = {
      ...capacities[0]!,
      commandRef: 'capacity:agent:v3',
      idempotencyKey: 'capacity:agent:v3',
      generation: 3,
      targetUnits: '30000000',
    }
    const concurrentResults = await Promise.all(
      Array.from({ length: 20 }, async () => await syncFormanceCapacity(context, concurrentCapacity)),
    )
    expect(concurrentResults.every((result) => result.kind === 'completed')).toBe(true)
    expect(await readFormanceDisplayBalance(context, {
      balanceKind: 'agent_budget',
      subjectRef: 'principal:shared-agent',
      generation: 3,
      now: 3_500,
    })).toMatchObject({ kind: 'available', units: '30000000' })

    expect(await canRebindFormanceLegalCustomer(context, {
      legalCustomerRef: 'legal-customer:one',
      generation: 1,
      pendingCallCount: 1,
    })).toEqual({ kind: 'refused', code: 'legal_customer_calls_pending' })
    expect(await canRebindFormanceLegalCustomer(context, {
      legalCustomerRef: 'legal-customer:one',
      generation: 1,
      pendingCallCount: 0,
    })).toEqual({ kind: 'allowed' })

    const reservationDigest = digest('legal-customer-reservation')
    const reservationIdempotency = digest('legal-customer-reservation-idempotency')
    const reservationVariables = {
      account_available: `accounts:${accountSegmentDigest('account', funding.accountRef)}:available`,
      call_reserved: `calls:${digest('call:legal-rebind')}:buyer_reserved`,
      agent_available: `agents:${accountSegmentDigest('agent_budget', { subjectRef: 'principal:shared-agent', generation: 2 })}:budget_available`,
      agent_reserved: `agents:${accountSegmentDigest('agent_budget', { subjectRef: 'principal:shared-agent', generation: 2 })}:budget_reserved`,
      legal_available: `legal_customers:${accountSegmentDigest('legal_customer_exposure', { subjectRef: 'legal-customer:one', generation: 1 })}:exposure_available`,
      legal_reserved: `legal_customers:${accountSegmentDigest('legal_customer_exposure', { subjectRef: 'legal-customer:one', generation: 1 })}:exposure_reserved`,
      buyer_amount: 'AUD/6 1000000',
      budget_amount: 'AUD/6 1000000',
      exposure_amount: 'AUD/6 1000000',
    }
    expect(await executeFormanceMoneyCommand(context, {
      commandRef: `ae-p4:${reservationDigest}:reserve-aud`,
      idempotencyKey: reservationIdempotency,
      schemaVersion: LEGACY_FORMANCE_SCHEMA_VERSION,
      template: 'CALL_RESERVED_AUD',
      variables: reservationVariables,
      metadata: {
        command_digest: reservationDigest,
        idempotency_digest: reservationIdempotency,
      },
    })).toMatchObject({ kind: 'completed' })
    expect(await canRebindFormanceLegalCustomer(context, {
      legalCustomerRef: 'legal-customer:one',
      generation: 1,
      pendingCallCount: 0,
    })).toEqual({ kind: 'refused', code: 'legal_customer_capacity_reserved' })

    const releaseDigest = digest('legal-customer-release')
    const releaseIdempotency = digest('legal-customer-release-idempotency')
    expect(await executeFormanceMoneyCommand(context, {
      commandRef: `ae-p4:${releaseDigest}:release-aud`,
      idempotencyKey: releaseIdempotency,
      schemaVersion: LEGACY_FORMANCE_SCHEMA_VERSION,
      template: 'CALL_RELEASED_AUD',
      variables: reservationVariables,
      metadata: {
        command_digest: releaseDigest,
        idempotency_digest: releaseIdempotency,
      },
    })).toMatchObject({ kind: 'completed' })

    const reversed = await bookFormanceFundingReversal(context, {
      ...funding,
      commandRef: 'account-funding-reversal:inert-one',
      idempotencyKey: 'account-funding-reversal:inert-one',
      externalEvidenceDigest: `sha256:${digest('stripe-reversal-readback')}`,
    })
    expect(reversed).toMatchObject({ kind: 'completed', replayed: false })
    expect(await bookFormanceFundingReversal(context, {
      ...funding,
      commandRef: 'account-funding-reversal:inert-one',
      idempotencyKey: 'account-funding-reversal:inert-one',
      externalEvidenceDigest: `sha256:${digest('stripe-reversal-readback')}`,
    })).toMatchObject({ kind: 'completed', replayed: true })
    expect(await readFormanceDisplayBalance(context, {
      balanceKind: 'account_aud',
      subjectRef: funding.accountRef,
      now: 4_000,
    })).toMatchObject({ kind: 'available', units: '0' })
  })

  it('lets native atomic bulk choose managed-call winners and preserves exact recovery refs', async () => {
    const runDigest = digest(`package4-pr4:${Date.now()}:${process.pid}`)
    const context = createFormanceContext({
      environment: 'sandbox',
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:8080',
      ledger: `ae-package4-pr4-${runDigest.slice(0, 16)}`,
      requestTimeoutMs: 30_000,
    })
    expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })
    const policyDigest = `sha256:${digest('pr4-policy')}`
    const externalEvidenceDigest = `sha256:${digest('pr4-external-evidence')}`
    expect(await bookFormanceFundingSettlement(context, {
      commandRef: 'pr4:funding',
      idempotencyKey: 'pr4:funding',
      accountRef: 'account:contention',
      processorRef: 'stripe:pr4',
      principalUnits: '1000',
      serviceFeeUnits: '1',
      taxUnits: '1',
      totalUnits: '1002',
      policyDigest,
      externalEvidenceDigest,
    })).toMatchObject({ kind: 'completed' })
    for (const capacity of [
      { kind: 'agent_budget' as const, subjectRef: 'principal:shared', targetUnits: '20' },
      { kind: 'legal_customer_exposure' as const, subjectRef: 'legal:shared', targetUnits: '1000' },
      { kind: 'treasury_usdc' as const, subjectRef: 'custody:shared', targetUnits: '1000' },
    ]) {
      expect(await syncFormanceCapacity(context, {
        commandRef: `pr4:capacity:${capacity.kind}`,
        idempotencyKey: `pr4:capacity:${capacity.kind}`,
        ...capacity,
        generation: 1,
        policyDigest,
        externalEvidenceDigest,
      })).toMatchObject({ kind: 'completed' })
    }

    const bookings = Array.from({ length: 100 }, (_, index) => managedCallBooking(index, policyDigest))
    const results = await Promise.all(
      bookings.map(async (booking) => await reserveFormanceManagedCall(context, booking)),
    )
    const winnerIndexes = results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.kind === 'completed')
      .map(({ index }) => index)
    const loserIndexes = results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.kind !== 'completed')
      .map(({ index }) => index)
    expect(winnerIndexes).toHaveLength(10)
    expect(loserIndexes).toHaveLength(90)

    for (const index of loserIndexes) {
      const prepared = prepareFormanceManagedCallReservation(bookings[index]!)
      if (prepared.kind !== 'prepared') throw new Error(prepared.code)
      const reads = await Promise.all(prepared.bulk.commands.map(
        async ({ commandRef }) => await readFormanceTransactionByReference(context, commandRef),
      ))
      expect(reads.every((read) => read.kind === 'absent')).toBe(true)
    }

    const releasedBooking = bookings[winnerIndexes[0]!]!
    const settledBooking = bookings[winnerIndexes[1]!]!
    expect(await reserveFormanceManagedCall(context, releasedBooking))
      .toMatchObject({ kind: 'completed', replayed: true })
    expect(await reserveFormanceManagedCall(context, {
      ...releasedBooking,
      buyerAmountUnits: '4',
      buyerRevenueUnits: '3',
      buyerTaxUnits: '1',
    })).toEqual({ kind: 'refused', code: 'formance_reference_conflict', retryable: false })

    expect(await releaseFormanceManagedCall(context, {
      booking: releasedBooking,
      externalEvidenceDigest: `sha256:${digest('proven-pre-submit-failure')}`,
      submissionProvenAbsent: true,
    })).toMatchObject({ kind: 'completed', replayed: false })
    const settlement = await settleFormanceManagedCall(context, {
      booking: settledBooking,
      externalEvidenceDigest: `sha256:${digest('verified-x402-settlement')}`,
    })
    expect(settlement).toMatchObject({ kind: 'completed', replayed: false })
    if (settlement.kind !== 'completed' || settlement.transactionRefs[1] === undefined) {
      throw new Error('Provider settlement reference missing')
    }
    const providerReversal = {
      booking: settledBooking,
      originalSettlementRef: settlement.transactionRefs[1],
      correctionEvidenceDigest: `sha256:${digest('verified-provider-reversal')}`,
    }
    expect(await reverseFormanceProviderSettlement(context, providerReversal))
      .toMatchObject({ kind: 'completed', replayed: false })
    expect(await reverseFormanceProviderSettlement(context, providerReversal))
      .toMatchObject({ kind: 'completed', replayed: true })
    expect(await reverseFormanceProviderSettlement(context, {
      ...providerReversal,
      originalSettlementRef: settlement.transactionRefs[0]!,
    })).toEqual({
      kind: 'refused',
      code: 'formance_provider_settlement_reference_invalid',
      retryable: false,
    })

    const statementEndAt = Date.now()
    let statementCursor: string | undefined
    let statementTotal = 0n
    const statementRefs: string[] = []
    do {
      const page = await readFormanceStatementPage(context, {
        accountDigest: accountSegmentDigest('account', settledBooking.accountRef),
        periodStartAt: statementEndAt - 60_000,
        periodEndAt: statementEndAt,
        snapshotCutoffAt: statementEndAt,
        ...(statementCursor === undefined ? {} : { cursor: statementCursor }),
      })
      expect(page.kind).toBe('available')
      if (page.kind !== 'available') throw new Error(page.code)
      statementTotal += BigInt(page.exactAmountUnits)
      statementRefs.push(...page.transactionRefs)
      statementCursor = page.isDone ? undefined : page.continueCursor
    } while (statementCursor !== undefined)
    expect(statementTotal.toString()).toBe(settledBooking.buyerAmountUnits)
    expect(statementRefs).toHaveLength(1)

    const adjustment = {
      documentRef: 'document:contention:statement',
      accountRef: settledBooking.accountRef,
      residualUnits: '1',
      policyDigest,
      snapshotDigest: `sha256:${digest('statement-snapshot')}`,
    }
    expect(await bookFormanceBuyerAdjustment(context, adjustment))
      .toMatchObject({ kind: 'completed', replayed: false })
    expect(await bookFormanceBuyerAdjustment(context, adjustment))
      .toMatchObject({ kind: 'completed', replayed: true })

    expect(await readFormanceDisplayBalance(context, {
      balanceKind: 'account_aud',
      subjectRef: 'account:contention',
      now: 5_000,
    })).toMatchObject({ kind: 'available', units: '982' })
    expect(await readFormanceDisplayBalance(context, {
      balanceKind: 'agent_budget',
      subjectRef: 'principal:shared',
      generation: 1,
      now: 5_000,
    })).toMatchObject({ kind: 'available', units: '2' })
    expect(await readFormanceDisplayBalance(context, {
      balanceKind: 'treasury_usdc',
      subjectRef: 'custody:shared',
      generation: 1,
      now: 5_000,
    })).toMatchObject({ kind: 'available', units: '992' })
  })
})

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function accountSegmentDigest(kind: string, reference: unknown): string {
  return canonicalDigest({
    format: 'ae.formance-account-segment:v1',
    value: { kind, reference },
  }).slice('sha256:'.length)
}

function managedCallBooking(index: number, policyDigest: string) {
  return {
    callRef: `invocation:contention:${index}`,
    quoteRef: `commitment:contention:${index}`,
    idempotencyKey: `invoke:contention:${index}`,
    accountRef: 'account:contention',
    principalRef: 'principal:shared',
    agentBudgetGeneration: 1,
    legalCustomerRef: 'legal:shared',
    legalCustomerGeneration: 1,
    treasuryRef: 'custody:shared',
    treasuryGeneration: 1,
    toolRef: 'operation:managed-x402',
    providerRef: 'provider:sandbox',
    authorityGeneration: 1,
    policyGeneration: 1,
    buyerAmountUnits: '2',
    buyerRevenueUnits: '1',
    buyerTaxUnits: '1',
    providerAmountUnits: '1',
    quoteDigest: `sha256:${digest(`commitment:${index}`)}`,
    inputDigest: `sha256:${digest(`input:${index}`)}`,
    policyDigest,
    rateEvidenceDigest: `sha256:${digest('sandbox-rate')}`,
    treasuryEvidenceDigest: `sha256:${digest('sandbox-custody')}`,
    x402RequirementDigest: `sha256:${digest('sandbox-x402-requirement')}`,
  }
}
