/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { internal } from '../../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const reserve = anyApi.moneyAccountFunding?.reserve
const bind = anyApi.moneyAccountFunding?.bind
const applyVerifiedEvent = anyApi.moneyAccountFunding?.applyVerifiedEvent
const readBalance = anyApi.moneyAccountFunding?.readBalance
if (reserve === undefined || bind === undefined || applyVerifiedEvent === undefined || readBalance === undefined) {
  throw new Error('Account funding functions missing')
}

describe('Account AUD funding', () => {
  it('binds one sandbox payment to the owner Account and credits requested principal exactly once', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'account-aud-funding')
    const base = {
      amountUnits: '5000000',
      environment: 'sandbox' as const,
      commandRef: 'account-funding:one',
      idempotencyKey: 'account-funding:one',
      inputDigest: `sha256:${'a'.repeat(64)}`,
      successReturnRef: 'owner/credit',
      operationKey: 'moneyAccountFunding:reserve',
      correlationId: 'account-funding:one',
    }
    const reserved = await fixture.owner.mutation(
      reserve,
      await withSourceWrite('billing', base),
    )
    expect(reserved).toMatchObject({
      kind: 'accepted',
      command: {
        accountRef: fixture.canonicalAccountRef,
        actorPrincipalRef: fixture.canonicalPrincipalRef,
        currency: 'AUD',
        exponent: 6,
        principalUnits: '5000000',
        serviceFeeUnits: '250000',
        taxUnits: '30000',
        totalUnits: '5280000',
        state: 'pending',
      },
    })
    if (reserved.kind !== 'accepted') throw new Error('funding fixture not reserved')

    const evidence = {
      externalRef: 'cs_redacted_funding_one',
      amount: { currency: 'AUD', units: '5280000', exponent: 6 },
      status: 'succeeded' as const,
      evidenceRef: 'stripe:checkout:cs_redacted_funding_one',
      requestDigest: `sha256:${'b'.repeat(64)}`,
      metadataDigest: reserved.command.metadataDigest!,
      checkoutSessionDigest: `sha256:${'c'.repeat(64)}`,
      paymentIntentDigest: `sha256:${'d'.repeat(64)}`,
      evidenceDigest: `sha256:${'e'.repeat(64)}`,
      paymentId: 'pi_redacted_funding_one',
    }
    await expect(fixture.owner.mutation(bind, await withSourceWrite('billing', {
      commandRef: base.commandRef,
      evidence,
      operationKey: 'moneyAccountFunding:bind',
      correlationId: base.correlationId,
    }))).resolves.toMatchObject({
      kind: 'accepted',
      command: { externalRef: evidence.externalRef, state: 'pending' },
    })

    const event = {
      kind: 'checkout' as const,
      stripeEventId: 'evt_redacted_funding_one',
      eventType: 'checkout.session.completed' as const,
      externalRef: evidence.externalRef,
      sessionId: evidence.externalRef,
      commandRef: base.commandRef,
      paymentId: evidence.paymentId,
      checkoutSessionDigest: evidence.checkoutSessionDigest,
      paymentIntentDigest: evidence.paymentIntentDigest,
      status: 'paid' as const,
      amount: evidence.amount,
      metadataDigest: evidence.metadataDigest,
      payloadDigest: `sha256:${'f'.repeat(64)}`,
      observedAt: 1_800_000_000_000,
    }
    const applyArgs = {
      event,
      readback: evidence,
      operationKey: 'moneyAccountFunding:applyVerifiedEvent',
      correlationId: event.stripeEventId,
    }
    await expect(fixture.owner.mutation(
      applyVerifiedEvent,
      await withSourceWrite('billing', applyArgs),
    )).resolves.toMatchObject({ kind: 'accepted', status: 'applied' })
    await expect(fixture.owner.mutation(
      applyVerifiedEvent,
      await withSourceWrite('billing', applyArgs),
    )).resolves.toMatchObject({ kind: 'accepted', status: 'replayed' })
    await expect(fixture.owner.query(readBalance, {})).resolves.toMatchObject({
      kind: 'available',
      accountRef: fixture.canonicalAccountRef,
      balance: { currency: 'AUD', exponent: 6, units: '5000000' },
      locked: false,
    })

    await expect(backend.run(async (ctx) => ({
      command: await ctx.db.query('moneyFundingCommands')
        .withIndex('by_commandRef', (query) => query.eq('commandRef', base.commandRef))
        .unique(),
      transactions: await ctx.db.query('moneyLedgerTransactions').collect(),
      customerBalance: await ctx.db.query('moneyBalanceProjections')
        .withIndex('by_accountRef_and_asset', (query) => query
          .eq('accountRef', fixture.canonicalAccountRef)
          .eq('asset', 'AUD'))
        .unique(),
      stripeEvents: await ctx.db.query('moneyStripeEvents').collect(),
      documents: await ctx.db.query('moneyDocuments')
        .withIndex('by_accountRef_and_createdAt', (query) => query.eq('accountRef', fixture.canonicalAccountRef))
        .collect(),
    }))).resolves.toMatchObject({
      command: {
        state: 'succeeded',
        appliedTransactionRef: canonicalDigest({
          format: 'ae.account-funding-settlement:v1',
          commandRef: base.commandRef,
        }),
      },
      transactions: [expect.objectContaining({ debitUnits: '5280000', creditUnits: '5280000' })],
      customerBalance: { balanceUnits: '5000000' },
      stripeEvents: [expect.objectContaining({ status: 'applied' })],
      documents: expect.arrayContaining([
        expect.objectContaining({
          kind: 'funding_receipt',
          amountUnits: '5000000',
          sourceTransactionRefs: [canonicalDigest({
            format: 'ae.account-funding-settlement:v1',
            commandRef: base.commandRef,
          })],
        }),
        expect.objectContaining({
          kind: 'service_fee_document',
          amountUnits: '280000',
        }),
      ]),
    })

    await expect(backend.mutation(internal.moneyAdjustments.record, {
      adjustmentRef: 'adjustment:funding-one',
      accountRef: fixture.canonicalAccountRef,
      direction: 'credit',
      amountUnits: '500000',
      reasonCode: 'processor_correction',
      evidenceRefs: ['evidence:processor-correction'],
      policyRefs: reserved.command.commercialPolicyRefs,
      policyDigest: reserved.command.commercialPolicyDigest,
      occurredAt: event.observedAt + 1,
    })).resolves.toMatchObject({ kind: 'posted' })
    await expect(backend.mutation(internal.moneyAdjustments.record, {
      adjustmentRef: 'adjustment:funding-one',
      accountRef: fixture.canonicalAccountRef,
      direction: 'credit',
      amountUnits: '500000',
      reasonCode: 'processor_correction',
      evidenceRefs: ['evidence:processor-correction'],
      policyRefs: reserved.command.commercialPolicyRefs,
      policyDigest: reserved.command.commercialPolicyDigest,
      occurredAt: event.observedAt + 1,
    })).resolves.toMatchObject({ kind: 'replayed' })
    await expect(fixture.owner.query(readBalance, {})).resolves.toMatchObject({
      kind: 'available',
      balance: { units: '5500000' },
    })
    await expect(backend.run(async (ctx) => ({
      adjustments: await ctx.db.query('moneyLedgerTransactions')
        .withIndex('by_transactionRef', (query) => query
          .eq('transactionRef', 'journal:funding-adjustment:adjustment:funding-one'))
        .collect(),
      documents: await ctx.db.query('moneyDocuments')
        .withIndex('by_accountRef_and_createdAt', (query) => query.eq('accountRef', fixture.canonicalAccountRef))
        .collect(),
    }))).resolves.toMatchObject({
      adjustments: [expect.objectContaining({ kind: 'funding_adjustment', state: 'posted' })],
      documents: expect.arrayContaining([
        expect.objectContaining({ kind: 'adjustment', amountUnits: '500000' }),
      ]),
    })
  })

  it('rounds a statement once after summing exact six-decimal Calls and retains the residual', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'account-statement')
    const periodStart = Date.UTC(2026, 7, 1)
    const periodEnd = Date.UTC(2026, 8, 1)
    const sourceTransactions = [
      { transactionRef: 'journal:call-settlement:statement-one', units: '1000001', at: periodStart + 1 },
      { transactionRef: 'journal:call-settlement:statement-two', units: '2000004', at: periodStart + 2 },
    ]
    await backend.run(async (ctx) => {
      for (const transaction of sourceTransactions) {
        await ctx.db.insert('moneyLedgerTransactions', {
          transactionRef: transaction.transactionRef,
          accountRef: fixture.canonicalAccountRef,
          kind: 'call_settlement',
          asset: 'AUD',
          exponent: 6,
          idempotencyKey: transaction.transactionRef,
          inputDigest: `sha256:${'1'.repeat(64)}`,
          journalDigest: `sha256:${'2'.repeat(64)}`,
          debitUnits: transaction.units,
          creditUnits: transaction.units,
          state: 'posted',
          evidenceRefs: [`evidence:${transaction.transactionRef}`],
          occurredAt: transaction.at,
          recordedAt: transaction.at,
        })
      }
    })
    const createStatement = anyApi.moneyDocuments?.createOwnerStatement
    const listDocuments = anyApi.moneyDocuments?.listOwnerDocuments
    const renderDocument = anyApi.moneyDocumentRender?.renderOwnerDocument
    if (createStatement === undefined || listDocuments === undefined || renderDocument === undefined) {
      throw new Error('Money document functions missing')
    }
    const created = await fixture.owner.mutation(createStatement, {
      environment: 'sandbox',
      periodStart,
      periodEnd,
    })
    expect(created).toMatchObject({ kind: 'created' })
    if (created.kind !== 'created') throw new Error('Statement not created')
    await expect(fixture.owner.mutation(createStatement, {
      environment: 'sandbox',
      periodStart,
      periodEnd,
    })).resolves.toEqual({ kind: 'replayed', documentRef: created.documentRef })
    await expect(fixture.owner.action(renderDocument, {
      documentRef: created.documentRef,
    })).resolves.toMatchObject({ kind: 'available' })
    const documents = await fixture.owner.query(listDocuments, {
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(documents.page).toContainEqual(expect.objectContaining({
      documentRef: created.documentRef,
      kind: 'statement',
      amountUnits: '3000000',
      residualUnits: '-5',
      sourceTransactionRefs: sourceTransactions.map(({ transactionRef }) => transactionRef),
      rendered: true,
    }))
  })

  it('refuses production before a PaymentIntent when commercial approvals are absent', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'account-aud-funding-production')
    await expect(fixture.owner.mutation(reserve, await withSourceWrite('billing', {
      amountUnits: '5000000',
      environment: 'production',
      commandRef: 'account-funding:production',
      idempotencyKey: 'account-funding:production',
      inputDigest: `sha256:${'1'.repeat(64)}`,
      successReturnRef: 'owner/credit',
      operationKey: 'moneyAccountFunding:reserve',
      correlationId: 'account-funding:production',
    }))).resolves.toEqual({
      kind: 'refused',
      code: 'commercial_policy_required',
      retryable: false,
    })
    await expect(backend.run(async (ctx) => ({
      commands: await ctx.db.query('moneyFundingCommands').collect(),
      transactions: await ctx.db.query('moneyLedgerTransactions').collect(),
    }))).resolves.toEqual({ commands: [], transactions: [] })
  })
})
