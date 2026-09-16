/// <reference types="vite/client" />
import { anyApi, makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { components, internal } from '../../../convex/_generated/api'
import { convexTestWithMarketComponents, convexTestWithWorkers, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'
import {
  am10BindEvidence,
  am10PaidCheckoutEvent,
  am10SettlementBooking,
  am10VerifiedEventArgs,
  am12RefundArgs,
  refundEvent,
  refundEvidence,
  type Am10BoundFunding,
  type Am10CheckoutEventType,
  type Am12RefundEventType,
} from '../../helpers/money-funding-fixtures'
import { createCustomerRequestServiceAssertion, toStableHashValue } from '@/modules/agent-access/service-auth-envelope'
import { issuedAgentGrantRef } from '@/modules/agent-access/issued-agent-binding'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import { CUSTOMER_REQUEST_READ_ONLY_SCOPE, MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { ConvexFixtureBackend } from '../../helpers/convex-fixtures'
import { evaluateCommercialPolicyGate } from '@/modules/money/public'

const reserve = anyApi.moneyAccountFunding?.reserve
const bind = anyApi.moneyAccountFunding?.bind
const signDailyClose = anyApi.moneyDocuments?.signOwnerDailyClose
const listCases = anyApi.moneyReconciliationCases?.listOwnerCases
const resolveOwnerCase = anyApi.moneyReconciliationCases?.resolveOwnerCase
const reserveAgentHandoff = anyApi.moneyAccountFunding?.reserveAgentHandoff
const bindAgentHandoff = anyApi.moneyAccountFunding?.bindAgentHandoff
const readAgentHandoff = anyApi.moneyAccountFunding?.readAgentHandoff
const readPayerSafeHandoff = anyApi.moneyAccountFunding?.readPayerSafeHandoff
if (
  reserve === undefined
  || bind === undefined
  || signDailyClose === undefined
  || listCases === undefined
  || resolveOwnerCase === undefined
) {
  throw new Error('Account funding functions missing')
}

const SERVICE_KEY = 'funding-handoff-test-key-material-32-bytes'
const sandboxGate = evaluateCommercialPolicyGate({
  environment: 'sandbox',
  now: 0,
  approvals: [],
  sandboxFixture: 'managed_x402_deterministic_v1',
})
if (sandboxGate.kind !== 'admitted') throw new Error('sandbox_commercial_policy_missing')
const SANDBOX_POLICY_DIGEST = sandboxGate.policyDigest
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
    scopes: [MARKET_TOOLS_CALL_SCOPE, CUSTOMER_REQUEST_READ_ONLY_SCOPE], authorityMode: 'read_only' as const,
    toolAccess: 'all_admitted' as const, toolRefs: [] as string[],
    spendingPolicy: defaultSandboxAgentAccessPolicy({ currency: 'AUD', exponent: 6 }), createdAt: now, expiresAt: now + 600_000,
  }
  const serviceAuth = await createCustomerRequestServiceAssertion({
    key: SERVICE_KEY, operation: 'agentAccessPrincipals.registerIssuedAgentBindingForServer',
    command: toStableHashValue({ ...input, scopes: [...input.scopes] }),
    principal: { principalId: 'ae:server-function', ownerId: 'ae:server-function', credentialId: 'ae:server-function', scopes: [MARKET_TOOLS_CALL_SCOPE] },
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

type ConvexBackend = ReturnType<typeof convexTestWithMarketComponents>
type PublishedOwner = Awaited<ReturnType<typeof publishedBusinessOwner>>
type OwnerCheckoutBindEvidence = ReturnType<typeof am10BindEvidence>

const sha256 = (char: string) => `sha256:${char.repeat(64)}`

function ownerReserveInput(
  commandRef: string,
  overrides: Partial<{
    amountUnits: string
    expectedPolicyDigest: string
    inputDigest: string
    correlationId: string
    idempotencyKey: string
  }> = {},
) {
  return {
    amountUnits: '5000000',
    environment: 'sandbox' as const,
    expectedPolicyDigest: SANDBOX_POLICY_DIGEST,
    commandRef,
    idempotencyKey: overrides.idempotencyKey ?? commandRef,
    inputDigest: sha256('a'),
    successReturnRef: 'owner/credit',
    operationKey: 'moneyAccountFunding:reserve',
    correlationId: overrides.correlationId ?? commandRef,
    ...overrides,
  }
}

function ownerCheckoutBindEvidence(
  metadataDigest: string,
  input: Readonly<{ externalRef: string; paymentId: string; digestChars?: readonly [string, string, string, string] }>,
): OwnerCheckoutBindEvidence {
  const [request, checkout, payment, evidence] = input.digestChars ?? ['b', 'c', 'd', 'e']
  return {
    externalRef: input.externalRef,
    amount: { currency: 'AUD' as const, units: '5280000', exponent: 6 as const },
    status: 'succeeded' as const,
    evidenceRef: `stripe:checkout:${input.externalRef}`,
    requestDigest: sha256(request),
    metadataDigest,
    checkoutSessionDigest: sha256(checkout),
    paymentIntentDigest: sha256(payment),
    evidenceDigest: sha256(evidence),
    paymentId: input.paymentId,
  }
}

function checkoutPaidEvent(
  input: Readonly<{
    stripeEventId: string
    commandRef: string
    evidence: OwnerCheckoutBindEvidence
    payloadDigest?: string
    observedAt?: number
  }>,
) {
  return {
    kind: 'checkout' as const,
    stripeEventId: input.stripeEventId,
    eventType: 'checkout.session.completed' as const,
    externalRef: input.evidence.externalRef,
    sessionId: input.evidence.externalRef,
    commandRef: input.commandRef,
    paymentId: input.evidence.paymentId,
    checkoutSessionDigest: input.evidence.checkoutSessionDigest,
    paymentIntentDigest: input.evidence.paymentIntentDigest,
    status: 'paid' as const,
    amount: input.evidence.amount,
    metadataDigest: input.evidence.metadataDigest,
    payloadDigest: input.payloadDigest ?? sha256('f'),
    observedAt: input.observedAt ?? 1_800_000_000_000,
  }
}

async function ownerReserve(
  fixture: PublishedOwner,
  commandRef: string,
  overrides?: Parameters<typeof ownerReserveInput>[1],
) {
  return await fixture.owner.mutation(reserve!, await withSourceWrite('billing', ownerReserveInput(commandRef, overrides)))
}

async function ownerBindCheckout(
  fixture: PublishedOwner,
  commandRef: string,
  evidence: OwnerCheckoutBindEvidence,
  correlationId = commandRef,
) {
  return await fixture.owner.mutation(bind!, await withSourceWrite('billing', {
    commandRef, evidence, operationKey: 'moneyAccountFunding:bind', correlationId,
  }))
}

async function publishedOwnerFixture(slug: string) {
  const backend = convexTestWithMarketComponents()
  const fixture = await publishedBusinessOwner(backend, slug)
  return { backend, fixture }
}

async function workpoolFixture(slug: string, maxParallelism = 1) {
  vi.useFakeTimers()
  const backend = convexTestWithWorkers()
  await backend.run(async (ctx) => {
    await ctx.runMutation(components.workpool.config.update, { maxParallelism })
  })
  const fixture = await publishedBusinessOwner(backend, slug)
  return { backend, fixture }
}

async function fundingRows(backend: ConvexBackend, commandRef: string) {
  return await backend.run(async (ctx) => ({
    command: await ctx.db.query('moneyFundingCommands')
      .withIndex('by_commandRef', (query) => query.eq('commandRef', commandRef)).unique(),
    stripeEvents: await ctx.db.query('moneyStripeEvents').collect(),
    documents: await ctx.db.query('moneyDocuments').collect(),
  }))
}

function expectFundingDocumentsForTransaction(
  documents: Awaited<ReturnType<typeof fundingRows>>['documents'],
  formanceTransactionRef: string,
): void {
  expect(documents).toHaveLength(2)
  expect(documents).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'funding_receipt', sourceTransactionRefs: [formanceTransactionRef] }),
    expect.objectContaining({ kind: 'service_fee_document', sourceTransactionRefs: [formanceTransactionRef] }),
  ]))
}

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
      commercialPolicyDigest: sha256('1'),
      commercialPolicyRefs: ['commercial-policy:sandbox'],
      idempotencyKey: input.commandRef,
      inputDigest: sha256('2'),
      successReturnRef: 'owner/credit',
      providerRecoveryDeadlineAt: 1_900_000_000_000,
      state: 'succeeded',
      externalRef: `cs_${input.paymentId}`,
      providerStatus: 'succeeded',
      paymentId: input.paymentId,
      appliedStripeEventId: `evt_${input.paymentId}`,
      appliedPayloadDigest: sha256('3'),
      appliedTransactionRef: `formance:tx:${input.paymentId}`,
      createdAt: 1_800_000_000_000,
      updatedAt: 1_800_000_000_000,
    })
  })
}

describe('Account AUD funding through Formance', () => {
  const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
  beforeEach(() => { process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY })
  afterEach(() => {
    vi.useRealTimers()
    if (previousServiceKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServiceKey
  })

  it('refuses a changed funding policy before creating a funding command', async () => {
    const { backend, fixture } = await publishedOwnerFixture('funding-policy-drift')
    await expect(ownerReserve(fixture, 'account-funding:policy-drift', {
      expectedPolicyDigest: sha256('0'),
      inputDigest: sha256('1'),
    })).resolves.toEqual({ kind: 'refused', code: 'price_changed', retryable: false })
    await expect(backend.run(async (ctx) => ctx.db.query('moneyFundingCommands').collect())).resolves.toEqual([])
  })

  it('quotes one owner funding command and replays it without changing the obligation', async () => {
    const { backend, fixture } = await publishedOwnerFixture('funding-owner-replay')
    const commandRef = 'account-funding:owner-replay'
    const base = ownerReserveInput(commandRef, { amountUnits: '10000000', inputDigest: sha256('2') })
    const first = await fixture.owner.mutation(reserve, await withSourceWrite('billing', base))
    expect(first).toMatchObject({ kind: 'accepted', command: {
      accountRef: fixture.canonicalAccountRef, principalUnits: '10000000',
      serviceFeeUnits: '500000', taxUnits: '50000', totalUnits: '10550000', state: 'pending',
    } })
    if (first.kind !== 'accepted') throw new Error('funding fixture not reserved')
    const storedBeforeConflict = await backend.run(async (ctx) => ctx.db.query('moneyFundingCommands').collect())

    await expect(fixture.owner.mutation(reserve, await withSourceWrite('billing', {
      ...base, correlationId: 'account-funding:owner-replay-retry',
    }))).resolves.toEqual(first)

    await expect(fixture.owner.mutation(reserve, await withSourceWrite('billing', {
      ...base, amountUnits: '11000000', expectedPolicyDigest: sha256('0'),
      inputDigest: sha256('3'), correlationId: 'account-funding:owner-replay-conflict',
    }))).resolves.toEqual({ kind: 'refused', code: 'funding_idempotency_conflict', retryable: false })

    await expect(backend.run(async (ctx) => ctx.db.query('moneyFundingCommands').collect()))
      .resolves.toEqual(storedBeforeConflict)
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

  it('AM-09 maps async_payment_failed on a bound handoff to public failed with no documents', async () => {
    const handoff = await boundAm09AgentHandoff('failed')
    const event = am09UnpaidCheckoutEvent({
      stripeEventId: 'evt_am09_async_failed',
      eventType: 'checkout.session.async_payment_failed',
      status: 'failed',
      commandRef: handoff.commandRef,
      evidence: handoff.evidence,
    })
    await expect(handoff.owner.mutation(
      internal.moneyAccountFunding.prepareVerifiedEvent,
      await withSourceWrite('billing', {
        event,
        readback: handoff.evidence,
        operationKey: 'moneyAccountFunding:applyVerifiedEvent',
        correlationId: event.stripeEventId,
      }),
    )).resolves.toEqual({ kind: 'accepted', status: 'ignored' })
    await expect(handoff.backend.query(readPayerSafeHandoff!, { externalRef: handoff.evidence.externalRef }))
      .resolves.toMatchObject({ kind: 'found', funding: { state: 'failed' } })
    const rows = await fundingRows(handoff.backend, handoff.commandRef)
    expect(rows.command).toMatchObject({ state: 'failed', terminalReason: 'async_payment_failed' })
    expect(rows.documents).toHaveLength(0)
  })

  it.each([
    {
      title: 'AM-09 maps bound expired Checkout evidence to public expired',
      slug: 'expired',
      evidenceOverrides: { checkoutStatus: 'expired' as const },
      expectedState: 'expired',
    },
    {
      title: 'AM-09 maps complete unpaid Checkout evidence to public processing',
      slug: 'processing',
      evidenceOverrides: { checkoutStatus: 'complete' as const, paymentStatus: 'unpaid' as const },
      expectedState: 'processing',
    },
  ])('$title', async ({ slug, evidenceOverrides, expectedState }) => {
    const handoff = await boundAm09AgentHandoff(slug, evidenceOverrides)
    await expect(handoff.backend.query(readPayerSafeHandoff!, { externalRef: handoff.evidence.externalRef }))
      .resolves.toMatchObject({ kind: 'found', funding: { state: expectedState } })
  })

  it.each([
    {
      title: 'AM-09 shows ready after settlement even if the browser cancelled',
      slug: 'ready',
      appliedTransactionRef: 'formance:tx:am09-ready',
    },
    {
      title: 'AM-09 keeps succeeded credit when Checkout evidence is also expired',
      slug: 'succeeded_expired',
      appliedTransactionRef: 'formance:tx:am09_succeeded_expired',
      checkoutStatus: 'expired' as const,
    },
  ])('$title', async ({ slug, appliedTransactionRef, checkoutStatus }) => {
    const handoff = await boundAm09AgentHandoff(slug, checkoutStatus === undefined ? {} : { checkoutStatus })
    await patchFundingCommand(handoff.backend, handoff.commandRef, {
      state: 'succeeded',
      appliedTransactionRef,
    })
    await expect(handoff.backend.query(readPayerSafeHandoff!, { externalRef: handoff.evidence.externalRef }))
      .resolves.toMatchObject({ kind: 'found', funding: { state: 'ready' } })
  })

  it('AM-09 treats a hyphenated Checkout session id as not found', async () => {
    if (readPayerSafeHandoff === undefined) throw new Error('Agent funding handoff functions missing')
    const backend = convexTestWithMarketComponents()
    await expect(backend.query(readPayerSafeHandoff, { externalRef: 'cs_am09_not-a-session' }))
      .resolves.toEqual({ kind: 'not_found' })
  })

  it('prepares one exact booking and finalizes only the returned Formance reference', async () => {
    const commandRef = 'account-funding:formance-one'
    const { backend, fixture } = await workpoolFixture('formance-account-funding')
    const reserved = await ownerReserve(fixture, commandRef, { inputDigest: sha256('a') })
    expect(reserved).toMatchObject({ kind: 'accepted', command: {
      accountRef: fixture.canonicalAccountRef, principalUnits: '5000000', serviceFeeUnits: '250000',
      taxUnits: '30000', totalUnits: '5280000', state: 'pending',
    } })
    if (reserved.kind !== 'accepted' || reserved.command.metadataDigest === undefined) {
      throw new Error('funding fixture not reserved')
    }
    const evidence = ownerCheckoutBindEvidence(reserved.command.metadataDigest, {
      externalRef: 'cs_redacted_funding_formance_one',
      paymentId: 'pi_redacted_funding_formance_one',
    })
    await expect(ownerBindCheckout(fixture, commandRef, evidence)).resolves.toMatchObject({
      kind: 'accepted', command: { state: 'pending' },
    })
    const event = checkoutPaidEvent({
      stripeEventId: 'evt_redacted_funding_formance_one',
      commandRef,
      evidence,
    })
    const actionArgs = await withSourceWrite('billing', {
      event, readback: evidence, operationKey: 'moneyAccountFunding:applyVerifiedEvent',
      correlationId: event.stripeEventId,
    })
    const prepared = await fixture.owner.mutation(internal.moneyAccountFunding.prepareVerifiedEvent, actionArgs)
    expect(prepared).toMatchObject({ kind: 'prepared', booking: {
      commandRef, accountRef: fixture.canonicalAccountRef,
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
      event: { ...event, payloadDigest: sha256('0') },
    })
    await expect(fixture.owner.mutation(
      internal.moneyAccountFunding.prepareVerifiedEvent,
      redeliveredArgs,
    )).resolves.toEqual({
      kind: 'accepted', status: 'replayed', appliedRef: formanceTransactionRef,
    })
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    const rows = await fundingRows(backend, commandRef)
    expect(rows).toMatchObject({
      command: { state: 'succeeded', appliedTransactionRef: formanceTransactionRef },
      stripeEvents: [expect.objectContaining({ status: 'applied', appliedRef: formanceTransactionRef })],
      documents: expect.arrayContaining([
        expect.objectContaining({ kind: 'funding_receipt', sourceTransactionRefs: [formanceTransactionRef] }),
        expect.objectContaining({ kind: 'service_fee_document', sourceTransactionRefs: [formanceTransactionRef] }),
      ]),
    })
    expect(rows.documents).toHaveLength(2)
    for (const document of rows.documents) {
      expect(document.state).toBe('issued')
      if (document.fileId === undefined) throw new Error('funding_document_file_missing')
      const fileId = document.fileId
      const html = await backend.run(async (ctx) => (await ctx.storage.get(fileId))?.text())
      expect(html).toContain(`<td>${document.amountUnits}</td>`)
      expect(html).toContain(formanceTransactionRef)
    }
  })

  it('refuses changed Stripe money before preparing a Formance booking', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'formance-funding-conflict')
    const reserved = await fixture.owner.mutation(reserve, await withSourceWrite('billing', {
      amountUnits: '5000000', environment: 'sandbox', commandRef: 'account-funding:conflict',
      expectedPolicyDigest: SANDBOX_POLICY_DIGEST,
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
      expectedPolicyDigest: SANDBOX_POLICY_DIGEST,
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
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
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
      event: { ...event, payloadDigest: sha256('0') },
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

  it('occupies one funding-command reversal for two succeeded Stripe refunds', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'formance-funding-second-refund')
    const commandRef = 'account-funding:second-refund'
    const paymentId = 'pi_second_refund'
    await insertSettledFunding(backend, {
      accountRef: fixture.canonicalAccountRef,
      actorPrincipalRef: fixture.canonicalPrincipalRef,
      commandRef,
      paymentId,
    })
    const firstEvent = refundEvent({
      stripeEventId: 'evt_second_refund_one',
      refundId: 're_second_refund_one',
      paymentId,
      observedAt: 1_800_000_000_400,
    })
    const secondEvent = refundEvent({
      stripeEventId: 'evt_second_refund_two',
      refundId: 're_second_refund_two',
      paymentId,
      observedAt: 1_800_000_000_500,
    })
    const first = await fixture.owner.mutation(
      internal.moneyAccountFunding.prepareVerifiedEvent,
      await withSourceWrite('billing', {
        event: firstEvent,
        refundReadback: refundEvidence(firstEvent),
        operationKey: 'moneyAccountFunding:applyVerifiedEvent',
        correlationId: firstEvent.stripeEventId,
      }),
    )
    expect(first).toMatchObject({
      kind: 'prepared',
      bookingKind: 'reversal',
      booking: {
        commandRef: 'funding-reversal:re_second_refund_one',
        idempotencyKey: 'funding-reversal:re_second_refund_one',
      },
    })
    const second = await fixture.owner.mutation(
      internal.moneyAccountFunding.prepareVerifiedEvent,
      await withSourceWrite('billing', {
        event: secondEvent,
        refundReadback: refundEvidence(secondEvent),
        operationKey: 'moneyAccountFunding:applyVerifiedEvent',
        correlationId: secondEvent.stripeEventId,
      }),
    )
    expect(JSON.stringify(second)).not.toContain('funding-reversal:re_second_refund_two')
    expect(second).toMatchObject({
      kind: 'prepared',
      bookingKind: 'reversal',
      booking: {
        commandRef: 'funding-reversal:re_second_refund_one',
        idempotencyKey: 'funding-reversal:re_second_refund_one',
      },
    })
    const command = await backend.run(async (ctx) => ctx.db.query('moneyFundingCommands')
      .withIndex('by_commandRef', (query) => query.eq('commandRef', commandRef)).unique())
    expect(command).toMatchObject({
      reversalState: 'pending',
      reversalRefundId: firstEvent.refundId,
    })
  })

  it('replays a second paid checkout on an already-succeeded funding command', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'formance-funding-second-paid')
    const commandRef = 'account-funding:second-paid'
    const paymentId = 'pi_second_paid'
    await insertSettledFunding(backend, {
      accountRef: fixture.canonicalAccountRef,
      actorPrincipalRef: fixture.canonicalPrincipalRef,
      commandRef,
      paymentId,
    })
    const metadataDigest = `sha256:${'7'.repeat(64)}`
    const checkoutSessionDigest = `sha256:${'c'.repeat(64)}`
    const paymentIntentDigest = `sha256:${'d'.repeat(64)}`
    await backend.run(async (ctx) => {
      const command = await ctx.db.query('moneyFundingCommands')
        .withIndex('by_commandRef', (query) => query.eq('commandRef', commandRef)).unique()
      if (command === null) throw new Error('settled_funding_missing')
      await ctx.db.patch(command._id, { metadataDigest })
    })
    const amount = { currency: 'AUD' as const, units: '5280000', exponent: 6 as const }
    const readback = {
      externalRef: `cs_${paymentId}`,
      amount,
      status: 'succeeded' as const,
      evidenceRef: `stripe:checkout:cs_${paymentId}`,
      requestDigest: `sha256:${'b'.repeat(64)}`,
      metadataDigest,
      checkoutSessionDigest,
      paymentIntentDigest,
      evidenceDigest: `sha256:${'e'.repeat(64)}`,
      paymentId,
    }
    const event = {
      kind: 'checkout' as const,
      stripeEventId: 'evt_second_paid_checkout',
      eventType: 'checkout.session.completed' as const,
      externalRef: readback.externalRef,
      sessionId: readback.externalRef,
      commandRef,
      paymentId,
      checkoutSessionDigest,
      paymentIntentDigest,
      status: 'paid' as const,
      amount,
      metadataDigest,
      payloadDigest: `sha256:${'f'.repeat(64)}`,
      observedAt: 1_800_000_000_600,
    }
    await expect(fixture.owner.mutation(
      internal.moneyAccountFunding.prepareVerifiedEvent,
      await withSourceWrite('billing', {
        event,
        readback,
        operationKey: 'moneyAccountFunding:applyVerifiedEvent',
        correlationId: event.stripeEventId,
      }),
    )).resolves.toEqual({
      kind: 'accepted',
      status: 'replayed',
      appliedRef: `formance:tx:${paymentId}`,
    })
  })

  it('refuses owner close of a processor_difference funding lock without source-write', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'formance-funding-lock-close')
    const commandRef = 'account-funding:lock-close'
    const paymentId = 'pi_lock_close'
    await insertSettledFunding(backend, {
      accountRef: fixture.canonicalAccountRef,
      actorPrincipalRef: fixture.canonicalPrincipalRef,
      commandRef,
      paymentId,
    })
    const partial = refundEvent({
      stripeEventId: 'evt_lock_close_partial',
      refundId: 're_lock_close_partial',
      paymentId,
      amountUnits: '100',
      observedAt: 1_800_000_000_700,
    })
    await expect(fixture.owner.mutation(
      internal.moneyAccountFunding.prepareVerifiedEvent,
      await withSourceWrite('billing', {
        event: partial,
        refundReadback: refundEvidence(partial),
        operationKey: 'moneyAccountFunding:applyVerifiedEvent',
        correlationId: partial.stripeEventId,
      }),
    )).resolves.toMatchObject({ kind: 'accepted', status: 'ignored' })
    const openCase = await backend.run(async (ctx) => ctx.db.query('moneyReconciliationCases')
      .withIndex('by_accountRef_and_status_and_createdAt', (index) => index
        .eq('accountRef', fixture.canonicalAccountRef)
        .eq('status', 'open'))
      .unique())
    if (openCase === null) throw new Error('funding_lock_missing')
    await expect(fixture.owner.mutation(resolveOwnerCase, {
      caseRef: openCase.caseRef,
      confirmation: openCase.caseRef,
      resolutionEvidenceRef: 'owner-opinion',
    })).resolves.toEqual({ kind: 'refused', code: 'source_write_denied' })
    await expect(fixture.owner.mutation(resolveOwnerCase, await withSourceWrite('billing', {
      caseRef: openCase.caseRef,
      confirmation: openCase.caseRef,
      resolutionEvidenceRef: 'stripe:repair:lock-close',
      operationKey: 'moneyReconciliationCases:resolveOwnerCase',
      correlationId: openCase.caseRef,
    }))).resolves.toEqual({ kind: 'resolved', caseRef: openCase.caseRef })
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyReconciliationCases', {
        caseRef: 'money-case:projection-owner-close',
        accountRef: fixture.canonicalAccountRef,
        kind: 'projection_mismatch',
        status: 'open',
        scopeType: 'account',
        scopeRef: fixture.canonicalAccountRef,
        reasonCode: 'projection_mismatch',
        evidenceRefs: ['owner-projection'],
        createdAt: 1_800_000_000_800,
        updatedAt: 1_800_000_000_800,
      })
    })
    await expect(fixture.owner.mutation(resolveOwnerCase, {
      caseRef: 'money-case:projection-owner-close',
      confirmation: 'money-case:projection-owner-close',
      resolutionEvidenceRef: 'owner-projection-close',
    })).resolves.toEqual({ kind: 'resolved', caseRef: 'money-case:projection-owner-close' })
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

  it('AM-10 replays the same stripeEventId prepared twice before finalize', async () => {
    vi.useFakeTimers()
    const backend = convexTestWithWorkers()
    await backend.run(async (ctx) => {
      await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 })
    })
    const fixture = await publishedBusinessOwner(backend, 'am10-same-event')
    const bound = await reserveBoundAm10Funding(fixture, 'same-event')
    const event = am10PaidCheckoutEvent({
      stripeEventId: 'evt_am10_same',
      eventType: 'checkout.session.completed',
      commandRef: bound.commandRef,
      evidence: bound.evidence,
      payloadDigest: `sha256:${'f'.repeat(64)}`,
    })
    const actionArgs = await am10VerifiedEventArgs(event, bound.evidence)
    const first = await fixture.owner.mutation(internal.moneyAccountFunding.prepareVerifiedEvent, actionArgs)
    expect(first).toMatchObject({
      kind: 'prepared',
      booking: am10SettlementBooking(bound),
    })
    const second = await fixture.owner.mutation(
      internal.moneyAccountFunding.prepareVerifiedEvent,
      await am10VerifiedEventArgs(event, bound.evidence),
    )
    expect(second).toEqual(first)
    const beforeFinalize = await fundingRows(backend, bound.commandRef)
    expect(beforeFinalize.stripeEvents).toEqual([
      expect.objectContaining({ stripeEventId: event.stripeEventId, status: 'received' }),
    ])
    const formanceTransactionRef = 'formance:tx:am10-same'
    await expect(fixture.owner.mutation(internal.moneyAccountFunding.finalizeVerifiedEvent, {
      ...actionArgs, formanceTransactionRef,
    })).resolves.toEqual({ kind: 'accepted', status: 'applied', appliedRef: formanceTransactionRef })
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    const rows = await fundingRows(backend, bound.commandRef)
    expect(rows.command).toMatchObject({
      state: 'succeeded',
      appliedTransactionRef: formanceTransactionRef,
    })
    expect(rows.stripeEvents).toEqual([
      expect.objectContaining({
        stripeEventId: event.stripeEventId,
        status: 'applied',
        appliedRef: formanceTransactionRef,
      }),
    ])
    expectFundingDocumentsForTransaction(rows.documents, formanceTransactionRef)
  })

  it('AM-10 settles checkout.session.completed then async_payment_succeeded on one Formance booking', async () => {
    await settleAm10PaidCheckoutReorder({
      slug: 'reorder',
      first: { stripeEventId: 'evt_am10_completed', eventType: 'checkout.session.completed' },
      second: { stripeEventId: 'evt_am10_async', eventType: 'checkout.session.async_payment_succeeded' },
      formanceTransactionRef: 'formance:tx:am10-reorder',
      conflictTransactionRef: 'formance:tx:am10-other',
    })
  })

  it('AM-10 settles async_payment_succeeded then checkout.session.completed on one Formance booking', async () => {
    await settleAm10PaidCheckoutReorder({
      slug: 'reverse',
      first: { stripeEventId: 'evt_am10_async_first', eventType: 'checkout.session.async_payment_succeeded' },
      second: { stripeEventId: 'evt_am10_completed_second', eventType: 'checkout.session.completed' },
      formanceTransactionRef: 'formance:tx:am10-reverse',
    })
  })

  it('AM-12 replays the same stripeEventId prepared twice before finalize', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'am12-same-event')
    const commandRef = 'account-funding:am12-same'
    const paymentId = 'pi_am12_same'
    const refundId = 're_am12_same'
    await insertSettledFunding(backend, {
      accountRef: fixture.canonicalAccountRef,
      actorPrincipalRef: fixture.canonicalPrincipalRef,
      commandRef,
      paymentId,
    })
    const event = refundEvent({
      stripeEventId: 'evt_am12_same',
      eventType: 'refund.updated',
      refundId,
      paymentId,
      observedAt: 1_800_000_000_800,
    })
    const firstArgs = await am12RefundArgs(event)
    const first = await fixture.owner.mutation(internal.moneyAccountFunding.prepareVerifiedEvent, firstArgs)
    expect(first).toMatchObject({
      kind: 'prepared',
      bookingKind: 'reversal',
      booking: { idempotencyKey: `funding-reversal:${refundId}` },
    })
    const second = await fixture.owner.mutation(
      internal.moneyAccountFunding.prepareVerifiedEvent,
      await am12RefundArgs(event),
    )
    expect(second).toEqual(first)
    const beforeFinalize = await fundingRows(backend, commandRef)
    expect(beforeFinalize.stripeEvents).toEqual([
      expect.objectContaining({ stripeEventId: event.stripeEventId, status: 'received' }),
    ])
    const formanceTransactionRef = 'formance:tx:am12-same'
    await expect(fixture.owner.mutation(internal.moneyAccountFunding.finalizeVerifiedRefund, {
      ...firstArgs, formanceTransactionRef,
    })).resolves.toEqual({ kind: 'accepted', status: 'applied', appliedRef: formanceTransactionRef })
    const rows = await fundingRows(backend, commandRef)
    expect(rows.command).toMatchObject({
      state: 'reversed',
      reversalTransactionRef: formanceTransactionRef,
    })
    expect(rows.stripeEvents).toEqual([
      expect.objectContaining({
        stripeEventId: event.stripeEventId,
        status: 'applied',
        appliedRef: formanceTransactionRef,
      }),
    ])
    expect(rows.documents).toEqual([
      expect.objectContaining({
        kind: 'adjustment',
        sourceTransactionRefs: [formanceTransactionRef],
      }),
    ])
  })

  it('AM-12 reverses refund.created then refund.updated on one Formance booking', async () => {
    await settleAm12RefundReorder({
      slug: 'reorder',
      first: { stripeEventId: 'evt_am12_created', eventType: 'refund.created' },
      second: { stripeEventId: 'evt_am12_updated', eventType: 'refund.updated' },
      formanceTransactionRef: 'formance:tx:am12-reorder',
      conflictTransactionRef: 'formance:tx:am12-other',
    })
  })

  it('AM-12 reverses refund.updated then refund.created on one Formance booking', async () => {
    await settleAm12RefundReorder({
      slug: 'reverse',
      first: { stripeEventId: 'evt_am12_updated_first', eventType: 'refund.updated' },
      second: { stripeEventId: 'evt_am12_created_second', eventType: 'refund.created' },
      formanceTransactionRef: 'formance:tx:am12-reverse',
    })
  })

  it('AM-12 ignores refund.failed and keeps the original credit', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'am12-failed')
    const commandRef = 'account-funding:am12-failed'
    const paymentId = 'pi_am12_failed'
    await insertSettledFunding(backend, {
      accountRef: fixture.canonicalAccountRef,
      actorPrincipalRef: fixture.canonicalPrincipalRef,
      commandRef,
      paymentId,
    })
    const event = refundEvent({
      stripeEventId: 'evt_am12_failed',
      eventType: 'refund.failed',
      refundId: 're_am12_failed',
      paymentId,
      status: 'failed',
      observedAt: 1_800_000_000_900,
    })
    await expect(fixture.owner.mutation(
      internal.moneyAccountFunding.prepareVerifiedEvent,
      await am12RefundArgs(event),
    )).resolves.toEqual({ kind: 'accepted', status: 'ignored' })
    const rows = await fundingRows(backend, commandRef)
    expect(rows.command).toMatchObject({ state: 'succeeded' })
    expect(rows.command?.reversalState).toBeUndefined()
    expect(rows.documents).toHaveLength(0)
    expect(rows.stripeEvents).toEqual([
      expect.objectContaining({ stripeEventId: event.stripeEventId, status: 'ignored' }),
    ])
  })

  it('AM-12 retries outcome_unknown reversal with the same Formance booking key', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'am12-unknown')
    const commandRef = 'account-funding:am12-unknown'
    const paymentId = 'pi_am12_unknown'
    const refundId = 're_am12_unknown'
    await insertSettledFunding(backend, {
      accountRef: fixture.canonicalAccountRef,
      actorPrincipalRef: fixture.canonicalPrincipalRef,
      commandRef,
      paymentId,
    })
    const event = refundEvent({
      stripeEventId: 'evt_am12_unknown',
      eventType: 'refund.updated',
      refundId,
      paymentId,
      observedAt: 1_800_000_001_000,
    })
    const prepared = await fixture.owner.mutation(
      internal.moneyAccountFunding.prepareVerifiedEvent,
      await am12RefundArgs(event),
    )
    expect(prepared).toMatchObject({
      kind: 'prepared',
      booking: { idempotencyKey: `funding-reversal:${refundId}` },
    })
    await fixture.owner.mutation(internal.moneyAccountFunding.markFundingReversalUnknown, {
      paymentId,
      refundId,
      stripeEventId: event.stripeEventId,
      statusRef: 'formance:unknown:am12',
      observedAt: event.observedAt + 1,
    })
    const retried = await fixture.owner.mutation(
      internal.moneyAccountFunding.prepareVerifiedEvent,
      await am12RefundArgs(event),
    )
    expect(retried).toMatchObject({
      kind: 'prepared',
      bookingKind: 'reversal',
      booking: { idempotencyKey: `funding-reversal:${refundId}` },
    })
    const rows = await fundingRows(backend, commandRef)
    expect(rows.command).toMatchObject({
      state: 'succeeded',
      reversalState: 'outcome_unknown',
      reversalRefundId: refundId,
    })
  })

  it('AM-11 queues the refund adjustment on the existing document worker', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'am11-adjustment')
    const commandRef = 'account-funding:am11-adjustment'
    const paymentId = 'pi_am11_adjustment'
    await insertSettledFunding(backend, {
      accountRef: fixture.canonicalAccountRef,
      actorPrincipalRef: fixture.canonicalPrincipalRef,
      commandRef,
      paymentId,
    })
    const event = refundEvent({
      stripeEventId: 'evt_am11_adjustment',
      eventType: 'refund.updated',
      refundId: 're_am11_adjustment',
      paymentId,
      observedAt: 1_800_000_002_000,
    })
    const actionArgs = await am12RefundArgs(event)
    await expect(fixture.owner.mutation(internal.moneyAccountFunding.prepareVerifiedEvent, actionArgs))
      .resolves.toMatchObject({ kind: 'prepared' })
    const reversalRef = 'formance:tx:am11-adjustment'
    await expect(fixture.owner.mutation(internal.moneyAccountFunding.finalizeVerifiedRefund, {
      ...actionArgs, formanceTransactionRef: reversalRef,
    })).resolves.toEqual({ kind: 'accepted', status: 'applied', appliedRef: reversalRef })
    const rows = await fundingRows(backend, commandRef)
    expect(rows.documents).toEqual([
      expect.objectContaining({
        kind: 'adjustment',
        state: 'rendering',
        sourceTransactionRefs: [reversalRef],
        amountUnits: '5280000',
        workId: expect.any(String),
      }),
    ])
  })
})

async function settleAm10PaidCheckoutReorder(input: Readonly<{
  slug: string
  first: Readonly<{ stripeEventId: string, eventType: Am10CheckoutEventType }>
  second: Readonly<{ stripeEventId: string, eventType: Am10CheckoutEventType }>
  formanceTransactionRef: string
  conflictTransactionRef?: string
}>): Promise<void> {
  vi.useFakeTimers()
  const backend = convexTestWithWorkers()
  await backend.run(async (ctx) => {
    await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 })
  })
  const fixture = await publishedBusinessOwner(backend, `am10-${input.slug}`)
  const bound = await reserveBoundAm10Funding(fixture, input.slug)
  const booking = am10SettlementBooking(bound)
  const firstEvent = am10PaidCheckoutEvent({
    stripeEventId: input.first.stripeEventId,
    eventType: input.first.eventType,
    commandRef: bound.commandRef,
    evidence: bound.evidence,
    payloadDigest: `sha256:${'f'.repeat(64)}`,
  })
  const secondEvent = am10PaidCheckoutEvent({
    stripeEventId: input.second.stripeEventId,
    eventType: input.second.eventType,
    commandRef: bound.commandRef,
    evidence: bound.evidence,
    payloadDigest: `sha256:${'0'.repeat(64)}`,
  })
  const firstArgs = await am10VerifiedEventArgs(firstEvent, bound.evidence)
  const secondArgs = await am10VerifiedEventArgs(secondEvent, bound.evidence)
  const firstPrepared = await fixture.owner.mutation(
    internal.moneyAccountFunding.prepareVerifiedEvent, firstArgs,
  )
  expect(firstPrepared).toMatchObject({ kind: 'prepared', booking })
  const secondPrepared = await fixture.owner.mutation(
    internal.moneyAccountFunding.prepareVerifiedEvent, secondArgs,
  )
  expect(secondPrepared).toMatchObject({ kind: 'prepared', booking })
  const preparedRows = await fundingRows(backend, bound.commandRef)
  expect(preparedRows.stripeEvents).toHaveLength(2)
  expect(preparedRows.stripeEvents).toEqual(expect.arrayContaining([
    expect.objectContaining({ stripeEventId: firstEvent.stripeEventId, status: 'received' }),
    expect.objectContaining({ stripeEventId: secondEvent.stripeEventId, status: 'received' }),
  ]))
  await expect(fixture.owner.mutation(internal.moneyAccountFunding.finalizeVerifiedEvent, {
    ...firstArgs, formanceTransactionRef: input.formanceTransactionRef,
  })).resolves.toEqual({
    kind: 'accepted', status: 'applied', appliedRef: input.formanceTransactionRef,
  })
  expect((await fundingRows(backend, bound.commandRef)).documents).toHaveLength(2)
  await expect(fixture.owner.mutation(internal.moneyAccountFunding.finalizeVerifiedEvent, {
    ...secondArgs, formanceTransactionRef: input.formanceTransactionRef,
  })).resolves.toEqual({
    kind: 'accepted', status: 'replayed', appliedRef: input.formanceTransactionRef,
  })
  if (input.conflictTransactionRef !== undefined) {
    await expect(fixture.owner.mutation(internal.moneyAccountFunding.finalizeVerifiedEvent, {
      ...secondArgs, formanceTransactionRef: input.conflictTransactionRef,
    })).resolves.toEqual({
      kind: 'refused', code: 'funding_idempotency_conflict', retryable: false,
    })
  }
  await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
  const rows = await fundingRows(backend, bound.commandRef)
  expect(rows.command).toMatchObject({
    state: 'succeeded',
    appliedTransactionRef: input.formanceTransactionRef,
  })
  expect(rows.stripeEvents).toHaveLength(2)
  expect(rows.stripeEvents).toEqual(expect.arrayContaining([
    expect.objectContaining({
      stripeEventId: firstEvent.stripeEventId,
      status: 'applied',
      appliedRef: input.formanceTransactionRef,
    }),
    expect.objectContaining({
      stripeEventId: secondEvent.stripeEventId,
      status: 'received',
    }),
  ]))
  expect(rows.documents).toHaveLength(2)
  expectFundingDocumentsForTransaction(rows.documents, input.formanceTransactionRef)
}

async function reserveBoundAm10Funding(
  fixture: PublishedOwner,
  slug: string,
): Promise<Am10BoundFunding> {
  if (reserve === undefined || bind === undefined) {
    throw new Error('Account funding functions missing')
  }
  const commandRef = `account-funding:am10-${slug}`
  const reserved = await fixture.owner.mutation(reserve, await withSourceWrite('billing', {
    amountUnits: '5000000', environment: 'sandbox' as const,
    expectedPolicyDigest: SANDBOX_POLICY_DIGEST,
    commandRef, idempotencyKey: commandRef,
    inputDigest: `sha256:${'a'.repeat(64)}`, successReturnRef: 'owner/credit',
    operationKey: 'moneyAccountFunding:reserve', correlationId: commandRef,
  }))
  if (reserved.kind !== 'accepted' || reserved.command.metadataDigest === undefined) {
    throw new Error('funding fixture not reserved')
  }
  const evidence = am10BindEvidence(reserved.command.metadataDigest, slug)
  await expect(fixture.owner.mutation(bind, await withSourceWrite('billing', {
    commandRef, evidence, operationKey: 'moneyAccountFunding:bind',
    correlationId: commandRef,
  }))).resolves.toMatchObject({ kind: 'accepted', command: { state: 'pending' } })
  return {
    commandRef,
    idempotencyKey: reserved.command.idempotencyKey,
    accountRef: fixture.canonicalAccountRef,
    evidence,
  }
}

type Am09HandoffEvidence = Readonly<{
  externalRef: string
  amount: { currency: 'AUD'; units: string; exponent: 6 }
  status: 'pending'
  evidenceRef: string
  requestDigest: string
  metadataDigest: string
  checkoutSessionDigest: string
  evidenceDigest: string
  checkoutStatus: 'open' | 'complete' | 'expired'
  paymentStatus: 'unpaid' | 'paid' | 'no_payment_required'
  checkoutMode: 'hosted_page'
  checkoutExpiresAt: number
}>

async function boundAm09AgentHandoff(
  slug: string,
  evidenceOverrides: Partial<Pick<Am09HandoffEvidence, 'checkoutStatus' | 'paymentStatus'>> = {},
) {
  if (
    reserveAgentHandoff === undefined
    || bindAgentHandoff === undefined
    || readPayerSafeHandoff === undefined
  ) {
    throw new Error('Agent funding handoff functions missing')
  }
  const backend = convexTestWithMarketComponents()
  const published = await publishedBusinessOwner(backend, `am09-${slug}`)
  const agent = await issueBuyerAgent(backend, published.owner, `user_am09-${slug}`)
  const checkoutExpiresAt = (Math.floor(Date.now() / 1000) + 3600) * 1000
  const reserved = await backend.mutation(reserveAgentHandoff, await withSourceWrite('billing', {
    principalAmountUnits: '5000000',
    environment: 'sandbox' as const,
    idempotencyKey: `am09-${slug}`,
    successReturnRef: 'https://ae.test/fund/{CHECKOUT_SESSION_ID}',
    cancelReturnRef: 'https://ae.test/fund/{CHECKOUT_SESSION_ID}',
    checkoutExpiresAt,
    agentPrincipal: agent,
    operationKey: 'moneyAccountFunding:reserveAgentHandoff',
    correlationId: `am09-${slug}`,
  }))
  if (reserved.kind !== 'accepted' || reserved.command.metadataDigest === undefined) {
    throw new Error('handoff_not_reserved')
  }
  const evidence: Am09HandoffEvidence = {
    externalRef: `cs_am09_${slug}`,
    amount: { currency: 'AUD', exponent: 6, units: reserved.command.totalUnits },
    status: 'pending',
    evidenceRef: `stripe:checkout:cs_am09_${slug}`,
    requestDigest: `sha256:${'2'.repeat(64)}`,
    metadataDigest: reserved.command.metadataDigest,
    checkoutSessionDigest: `sha256:${'3'.repeat(64)}`,
    evidenceDigest: `sha256:${'4'.repeat(64)}`,
    checkoutStatus: 'open',
    paymentStatus: 'unpaid',
    checkoutMode: 'hosted_page',
    checkoutExpiresAt,
    ...evidenceOverrides,
  }
  await expect(backend.mutation(bindAgentHandoff, await withSourceWrite('billing', {
    commandRef: reserved.command.commandRef,
    evidence,
    agentPrincipal: agent,
    operationKey: 'moneyAccountFunding:bindAgentHandoff',
    correlationId: `am09-${slug}-bind`,
  }))).resolves.toMatchObject({ kind: 'accepted', command: { externalRef: evidence.externalRef } })
  return {
    backend,
    owner: published.owner,
    commandRef: reserved.command.commandRef,
    evidence,
  }
}

function am09UnpaidCheckoutEvent(input: Readonly<{
  stripeEventId: string
  eventType: 'checkout.session.async_payment_failed'
  status: 'failed'
  commandRef: string
  evidence: Am09HandoffEvidence
}>) {
  return {
    kind: 'checkout' as const,
    stripeEventId: input.stripeEventId,
    eventType: input.eventType,
    externalRef: input.evidence.externalRef,
    sessionId: input.evidence.externalRef,
    commandRef: input.commandRef,
    checkoutSessionDigest: input.evidence.checkoutSessionDigest,
    status: input.status,
    amount: input.evidence.amount,
    metadataDigest: input.evidence.metadataDigest,
    payloadDigest: `sha256:${'f'.repeat(64)}`,
    observedAt: 1_800_000_000_000,
  }
}

async function patchFundingCommand(
  backend: ConvexBackend,
  commandRef: string,
  patch: Readonly<{ state?: 'succeeded'; appliedTransactionRef?: string }>,
): Promise<void> {
  await backend.run(async (ctx) => {
    const command = await ctx.db.query('moneyFundingCommands')
      .withIndex('by_commandRef', (query) => query.eq('commandRef', commandRef)).unique()
    if (command === null) throw new Error('funding command missing')
    await ctx.db.patch(command._id, patch)
  })
}


async function settleAm12RefundReorder(input: Readonly<{
  slug: string
  first: Readonly<{ stripeEventId: string; eventType: Exclude<Am12RefundEventType, 'refund.failed'> }>
  second: Readonly<{ stripeEventId: string; eventType: Exclude<Am12RefundEventType, 'refund.failed'> }>
  formanceTransactionRef: string
  conflictTransactionRef?: string
}>): Promise<void> {
  const backend = convexTestWithWorkers({ pauseWorkpool: true })
  const fixture = await publishedBusinessOwner(backend, `am12-${input.slug}`)
  const commandRef = `account-funding:am12-${input.slug}`
  const paymentId = `pi_am12_${input.slug}`
  const refundId = 're_am12_one'
  await insertSettledFunding(backend, {
    accountRef: fixture.canonicalAccountRef,
    actorPrincipalRef: fixture.canonicalPrincipalRef,
    commandRef,
    paymentId,
  })
  const bookingKey = `funding-reversal:${refundId}`
  const firstEvent = refundEvent({
    stripeEventId: input.first.stripeEventId,
    eventType: input.first.eventType,
    refundId,
    paymentId,
    payloadDigest: `sha256:${'a'.repeat(64)}`,
    observedAt: 1_800_000_001_100,
  })
  const secondEvent = refundEvent({
    stripeEventId: input.second.stripeEventId,
    eventType: input.second.eventType,
    refundId,
    paymentId,
    payloadDigest: `sha256:${'b'.repeat(64)}`,
    observedAt: 1_800_000_001_200,
  })
  const firstArgs = await am12RefundArgs(firstEvent)
  const secondArgs = await am12RefundArgs(secondEvent)
  const firstPrepared = await fixture.owner.mutation(
    internal.moneyAccountFunding.prepareVerifiedEvent, firstArgs,
  )
  expect(firstPrepared).toMatchObject({
    kind: 'prepared',
    bookingKind: 'reversal',
    booking: { idempotencyKey: bookingKey },
  })
  const secondPrepared = await fixture.owner.mutation(
    internal.moneyAccountFunding.prepareVerifiedEvent, secondArgs,
  )
  expect(secondPrepared).toMatchObject({
    kind: 'prepared',
    bookingKind: 'reversal',
    booking: { idempotencyKey: bookingKey },
  })
  const preparedRows = await fundingRows(backend, commandRef)
  expect(preparedRows.stripeEvents).toHaveLength(2)
  expect(preparedRows.stripeEvents).toEqual(expect.arrayContaining([
    expect.objectContaining({ stripeEventId: firstEvent.stripeEventId, status: 'received' }),
    expect.objectContaining({ stripeEventId: secondEvent.stripeEventId, status: 'received' }),
  ]))
  await expect(fixture.owner.mutation(internal.moneyAccountFunding.finalizeVerifiedRefund, {
    ...firstArgs, formanceTransactionRef: input.formanceTransactionRef,
  })).resolves.toEqual({
    kind: 'accepted', status: 'applied', appliedRef: input.formanceTransactionRef,
  })
  expect((await fundingRows(backend, commandRef)).documents).toEqual([
    expect.objectContaining({
      kind: 'adjustment',
      sourceTransactionRefs: [input.formanceTransactionRef],
    }),
  ])
  await expect(fixture.owner.mutation(internal.moneyAccountFunding.finalizeVerifiedRefund, {
    ...secondArgs, formanceTransactionRef: input.formanceTransactionRef,
  })).resolves.toEqual({
    kind: 'accepted', status: 'replayed', appliedRef: input.formanceTransactionRef,
  })
  expect((await fundingRows(backend, commandRef)).documents).toHaveLength(1)
  expect((await fundingRows(backend, commandRef)).command).toMatchObject({
    state: 'reversed',
    reversalTransactionRef: input.formanceTransactionRef,
  })
  if (input.conflictTransactionRef !== undefined) {
    await expect(fixture.owner.mutation(internal.moneyAccountFunding.finalizeVerifiedRefund, {
      ...secondArgs, formanceTransactionRef: input.conflictTransactionRef,
    })).resolves.toEqual({ kind: 'refused', code: 'funding_idempotency_conflict', retryable: false })
  }
}

