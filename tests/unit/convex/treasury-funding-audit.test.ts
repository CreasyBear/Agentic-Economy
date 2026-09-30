import type Stripe from 'stripe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { auditTreasuryFunding, TREASURY_FUNDING_READBACK_LIMIT, TREASURY_FUNDING_DEADLINE_MS,
  TREASURY_FUNDING_REQUEST_TIMEOUT_MS } from '../../../convex/lib/money/treasury/fundingAudit'
import type { TreasuryFundingSourcesResult } from '../../../convex/lib/money/treasury/auditSources'
import type { FormanceTreasuryAuditTransaction } from '@/modules/money/formance-treasury-audit'
import { prepareFormanceFundingSettlement, prepareFormanceFundingReversal, type FormanceFundingBooking } from '@/modules/money/formance-workflows'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isMoneyRefusal, type CreditPaymentRequest } from '@/modules/money/public'
import { mapStripeCheckoutSessionEvidence, mapStripeFundingRefundEvidence } from '../../../src/lib/server/stripe-money-provider'

// Mock only external SDK I/O. Provider mapping, environment fences, command
// reconstruction and native posting matchers all execute their real code.
const sdk = vi.hoisted(() => ({
  construct: vi.fn(), checkout: vi.fn(), intent: vi.fn(), charge: vi.fn(), refunds: vi.fn(), refund: vi.fn(),
}))
vi.mock('stripe', async importOriginal => {
  const actual = await importOriginal<typeof import('stripe')>()
  return {
  default: class StripeBoundary {
    static API_VERSION = 'test-sdk-version'
    static createFetchHttpClient = actual.default.createFetchHttpClient
    constructor(key: string, options: unknown) { sdk.construct(key, options) }
    checkout = { sessions: { retrieve: sdk.checkout } }
    paymentIntents = { retrieve: sdk.intent }
    charges = { retrieve: sdk.charge }
    refunds = { list: sdk.refunds, retrieve: sdk.refund }
  },
  }
})

type FundingSource = Extract<TreasuryFundingSourcesResult, { kind: 'available' }>['rows'][number]
const config = { secretKey: 'rk_test_treasury_fixture', mode: 'test' as const }
const policyDigest = `sha256:${'a'.repeat(64)}`
const inputDigest = `sha256:${'b'.repeat(64)}`
const createdAt = 1_700_000_000_000
const request: CreditPaymentRequest = {
  commandRef: 'funding:treasury-fixture', principalId: 'principal:treasury-fixture', accountRef: 'account:treasury-fixture',
  amount: { currency: 'AUD', exponent: 6, units: '1110000' },
  principalAmount: { currency: 'AUD', exponent: 6, units: '1000000' },
  serviceFeeAmount: { currency: 'AUD', exponent: 6, units: '100000' },
  taxAmount: { currency: 'AUD', exponent: 6, units: '10000' },
  idempotencyKey: 'funding:treasury-fixture:key', inputDigest,
  successReturnRef: 'https://app.example.test/funding/return', cancelReturnRef: 'https://app.example.test/funding/cancel',
  providerRecoveryDeadlineAt: createdAt + 86_400_000, checkoutExpiresAt: createdAt + 3_600_000,
}

function checkout(): Stripe.Checkout.Session {
  return {
    id: 'cs_test_treasury', object: 'checkout.session', amount_total: 111, created: createdAt / 1_000,
    currency: 'aud', livemode: false, mode: 'payment', ui_mode: 'hosted_page',
    client_reference_id: request.commandRef, metadata: { ae_command_ref: request.commandRef, ae_contract: 'account_funding_v2' },
    payment_intent: { id: 'pi_test_treasury' }, status: 'complete', payment_status: 'paid',
    success_url: request.successReturnRef, cancel_url: request.cancelReturnRef, expires_at: request.checkoutExpiresAt! / 1_000,
    automatic_tax: { enabled: false }, total_details: { amount_tax: 0 }, url: null,
    line_items: { object: 'list', has_more: false, data: [
      { id: 'li_credit', quantity: 1, amount_total: 100, amount_tax: 0, description: 'Agentic Economy Account credit', taxes: [] },
      { id: 'li_fee', quantity: 1, amount_total: 10, amount_tax: 0, description: 'Account funding service fee', taxes: [] },
      { id: 'li_tax', quantity: 1, amount_total: 1, amount_tax: 0, description: 'Australian GST', taxes: [] },
    ] },
  } as unknown as Stripe.Checkout.Session
}
function charge(refundedMinor = 0): Stripe.Charge {
  return { id: 'ch_test_treasury', object: 'charge', livemode: false, payment_intent: 'pi_test_treasury',
    currency: 'aud', status: 'succeeded', paid: true, captured: true,
    amount: 111, amount_captured: 111, amount_refunded: refundedMinor, refunded: refundedMinor === 111,
  } as Stripe.Charge
}
function refund(id = 're_test_treasury', status = 'succeeded', amount = 111): Stripe.Refund {
  return { id, object: 'refund', payment_intent: 'pi_test_treasury', charge: 'ch_test_treasury', currency: 'aud',
    status, amount, created: createdAt / 1_000 + 60, balance_transaction: `txn_${id}`, failure_balance_transaction: null,
  } as unknown as Stripe.Refund
}

function native(booking: FormanceFundingBooking, kind: 'settlement' | 'reversal', id = '1'): FormanceTreasuryAuditTransaction {
  const prepared = kind === 'settlement' ? prepareFormanceFundingSettlement(booking) : prepareFormanceFundingReversal(booking)
  if (prepared.kind !== 'prepared') throw new Error(prepared.code)
  const segment = (kind: string, reference: string) => canonicalDigest({ format: 'ae.formance-account-segment:v1', value: { kind, reference } }).slice(7)
  const processor = `processor:${segment('processor', booking.processorRef)}:settlement`
  const account = `accounts:${segment('account', booking.accountRef)}:available`
  // Stable chart fixture independent of the matcher; only the command envelope
  // uses the original maintained booking builder.
  const postings = [
    { source: 'world', destination: processor, asset: 'AUD/6', amountUnits: booking.totalUnits },
    { source: processor, destination: account, asset: 'AUD/6', amountUnits: booking.principalUnits },
    { source: processor, destination: 'platform:revenue:sales', asset: 'AUD/6', amountUnits: booking.serviceFeeUnits },
    { source: processor, destination: 'platform:tax:gst', asset: 'AUD/6', amountUnits: booking.taxUnits },
  ].map(posting => kind === 'settlement' ? posting : { ...posting, source: posting.destination, destination: posting.source })
  return { id, commandRef: prepared.command.commandRef, template: prepared.command.template,
    insertedAt: createdAt + 1, effectiveAt: createdAt, reverted: false, revertedAt: null,
    metadata: { ...prepared.command.metadata }, postings }
}

function fixture() {
  const session = checkout()
  const evidence = mapStripeCheckoutSessionEvidence({ session, config, expected: request })
  if (isMoneyRefusal(evidence)) throw new Error(`invalid_checkout_fixture:${evidence.code}`)
  const booking: FormanceFundingBooking = {
    commandRef: request.commandRef, idempotencyKey: request.idempotencyKey, accountRef: request.accountRef,
    processorRef: session.id, principalUnits: '1000000', serviceFeeUnits: '100000', taxUnits: '10000', totalUnits: '1110000',
    policyDigest, externalEvidenceDigest: evidence.evidenceDigest,
  }
  const settlement = native(booking, 'settlement')
  const source: FundingSource = {
    commandRef: request.commandRef, idempotencyKey: request.idempotencyKey, accountRef: request.accountRef,
    legalCustomerRef: 'customer:treasury-fixture', actorPrincipalRef: request.principalId, environment: 'sandbox',
    successReturnRef: request.successReturnRef,
    ...(request.cancelReturnRef === undefined ? {} : { cancelReturnRef: request.cancelReturnRef }),
    providerRecoveryDeadlineAt: request.providerRecoveryDeadlineAt,
    ...(request.checkoutExpiresAt === undefined ? {} : { checkoutExpiresAt: request.checkoutExpiresAt }),
    currency: 'AUD', exponent: 6, principalUnits: '1000000', serviceFeeUnits: '100000', taxUnits: '10000', totalUnits: '1110000',
    commercialPolicyDigest: policyDigest, commercialPolicyRefs: ['policy:treasury-fixture'], inputDigest,
    externalRef: session.id,
    ...(evidence.paymentId === undefined ? {} : { paymentId: evidence.paymentId }),
    ...(evidence.paymentIntentDigest === undefined ? {} : { paymentIntentDigest: evidence.paymentIntentDigest }),
    checkoutSessionDigest: evidence.checkoutSessionDigest, metadataDigest: evidence.metadataDigest,
    requestDigest: evidence.requestDigest, evidenceDigest: evidence.evidenceDigest, providerEvidenceRef: evidence.evidenceRef,
    appliedStripeEventId: 'evt_test_funding', appliedPayloadDigest: policyDigest, appliedTransactionRef: settlement.commandRef!,
    state: 'succeeded', providerStatus: 'succeeded', createdAt, updatedAt: createdAt + 1,
  }
  sdk.checkout.mockResolvedValue(session)
  setProcessor()
  return { session, source, booking, settlement }
}

function setProcessor(refunds: Stripe.Refund[] = [], refundedMinor = 0) {
  const paidCharge = charge(refundedMinor)
  sdk.intent.mockResolvedValue({ id: 'pi_test_treasury', object: 'payment_intent', livemode: false, currency: 'aud',
    status: 'succeeded', amount: 111, amount_received: 111, latest_charge: paidCharge })
  sdk.charge.mockResolvedValue(paidCharge)
  sdk.refunds.mockImplementation(async (input: { charge: string; limit: number; starting_after?: string }) => {
    const start = input.starting_after === undefined ? 0 : refunds.findIndex(item => item.id === input.starting_after) + 1
    const data = refunds.slice(start, start + input.limit)
    return { object: 'list', data, has_more: start + data.length < refunds.length }
  })
  sdk.refund.mockImplementation(async (id: string) => {
    const found = refunds.find(item => item.id === id)
    if (found === undefined) throw new Error('refund_not_found')
    return found
  })
}

describe('fresh Stripe treasury funding audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    vi.stubEnv('STRIPE_READBACK_KEY', config.secretKey)
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('matches paid funding principal after fresh payment/charge/refund reads and exact four native postings', async () => {
    const { source, settlement } = fixture()
    expect(await auditTreasuryFunding([source], [settlement], 'sandbox')).toEqual({ kind: 'matched', checkedCount: 1,
      expectedUnits: '1000000', observedUnits: '1000000', differenceUnits: '0' })
    expect(sdk.intent).toHaveBeenCalledWith('pi_test_treasury', { expand: ['latest_charge'] })
    expect(sdk.refunds).toHaveBeenCalledWith({ charge: 'ch_test_treasury', limit: 100 })
    expect(sdk.construct.mock.calls.every(([key]) => key === config.secretKey)).toBe(true)
    expect(sdk.construct.mock.calls[0]?.[1]).toMatchObject({ timeout: TREASURY_FUNDING_REQUEST_TIMEOUT_MS, maxNetworkRetries: 0 })
  })

  it('matches the recorded full refund and native reversal using the original checkout and refund evidence', async () => {
    const { source, booking, settlement } = fixture()
    const returned = refund()
    const evidence = mapStripeFundingRefundEvidence({ refund: returned, config })
    if (isMoneyRefusal(evidence)) throw new Error('invalid_refund_fixture')
    const reversal = native({ ...booking, commandRef: `funding-reversal:${returned.id}`,
      idempotencyKey: `funding-reversal:${returned.id}`, externalEvidenceDigest: evidence.evidenceDigest }, 'reversal', '2')
    setProcessor([returned], 111)
    expect(await auditTreasuryFunding([{ ...source, state: 'reversed', reversalState: 'succeeded',
      reversalRefundId: returned.id, reversalChargeId: 'ch_test_treasury', reversalStripeEventId: 'evt_test_refund',
      reversalEvidenceDigest: evidence.evidenceDigest, reversalTransactionRef: reversal.commandRef!, reversedAt: createdAt + 60_000,
    }], [settlement, reversal], 'sandbox')).toEqual({ kind: 'matched', checkedCount: 1,
      expectedUnits: '0', observedUnits: '0', differenceUnits: '0' })
    expect(sdk.refund).toHaveBeenCalledWith(returned.id)
  })

  it('rejects native funding rebuilt with a digest other than the original durable checkout evidence', async () => {
    const { source, booking } = fixture()
    const substituted = native({ ...booking, externalEvidenceDigest: policyDigest }, 'settlement')
    expect(await auditTreasuryFunding([source], [substituted], 'sandbox')).toMatchObject({ kind: 'mismatch',
      code: 'treasury_funding_native_binding_invalid', expectedUnits: '1000000', observedUnits: '1000000' })
  })

  it('rejects changed fresh checkout evidence even when the original native funding remains intact', async () => {
    const { source, settlement, session } = fixture()
    sdk.checkout.mockResolvedValue({ ...session, metadata: { ...session.metadata, unexpected_new_fact: 'changed' } })
    expect(await auditTreasuryFunding([source], [settlement], 'sandbox')).toMatchObject({ kind: 'mismatch', code: 'treasury_funding_processor_binding_invalid' })
  })

  it.each(['pending', 'partial', 'unrecorded_full'] as const)('refuses green for a fresh %s refund absent from webhook projection', async kind => {
    const { source, settlement } = fixture()
    setProcessor([refund('re_new', kind === 'pending' ? 'pending' : 'succeeded', kind === 'partial' ? 55 : 111)],
      kind === 'pending' ? 0 : kind === 'partial' ? 55 : 111)
    expect(await auditTreasuryFunding([source], [settlement], 'sandbox')).toMatchObject({ kind: 'attention',
      code: kind === 'pending' ? 'treasury_funding_refund_pending' : 'treasury_funding_refund_unrecorded',
      pendingCount: 1, pendingUnits: null, evidenceRefs: [source.commandRef] })
  })

  it('keeps a known partial refund unresolved instead of assuming a full principal reversal', async () => {
    const { source, settlement } = fixture()
    setProcessor([refund('re_partial', 'succeeded', 55)], 55)
    expect(await auditTreasuryFunding([{ ...source, reversalState: 'pending', reversalRefundId: 're_partial',
      reversalChargeId: 'ch_test_treasury' }], [settlement], 'sandbox')).toMatchObject({ kind: 'attention', code: 'treasury_funding_refund_partial' })
  })

  it('detects an orphan native reversal even though the payment source still says succeeded', async () => {
    const { source, settlement, booking } = fixture()
    const orphan = native({ ...booking, commandRef: 'funding-reversal:re_orphan', idempotencyKey: 'funding-reversal:re_orphan' }, 'reversal', '2')
    expect(await auditTreasuryFunding([source], [settlement, orphan], 'sandbox')).toMatchObject({ kind: 'mismatch',
      code: 'treasury_funding_native_orphan', expectedUnits: '1000000', observedUnits: '0', differenceUnits: '-1000000' })
  })

  it('reports native reversion and compensation as unexplained net-zero funding rather than silently matching success', async () => {
    const { source, settlement } = fixture()
    const compensation: FormanceTreasuryAuditTransaction = { ...settlement, id: '2', commandRef: null, template: null,
      metadata: { 'com.formance.spec/state/reverts': settlement.id },
      postings: settlement.postings.map(posting => ({ ...posting, source: posting.destination, destination: posting.source })) }
    expect(await auditTreasuryFunding([source], [{ ...settlement, reverted: true, revertedAt: createdAt + 2 }, compensation], 'sandbox'))
      .toMatchObject({ kind: 'mismatch', expectedUnits: '1000000', observedUnits: '0' })
  })

  it.each([0, 1, 2, 3])('rejects a changed native total/principal/fee/tax posting at index %i', async index => {
    const { source, settlement } = fixture()
    const postings = settlement.postings.map(posting => ({ ...posting }))
    postings[index]!.amountUnits = String(BigInt(postings[index]!.amountUnits) + 1n)
    expect(await auditTreasuryFunding([source], [{ ...settlement, postings }], 'sandbox')).toMatchObject({ kind: 'mismatch', code: 'treasury_funding_native_binding_invalid' })
  })

  it('reports provider downtime without partial matched totals', async () => {
    const { source, settlement } = fixture()
    sdk.checkout.mockRejectedValueOnce(new Error('external_provider_down'))
    expect(await auditTreasuryFunding([source], [settlement], 'sandbox')).toEqual({ kind: 'unavailable', code: 'treasury_funding_processor_read_unavailable' })
  })

  it('preserves a known native orphan when an unrelated checkout read is unavailable', async () => {
    const { source, settlement, booking } = fixture()
    const orphan = native({ ...booking, commandRef: 'funding-reversal:re_orphan', idempotencyKey: 'funding-reversal:re_orphan' }, 'reversal', '2')
    sdk.checkout.mockRejectedValueOnce(new Error('external_provider_down'))
    expect(await auditTreasuryFunding([source], [settlement, orphan], 'sandbox')).toMatchObject({ kind: 'mismatch',
      code: 'treasury_funding_native_orphan', observedUnits: '0' })
  })

  it('preserves known native drift when Stripe client construction throws, without logging provider text', async () => {
    const { source, settlement, booking } = fixture()
    const orphan = native({ ...booking, commandRef: 'funding-reversal:re_orphan', idempotencyKey: 'funding-reversal:re_orphan' }, 'reversal', '2')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    sdk.construct.mockImplementationOnce(() => { throw new Error('unsafe_constructor_provider_content') })
    expect(await auditTreasuryFunding([source], [settlement, orphan], 'sandbox')).toMatchObject({ kind: 'mismatch', code: 'treasury_funding_native_orphan' })
    expect(log).toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain('unsafe_constructor_provider_content')
    expect(sdk.checkout).not.toHaveBeenCalled()
  })

  it('aborts a continually dripping response body after headers through the actual maintained Fetch adapter', async () => {
    const { source, settlement } = fixture()
    await auditTreasuryFunding([source], [settlement], 'sandbox')
    const options = sdk.construct.mock.calls[0]?.[1] as { httpClient: ReturnType<typeof Stripe.createFetchHttpClient> }
    const actualTimeout = AbortSignal.timeout.bind(AbortSignal)
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => actualTimeout(25))
    let aborted = false
    let signal: AbortSignal | null | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      signal = init?.signal
      if (signal === undefined || signal === null) throw new Error('missing_abort_signal')
      const requestSignal = signal
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{'))
          const drip = setInterval(() => controller.enqueue(new TextEncoder().encode(' ')), 2)
          requestSignal.addEventListener('abort', () => {
            aborted = true
            clearInterval(drip)
            controller.error(requestSignal.reason)
          }, { once: true })
        },
      })
      return new Response(stream, { headers: { 'content-type': 'application/json' } })
    }))
    // Headers arrive immediately, so the SDK clears its own timeout. Body I/O
    // keeps progressing, demonstrating why an inactivity timeout is insufficient.
    const response = await options.httpClient.makeRequest('api.stripe.com', '443', '/v1/audit-proof', 'GET', {}, '', 'https', 5_000)
    await expect(response.toJSON()).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(timeout).toHaveBeenCalledWith(TREASURY_FUNDING_REQUEST_TIMEOUT_MS)
    expect(aborted).toBe(true)
    expect(signal?.aborted).toBe(true)
  })

  it('preserves a proven processor binding mismatch when the next payment read fails', async () => {
    const { source, settlement, booking, session } = fixture()
    const secondBooking = { ...booking, commandRef: 'funding:second', idempotencyKey: 'funding:second:key', processorRef: 'cs_test_second' }
    const secondNative = native(secondBooking, 'settlement', '2')
    const secondSource: FundingSource = { ...source, commandRef: secondBooking.commandRef, idempotencyKey: secondBooking.idempotencyKey,
      externalRef: secondBooking.processorRef, appliedTransactionRef: secondNative.commandRef! }
    sdk.checkout.mockResolvedValueOnce({ ...session, metadata: { ...session.metadata, ae_command_ref: 'funding:wrong' } })
      .mockRejectedValueOnce(new Error('external_provider_down'))
    expect(await auditTreasuryFunding([source, secondSource], [settlement, secondNative], 'sandbox')).toMatchObject({
      kind: 'mismatch', code: 'treasury_funding_processor_binding_invalid', evidenceRefs: [source.commandRef] })
  })

  it('correlates an exact pending native booking without downgrading an unrelated orphan', async () => {
    const { source, settlement, booking } = fixture()
    const { appliedTransactionRef: _applied, ...pending } = source
    void _applied
    const pendingSource: FundingSource = { ...pending, state: 'pending' }
    expect(await auditTreasuryFunding([pendingSource], [settlement], 'sandbox')).toMatchObject({ kind: 'attention' })
    const orphan = native({ ...booking, commandRef: 'funding-reversal:re_orphan', idempotencyKey: 'funding-reversal:re_orphan' }, 'reversal', '2')
    expect(await auditTreasuryFunding([pendingSource], [settlement, orphan], 'sandbox')).toMatchObject({ kind: 'mismatch', code: 'treasury_funding_native_orphan' })
  })

  it('stops further external reads when the total audit deadline is exhausted', async () => {
    const { source, settlement, session } = fixture()
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    sdk.checkout.mockImplementationOnce(async () => { now += TREASURY_FUNDING_DEADLINE_MS; return session })
    expect(await auditTreasuryFunding([source], [settlement], 'sandbox')).toEqual({ kind: 'unavailable', code: 'treasury_funding_read_budget_exhausted' })
    expect(sdk.intent).not.toHaveBeenCalled()
    expect(sdk.refunds).not.toHaveBeenCalled()
  })

  it.each(['environment', 'missing_key', 'wrong_key_mode'] as const)('refuses %s before external reads', async fault => {
    const { source, settlement } = fixture()
    if (fault === 'environment') vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    if (fault === 'missing_key') vi.stubEnv('STRIPE_READBACK_KEY', undefined)
    if (fault === 'wrong_key_mode') vi.stubEnv('STRIPE_READBACK_KEY', 'rk_live_wrong_world')
    expect(await auditTreasuryFunding([source], [settlement], 'sandbox')).toEqual({ kind: 'unavailable',
      code: fault === 'environment' ? 'treasury_funding_environment_invalid' : 'treasury_funding_processor_unavailable' })
    expect(sdk.checkout).not.toHaveBeenCalled()
  })

  it.each(['identity', 'amount'] as const)('rejects a fresh charge with substituted %s', async fault => {
    const { source, settlement } = fixture()
    sdk.intent.mockResolvedValue({ id: 'pi_test_treasury', livemode: false, currency: 'aud', status: 'succeeded',
      amount: 111, amount_received: 111, latest_charge: { ...charge(),
        payment_intent: fault === 'identity' ? 'pi_another_payment' : 'pi_test_treasury',
        amount: fault === 'amount' ? 112 : 111 } })
    expect(await auditTreasuryFunding([source], [settlement], 'sandbox')).toMatchObject({ kind: 'mismatch', code: 'treasury_funding_charge_binding_invalid' })
  })

  it('traverses refunds beyond the first page without treating failed refunds as principal debits', async () => {
    const { source, settlement } = fixture()
    setProcessor(Array.from({ length: 101 }, (_, index) => refund(`re_failed_${index}`, 'failed', 1)))
    expect(await auditTreasuryFunding([source], [settlement], 'sandbox')).toMatchObject({ kind: 'matched', expectedUnits: '1000000', observedUnits: '1000000' })
    expect(sdk.refunds).toHaveBeenCalledTimes(2)
    expect(sdk.refunds.mock.calls[1]?.[0]).toMatchObject({ starting_after: 're_failed_99' })
  })

  it.each(['empty_continuation', 'duplicate_refund', 'saturated'] as const)('refuses %s refund pagination without green coverage', async fault => {
    const { source, settlement } = fixture()
    if (fault === 'empty_continuation') sdk.refunds.mockResolvedValue({ object: 'list', data: [], has_more: true })
    if (fault === 'duplicate_refund') sdk.refunds.mockResolvedValue({ object: 'list', data: [refund('re_duplicate', 'failed', 1)], has_more: true })
    if (fault === 'saturated') setProcessor(Array.from({ length: 1_001 }, (_, index) => refund(`re_failed_${index}`, 'failed', 1)))
    expect(await auditTreasuryFunding([source], [settlement], 'sandbox')).toMatchObject({ kind: 'unavailable', code:
      fault === 'empty_continuation' ? 'treasury_funding_refund_cursor_invalid'
        : fault === 'duplicate_refund' ? 'treasury_funding_refund_evidence_unavailable' : 'treasury_funding_refund_history_incomplete' })
  })

  it('refuses funding readback saturation before constructing Stripe', async () => {
    const { source, settlement } = fixture()
    expect(await auditTreasuryFunding(Array.from({ length: TREASURY_FUNDING_READBACK_LIMIT + 1 }, () => source), [settlement], 'sandbox'))
      .toEqual({ kind: 'unavailable', code: 'treasury_funding_readback_incomplete' })
    expect(sdk.construct).not.toHaveBeenCalled()
  })

  it('matches genuinely empty history without environment/key configuration or Stripe calls', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', undefined)
    vi.stubEnv('STRIPE_READBACK_KEY', undefined)
    expect(await auditTreasuryFunding([], [], 'sandbox')).toEqual({ kind: 'matched', checkedCount: 0,
      expectedUnits: '0', observedUnits: '0', differenceUnits: '0' })
    expect(sdk.construct).not.toHaveBeenCalled()
  })
})
