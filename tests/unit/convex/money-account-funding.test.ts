/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { internal } from '../../../convex/_generated/api'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const reserve = anyApi.moneyAccountFunding?.reserve
const bind = anyApi.moneyAccountFunding?.bind
const signDailyClose = anyApi.moneyDocuments?.signOwnerDailyClose
const listCases = anyApi.moneyReconciliationCases?.listOwnerCases
if (reserve === undefined || bind === undefined || signDailyClose === undefined || listCases === undefined) {
  throw new Error('Account funding functions missing')
}

describe('Account AUD funding through Formance', () => {
  it('prepares one exact booking and finalizes only the returned Formance reference', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'formance-account-funding')
    const base = {
      amountUnits: '5000000', environment: 'sandbox' as const,
      commandRef: 'account-funding:formance-one', idempotencyKey: 'account-funding:formance-one',
      inputDigest: `sha256:${'a'.repeat(64)}`, successReturnRef: 'owner/credit',
      operationKey: 'moneyAccountFunding:reserve', correlationId: 'account-funding:formance-one',
    }
    const reserved = await fixture.owner.mutation(reserve, await withSourceWrite('billing', base))
    expect(reserved).toMatchObject({ kind: 'accepted', command: {
      accountRef: fixture.canonicalAccountRef, principalUnits: '5000000', serviceFeeUnits: '250000',
      taxUnits: '30000', totalUnits: '5280000', state: 'pending',
    } })
    if (reserved.kind !== 'accepted' || reserved.command.metadataDigest === undefined) {
      throw new Error('funding fixture not reserved')
    }
    const evidence = {
      externalRef: 'cs_redacted_funding_formance_one',
      amount: { currency: 'AUD' as const, units: '5280000', exponent: 6 as const },
      status: 'succeeded' as const, evidenceRef: 'stripe:checkout:cs_redacted_funding_formance_one',
      requestDigest: `sha256:${'b'.repeat(64)}`, metadataDigest: reserved.command.metadataDigest,
      checkoutSessionDigest: `sha256:${'c'.repeat(64)}`, paymentIntentDigest: `sha256:${'d'.repeat(64)}`,
      evidenceDigest: `sha256:${'e'.repeat(64)}`, paymentId: 'pi_redacted_funding_formance_one',
    }
    await expect(fixture.owner.mutation(bind, await withSourceWrite('billing', {
      commandRef: base.commandRef, evidence, operationKey: 'moneyAccountFunding:bind',
      correlationId: base.correlationId,
    }))).resolves.toMatchObject({ kind: 'accepted', command: { state: 'pending' } })
    const event = {
      kind: 'checkout' as const, stripeEventId: 'evt_redacted_funding_formance_one',
      eventType: 'checkout.session.completed' as const, externalRef: evidence.externalRef,
      sessionId: evidence.externalRef, commandRef: base.commandRef, paymentId: evidence.paymentId,
      checkoutSessionDigest: evidence.checkoutSessionDigest, paymentIntentDigest: evidence.paymentIntentDigest,
      status: 'paid' as const, amount: evidence.amount, metadataDigest: evidence.metadataDigest,
      payloadDigest: `sha256:${'f'.repeat(64)}`, observedAt: 1_800_000_000_000,
    }
    const actionArgs = await withSourceWrite('billing', {
      event, readback: evidence, operationKey: 'moneyAccountFunding:applyVerifiedEvent',
      correlationId: event.stripeEventId,
    })
    const prepared = await fixture.owner.mutation(internal.moneyAccountFunding.prepareVerifiedEvent, actionArgs)
    expect(prepared).toMatchObject({ kind: 'prepared', booking: {
      commandRef: base.commandRef, accountRef: fixture.canonicalAccountRef,
      principalUnits: '5000000', serviceFeeUnits: '250000', taxUnits: '30000', totalUnits: '5280000',
    } })
    const formanceTransactionRef = 'formance:tx:funding-formance-one'
    await expect(fixture.owner.mutation(internal.moneyAccountFunding.finalizeVerifiedEvent, {
      ...actionArgs, formanceTransactionRef,
    })).resolves.toEqual({ kind: 'accepted', status: 'applied', appliedRef: formanceTransactionRef })
    await expect(fixture.owner.mutation(internal.moneyAccountFunding.finalizeVerifiedEvent, {
      ...actionArgs, formanceTransactionRef,
    })).resolves.toEqual({ kind: 'accepted', status: 'replayed', appliedRef: formanceTransactionRef })
    const rows = await backend.run(async (ctx) => ({
      command: await ctx.db.query('moneyFundingCommands')
        .withIndex('by_commandRef', (query) => query.eq('commandRef', base.commandRef)).unique(),
      stripeEvents: await ctx.db.query('moneyStripeEvents').collect(),
      documents: await ctx.db.query('moneyDocuments').collect(),
    }))
    expect(rows).toMatchObject({
      command: { state: 'succeeded', appliedTransactionRef: formanceTransactionRef },
      stripeEvents: [expect.objectContaining({ status: 'applied', appliedRef: formanceTransactionRef })],
      documents: expect.arrayContaining([
        expect.objectContaining({ kind: 'funding_receipt', sourceTransactionRefs: [formanceTransactionRef] }),
        expect.objectContaining({ kind: 'service_fee_document', sourceTransactionRefs: [formanceTransactionRef] }),
      ]),
    })
  })

  it('refuses changed Stripe money before preparing a Formance booking', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'formance-funding-conflict')
    const reserved = await fixture.owner.mutation(reserve, await withSourceWrite('billing', {
      amountUnits: '5000000', environment: 'sandbox', commandRef: 'account-funding:conflict',
      idempotencyKey: 'account-funding:conflict', inputDigest: `sha256:${'1'.repeat(64)}`,
      successReturnRef: 'owner/credit', operationKey: 'moneyAccountFunding:reserve',
      correlationId: 'account-funding:conflict',
    }))
    if (reserved.kind !== 'accepted' || reserved.command.metadataDigest === undefined) {
      throw new Error('funding fixture not reserved')
    }
    const readback = {
      externalRef: 'cs_conflict',
      amount: { currency: 'AUD' as const, units: reserved.command.totalUnits, exponent: 6 as const },
      status: 'succeeded' as const, evidenceRef: 'stripe:checkout:cs_conflict',
      requestDigest: `sha256:${'2'.repeat(64)}`, metadataDigest: reserved.command.metadataDigest,
      checkoutSessionDigest: `sha256:${'3'.repeat(64)}`, paymentIntentDigest: `sha256:${'4'.repeat(64)}`,
      evidenceDigest: `sha256:${'5'.repeat(64)}`, paymentId: 'pi_conflict',
    }
    const result = await fixture.owner.mutation(internal.moneyAccountFunding.prepareVerifiedEvent,
      await withSourceWrite('billing', {
        event: {
          kind: 'checkout', stripeEventId: 'evt_conflict', eventType: 'checkout.session.completed',
          externalRef: readback.externalRef, sessionId: readback.externalRef,
          commandRef: reserved.command.commandRef, paymentId: readback.paymentId,
          checkoutSessionDigest: readback.checkoutSessionDigest,
          paymentIntentDigest: readback.paymentIntentDigest, status: 'paid',
          amount: { ...readback.amount, units: (BigInt(readback.amount.units) + 1n).toString() },
          metadataDigest: readback.metadataDigest, payloadDigest: `sha256:${'6'.repeat(64)}`,
          observedAt: 1_800_000_000_001,
        },
        readback, operationKey: 'moneyAccountFunding:applyVerifiedEvent', correlationId: 'evt_conflict',
      }))
    expect(result).toEqual({ kind: 'refused', code: 'payment_binding_invalid', retryable: false })
  })

  it('binds a daily close signature to the authenticated owner and frozen document digest', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'formance-daily-close')
    const documentRef = 'money-document:daily_close:test'
    const renderInputDigest = `sha256:${'7'.repeat(64)}`
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyDocuments', {
        documentRef,
        accountRef: fixture.canonicalAccountRef,
        kind: 'daily_close',
        sourceTransactionRefs: ['ae-p4:test:settle-buyer'],
        amountUnits: '10000',
        residualUnits: '0',
        policyRefs: ['commercial-policy:sandbox'],
        policyDigest: `sha256:${'8'.repeat(64)}`,
        templateVersion: 'ae.money-document:html:v1',
        renderInputJson: '{}',
        renderInputDigest,
        state: 'awaiting_signature',
        environment: 'sandbox',
        sourceCount: 1,
        snapshotDigest: `sha256:${'9'.repeat(64)}`,
        snapshotCutoffAt: 1_800_000_000_000,
        periodStart: 1_799_913_600_000,
        periodEnd: 1_800_000_000_000,
        pageCount: 1,
        exactAmountUnits: '10000',
        fileId: await ctx.storage.store(new Blob(['close'])),
        fileDigest: `sha256:${'a'.repeat(64)}`,
        csvFileId: await ctx.storage.store(new Blob(['close,csv'])),
        csvFileDigest: `sha256:${'b'.repeat(64)}`,
        renderedAt: 1_800_000_000_001,
        createdAt: 1_800_000_000_000,
      })
    })

    await expect(fixture.owner.mutation(signDailyClose, {
      documentRef,
      expectedRenderInputDigest: `sha256:${'0'.repeat(64)}`,
      confirmation: documentRef,
    })).resolves.toEqual({ kind: 'refused', code: 'daily_close_confirmation_invalid' })
    const signed = await fixture.owner.mutation(signDailyClose, {
      documentRef,
      expectedRenderInputDigest: renderInputDigest,
      confirmation: documentRef,
    })
    expect(signed).toMatchObject({ kind: 'signed', documentRef })
    if (signed.kind !== 'signed') throw new Error('daily close not signed')
    await expect(fixture.owner.mutation(signDailyClose, {
      documentRef,
      expectedRenderInputDigest: renderInputDigest,
      confirmation: documentRef,
    })).resolves.toEqual({ kind: 'replayed', documentRef, evidenceDigest: signed.evidenceDigest })
    await expect(fixture.owner.query(listCases, {
      paginationOpts: { numItems: 10, cursor: null },
    })).resolves.toMatchObject({ page: [] })
  })
})
