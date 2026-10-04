import type { fetch as UndiciFetch } from 'undici'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Response as UndiciResponse } from 'undici'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http'
import { eip3009ABI } from '@x402/evm'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, type Hex } from 'viem'

import { api, components, internal } from '../../convex/_generated/api'
import { prepareFundedSandboxBuyer, readEvidence, registerRotatingBuyer,
  type PrepareBuyerOptions } from './capability-call-workpool-harness'
import { publishedBusinessOwner } from '../helpers/convex-fixtures'
import { setPublicSourceTransportForTests, type ConvexSourceTransport } from '@/lib/server/convex-source'
import { handleToolQuotePost, handleToolCallPost, handleCallStatusGet, handleCallCancelPost } from '@/lib/server/call-api'
import { handleMcpRequest } from '@/lib/server/mcp-api'
import { callMachineResultSchema } from '@/modules/capability-execution/call-contracts'
import { callStatusResultSchema, callRecoveryResultSchema } from '@/modules/capability-execution/call-recovery.actions'
import { toolQuoteAction } from '@/modules/capability-execution/quote.actions'
import { isRecord } from '@/modules/common/is-record'
import { currentUtcMonthBounds } from '@/modules/common/freshness'
import { projectAgentDirectory } from '@/modules/agent-access/agent-access-console'
import { projectAgentFirstUse } from '@/modules/agent-access/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { readFormanceAccount, readFormanceTransactionByReference, type FormanceReferenceReadResult } from '@/modules/money/formance'
import { formanceAccountMetadataDigest, readFormanceSpendingPeriod } from '@/modules/money/formance-workflows'
import { readFormanceTreasuryBalances } from '@/modules/money/formance-treasury'
import { BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC_ADDRESS, cdpX402CustodyBudgetRef, cdpX402CustodyConfigurationFromEnvironment } from '@/modules/capability-supply/server'

const providerFetch = vi.hoisted(() => vi.fn<typeof UndiciFetch>())
const external = vi.hoisted(() => ({ cdpClient: vi.fn(), receipt: vi.fn() }))
vi.mock('@coinbase/cdp-sdk', async original => ({
  ...await original<Record<string, unknown>>(), CdpClient: class { constructor() { return external.cdpClient() } },
}))
vi.mock('@/modules/capability-supply/server', async original => ({
  ...await original<Record<string, unknown>>(), readGuardedX402EvmReceipt: external.receipt,
}))
vi.mock('@/modules/money/x402-payee-screening.server', () => ({
  screenX402Payee: async (request: Record<string, unknown>) => ({ ...request,
    provider: 'trm-wallet-screening', outcome: 'clear', startedAt: Date.now(), checkedAt: Date.now(),
    reason: 'native_matrix_external_provider_fixture' }),
}))
vi.mock('undici', async original => ({ ...await original<Record<string, unknown>>(), fetch: providerFetch }))

type Buyer = Awaited<ReturnType<typeof prepareFundedSandboxBuyer>>
type Evidence = Awaited<ReturnType<typeof readEvidence>>
type Transaction = Extract<FormanceReferenceReadResult, { kind: 'found' }>
type ProviderMode = 'settled' | 'settled_error' | 'invalid_output' | 'unpaid_error' | 'changed' | 'lost_response'
const BUYER_UNITS = '12000'
const PROVIDER_UNITS = '10000'
const INITIAL_CREDIT = '10000000'
const INITIAL_TREASURY_AVAILABLE = '9990000'
const transactionHash: Hex = `0x${'6'.repeat(64)}`
let restoreTransport: (() => void) | undefined

/**
 * Requires real native Ledger and registered Call/Workpool/financial handlers.
 * Ensures all nine rows agree across HTTP, source history, native cash/capacity,
 * and the independent external signing/challenge/payment trace.
 * Invariant: unknown sends retain liability; native and source replay cannot pay
 * twice. A paid error restores the buyer while preserving Provider expense.
 * On violation: an observable mismatch fails; no internal financial matcher,
 * builder, worker or recovery decision is mocked.
 * Complexity: this one test file owns local assertions, reusing the existing
 * buyer and evidence readers. No additional server, CLI or scenario framework.
 */
async function prepare(options: PrepareBuyerOptions = {}) {
  const buyer = await prepareFundedSandboxBuyer({ ...options, mocks: { providerFetch, external } })
  await buyer.backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 }))
  restoreTransport = setPublicSourceTransportForTests({ query: buyer.backend.query as ConvexSourceTransport['query'],
    mutation: buyer.backend.mutation as ConvexSourceTransport['mutation'], action: buyer.backend.action as ConvexSourceTransport['action'] })
  const optionsHttp = {
    authenticate: async () => ({ isAuthenticated: true as const, tokenType: 'api_key' as const,
      id: buyer.buyer.principal.credentialId, subject: 'user_native_matrix', scopes: buyer.buyer.principal.scopes,
      claims: { aeEnvironment: 'sandbox' } }),
    resolvePrincipal: async () => buyer.buyer.principal,
  }
  const request = (path: string, body?: unknown) => new Request(`https://ae.example${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${buyer.buyer.principal.credentialId}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const quote = async () => {
    const response = await handleToolQuotePost(request('/api/v1/tools/quote', {
      toolRef: buyer.published.toolRef, input: buyer.input,
    }), optionsHttp)
    const body: unknown = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(200)
    return toolQuoteAction.outputSchema.parse(body)
  }
  const call = async (quoteRef: string, key: string) => {
    const response = await handleToolCallPost(request('/api/v1/tools/call', { quoteRef, idempotencyKey: key }), optionsHttp)
    const body: unknown = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(200)
    return callMachineResultSchema.parse(body)
  }
  const status = async (callRef: string) => {
    const response = await handleCallStatusGet(request(`/api/v1/calls/${encodeURIComponent(callRef)}`), callRef, optionsHttp)
    const body: unknown = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(200)
    return callStatusResultSchema.parse(body)
  }
  const cancel = async (callRef: string) => {
    const response = await handleCallCancelPost(request(`/api/v1/calls/${encodeURIComponent(callRef)}/cancel`, {
      idempotencyKey: `matrix:cancel:${callRef}`,
    }), callRef, optionsHttp)
    const body: unknown = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(200)
    return callRecoveryResultSchema.parse(body)
  }
  return { ...buyer, quote, call, status, cancel }
}
type MatrixBuyer = Awaited<ReturnType<typeof prepare>>

function programProvider(buyer: Buyer) {
  let mode: ProviderMode = 'settled'
  let receiptReady = true
  let receipt: unknown
  const hits: Array<{ paid: boolean; status: number | 'lost' }> = []
  external.receipt.mockImplementation(async () => receiptReady ? receipt : undefined)
  providerFetch.mockImplementation(async (_url, init) => {
    const payment = new Headers(init?.headers as HeadersInit).get('payment-signature')
    if (payment === null) {
      const status = mode === 'unpaid_error' ? 500 : 402
      hits.push({ paid: false, status })
      if (status === 500) return new UndiciResponse('Seller unavailable', { status })
      const challenge = mode === 'changed' ? { ...buyer.resource.paymentRequired,
        accepts: buyer.resource.paymentRequired.accepts.map(item => ({ ...item, amount: (BigInt(item.amount) + 1n).toString() })) }
        : buyer.resource.paymentRequired
      return new UndiciResponse('', { status, headers: { 'Payment-Required': encodePaymentRequiredHeader(challenge) } })
    }
    const status = mode === 'lost_response' ? 'lost' : mode === 'settled_error' ? 500 : 200
    hits.push({ paid: true, status })
    const paidTransactionHash = `0x${(BigInt(transactionHash) + BigInt(hits.filter(hit => hit.paid).length - 1)).toString(16).padStart(64, '0')}` as Hex
    const { authorization } = decodePaymentSignatureHeader(payment).payload as { authorization: {
      from: Hex; to: Hex; value: string; validAfter: string; validBefore: string; nonce: Hex
    } }
    expect(authorization).toMatchObject({ from: buyer.payer.address, to: buyer.resource.paymentRequired.accepts[0]!.payTo, value: PROVIDER_UNITS })
    receipt = { transactionHash: paidTransactionHash, status: 'success', confirmations: 12n, blockHash: `0x${'7'.repeat(64)}`,
      blockNumber: 101n, observedBlockTimestamp: BigInt(Math.floor(Date.now() / 1000)), authorizationState: true,
      transactionTo: BASE_SEPOLIA_USDC_ADDRESS,
      transactionInput: encodeFunctionData({ abi: eip3009ABI, functionName: 'transferWithAuthorization', args: [
        authorization.from, authorization.to, BigInt(authorization.value), BigInt(authorization.validAfter),
        BigInt(authorization.validBefore), authorization.nonce, 27, `0x${'b'.repeat(64)}`, `0x${'c'.repeat(64)}`,
      ] }),
      logs: [{ address: BASE_SEPOLIA_USDC_ADDRESS,
        data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(authorization.value)]),
        topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: authorization.from, to: authorization.to } }),
      }],
    }
    if (status === 'lost') throw new TypeError('native_matrix_response_lost_after_signed_send')
    return new UndiciResponse(mode === 'invalid_output' ? '{"unexpected":true}'
      : status === 500 ? 'Seller error after payment' : '{"result":"native matrix result"}', {
      status, headers: { 'Content-Type': 'application/json', 'Payment-Response': encodePaymentResponseHeader({
        success: true, transaction: paidTransactionHash, network: BASE_SEPOLIA_NETWORK, payer: buyer.payer.address,
      }) },
    })
  })
  return { hits, setMode: (next: ProviderMode) => { mode = next }, setReceiptReady: (ready: boolean) => { receiptReady = ready } }
}

async function accept(buyer: MatrixBuyer, key: string) {
  const quote = await buyer.quote()
  expect(quote).toMatchObject({ kind: 'committed', price: { currency: 'AUD', units: BUYER_UNITS, exponent: 6 } })
  if (quote.kind !== 'committed') throw new Error(`matrix_quote_refused:${JSON.stringify(quote)}`)
  const pending = await buyer.call(quote.quoteRef, key)
  expect(pending).toMatchObject({ kind: 'pending' })
  if (pending.kind !== 'pending') throw new Error(`matrix_call_not_pending:${JSON.stringify(pending)}`)
  const evidence = await readEvidence(buyer.backend, pending.callRef)
  expect(evidence.call).toMatchObject({ state: 'pending', formanceFinancialState: 'reserved', quoteRef: quote.quoteRef })
  expect(evidence.history).toEqual([])
  await assertFinance(buyer, evidence, 'reserved')
  return { quote, pending }
}

async function drain(buyer: Buyer, callRef?: string) {
  await buyer.backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 }))
  await buyer.backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
  if (callRef === undefined) return
  // A later enqueue can share a live batch-worker loop. Its idempotent ping
  // waits for the maintained two-minute monitor; convex-test's twenty idle
  // turns are insufficient to reach that future schedule.
  for (let step = 0; step < 3; step += 1) {
    if ((await readEvidence(buyer.backend, callRef)).call?.state !== 'pending') return
    vi.advanceTimersByTime(120_001)
    await buyer.backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
  }
  expect((await readEvidence(buyer.backend, callRef)).call?.state).not.toBe('pending')
}

async function transaction(buyer: Buyer, ref: string): Promise<Transaction> {
  const result = await readFormanceTransactionByReference(buyer.formance, ref)
  expect(result, ref).toMatchObject({ kind: 'found', reference: ref })
  if (result.kind !== 'found') throw new Error(`matrix_native_reference_missing:${ref}`)
  return result
}

function segment(kind: string, reference: string | Record<string, string | number>) {
  return canonicalDigest({ format: 'ae.formance-account-segment:v1', value: { kind, reference } }).slice(7)
}

async function nativeTransactionIds(buyer: Buyer) {
  const response = await buyer.formance.sdk.ledger.v2.listTransactions({
    ledger: buyer.formance.configuration.ledger, pageSize: 100, sort: 'id:asc',
  }, { retries: { strategy: 'none' } })
  const cursor = response.v2TransactionsCursorResponse?.cursor
  expect(cursor).toBeDefined()
  expect(cursor?.hasMore).toBe(false)
  if (cursor === undefined || cursor.hasMore) throw new Error('matrix_native_history_incomplete')
  return cursor.data.map(row => row.id.toString())
}

async function signingReservation(buyer: Buyer, evidence: Evidence, state: 'liability' | 'settled') {
  const call = evidence.call
  if (call === null) throw new Error('matrix_signing_call_missing')
  const rows = await buyer.backend.run(async ctx => ({
    attempts: await ctx.db.query('moneyX402PaymentAttempts').collect(),
    reservations: await ctx.db.query('moneyX402SpendReservations').collect(),
  }))
  const payments = rows.attempts.filter(row => row.dispatchRef === call.callRef)
  expect(payments).toHaveLength(1)
  const payment = payments[0]!
  const reservations = rows.reservations.filter(row => row.dispatchRef === call.callRef)
  expect(reservations).toHaveLength(1)
  const reservation = reservations[0]!
  const custody = cdpX402CustodyConfigurationFromEnvironment()
  if (custody === undefined || payment.paymentUnsignedMaterialJson === undefined) throw new Error('matrix_signing_material_missing')
  const material = JSON.parse(payment.paymentUnsignedMaterialJson) as {
    accepted: { payTo: string; amount: string }; authorization: { from: string; to: string; value: string; nonce: string }; typedData: {
      message: { from: string; to: string; value: string; nonce: string }; domain: { chainId: number; verifyingContract: string }
    }
  }
  const payTo = buyer.resource.paymentRequired.accepts[0]!.payTo
  expect(payment).toMatchObject({ dispatchRef: call.callRef, attemptRef: call.attemptRef, effectGeneration: evidence.attempt?.effectGeneration,
    toolRef: buyer.published.toolRef, inputDigest: call.inputDigest, amountUnits: PROVIDER_UNITS,
    custodyBudgetRef: cdpX402CustodyBudgetRef(custody, 'sandbox'), custodyGeneration: 1,
    payTo, asset: BASE_SEPOLIA_USDC_ADDRESS, network: BASE_SEPOLIA_NETWORK, currency: 'USDC', exponent: 6,
    paymentUnsignedMaterialDigest: canonicalDigest(material), paymentPayer: buyer.payer.address.toLowerCase(),
  })
  expect(material.accepted).toMatchObject({ payTo, amount: PROVIDER_UNITS })
  expect(material.authorization.from.toLowerCase()).toBe(buyer.payer.address.toLowerCase())
  expect(material.authorization).toMatchObject({ to: payTo, value: PROVIDER_UNITS, nonce: payment.paymentNonce })
  expect(material.typedData.message).toMatchObject(material.authorization)
  expect(material.typedData.domain).toMatchObject({ chainId: 84532, verifyingContract: BASE_SEPOLIA_USDC_ADDRESS })
  expect(reservation).toMatchObject({ state, dispatchRef: call.callRef, attemptRef: payment.attemptRef,
    effectGeneration: payment.effectGeneration, reservationRef: payment.spendReservationRef,
    custodyBudgetRef: cdpX402CustodyBudgetRef(custody, 'sandbox'), custodyGeneration: 1, custodyRef: payment.custodyRef,
    authorizationDigest: payment.authorizationDigest, paymentIdentityDigest: payment.paymentIdentityDigest,
    paymentUnsignedMaterialDigest: canonicalDigest(material), paymentSigningIdempotencyKey: payment.paymentSigningIdempotencyKey,
    typedDataDigest: canonicalDigest(material.typedData), normalizedPayTo: payTo.toLowerCase(),
    amountUnits: PROVIDER_UNITS, asset: BASE_SEPOLIA_USDC_ADDRESS.toLowerCase(), network: BASE_SEPOLIA_NETWORK, currency: 'USDC', exponent: 6,
  })
  expect(reservation.paymentSigningIdempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
  return reservation
}

async function drainToUncertain(buyer: Buyer, callRef: string) {
  await buyer.backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 }))
  for (let step = 0; step < 100; step += 1) {
    vi.advanceTimersByTime(1)
    await buyer.backend.finishInProgressScheduledFunctions()
    const evidence = await readEvidence(buyer.backend, callRef)
    if (evidence.call?.state === 'reconciliation_required') return evidence
  }
  vi.advanceTimersByTime(120_001)
  await buyer.backend.finishInProgressScheduledFunctions()
  const evidence = await readEvidence(buyer.backend, callRef)
  expect(evidence.call?.state).toBe('reconciliation_required')
  return evidence
}

async function activeRecoveryAttempt(buyer: Buyer, callRef: string) {
  // Execute the actual scheduled watchdog with the external receipt still down.
  vi.advanceTimersByTime(60_001)
  await buyer.backend.finishInProgressScheduledFunctions()
  const evidence = await readEvidence(buyer.backend, callRef)
  expect(evidence.call?.reconciliation).toMatchObject({ disposition: 'automatic' })
  const owner = evidence.call?.reconciliation?.leaseOwner
  expect(owner).toMatch(/^paid-response:[0-3]$/u)
  const attempt = Number(owner?.split(':')[1])
  expect(evidence.call?.reconciliation?.attemptCount).toBe(attempt + 1)
  return attempt
}

async function assertFinance(buyer: Buyer, evidence: Evidence, state: 'reserved' | 'settled' | 'released' | 'remedied') {
  const call = evidence.call
  if (call === null || call.quoteRef === undefined) throw new Error('matrix_financial_call_missing')
  const quote = await buyer.backend.run(async ctx => await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', q => q.eq('quoteRef', call.quoteRef!)).unique())
  expect(quote).toMatchObject({ state: 'consumed', consumedCallRef: call.callRef,
    decisionAudUnits: BUYER_UNITS, sourceUsdcUnits: PROVIDER_UNITS })
  if (quote === null) throw new Error('matrix_consumed_quote_missing')
  const native = await buyer.backend.query(internal.moneyManagedCall.readBooking, { callRef: call.callRef })
  if (native.kind !== 'available') throw new Error('matrix_native_booking_missing')
  expect(native.booking).toMatchObject({ callRef: call.callRef, quoteRef: call.quoteRef,
    accountRef: buyer.buyer.principal.ownerId, buyerAmountUnits: BUYER_UNITS, providerAmountUnits: PROVIDER_UNITS })
  const canonical = await buyer.backend.run(async ctx => {
    const account = await ctx.db.query('accounts').withIndex('by_accountRef', q => q.eq('accountRef', buyer.buyer.principal.ownerId)).unique()
    if (account === null) throw new Error('matrix_account_missing')
    const ownership = await ctx.db.query('accountOwnerships').withIndex('by_ownershipRef', q => q.eq('ownershipRef', account.currentOwnershipRef)).unique()
    const binding = await ctx.db.query('moneyLegalCustomerBindings').withIndex('by_accountRef', q => q.eq('accountRef', account.accountRef)).unique()
    if (ownership === null || binding === null) throw new Error('matrix_customer_binding_missing')
    expect(binding).toMatchObject({ legalCustomerRef: ownership.ownerPrincipalRef, state: 'active', version: 1 })
    const publication = await ctx.db.query('capabilityPublications').filter(q => q.eq(q.field('toolRef'), buyer.published.toolRef)).first()
    if (publication === null) throw new Error('matrix_provider_publication_missing')
    return { customerRef: ownership.ownerPrincipalRef, providerBusinessRef: String(publication.businessId) }
  })
  const custody = cdpX402CustodyConfigurationFromEnvironment()
  if (custody === undefined) throw new Error('matrix_custody_missing')
  const custodyRef = cdpX402CustodyBudgetRef(custody, 'sandbox')
  const created = new Date(quote.createdAt)
  const dayStart = Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate())
  const monthStart = Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), 1)
  const monthEnd = Date.UTC(created.getUTCFullYear(), created.getUTCMonth() + 1, 1)
  expect(quote.spendingPeriods).toMatchObject({ daily: { periodStartAt: dayStart, periodEndAt: dayStart + 86_400_000 },
    monthly: { periodStartAt: monthStart, periodEndAt: monthEnd } })
  expect(native.booking).toMatchObject({ principalRef: buyer.buyer.principal.principalId,
    legalCustomerRef: canonical.customerRef, legalCustomerGeneration: 1, treasuryRef: custodyRef, treasuryGeneration: 1,
    providerRef: canonical.providerBusinessRef, spendingPeriods: quote.spendingPeriods })
  const legal = `legal_customers:${segment('legal_customer_exposure', { subjectRef: canonical.customerRef, generation: 1 })}`
  const treasuryAccount = `treasury:corporate:${segment('treasury_usdc', { subjectRef: custodyRef, generation: 1 })}`
  const periods = [['day', dayStart], ['month', monthStart]].map(([periodKind, periodStartAt]) =>
    `spending_periods:${segment('spending_period', { principalRef: buyer.buyer.principal.principalId, periodKind: String(periodKind), periodStartAt: Number(periodStartAt) })}`)
  const refs = call.formanceReservationRefs ?? []
  expect(refs).toHaveLength(3)
  const reservations = await Promise.all(refs.map(ref => transaction(buyer, ref)))
  expect(reservations.map(row => row.template)).toEqual(['CALL_RESERVED_AUD', 'CALL_RESERVED_USDC', 'PROVIDER_OBLIGATION_ACCRUED'])
  const callDigest = canonicalDigest({ format: 'ae.formance-account-segment:v1', value: { kind: 'call', reference: call.callRef } }).slice(7)
  for (const row of reservations) expect(row.metadata).toMatchObject({
    call_digest: callDigest, account_digest: formanceAccountMetadataDigest(buyer.buyer.principal.ownerId),
  })
  const [aud, usdc, obligation] = reservations
  if (aud === undefined || usdc === undefined || obligation === undefined) throw new Error('matrix_reservation_missing')
  const expectedAud = [
    { source: `accounts:${segment('account', buyer.buyer.principal.ownerId)}:available`, destination: `calls:${callDigest}:buyer_reserved`, asset: 'AUD/6', amountUnits: BUYER_UNITS },
    { source: `${legal}:exposure_available`, destination: `${legal}:exposure_reserved`, asset: 'AUD/6', amountUnits: BUYER_UNITS },
    ...periods.map(account => ({ source: `${account}:available`, destination: `${account}:reserved`, asset: 'AUD/6', amountUnits: BUYER_UNITS })),
  ]
  expect(aud.postings).toEqual(expectedAud)
  expect(usdc.postings).toEqual([{ source: `${treasuryAccount}:available`, destination: `${treasuryAccount}:committed`, asset: 'USDC/6', amountUnits: PROVIDER_UNITS }])
  expect(obligation.postings).toEqual([{ source: 'platform:expense:providers', destination: `provider_obligations:${callDigest}:accrued`, asset: 'USDC/6', amountUnits: PROVIDER_UNITS }])
  for (const posting of [...aud.postings, ...usdc.postings, ...obligation.postings]) {
    expect(await readFormanceAccount(buyer.formance, posting.destination)).toMatchObject({ kind: 'completed',
      volumes: { [posting.asset]: { balanceUnits: state === 'reserved' ? posting.amountUnits : '0' } } })
  }
  const finalRefs = [...call.formanceSettlementRefs ?? [], ...call.formanceReleaseRefs ?? []]
  expect(new Set([...refs, ...finalRefs]).size).toBe(refs.length + finalRefs.length)
  const finals = await Promise.all(finalRefs.map(ref => transaction(buyer, ref)))
  expect(finals.map(row => row.template).sort()).toEqual(state === 'reserved' ? []
    : state === 'settled' ? ['BUYER_SALE_SETTLED', 'PROVIDER_SETTLED']
      : state === 'remedied' ? ['CALL_RELEASED_AUD', 'PROVIDER_SETTLED'] : ['CALL_RELEASED_AUD', 'CALL_RELEASED_USDC'])
  for (const row of finals) {
    expect(row.metadata.call_digest).toBe(callDigest)
    expect(row.metadata.external_evidence_digest).toMatch(/^[a-f0-9]{64}$/u)
    if (row.template === 'BUYER_SALE_SETTLED') {
      expect(row.metadata.commitment_digest).toBe(quote.evidenceDigest.slice(7))
      expect(row.postings).toEqual([
        { source: `calls:${callDigest}:buyer_reserved`, destination: 'platform:revenue:sales', asset: 'AUD/6', amountUnits: BUYER_UNITS },
        { source: `calls:${callDigest}:buyer_reserved`, destination: 'platform:tax:gst', asset: 'AUD/6', amountUnits: '0' },
        { source: `${legal}:exposure_reserved`, destination: `${legal}:exposure_settled`, asset: 'AUD/6', amountUnits: BUYER_UNITS },
        ...periods.map(account => ({ source: `${account}:reserved`, destination: `${account}:spent`, asset: 'AUD/6', amountUnits: BUYER_UNITS })),
      ])
    } else if (row.template === 'CALL_RELEASED_AUD') {
      expect(row.postings).toEqual(expectedAud.map(posting => ({ ...posting, source: posting.destination, destination: posting.source })))
    } else if (row.template === 'PROVIDER_SETTLED') {
      expect(row.postings).toEqual([
        { source: `${treasuryAccount}:committed`, destination: `providers:${segment('provider', canonical.providerBusinessRef)}:settlement`, asset: 'USDC/6', amountUnits: PROVIDER_UNITS },
        { source: `provider_obligations:${callDigest}:accrued`, destination: `provider_obligations:${callDigest}:settled`, asset: 'USDC/6', amountUnits: PROVIDER_UNITS },
      ])
    } else {
      expect(row.postings).toEqual([
        { source: `${treasuryAccount}:committed`, destination: `${treasuryAccount}:available`, asset: 'USDC/6', amountUnits: PROVIDER_UNITS },
        { source: `provider_obligations:${callDigest}:accrued`, destination: 'platform:expense:providers', asset: 'USDC/6', amountUnits: PROVIDER_UNITS },
      ])
    }
  }
  const treasury = await readFormanceTreasuryBalances(buyer.formance, {
    custodyRef, custodyGeneration: 1,
  })
  expect(treasury).toMatchObject({ kind: 'available', bufferUnits: '10000',
    committedUnits: state === 'reserved' ? PROVIDER_UNITS : '0' })
  return { reservations, finals, native, treasury }
}

async function assertTerminal(buyer: MatrixBuyer, callRef: string, state: 'settled' | 'released' | 'remedied', recovered = false) {
  const evidence = await readEvidence(buyer.backend, callRef)
  expect(evidence.history.map(row => row.kind)).toEqual(state === 'released' ? ['claim_before_effect', 'terminal_failed']
    : recovered ? ['claim_before_effect', 'release_fence_before_network', 'terminal_uncertain', 'reconcile']
      : ['claim_before_effect', 'release_fence_before_network', state === 'remedied' ? 'terminal_uncertain' : 'terminal_returned'])
  expect(evidence.control?.control.control.state).toBe(state === 'remedied' ? 'reconciliation_required' : state === 'released' ? 'retryable' : 'terminal')
  if (state === 'released') expect(evidence.control?.control.control).toMatchObject({ reason: 'pre_release_failure' })
  expect(evidence.attempt).not.toBeNull()
  expect(evidence.call?.reconciliation).toBeUndefined()
  const financial = await assertFinance(buyer, evidence, state)
  if (state === 'released') {
    expect(await buyer.backend.run(async ctx => (await ctx.db.query('moneyX402SpendReservations').collect()).filter(row => row.dispatchRef === callRef))).toEqual([])
  } else await signingReservation(buyer, evidence, 'settled')
  const status = await buyer.status(callRef)
  expect(status).toMatchObject({ kind: 'found', callRef, state: 'terminal', result: evidence.call?.result,
    receipt: evidence.call?.result !== undefined && 'receipt' in evidence.call.result ? evidence.call.result.receipt : undefined })
  return { evidence, financial, status }
}

function assertHits(buyer: Buyer, provider: ReturnType<typeof programProvider>, unpaid: number, paid: number) {
  expect(provider.hits.filter(hit => !hit.paid)).toHaveLength(unpaid)
  expect(provider.hits.filter(hit => hit.paid)).toHaveLength(paid)
  expect(buyer.signedAuthorizations).toHaveLength(paid)
  expect(new Set(buyer.signedAuthorizations).size).toBe(paid)
}

async function assertNoCall(buyer: Buyer) {
  expect(await buyer.backend.run(async ctx => ({ calls: await ctx.db.query('capabilityCalls').collect(),
    history: await ctx.db.query('actionExecutionHistory').collect(), payments: await ctx.db.query('moneyX402PaymentAttempts').collect(),
    reservations: await ctx.db.query('moneyX402SpendReservations').collect() }))).toEqual({ calls: [], history: [], payments: [], reservations: [] })
  expect(await buyer.readBalance()).toMatchObject({ kind: 'available', units: INITIAL_CREDIT })
}

afterEach(() => {
  restoreTransport?.()
  restoreTransport = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  providerFetch.mockReset()
  external.cdpClient.mockReset()
  external.receipt.mockReset()
})

describe('native nine-row money contract matrix', () => {
  const native = it.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')

  native('MCP first use retains the purchase across connection, delivery and a client restart', async () => {
    let observer!: Awaited<ReturnType<typeof registerRotatingBuyer>>['owner']
    const buyer = await prepare({ buyerSetup: async backend => {
      const registered = await registerRotatingBuyer(backend, '5000000', '5000000', 2, '5000000')
      observer = registered.owner
      return registered
    } })
    const provider = programProvider(buyer)
    let watchedCallRef: string | undefined
    const readLive = async () => await observer.query(api.capabilityCallProjections.readOwnerAgentReadback, {
      principalRef: buyer.buyer.principal.principalId, ...(watchedCallRef === undefined ? {} : { callRef: watchedCallRef }), ...currentUtcMonthBounds(Date.now()), paginationOpts: { numItems: 50, cursor: null },
    })
    const owned = await observer.query(api.agentDirectory.listOwnedPage, {
      now: Date.now(), principalRef: buyer.buyer.principal.principalId, paginationOpts: { numItems: 25, cursor: null },
    })
    expect(owned.page.map(agent => agent.principalRef)).toEqual([buyer.buyer.principal.principalId])
    const foreignOwner = await publishedBusinessOwner(buyer.backend, 'first-use-foreign-observer')
    const watchArgs = { now: Date.now(), principalRef: buyer.buyer.principal.principalId, paginationOpts: { numItems: 25, cursor: null } }
    expect((await foreignOwner.owner.query(api.agentDirectory.listOwnedPage, watchArgs)).page).toEqual([])
    expect((await buyer.backend.query(api.agentDirectory.listOwnedPage, watchArgs)).page).toEqual([])
    const firstUse = async () => {
      const live = await readLive()
      const directory = projectAgentDirectory([], owned.page, [], [{ principalRef: buyer.buyer.principal.principalId,
        activity: live.activity.page, ...(live.watchedCall === undefined ? {} : { watchedCall: live.watchedCall }), ...(live.liveCalls === undefined ? {} : { liveCalls: live.liveCalls }), activityIsDone: live.activity.isDone, dataState: 'source' }])
      return projectAgentFirstUse({ directory, caller: buyer.buyer.principal.principalId, ...(watchedCallRef === undefined ? {} : { callRef: watchedCallRef }) })
    }
    const connect = async (authenticated: boolean) => {
      const client = new Client({ name: 'ae-first-use-proof', version: '1.0.0' })
      const transport = new StreamableHTTPClientTransport(new URL('https://ae.example/mcp'), {
        ...(authenticated ? { requestInit: { headers: { authorization: 'Bearer first-use-owner-approved' } } } : {}),
        fetch: async (input, init) => await handleMcpRequest(new Request(input, init), {
          authenticate: async () => ({ isAuthenticated: true, tokenType: 'api_key', id: buyer.buyer.principal.credentialId,
            subject: 'user_native_matrix', scopes: buyer.buyer.principal.scopes, claims: { aeEnvironment: 'sandbox' } }),
          resolvePrincipal: async () => buyer.buyer.principal,
        }),
      })
      await client.connect(transport as unknown as Parameters<Client['connect']>[0])
      return client
    }
    const publicClient = await connect(false)
    try {
      expect(publicClient.getInstructions()).toContain('share its exact verification link')
      const tools = await publicClient.listTools()
      expect(tools.tools.map(tool => tool.name)).toContain('ae_registry_tools_describe')
      expect(tools.tools.map(tool => tool.name)).not.toContain('ae_tool_call')
      const described = await publicClient.callTool({ name: 'ae_registry_tools_describe', arguments: { toolRef: buyer.published.toolRef } })
      expect(described.isError).not.toBe(true)
      expect(described.structuredContent).toMatchObject({ result: { kind: 'found', tool: { toolRef: buyer.published.toolRef } } })
    } finally { await publicClient.close() }

    const connected = await connect(true)
    let quoteRef: string
    let callRef: string
    const idempotencyKey = 'first-use:one-purchase'
    try {
      expect(connected.getInstructions()).toContain('A lost response is not permission to buy again')
      expect(connected.getInstructions()).toContain('/agent-access?caller=<principalRef')
      const tools = await connected.listTools()
      expect(tools.tools.map(tool => tool.name)).toContain('ae_tool_quote')
      const identity = await connected.callTool({ name: 'ae_agentAccess_whoami', arguments: {} })
      expect(identity.structuredContent).toMatchObject({ result: { kind: 'authenticated', principalRef: buyer.buyer.principal.principalId, accountRef: buyer.buyer.principal.ownerId } })
      const quoted = await connected.callTool({ name: 'ae_tool_quote', arguments: { toolRef: buyer.published.toolRef, input: buyer.input } })
      const quote = toolQuoteAction.outputSchema.parse(isRecord(quoted.structuredContent) ? quoted.structuredContent.result : undefined)
      expect(quote.kind).toBe('committed')
      if (quote.kind !== 'committed') throw new Error('first_use_quote_not_committed')
      quoteRef = quote.quoteRef
      const called = await connected.callTool({ name: 'ae_tool_call', arguments: { quoteRef, idempotencyKey } })
      const pending = callMachineResultSchema.parse(isRecord(called.structuredContent) ? called.structuredContent.result : undefined)
      expect(pending.kind).toBe('pending')
      if (pending.kind !== 'pending') throw new Error('first_use_call_not_pending')
      callRef = pending.callRef
      watchedCallRef = callRef
      expect(called.structuredContent).toMatchObject({ next: [{ action: 'status', args: { ref: { kind: 'call', ref: callRef } } }] })
      expect((await readLive()).liveCalls).toEqual(expect.arrayContaining([expect.objectContaining({
        callRef, credentialRef: buyer.buyer.principal.credentialId, phase: 'queued',
      })]))
      expect(await firstUse()).toMatchObject({ kind: 'running', call: { callRef } })
    } finally { await connected.close() }

    await drain(buyer)
    const resumed = await connect(true)
    try {
      await resumed.listTools()
      const recovered = await resumed.callTool({ name: 'ae_call_status', arguments: { callRef } })
      expect(recovered.structuredContent).toMatchObject({ result: { kind: 'found', callRef, state: 'terminal',
        result: { kind: 'completed', output: { result: 'native matrix result' }, receipt: { state: 'settled' } } }, next: [] })
      const live = await readLive()
      expect(live.liveCalls).toEqual(expect.arrayContaining([expect.objectContaining({ callRef, phase: 'finished' })]))
      expect(live.activity.page).toEqual(expect.arrayContaining([expect.objectContaining({ callRef, deliveryState: 'delivered', receiptRef: expect.any(String) })]))
      expect(await firstUse()).toMatchObject({ kind: 'delivered', call: { callRef, receiptRef: expect.any(String) } })
      const replay = await resumed.callTool({ name: 'ae_tool_call', arguments: { quoteRef, idempotencyKey } })
      expect(replay.structuredContent).toMatchObject({ result: { kind: 'completed', callRef } })
      await assertTerminal(buyer, callRef, 'settled')
      assertHits(buyer, provider, 3, 1)
      expect(await buyer.readBalance()).toMatchObject({ kind: 'available', units: '9988000' })
    } finally { await resumed.close() }
  }, 120_000)

  native('1: settled 2xx captures once, including an invalid delivered shape', async () => {
    const buyer = await prepare()
    const provider = programProvider(buyer)
    const accepted = await accept(buyer, 'matrix:success')
    await drain(buyer)
    const terminal = await assertTerminal(buyer, accepted.pending.callRef, 'settled')
    expect(terminal.status).toMatchObject({ result: { kind: 'completed', output: { result: 'native matrix result' },
      usage: { chargeState: 'paid', amount: { currency: 'AUD', units: BUYER_UNITS, exponent: 6 } } } })
    expect(await buyer.readBalance()).toMatchObject({ kind: 'available', units: '9988000' })
    expect(terminal.financial.treasury).toMatchObject({ availableUnits: '9980000' })
    assertHits(buyer, provider, 3, 1)

    await buyer.backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 }))
    provider.setMode('invalid_output')
    const invalid = await accept(buyer, 'matrix:invalid-2xx')
    await drain(buyer, invalid.pending.callRef)
    const failedDelivery = await assertTerminal(buyer, invalid.pending.callRef, 'settled')
    expect(failedDelivery.status).toMatchObject({ result: { kind: 'refused', code: 'provider_output_invalid',
      receipt: { state: 'settled', lossState: 'provider_output_invalid', refundState: 'not_applicable' } } })
    expect(failedDelivery.evidence.projection).toMatchObject({ deliveryState: 'not_delivered', paymentState: 'settled' })
    expect(await buyer.readBalance()).toMatchObject({ kind: 'available', units: '9976000' })
    expect(failedDelivery.financial.treasury).toMatchObject({ availableUnits: '9970000' })
    assertHits(buyer, provider, 6, 2)
  }, 120_000)

  native('2: unpaid seller 500 proves no payment and releases every hold', async () => {
    const buyer = await prepare()
    const provider = programProvider(buyer)
    const accepted = await accept(buyer, 'matrix:unpaid-500')
    provider.setMode('unpaid_error')
    await drain(buyer)
    const terminal = await assertTerminal(buyer, accepted.pending.callRef, 'released')
    expect(terminal.status).toMatchObject({ result: { kind: 'refused', code: 'provider_refused', retryable: false, receipt: { state: 'refunded', refundState: 'released' } } })
    expect(terminal.evidence.projection).toMatchObject({ deliveryState: 'not_delivered', paymentState: 'released' })
    expect(await buyer.readBalance()).toMatchObject({ kind: 'available', units: INITIAL_CREDIT })
    expect(terminal.financial.treasury).toMatchObject({ availableUnits: INITIAL_TREASURY_AVAILABLE })
    expect(await buyer.backend.run(async ctx => await ctx.db.query('moneyX402PaymentAttempts').collect())).toEqual([])
    expect(provider.hits).toEqual([{ paid: false, status: 402 }, { paid: false, status: 402 }, { paid: false, status: 500 }])
    assertHits(buyer, provider, 3, 0)
  }, 60_000)

  native('3: settled seller 500 restores buyer credit while retaining Provider payment and loss', async () => {
    const buyer = await prepare()
    const provider = programProvider(buyer)
    provider.setMode('settled_error')
    const accepted = await accept(buyer, 'matrix:paid-500')
    await drain(buyer)
    const terminal = await assertTerminal(buyer, accepted.pending.callRef, 'remedied')
    expect(terminal.status).toMatchObject({ result: { kind: 'refused', code: 'provider_refused', receipt: {
      state: 'refunded', lossState: 'provider_http_error', refundState: 'released', externalSettlementRef: transactionHash,
    } } })
    expect(await buyer.readBalance()).toMatchObject({ kind: 'available', units: INITIAL_CREDIT })
    expect(terminal.financial.treasury).toMatchObject({ availableUnits: '9980000' })
    expect(await buyer.backend.run(async ctx => await ctx.db.query('moneyProviderObligations')
      .withIndex('by_callRef', q => q.eq('callRef', accepted.pending.callRef)).unique())).toMatchObject({ state: 'settled',
      settlementTransactionRef: terminal.evidence.call?.formanceSettlementRefs?.[0] })
    assertHits(buyer, provider, 3, 1)
  }, 60_000)

  native('4: retained paid response recovers once after receipt timeout; no-response control keeps its liability', async () => {
    const buyer = await prepare()
    const provider = programProvider(buyer)
    provider.setReceiptReady(false)
    const accepted = await accept(buyer, 'matrix:receipt-timeout')
    const uncertain = await drainToUncertain(buyer, accepted.pending.callRef)
    expect(await buyer.status(accepted.pending.callRef)).toMatchObject({ kind: 'found', state: 'reconciliation_required' })
    expect(uncertain.call).toMatchObject({ state: 'reconciliation_required', formanceFinancialState: 'outcome_unknown' })
    await assertFinance(buyer, uncertain, 'reserved')
    await signingReservation(buyer, uncertain, 'liability')
    expect(await buyer.readBalance()).toMatchObject({ kind: 'available', units: '9988000' })
    const payment = await buyer.backend.run(async ctx => await ctx.db.query('moneyX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', q => q.eq('attemptRef', uncertain.call?.attemptRef ?? '').eq('effectGeneration', uncertain.attempt?.effectGeneration ?? 1)).unique())
    expect(payment).toMatchObject({ responseStatus: 200, quarantinedOutputJson: '{"result":"native matrix result"}' })
    assertHits(buyer, provider, 3, 1)
    const recoveryAttempt = await activeRecoveryAttempt(buyer, accepted.pending.callRef)
    const liabilityBeforeRecovery = await signingReservation(buyer, await readEvidence(buyer.backend, accepted.pending.callRef), 'liability')
    expect(await buyer.backend.action(internal.moneyX402ResponseActions.recover, { callRef: accepted.pending.callRef, attempt: recoveryAttempt + 1 })).toEqual({ kind: 'stopped' })
    expect(await signingReservation(buyer, await readEvidence(buyer.backend, accepted.pending.callRef), 'liability')).toEqual(liabilityBeforeRecovery)
    provider.setReceiptReady(true)
    // The registered recovery action reads the retained response and exact
    // independent receipt. It never dispatches a new Provider request.
    const recovered = await buyer.backend.action(internal.moneyX402ResponseActions.recover, {
      callRef: accepted.pending.callRef, attempt: recoveryAttempt,
    })
    expect(recovered).toMatchObject({ kind: 'completed' })
    const terminal = await assertTerminal(buyer, accepted.pending.callRef, 'settled', true)
    const nativeBeforeReplay = await nativeTransactionIds(buyer)
    const reservationBeforeReplay = await signingReservation(buyer, terminal.evidence, 'settled')
    const beforeReplay = await readEvidence(buyer.backend, accepted.pending.callRef)
    await buyer.backend.action(internal.moneyX402ResponseActions.recover, { callRef: accepted.pending.callRef,
      attempt: recoveryAttempt })
    expect(await buyer.call(accepted.quote.quoteRef, 'matrix:receipt-timeout')).toMatchObject({ kind: 'completed', callRef: accepted.pending.callRef })
    expect(await readEvidence(buyer.backend, accepted.pending.callRef)).toEqual(beforeReplay)
    expect(await nativeTransactionIds(buyer)).toEqual(nativeBeforeReplay)
    expect(await signingReservation(buyer, await readEvidence(buyer.backend, accepted.pending.callRef), 'settled')).toEqual(reservationBeforeReplay)
    expect(await buyer.readBalance()).toMatchObject({ kind: 'available', units: '9988000' })
    expect(terminal.financial.treasury).toMatchObject({ availableUnits: '9980000' })
    assertHits(buyer, provider, 3, 1)

    // A different Call actually loses the paid HTTP response. Its chain receipt
    // alone does not establish an HTTP result or permission to charge the buyer.
    await buyer.backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 }))
    provider.setMode('lost_response')
    const lost = await accept(buyer, 'matrix:lost-response')
    const retained = await drainToUncertain(buyer, lost.pending.callRef)
    expect(await buyer.status(lost.pending.callRef)).toMatchObject({ kind: 'found', state: 'reconciliation_required' })
    await assertFinance(buyer, retained, 'reserved')
    expect(retained.call?.reconciliation?.leaseOwner).toBeUndefined()
    const lostPayment = await buyer.backend.run(async ctx => await ctx.db.query('moneyX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', q => q.eq('attemptRef', retained.call?.attemptRef ?? '').eq('effectGeneration', retained.attempt?.effectGeneration ?? 1)).unique())
    expect(lostPayment?.responseStatus).toBeUndefined()
    expect(lostPayment?.quarantinedOutputJson).toBeUndefined()
    const lostRecoveryAttempt = 0
    const retainedLiability = await signingReservation(buyer, await readEvidence(buyer.backend, lost.pending.callRef), 'liability')
    const nativeBeforeStopped = await nativeTransactionIds(buyer)
    expect(await buyer.backend.action(internal.moneyX402ResponseActions.recover, {
      callRef: lost.pending.callRef, attempt: lostRecoveryAttempt,
    })).toMatchObject({ kind: 'stopped' })
    expect(await buyer.call(lost.quote.quoteRef, 'matrix:lost-response')).toMatchObject({ kind: 'outcome_unknown', callRef: lost.pending.callRef })
    expect(await buyer.readBalance()).toMatchObject({ kind: 'available', units: '9976000' })
    expect((await readEvidence(buyer.backend, lost.pending.callRef)).call?.formanceReleaseRefs).toBeUndefined()
    expect(await signingReservation(buyer, await readEvidence(buyer.backend, lost.pending.callRef), 'liability')).toEqual(retainedLiability)
    expect(await nativeTransactionIds(buyer)).toEqual(nativeBeforeStopped)
    assertHits(buyer, provider, 6, 2)
  }, 120_000)

  native('5: changed challenge refuses before signing and releases the accepted reservation', async () => {
    const buyer = await prepare()
    const provider = programProvider(buyer)
    const accepted = await accept(buyer, 'matrix:changed-challenge')
    provider.setMode('changed')
    await drain(buyer)
    const terminal = await assertTerminal(buyer, accepted.pending.callRef, 'released')
    expect(terminal.status).toMatchObject({ result: { kind: 'refused', code: 'provider_refused', retryable: false,
      receipt: { state: 'refunded', refundState: 'released' } } })
    expect(await buyer.call(accepted.quote.quoteRef, 'matrix:changed-challenge')).toMatchObject({ kind: 'refused', retryable: false })
    expect(await buyer.readBalance()).toMatchObject({ kind: 'available', units: INITIAL_CREDIT })
    expect(await buyer.backend.run(async ctx => await ctx.db.query('moneyX402PaymentAttempts').collect())).toEqual([])
    assertHits(buyer, provider, 3, 0)
  }, 60_000)

  native('6: identical HTTP retries return one Call and native receipt without another effect', async () => {
    const buyer = await prepare()
    const provider = programProvider(buyer)
    const accepted = await accept(buyer, 'matrix:replay')
    expect(await buyer.call(accepted.quote.quoteRef, 'matrix:replay')).toEqual(accepted.pending)
    await drain(buyer)
    const terminal = await assertTerminal(buyer, accepted.pending.callRef, 'settled')
    const before = await readEvidence(buyer.backend, accepted.pending.callRef)
    const nativeBefore = await nativeTransactionIds(buyer)
    const signingBefore = await signingReservation(buyer, before, 'settled')
    expect(await buyer.call(accepted.quote.quoteRef, 'matrix:replay')).toMatchObject({ kind: 'completed', callRef: accepted.pending.callRef })
    expect(await readEvidence(buyer.backend, accepted.pending.callRef)).toEqual(before)
    expect(await nativeTransactionIds(buyer)).toEqual(nativeBefore)
    expect(await signingReservation(buyer, before, 'settled')).toEqual(signingBefore)
    const replay = await assertFinance(buyer, before, 'settled')
    expect(replay.reservations).toEqual(terminal.financial.reservations)
    expect(replay.finals).toEqual(terminal.financial.finals)
    expect(await buyer.readBalance()).toMatchObject({ kind: 'available', units: '9988000' })
    expect(await buyer.backend.run(async ctx => await ctx.db.query('capabilityCalls').collect())).toHaveLength(1)
    assertHits(buyer, provider, 3, 1)
  }, 60_000)

  native('7: insufficient credit refuses another purchase without another Call or hold', async () => {
    const buyer = await prepare({ accountPrincipalUnits: BUYER_UNITS, maximumConcurrentCalls: 2 })
    const provider = programProvider(buyer)
    const secondQuote = await buyer.quote()
    if (secondQuote.kind !== 'committed') throw new Error('matrix_second_funds_quote_missing')
    const first = await accept(buyer, 'matrix:funds-first')
    const before = await readEvidence(buyer.backend, first.pending.callRef)
    expect(await buyer.call(secondQuote.quoteRef, 'matrix:funds-second')).toMatchObject({ kind: 'refused', code: 'commercial_policy_unavailable' })
    expect(await buyer.quote()).toMatchObject({ kind: 'refused', code: 'insufficient_balance' })
    expect(await readEvidence(buyer.backend, first.pending.callRef)).toEqual(before)
    expect(await buyer.readBalance()).toMatchObject({ kind: 'available', units: '0' })
    expect(await buyer.backend.run(async ctx => await ctx.db.query('capabilityCalls').collect())).toHaveLength(1)
    expect(await buyer.cancel(first.pending.callRef)).toMatchObject({ kind: 'found', state: 'cancelled' })
    await drain(buyer)
    const cancelled = await readEvidence(buyer.backend, first.pending.callRef)
    expect(cancelled.history).toEqual([])
    await assertFinance(buyer, cancelled, 'released')
    expect(await buyer.readBalance()).toMatchObject({ kind: 'available', units: BUYER_UNITS })
    expect(await buyer.status(first.pending.callRef)).toMatchObject({ kind: 'found', state: 'cancelled' })
    assertHits(buyer, provider, 5, 0)
  }, 60_000)

  native('8: per-Call and daily limits refuse without consuming extra native allowance', async () => {
    const buyer = await prepare({ buyerSetup: backend => registerRotatingBuyer(backend, '5000000', '5000000', 2, '11999') })
    const provider = programProvider(buyer)
    expect(await buyer.quote()).toMatchObject({ kind: 'refused', code: 'budget_exceeded', reason: 'per_call_limit' })
    await assertNoCall(buyer)
    assertHits(buyer, provider, 1, 0)
  }, 60_000)

  native('9: distinct keys race for one daily allowance, yielding one payment and no stranded hold', async () => {
    const buyer = await prepare({ buyerSetup: backend => registerRotatingBuyer(backend, '5000000') })
    const provider = programProvider(buyer)
    const quotes = await Promise.all([buyer.quote(), buyer.quote()])
    if (quotes[0]?.kind !== 'committed' || quotes[1]?.kind !== 'committed') throw new Error('matrix_race_quotes_missing')
    const calls = await Promise.all([buyer.call(quotes[0].quoteRef, 'matrix:race:first'), buyer.call(quotes[1].quoteRef, 'matrix:race:second')])
    expect(calls.filter(result => result.kind === 'pending')).toHaveLength(1)
    expect(calls.filter(result => result.kind === 'refused')).toEqual([expect.objectContaining({ kind: 'refused' })])
    const winner = calls.find(result => result.kind === 'pending')
    if (winner?.kind !== 'pending') throw new Error('matrix_race_winner_missing')
    const held = await readEvidence(buyer.backend, winner.callRef)
    await assertFinance(buyer, held, 'reserved')
    expect(held.history).toEqual([])
    expect(await buyer.quote()).toMatchObject({ kind: 'refused', code: 'budget_exceeded', reason: 'daily_limit_exhausted' })
    await drain(buyer)
    const terminal = await assertTerminal(buyer, winner.callRef, 'settled')
    const periods = terminal.financial.native.booking.spendingPeriods
    if (periods === undefined) throw new Error('matrix_periods_missing')
    for (const [periodKind, period, units] of [['day', periods.daily, '0'], ['month', periods.monthly, '4988000']] as const) {
      expect(await readFormanceSpendingPeriod(buyer.formance, { principalRef: buyer.buyer.principal.principalId,
        periodKind, periodStartAt: period.periodStartAt, periodEndAt: period.periodEndAt })).toMatchObject({ kind: 'available', units })
    }
    expect(await buyer.backend.run(async ctx => await ctx.db.query('capabilityCalls').collect())).toHaveLength(1)
    expect(await buyer.readBalance()).toMatchObject({ kind: 'available', units: '9988000' })
    assertHits(buyer, provider, 6, 1)
  }, 120_000)
})
