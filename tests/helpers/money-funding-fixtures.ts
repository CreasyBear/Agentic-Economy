import { anyApi } from 'convex/server'
import { expect, vi } from 'vitest'

import { components, internal } from '../../convex/_generated/api'
import { evaluateCommercialPolicyGate } from '@/modules/money/public'
import {
  CUSTOMER_REQUEST_READ_ONLY_SCOPE,
  MARKET_TOOLS_CALL_SCOPE,
} from '@/modules/agent-access/contract'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import {
  convexTestWithMarketComponents,
  convexTestWithWorkers,
  publishedBusinessOwner,
} from './convex-fixtures'
import { issueBuyerAgent } from './issued-buyer-agent'
import { withSourceWrite } from './source-write-admission'
import {
  createTestChargeRefundedEvent,
  createTestCheckoutEvent,
  type TestChargeRefundedEventOptions,
  type TestCheckoutEventOptions,
} from './stripe-events'

const FUNDING_HANDOFF_SERVICE_KEY = 'funding-handoff-test-key-material-32-bytes'

const reserve = anyApi.moneyAccountFunding?.reserve
const bind = anyApi.moneyAccountFunding?.bind
const reserveAgentHandoff = anyApi.moneyAccountFunding?.reserveAgentHandoff
const bindAgentHandoff = anyApi.moneyAccountFunding?.bindAgentHandoff
const readPayerSafeHandoff = anyApi.moneyAccountFunding?.readPayerSafeHandoff

const sandboxGate = evaluateCommercialPolicyGate({
  environment: 'sandbox',
  now: 0,
  approvals: [],
  sandboxFixture: 'managed_x402_deterministic_v1',
})
if (sandboxGate.kind !== 'admitted') throw new Error('sandbox_commercial_policy_missing')
const SANDBOX_POLICY_DIGEST = sandboxGate.policyDigest

type ConvexBackend = ReturnType<typeof convexTestWithMarketComponents>
type PublishedOwner = Awaited<ReturnType<typeof publishedBusinessOwner>>

const fundingSha256 = (char: string) => `sha256:${char.repeat(64)}`

export {
  createTestChargeRefundedEvent,
  createTestCheckoutEvent,
  type TestChargeRefundedEventOptions,
  type TestCheckoutEventOptions,
}

export type Am10CheckoutEventType =
  | 'checkout.session.completed'
  | 'checkout.session.async_payment_succeeded'

export type Am10BoundFunding = Readonly<{
  commandRef: string
  idempotencyKey: string
  accountRef: string
  evidence: ReturnType<typeof am10BindEvidence>
}>

export type Am12RefundEventType = 'refund.created' | 'refund.updated' | 'refund.failed'

export function am10BindEvidence(metadataDigest: string, slug: string) {
  return {
    externalRef: `cs_am10_${slug}`,
    amount: { currency: 'AUD' as const, units: '5780000', exponent: 6 as const },
    status: 'succeeded' as const,
    evidenceRef: `stripe:checkout:cs_am10_${slug}`,
    requestDigest: `sha256:${'b'.repeat(64)}`,
    metadataDigest,
    checkoutSessionDigest: `sha256:${'c'.repeat(64)}`,
    paymentIntentDigest: `sha256:${'d'.repeat(64)}`,
    evidenceDigest: `sha256:${'e'.repeat(64)}`,
    paymentId: `pi_am10_${slug}`,
  }
}

export function am10PaidCheckoutEvent(input: Readonly<{
  stripeEventId: string
  eventType: Am10CheckoutEventType
  commandRef: string
  evidence: ReturnType<typeof am10BindEvidence>
  payloadDigest: string
}>) {
  return createTestCheckoutEvent({
    stripeEventId: input.stripeEventId,
    eventType: input.eventType,
    sessionId: input.evidence.externalRef,
    commandRef: input.commandRef,
    paymentId: input.evidence.paymentId,
    amount: input.evidence.amount,
    metadataDigest: input.evidence.metadataDigest,
    payloadDigest: input.payloadDigest,
  })
}

export function am10SettlementBooking(bound: Am10BoundFunding) {
  return {
    commandRef: bound.commandRef,
    accountRef: bound.accountRef,
    processorRef: bound.evidence.externalRef,
    idempotencyKey: bound.idempotencyKey,
    principalUnits: '5000000',
    serviceFeeUnits: '250000',
    taxUnits: '530000',
    totalUnits: '5780000',
  }
}

export async function am10VerifiedEventArgs(
  event: ReturnType<typeof am10PaidCheckoutEvent>,
  evidence: ReturnType<typeof am10BindEvidence>,
) {
  return await withSourceWrite('billing', {
    event,
    readback: evidence,
    operationKey: 'moneyAccountFunding:applyVerifiedEvent',
    correlationId: event.stripeEventId,
  })
}

export function refundEvent(input: Readonly<{
  stripeEventId: string
  refundId: string
  paymentId: string
  amountUnits?: string
  observedAt: number
  eventType?: Am12RefundEventType
  status?: 'pending' | 'succeeded' | 'failed'
  payloadDigest?: string
}>) {
  return {
    kind: 'refund' as const,
    stripeEventId: input.stripeEventId,
    eventType: input.eventType ?? 'refund.updated' as const,
    externalRef: input.refundId,
    refundId: input.refundId,
    paymentId: input.paymentId,
    chargeId: `ch_${input.paymentId}`,
    refundDigest: `sha256:${'4'.repeat(64)}`,
    status: input.status ?? 'succeeded' as const,
    amount: {
      currency: 'AUD',
      units: input.amountUnits ?? '578',
      exponent: 2,
    },
    payloadDigest: input.payloadDigest ?? `sha256:${'5'.repeat(64)}`,
    observedAt: input.observedAt,
  }
}

export function refundEvidence(event: ReturnType<typeof refundEvent>) {
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

export async function am12RefundArgs(event: ReturnType<typeof refundEvent>) {
  return await withSourceWrite('billing', {
    event,
    refundReadback: refundEvidence(event),
    operationKey: 'moneyAccountFunding:applyVerifiedEvent',
    correlationId: event.stripeEventId,
  })
}

export async function fundingRows(backend: ConvexBackend, commandRef: string) {
  return await backend.run(async (ctx) => ({
    command: await ctx.db.query('moneyFundingCommands')
      .withIndex('by_commandRef', (query) => query.eq('commandRef', commandRef)).unique(),
    stripeEvents: await ctx.db.query('moneyStripeEvents').collect(),
    documents: await ctx.db.query('moneyDocuments').collect(),
  }))
}

export function expectFundingDocumentsForTransaction(
  documents: Awaited<ReturnType<typeof fundingRows>>['documents'],
  formanceTransactionRef: string,
): void {
  expect(documents).toHaveLength(2)
  expect(documents).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'funding_receipt', sourceTransactionRefs: [formanceTransactionRef] }),
    expect.objectContaining({ kind: 'service_fee_document', sourceTransactionRefs: [formanceTransactionRef] }),
  ]))
}

export async function insertSettledFunding(
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
      taxUnits: '530000',
      totalUnits: '5780000',
      commercialPolicyDigest: fundingSha256('1'),
      commercialPolicyRefs: ['commercial-policy:sandbox'],
      idempotencyKey: input.commandRef,
      inputDigest: fundingSha256('2'),
      successReturnRef: 'owner/credit',
      providerRecoveryDeadlineAt: 1_900_000_000_000,
      state: 'succeeded',
      externalRef: `cs_${input.paymentId}`,
      providerStatus: 'succeeded',
      paymentId: input.paymentId,
      appliedStripeEventId: `evt_${input.paymentId}`,
      appliedPayloadDigest: fundingSha256('3'),
      appliedTransactionRef: `formance:tx:${input.paymentId}`,
      createdAt: 1_800_000_000_000,
      updatedAt: 1_800_000_000_000,
    })
  })
}

export async function patchFundingCommand(
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

export function am09UnpaidCheckoutEvent(input: Readonly<{
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
    payloadDigest: fundingSha256('f'),
    observedAt: 1_800_000_000_000,
  }
}

export async function reserveBoundAm10Funding(
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
    inputDigest: fundingSha256('a'), successReturnRef: 'owner/credit',
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

export async function boundAm09AgentHandoff(
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
  const subject = `user_am09-${slug}`
  const { principal: agent } = await issueBuyerAgent(backend, published.owner, subject, {
    serviceKey: FUNDING_HANDOFF_SERVICE_KEY,
    issuanceKey: `funding-${subject}`,
    registration: {
      displayName: `user_am09-${slug} buyer`,
      applicationRef: 'agentic-economy',
      environment: 'sandbox',
      scopes: [MARKET_TOOLS_CALL_SCOPE, CUSTOMER_REQUEST_READ_ONLY_SCOPE],
      authorityMode: 'read_only',
      toolAccess: 'all_admitted',
      toolRefs: [],
      spendingPolicy: defaultSandboxAgentAccessPolicy({ currency: 'AUD', exponent: 6 }),
    },
  })
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
    requestDigest: fundingSha256('2'),
    metadataDigest: reserved.command.metadataDigest,
    checkoutSessionDigest: fundingSha256('3'),
    evidenceDigest: fundingSha256('4'),
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

export async function settleAm10PaidCheckoutReorder(input: Readonly<{
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
    payloadDigest: fundingSha256('f'),
  })
  const secondEvent = am10PaidCheckoutEvent({
    stripeEventId: input.second.stripeEventId,
    eventType: input.second.eventType,
    commandRef: bound.commandRef,
    evidence: bound.evidence,
    payloadDigest: fundingSha256('0'),
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

export async function settleAm12RefundReorder(input: Readonly<{
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
    payloadDigest: fundingSha256('a'),
    observedAt: 1_800_000_001_100,
  })
  const secondEvent = refundEvent({
    stripeEventId: input.second.stripeEventId,
    eventType: input.second.eventType,
    refundId,
    paymentId,
    payloadDigest: fundingSha256('b'),
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
