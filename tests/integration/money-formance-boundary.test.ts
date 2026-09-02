import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  createFormanceContext,
  executeFormanceMoneyCommand,
  installPackage4FormanceSchema,
  readFormanceAccount,
  readFormanceHealth,
  readFormanceStatementPage,
  readFormanceTransactionByReference,
  type FormanceConfiguration,
} from '@/modules/money/formance'
import {
  bookFormanceFundingReversal,
  bookFormanceFundingSettlement,
  bookFormanceBuyerAdjustment,
  canRebindFormanceLegalCustomer,
  prepareFormanceManagedCallReservation,
  readFormanceDisplayBalance,
  releaseFormanceManagedCall,
  reserveFormanceManagedCall,
  settleFormanceManagedCall,
  syncFormanceCapacity,
} from '@/modules/money/formance-workflows'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from '@/modules/money/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const integrationEnabled = process.env.AE_FORMANCE_INTEGRATION === 'true'

describe.runIf(integrationEnabled)('Package 4 real Formance boundary', () => {
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

  it('books verified funding and controlled capacities through inert named workflows', async () => {
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
      schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
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
      schemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
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
    expect(await settleFormanceManagedCall(context, {
      booking: settledBooking,
      externalEvidenceDigest: `sha256:${digest('verified-x402-settlement')}`,
    })).toMatchObject({ kind: 'completed', replayed: false })

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
    })).toMatchObject({ kind: 'available', units: '991' })
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
    invocationRef: `invocation:contention:${index}`,
    commitmentRef: `commitment:contention:${index}`,
    idempotencyKey: `invoke:contention:${index}`,
    accountRef: 'account:contention',
    principalRef: 'principal:shared',
    agentBudgetGeneration: 1,
    legalCustomerRef: 'legal:shared',
    legalCustomerGeneration: 1,
    treasuryRef: 'custody:shared',
    treasuryGeneration: 1,
    operationRef: 'operation:managed-x402',
    providerRef: 'provider:sandbox',
    authorityGeneration: 1,
    policyGeneration: 1,
    buyerAmountUnits: '2',
    buyerRevenueUnits: '1',
    buyerTaxUnits: '1',
    providerAmountUnits: '1',
    commitmentDigest: `sha256:${digest(`commitment:${index}`)}`,
    inputDigest: `sha256:${digest(`input:${index}`)}`,
    policyDigest,
    rateEvidenceDigest: `sha256:${digest('sandbox-rate')}`,
    treasuryEvidenceDigest: `sha256:${digest('sandbox-custody')}`,
    x402RequirementDigest: `sha256:${digest('sandbox-x402-requirement')}`,
  }
}
