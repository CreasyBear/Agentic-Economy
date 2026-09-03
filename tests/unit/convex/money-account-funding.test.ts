/// <reference types="vite/client" />
import { anyApi, makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { internal } from '../../../convex/_generated/api'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'
import { createCustomerRequestServiceAssertion, toStableHashValue } from '@/modules/agent-access/service-auth-envelope'
import { issuedAgentGrantRef } from '@/modules/agent-access/issued-agent-binding'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { ConvexFixtureBackend } from '../../helpers/convex-fixtures'

const reserve = anyApi.moneyAccountFunding?.reserve
const bind = anyApi.moneyAccountFunding?.bind
const signDailyClose = anyApi.moneyDocuments?.signOwnerDailyClose
const listCases = anyApi.moneyReconciliationCases?.listOwnerCases
const reserveAgentHandoff = anyApi.moneyAccountFunding?.reserveAgentHandoff
const bindAgentHandoff = anyApi.moneyAccountFunding?.bindAgentHandoff
const readAgentHandoff = anyApi.moneyAccountFunding?.readAgentHandoff
const readPayerSafeHandoff = anyApi.moneyAccountFunding?.readPayerSafeHandoff
if (reserve === undefined || bind === undefined || signDailyClose === undefined || listCases === undefined) {
  throw new Error('Account funding functions missing')
}

const SERVICE_KEY = 'funding-handoff-test-key-material-32-bytes'
const registerBinding = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'agentAccessPrincipals:registerIssuedAgentBindingForServer',
)

async function issueBuyerAgent(
  backend: ConvexFixtureBackend,
  owner: ReturnType<ConvexFixtureBackend['withIdentity']>,
  subject: string,
): Promise<AgentAccessPrincipal> {
  const now = Date.now()
  const issuanceKey = `funding-${subject}`
  const input = {
    issuanceKey, grantRef: issuedAgentGrantRef(subject, issuanceKey), credentialId: `credential:${subject}`,
    displayName: `${subject} buyer`, applicationRef: 'agentic-economy', environment: 'sandbox' as const,
    scopes: ['market_operations:invoke'], authorityMode: 'inspect_only' as const,
    operationAccess: 'all_admitted' as const, operationRefs: [] as string[],
    policy: defaultSandboxAgentAccessPolicy({ currency: 'AUD', exponent: 6 }), createdAt: now, expiresAt: now + 600_000,
  }
  const serviceAuth = await createCustomerRequestServiceAssertion({
    key: SERVICE_KEY, operation: 'agentAccessPrincipals.registerIssuedAgentBindingForServer',
    command: toStableHashValue({ ...input, scopes: [...input.scopes] }),
    principal: { principalId: 'ae:server-function', ownerId: 'ae:server-function', credentialId: 'ae:server-function', scopes: ['market_operations:invoke'] },
    issuedAt: now,
  })
  const result = await owner.mutation(registerBinding, { ...input, serviceAuth })
  if (result.kind !== 'recorded' && result.kind !== 'replayed') throw new Error(`buyer_binding_failed:${JSON.stringify(result)}`)
  const stored = await backend.run(async (ctx) => ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (index) => index.eq('credentialId', input.credentialId)).unique())
  if (stored === null) throw new Error('buyer_principal_missing')
  return {
    principalId: stored.principalId, ownerId: stored.ownerId, credentialId: stored.credentialId,
    applicationRef: stored.applicationRef, environment: stored.environment, scopes: [...stored.scopes], authorityMode: stored.authorityMode,
  }
}

describe('Account AUD funding through Formance', () => {
  const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
  beforeEach(() => { process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY })
  afterEach(() => {
    if (previousServiceKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServiceKey
  })

  it('binds an agent handoff to one principal while exposing only a payer-safe receipt', async () => {
    if (reserveAgentHandoff === undefined || bindAgentHandoff === undefined || readAgentHandoff === undefined || readPayerSafeHandoff === undefined) {
      throw new Error('Agent funding handoff functions missing')
    }
    const backend = convexTestWithMarketComponents()
    const firstOwner = await publishedBusinessOwner(backend, 'funding-agent-first')
    const secondOwner = await publishedBusinessOwner(backend, 'funding-agent-second')
    const first = await issueBuyerAgent(backend, firstOwner.owner, 'user_funding-agent-first')
    const second = await issueBuyerAgent(backend, secondOwner.owner, 'user_funding-agent-second')
    const checkoutExpiresAt = (Math.floor(Date.now() / 1000) + 3600) * 1000
    const command = {
      principalAmountUnits: '5000000', environment: 'sandbox' as const, idempotencyKey: 'caller-key-one',
      successReturnRef: 'https://ae.test/fund/{CHECKOUT_SESSION_ID}', cancelReturnRef: 'https://ae.test/fund/cancelled',
      checkoutExpiresAt, agentPrincipal: first, operationKey: 'moneyAccountFunding:reserveAgentHandoff', correlationId: 'funding-agent-one',
    }
    const reserved = await backend.mutation(reserveAgentHandoff, await withSourceWrite('billing', command))
    expect(reserved).toMatchObject({ kind: 'accepted', command: {
      initiationKind: 'agent_handoff', checkoutMode: 'hosted_page', principalUnits: '5000000',
      accountRef: first.ownerId, actorPrincipalRef: first.principalId,
    } })
    if (reserved.kind !== 'accepted' || reserved.command.metadataDigest === undefined) throw new Error('handoff_not_reserved')
    expect(reserved.command.idempotencyKey).not.toContain('caller-key-one')
    await expect(backend.mutation(reserveAgentHandoff, await withSourceWrite('billing', command)))
      .resolves.toMatchObject({ kind: 'accepted', command: { commandRef: reserved.command.commandRef } })
    const evidence = {
      externalRef: 'cs_agent_handoff_one', amount: { currency: 'AUD' as const, exponent: 6 as const, units: reserved.command.totalUnits },
      status: 'pending' as const, evidenceRef: 'stripe:checkout:cs_agent_handoff_one', requestDigest: `sha256:${'2'.repeat(64)}`,
      metadataDigest: reserved.command.metadataDigest, checkoutSessionDigest: `sha256:${'3'.repeat(64)}`,
      evidenceDigest: `sha256:${'4'.repeat(64)}`, checkoutStatus: 'open' as const, paymentStatus: 'unpaid' as const,
      checkoutMode: 'hosted_page' as const, checkoutExpiresAt,
    }
    await expect(backend.mutation(bindAgentHandoff, await withSourceWrite('billing', {
      commandRef: reserved.command.commandRef, evidence, agentPrincipal: first,
      operationKey: 'moneyAccountFunding:bindAgentHandoff', correlationId: 'funding-agent-bind',
    }))).resolves.toMatchObject({ kind: 'accepted', command: { externalRef: evidence.externalRef } })
    await expect(backend.mutation(readAgentHandoff, await withSourceWrite('billing', {
      externalRef: evidence.externalRef, agentPrincipal: second,
      operationKey: 'moneyAccountFunding:readAgentHandoff', correlationId: 'funding-agent-cross-read',
    }))).resolves.toEqual({ kind: 'refused', code: 'funding_pending', retryable: false })
    const publicRead = await backend.query(readPayerSafeHandoff, { externalRef: evidence.externalRef })
    expect(publicRead).toEqual({ kind: 'found', funding: {
      state: 'awaiting_payment', agentName: 'user_funding-agent-first buyer',
      creditAmount: { currency: 'AUD', exponent: 6, units: '5000000' },
    } })
    expect(JSON.stringify(publicRead)).not.toMatch(/account|owner|checkoutUrl|serviceFee|tax|credential|commandRef/u)
  })
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
    const redeliveredArgs = await withSourceWrite('billing', {
      ...actionArgs,
      event: { ...event, payloadDigest: `sha256:${'0'.repeat(64)}` },
    })
    await expect(fixture.owner.mutation(
      internal.moneyAccountFunding.prepareVerifiedEvent,
      redeliveredArgs,
    )).resolves.toEqual({
      kind: 'accepted', status: 'replayed', appliedRef: formanceTransactionRef,
    })
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

  it('records delayed payment as processing without failing or crediting the command', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'formance-funding-processing')
    const reserved = await fixture.owner.mutation(reserve, await withSourceWrite('billing', {
      amountUnits: '5000000', environment: 'sandbox', commandRef: 'account-funding:processing',
      idempotencyKey: 'account-funding:processing', inputDigest: `sha256:${'1'.repeat(64)}`,
      successReturnRef: 'owner/credit', operationKey: 'moneyAccountFunding:reserve',
      correlationId: 'account-funding:processing',
    }))
    if (reserved.kind !== 'accepted' || reserved.command.metadataDigest === undefined) {
      throw new Error('funding fixture not reserved')
    }
    const readback = {
      externalRef: 'cs_processing',
      amount: { currency: 'AUD' as const, units: reserved.command.totalUnits, exponent: 6 as const },
      status: 'pending' as const, evidenceRef: 'stripe:checkout:cs_processing',
      requestDigest: `sha256:${'2'.repeat(64)}`, metadataDigest: reserved.command.metadataDigest,
      checkoutSessionDigest: `sha256:${'3'.repeat(64)}`, evidenceDigest: `sha256:${'4'.repeat(64)}`,
      checkoutStatus: 'complete' as const, paymentStatus: 'unpaid' as const,
    }
    const event = {
      kind: 'checkout' as const, stripeEventId: 'evt_processing',
      eventType: 'checkout.session.completed' as const, externalRef: readback.externalRef,
      sessionId: readback.externalRef, commandRef: reserved.command.commandRef,
      checkoutSessionDigest: readback.checkoutSessionDigest, status: 'processing' as const,
      amount: readback.amount, metadataDigest: readback.metadataDigest,
      payloadDigest: `sha256:${'5'.repeat(64)}`, observedAt: 1_800_000_000_002,
    }
    const result = await fixture.owner.mutation(internal.moneyAccountFunding.prepareVerifiedEvent,
      await withSourceWrite('billing', {
        event, readback, operationKey: 'moneyAccountFunding:applyVerifiedEvent', correlationId: event.stripeEventId,
      }))
    expect(result).toEqual({ kind: 'accepted', status: 'ignored' })
    const rows = await backend.run(async (ctx) => ({
      command: await ctx.db.query('moneyFundingCommands')
        .withIndex('by_commandRef', (query) => query.eq('commandRef', reserved.command.commandRef)).unique(),
      stripeEvents: await ctx.db.query('moneyStripeEvents').collect(),
    }))
    expect(rows.command).toMatchObject({ state: 'pending', providerStatus: 'pending' })
    expect(rows.stripeEvents).toEqual([expect.objectContaining({ status: 'ignored' })])
  })

  it('books one full Stripe refund reversal and replays the same immutable Formance reference', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'formance-funding-refund')
    const commandRef = 'account-funding:refund-one'
    const paymentId = 'pi_refund_one'
    await insertSettledFunding(backend, {
      accountRef: fixture.canonicalAccountRef,
      actorPrincipalRef: fixture.canonicalPrincipalRef,
      commandRef,
      paymentId,
    })
    const event = refundEvent({
      stripeEventId: 'evt_refund_one',
      refundId: 're_refund_one',
      paymentId,
      observedAt: 1_800_000_000_100,
    })
    const refundReadback = refundEvidence(event)
    const actionArgs = await withSourceWrite('billing', {
      event,
      refundReadback,
      operationKey: 'moneyAccountFunding:applyVerifiedEvent',
      correlationId: event.stripeEventId,
    })

    await expect(fixture.owner.mutation(
      internal.moneyAccountFunding.prepareVerifiedEvent,
      actionArgs,
    )).resolves.toMatchObject({
      kind: 'prepared',
      bookingKind: 'reversal',
      booking: {
        commandRef: 'funding-reversal:re_refund_one',
        accountRef: fixture.canonicalAccountRef,
        principalUnits: '5000000',
        serviceFeeUnits: '250000',
        taxUnits: '30000',
        totalUnits: '5280000',
      },
    })

    const reversalRef = 'formance:tx:funding-reversal-one'
    await expect(fixture.owner.mutation(internal.moneyAccountFunding.finalizeVerifiedRefund, {
      ...actionArgs,
      formanceTransactionRef: reversalRef,
    })).resolves.toEqual({ kind: 'accepted', status: 'applied', appliedRef: reversalRef })
    await expect(fixture.owner.mutation(internal.moneyAccountFunding.finalizeVerifiedRefund, {
      ...actionArgs,
      formanceTransactionRef: reversalRef,
    })).resolves.toEqual({ kind: 'accepted', status: 'replayed', appliedRef: reversalRef })
    const redeliveredArgs = await withSourceWrite('billing', {
      ...actionArgs,
      event: { ...event, payloadDigest: `sha256:${'0'.repeat(64)}` },
    })
    await expect(fixture.owner.mutation(
      internal.moneyAccountFunding.prepareVerifiedEvent,
      redeliveredArgs,
    )).resolves.toEqual({ kind: 'accepted', status: 'replayed', appliedRef: reversalRef })

    const rows = await backend.run(async (ctx) => ({
      command: await ctx.db.query('moneyFundingCommands')
        .withIndex('by_commandRef', (query) => query.eq('commandRef', commandRef)).unique(),
      events: await ctx.db.query('moneyStripeEvents').collect(),
      adjustment: await ctx.db.query('moneyDocuments')
        .withIndex('by_documentRef', (query) => query.eq(
          'documentRef',
          `money-document:adjustment:${reversalRef}`,
        )).unique(),
    }))
    expect(rows.command).toMatchObject({
      state: 'reversed',
      providerStatus: 'reversed',
      reversalState: 'succeeded',
      reversalRefundId: event.refundId,
      reversalTransactionRef: reversalRef,
    })
    expect(rows.events).toEqual([
      expect.objectContaining({
        stripeEventId: event.stripeEventId,
        status: 'applied',
        appliedRef: reversalRef,
      }),
    ])
    expect(rows.adjustment).toMatchObject({
      kind: 'adjustment',
      sourceTransactionRefs: [reversalRef],
      amountUnits: '5280000',
    })
  })

  it('locks only the affected Account for partial refunds and never prepares a posting', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'formance-funding-partial-refund')
    const commandRef = 'account-funding:partial-refund'
    const paymentId = 'pi_partial_refund'
    await insertSettledFunding(backend, {
      accountRef: fixture.canonicalAccountRef,
      actorPrincipalRef: fixture.canonicalPrincipalRef,
      commandRef,
      paymentId,
    })
    const firstEvent = refundEvent({
      stripeEventId: 'evt_partial_refund_one',
      refundId: 're_partial_refund_one',
      paymentId,
      amountUnits: '100',
      observedAt: 1_800_000_000_200,
    })
    const secondEvent = refundEvent({
      stripeEventId: 'evt_partial_refund_two',
      refundId: 're_partial_refund_two',
      paymentId,
      amountUnits: '200',
      observedAt: 1_800_000_000_300,
    })
    for (const event of [firstEvent, secondEvent]) {
      await expect(fixture.owner.mutation(
        internal.moneyAccountFunding.prepareVerifiedEvent,
        await withSourceWrite('billing', {
          event,
          refundReadback: refundEvidence(event),
          operationKey: 'moneyAccountFunding:applyVerifiedEvent',
          correlationId: event.stripeEventId,
        }),
      )).resolves.toMatchObject({ kind: 'accepted', status: 'ignored' })
    }

    const rows = await backend.run(async (ctx) => ({
      command: await ctx.db.query('moneyFundingCommands')
        .withIndex('by_commandRef', (query) => query.eq('commandRef', commandRef)).unique(),
      cases: await ctx.db.query('moneyReconciliationCases').collect(),
      events: await ctx.db.query('moneyStripeEvents').collect(),
    }))
    expect(rows.command).toMatchObject({ state: 'succeeded' })
    expect(rows.cases).toHaveLength(1)
    expect(rows.cases[0]).toMatchObject({
      accountRef: fixture.canonicalAccountRef,
      scopeType: 'account',
      scopeRef: fixture.canonicalAccountRef,
      reasonCode: 'funding_refund_not_full',
      status: 'open',
    })
    expect(rows.cases[0]?.evidenceRefs).toEqual(expect.arrayContaining([
      firstEvent.refundId,
      secondEvent.refundId,
    ]))
    expect(rows.events).toHaveLength(2)
    await expect(fixture.owner.query(listCases, {
      paginationOpts: { numItems: 10, cursor: null },
    })).resolves.toMatchObject({ page: [expect.objectContaining({ scopeType: 'account' })] })
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

type ConvexBackend = ReturnType<typeof convexTestWithMarketComponents>

async function insertSettledFunding(
  backend: ConvexBackend,
  input: Readonly<{
    accountRef: string
    actorPrincipalRef: string
    commandRef: string
    paymentId: string
  }>,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('moneyFundingCommands', {
      commandRef: input.commandRef,
      accountRef: input.accountRef,
      legalCustomerRef: `legal-customer:${input.accountRef}`,
      actorPrincipalRef: input.actorPrincipalRef,
      environment: 'sandbox',
      currency: 'AUD',
      exponent: 6,
      principalUnits: '5000000',
      serviceFeeUnits: '250000',
      taxUnits: '30000',
      totalUnits: '5280000',
      commercialPolicyDigest: `sha256:${'1'.repeat(64)}`,
      commercialPolicyRefs: ['commercial-policy:sandbox'],
      idempotencyKey: input.commandRef,
      inputDigest: `sha256:${'2'.repeat(64)}`,
      successReturnRef: 'owner/credit',
      providerRecoveryDeadlineAt: 1_900_000_000_000,
      state: 'succeeded',
      externalRef: `cs_${input.paymentId}`,
      providerStatus: 'succeeded',
      paymentId: input.paymentId,
      appliedStripeEventId: `evt_${input.paymentId}`,
      appliedPayloadDigest: `sha256:${'3'.repeat(64)}`,
      appliedTransactionRef: `formance:tx:${input.paymentId}`,
      createdAt: 1_800_000_000_000,
      updatedAt: 1_800_000_000_000,
    })
  })
}

function refundEvent(input: Readonly<{
  stripeEventId: string
  refundId: string
  paymentId: string
  amountUnits?: string
  observedAt: number
}>) {
  return {
    kind: 'refund' as const,
    stripeEventId: input.stripeEventId,
    eventType: 'refund.updated' as const,
    externalRef: input.refundId,
    refundId: input.refundId,
    paymentId: input.paymentId,
    chargeId: `ch_${input.paymentId}`,
    refundDigest: `sha256:${'4'.repeat(64)}`,
    status: 'succeeded' as const,
    amount: {
      currency: 'AUD',
      units: input.amountUnits ?? '528',
      exponent: 2,
    },
    payloadDigest: `sha256:${'5'.repeat(64)}`,
    observedAt: input.observedAt,
  }
}

function refundEvidence(event: ReturnType<typeof refundEvent>) {
  return {
    refundId: event.refundId,
    paymentId: event.paymentId,
    chargeId: event.chargeId,
    status: event.status,
    amount: event.amount,
    refundDigest: event.refundDigest,
    evidenceDigest: `sha256:${'6'.repeat(64)}`,
    evidenceRef: `stripe:refund:${event.refundId}`,
    observedAt: event.observedAt,
  }
}
