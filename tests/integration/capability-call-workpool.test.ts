import type { fetch as UndiciFetch } from 'undici'
import { Response as UndiciResponse } from 'undici'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { encodePaymentRequiredHeader, encodePaymentResponseHeader, decodePaymentSignatureHeader } from '@x402/core/http'
import { eip3009ABI } from '@x402/evm'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, type Hex } from 'viem'
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from 'convex/server'

import {
  INPUT,
  prepareFundedSandboxBuyer as prepareFundedSandboxBuyerHarness,
  quoteByCallKey,
  registerRotatingBuyer,
  seedPrincipal,
  type PrepareBuyerOptions,
  type TestPrincipal,
} from './capability-call-workpool-harness'
import { components, api, internal } from '../../convex/_generated/api'
import {
  convexTestWithWorkers,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import {
  admitPublication,
  capabilityPublicationInput,
  preparedPublicationArgs,
  seedCatalogOffering,
} from './capability-publication-harness'
import { installTestSourceWriteSecret, withSourceWrite, withSourceWriteCommand } from '../helpers/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  CUSTOMER_REQUEST_SPENDING_POLICY_SCOPE,
  MARKET_TOOLS_CALL_SCOPE,
} from '@/modules/agent-access/contract'
import {
  COMMERCIAL_POLICY_FAMILIES,
  audFundingPolicyFromCommercialControls,
  quoteAudAccountFunding,
} from '@/modules/money/public'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../helpers/commercial-policy-fixtures'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { capabilitySupplyGraphPorts } from '../../convex/capabilitySupplyGraphPorts'
import { qualifySuppliedCandidate } from '@/modules/capability-supply/public'
import {
  setPublicSourceTransportForTests,
  type ConvexSourceTransport,
} from '@/lib/server/convex-source'
import { handleMarketToolSearchRequest } from '@/routes/api.v1.market-tools.search'
import { handleMarketToolDescribeRequest } from '@/routes/api.v1.market-tools.describe'
import { handleMarketToolCompareRequest } from '@/routes/api.v1.market-tools.compare'
import { handleAgentAccountGet } from '@/lib/server/agent-account-api'
import {
  handleToolQuotePost,
  handleToolCallPost,
  handleCallStatusGet,
  handleCallCancelPost,
  handleCallReconcilePost,
} from '@/lib/server/call-api'
import { projectCallReceipt } from '@/modules/capability-execution/call-receipt-view'
import { callStatusResultSchema } from '@/modules/capability-execution/call-recovery.actions'
import { issuedAgentGrantRef } from '@/modules/agent-access/issued-agent-binding'
import { createFormanceContext, readFormanceAccount, readFormanceTransactionByReference } from '@/modules/money/formance'
import { bookFormanceFundingSettlement, formanceAccountMetadataDigest, readFormanceDisplayBalance, readFormanceSpendingPeriod, type FormanceManagedCallBooking } from '@/modules/money/formance-workflows'
import { BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC_ADDRESS } from '@/modules/capability-supply/server'

const providerFetch = vi.hoisted(() => vi.fn<typeof UndiciFetch>())
const external = vi.hoisted(() => ({ cdpClient: vi.fn(), receipt: vi.fn(), rate: vi.fn() }))
vi.mock('@coinbase/cdp-sdk', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  CdpClient: class { constructor() { return external.cdpClient() } },
}))
vi.mock('@/modules/money/reference-rate', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(), fetchCoinbaseReferenceRate: external.rate,
}))
vi.mock('@/modules/capability-supply/server', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(), readGuardedX402EvmReceipt: external.receipt,
}))
vi.mock('undici', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  fetch: providerFetch,
}))

const prepareFundedSandboxBuyer = (options: PrepareBuyerOptions = {}) =>
  prepareFundedSandboxBuyerHarness({ ...options, mocks: { providerFetch, external } })


function publicReceipt(
  state: 'settled' | 'refunded' | 'reconciliation_required',
  suffix: string,
) {
  const buyerAmount = { currency: 'AUD', units: '1100000', exponent: 6 }
  const providerAmount = { currency: 'USDC', units: '1000000', exponent: 6 }
  return {
    commercialModel: 'account_aud' as const,
    receiptRef: `receipt:call-workpool:${suffix}`,
    state,
    buyerCharge: buyerAmount,
    serviceFee: { currency: 'AUD', units: '0', exponent: 6 },
    totalBuyerCharge: buyerAmount,
    providerObligation: {
      amount: providerAmount,
      settlementMethod: 'managed_x402' as const,
      payoutEligible: false as const,
    },
    providerSettlement: {
      network: 'eip155:8453' as const,
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,
      amount: providerAmount,
    },
    priceDigest: `price:call-workpool:${suffix}`,
    transactionRef: `transaction:call-workpool:${suffix}`,
    ...(state === 'refunded'
      ? { refundState: 'released' as const, lossState: 'provider_output_invalid' as const }
      : state === 'reconciliation_required'
        ? { refundState: 'unknown' as const, lossState: 'unknown' as const }
        : { refundState: 'not_applicable' as const, lossState: 'none' as const }),
    evidenceHash: `evidence:call-workpool:${suffix}`,
    issuedAt: '2026-08-12T00:00:00.000Z',
  }
}

async function seedKeylessLookup(
  backend: ConvexFixtureBackend,
  suffix = 'workpool-lookup',
): Promise<string> {
  const { businessId, owner } = await publishedBusinessOwner(backend, suffix)
  await seedCatalogOffering(backend, businessId, suffix, '/lookup', 'GET')
  const source = capabilityPublicationInput(businessId, suffix)
  const prepared = await preparedPublicationArgs(backend, {
    ...source,
    offering: {
      ...source.offering,
      presentation: {
        ...source.offering.presentation,
        price: {
          kind: 'fixed',
          amount: { currency: 'AUD', units: '0', exponent: 6 },
        },
      },
    },
    binding: {
      ...source.binding,
      endpointUrl: `https://${suffix}.example.test/lookup`,
      authority: { kind: 'public_upstream' },
      adapter: {
        adapterId: 'http-json:v1',
        config: {
          method: 'GET',
          query: [{ inputPointer: '/request', parameter: 'request' }],
          requestTimeoutMs: 5_000,
        },
      },
    },
  })
  const {
    sourceWrite: _sourceWrite,
    sourceWriteRequest: _sourceWriteRequest,
    ...preparedWithoutAdmission
  } = prepared
  const published = await owner.mutation(
    api.capabilitySupply.publishPreparedCapability,
    await withSourceWrite('catalog_publish', {
      ...preparedWithoutAdmission,
      proof: {
        reverificationId: `reverify:workpool-publication:${suffix}`,
        firstFactorAgeMinutes: 0,
        secondFactorAgeMinutes: 0,
      },
    }),
  )
  if ('reason' in published) throw new Error(`publication_refused:${published.reason}`)
  await admitPublication(backend, published, suffix)
  await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
  const publication = await backend.run(async (ctx) => (
    (await ctx.db.query('capabilityPublications').collect()).find((row) => (
      row.offeringId === published.offeringId && row.disposition === 'current'
    ))
  ))
  if (publication === undefined) throw new Error('workpool publication missing')
  const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: publication.publicationRef,
    expectedRevision: publication.revision,
    credentialState: 'ready',
    healthState: 'healthy',
    validUntil: Date.now() + 3_600_000,
    operationKey: `test:call-workpool:readiness:${publication.publicationRef}`,
    correlationId: 'test:call-workpool',
    reasonCode: 'test_readiness',
    evidenceRefs: ['test:call-workpool'],
  })
  if (observed.kind !== 'observed') throw new Error(`workpool readiness refused: ${observed.reason}`)
  const qualification = await backend.run(async (ctx) => qualifySuppliedCandidate(
    capabilitySupplyGraphPorts(ctx.db),
    {
      candidate: {
        publicationRef: publication.publicationRef,
        revision: publication.revision,
        networkId: publication.networkId,
        businessId: publication.businessId,
        offeringId: publication.offeringId,
        bindingId: publication.bindingId,
        contractRef: {
          capabilityId: publication.capabilityId,
          version: publication.version,
          contractDigest: publication.contractDigest,
        },
      },
      now: Date.now(),
    },
  ))
  expect(qualification).toMatchObject({ status: 'eligible', reasons: [] })
  return publication.toolRef
}


async function seedCommercialPolicies(backend: ConvexFixtureBackend, now: number): Promise<void> {
  await backend.run(async (ctx) => {
    for (const [index, family] of COMMERCIAL_POLICY_FAMILIES.entries()) {
      await ctx.db.insert('moneyCommercialPolicies', {
        policyRef: `commercial-policy:workpool:${family}:1`,
        family,
        environment: 'production',
        revision: 1,
        lifecycle: 'active',
        effectiveAt: now - 1,
        expiresAt: now + 7 * 24 * 60 * 60 * 1_000,
        evidenceRef: `approval:workpool:${family}:1`,
        evidenceDigest: canonicalDigest({ family, index, kind: 'workpool-approval' }),
        control: PRODUCTION_COMMERCIAL_POLICY_CONTROLS[family],
        approvedByPrincipalRef: 'principal:workpool-approver',
        activeAccountRef: 'account:workpool-approver',
        authorityGeneration: 1,
        correlationRef: `correlation:workpool:${family}:1`,
        idempotencyRef: `idempotency:workpool:${family}:1`,
        commandDigest: canonicalDigest({ family, index, kind: 'workpool-policy-command' }),
        activatedAt: now - 1,
        updatedAt: now - 1,
      })
    }
  })
}

const execFileAsync = promisify(execFile)

async function serveCallRoutes(input: Readonly<{
  apiKeyId: string
  apiKeySubject: string
  scopes: readonly string[]
  principal: TestPrincipal
  loseCallAcknowledgement?: () => boolean
}>): Promise<Readonly<{ origin: string; close: () => Promise<void> }>> {
  const authenticate = async () => ({
    isAuthenticated: true as const,
    tokenType: 'api_key' as const,
    id: input.apiKeyId,
    subject: input.apiKeySubject,
    scopes: input.scopes,
    claims: { aeEnvironment: input.principal.environment },
  })
  const resolvePrincipal = async () => input.principal
  const server = createServer(async (incoming, outgoing) => {
    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('served_call_address_unavailable')
      const origin = `http://127.0.0.1:${address.port}`
      const url = new URL(incoming.url ?? '/', origin)
      const chunks: Buffer[] = []
      for await (const chunk of incoming) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      const body = Buffer.concat(chunks)
      const request = new Request(url, {
        ...(incoming.method === undefined ? {} : { method: incoming.method }),
        headers: incoming.headers as HeadersInit,
        ...(body.length === 0 ? {} : { body }),
      })
      let response: Response
      if (url.pathname === '/api/v1/market-tools/search') {
        response = await handleMarketToolSearchRequest(request)
      } else if (url.pathname === '/api/v1/market-tools/describe') {
        response = await handleMarketToolDescribeRequest(request)
      } else if (url.pathname === '/api/v1/market-tools/compare') {
        response = await handleMarketToolCompareRequest(request)
      } else if (url.pathname === '/api/v1/account') {
        response = await handleAgentAccountGet(request, { authenticate, resolvePrincipal })
      } else if (url.pathname === '/api/v1/tools/quote') {
        response = await handleToolQuotePost(request, { authenticate, resolvePrincipal })
      } else if (url.pathname === '/api/v1/tools/call') {
        response = await handleToolCallPost(request, { authenticate, resolvePrincipal })
      } else if (url.pathname.startsWith('/api/v1/calls/')) {
        const segments = url.pathname.slice('/api/v1/calls/'.length).split('/')
        const callRef = decodeURIComponent(segments[0]!)
        response = segments[1] === 'cancel'
          ? await handleCallCancelPost(request, callRef, { authenticate, resolvePrincipal })
          : segments[1] === 'reconcile'
            ? await handleCallReconcilePost(request, callRef, { authenticate, resolvePrincipal })
            : await handleCallStatusGet(request, callRef, { authenticate, resolvePrincipal })
      } else {
        response = Response.json({ code: 'route_not_found' }, { status: 404 })
      }
      if (url.pathname === '/api/v1/tools/call' && response.ok && input.loseCallAcknowledgement?.()) {
        outgoing.destroy()
        return
      }
      outgoing.statusCode = response.status
      response.headers.forEach((value, name) => outgoing.setHeader(name, value))
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      outgoing.statusCode = 500
      outgoing.end(JSON.stringify({ code: error instanceof Error ? error.message : 'served_call_error' }))
    }
  })
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('served_call_address_unavailable')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error === undefined ? resolveClose() : rejectClose(error))
    }),
  }
}

async function installPackagedCli(root: string): Promise<string> {
  const preparedCli = process.env.AE_TEST_INSTALLED_CLI
  if (preparedCli !== undefined) {
    await access(preparedCli)
    return preparedCli
  }
  const packageDirectory = join(root, 'package')
  const consumerDirectory = join(root, 'consumer')
  await mkdir(packageDirectory, { recursive: true })
  await mkdir(consumerDirectory, { recursive: true })
  await execFileAsync('npm', ['run', 'build:cli'], { cwd: resolve('.') })
  const packed = await execFileAsync('npm', [
    'pack',
    './packages/cli',
    '--json',
    '--pack-destination',
    packageDirectory,
  ], { cwd: resolve('.') })
  const packResult = JSON.parse(packed.stdout) as Array<{ filename: string }>
  const filename = packResult[0]?.filename
  if (filename === undefined) throw new Error('packaged_cli_tarball_missing')
  await writeFile(join(consumerDirectory, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  await execFileAsync('npm', [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--offline',
    join(packageDirectory, filename),
  ], {
    cwd: consumerDirectory,
  })
  return join(consumerDirectory, 'node_modules', '.bin', 'ae')
}

async function invokeCall(
  backend: ConvexFixtureBackend,
  principal: TestPrincipal,
  toolRef: string,
  idempotencyKey: string,
  suffix: string,
  sourcePrincipal: TestPrincipal = principal,
) {
  const callKey = `${principal.credentialId}:${idempotencyKey}`
  let quoteRef = quoteByCallKey.get(callKey)
  if (quoteRef === undefined) {
    const inspectionCommand = {
      operationKey: `test:call-workpool:quote:${suffix}`,
      correlationId: `test:call-workpool:quote:${suffix}`,
      principal: { ...principal, scopes: [...principal.scopes] },
      toolRef,
      input: INPUT,
    }
    const inspected = await backend.action(
      api.capabilityQuotes.quote,
      await withSourceWrite('protected_action', inspectionCommand),
    )
    if (inspected.kind !== 'committed') throw new Error(`call_quote_refused:${inspected.code}`)
    quoteRef = inspected.quoteRef
    quoteByCallKey.set(callKey, quoteRef)
  }
  const command = {
    operationKey: `test:call-workpool:call:${suffix}`,
    correlationId: `test:call-workpool:${suffix}`,
    principal: { ...principal, scopes: [...principal.scopes] },
    quoteRef,
    idempotencyKey,
  }
  const signed = await withSourceWrite('protected_action', {
    ...command,
    principal: { ...sourcePrincipal, scopes: [...sourcePrincipal.scopes] },
  })
  return await backend.action(
    api.capabilityCalls.call,
    { ...signed, principal: command.principal } as never,
  )
}

async function recoveryActionArgs(
  principal: TestPrincipal,
  callRef: string,
  suffix: string,
  idempotencyKey: string,
) {
  const args = {
    operationKey: `test:call-workpool:recovery:${suffix}`,
    correlationId: `test:call-workpool:recovery:${suffix}`,
    principal: { ...principal, scopes: [...principal.scopes] },
    callRef,
  }
  return await withSourceWriteCommand('protected_action', args, {
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    principal: args.principal,
    toolRef: '',
    input: {},
    idempotencyKey,
  })
}

async function readEvidence(
  backend: ConvexFixtureBackend,
  callRef: string,
) {
  return await backend.run(async (ctx) => {
    const call = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
      .unique()
    const control = await ctx.db.query('actionExecutionControls')
      .withIndex('by_executionRef', (query) => query.eq('executionRef', callRef))
      .unique()
    const attempt = await ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptRef', (query) => (
        query.eq('executionRef', callRef).eq('attemptRef', call?.attemptRef ?? '')
      ))
      .unique()
    const projection = await ctx.db.query('capabilityCallProjections')
      .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
      .unique()
    const history = await ctx.db.query('actionExecutionHistory')
      .withIndex('by_executionRef_and_executionVersion', (query) => query.eq('executionRef', callRef))
      .order('asc')
      .collect()
    return {
      call,
      control,
      attempt,
      history,
      projection,
    }
  })
}

afterEach(() => {
  vi.useRealTimers()
  quoteByCallKey.clear()
  providerFetch.mockReset()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  external.cdpClient.mockReset()
  external.rate.mockReset()
  external.receipt.mockReset()
})

async function expectAgentPeriodBalances(
  context: ReturnType<typeof createFormanceContext>,
  booking: FormanceManagedCallBooking,
  units: string,
) {
  if (booking.spendingPeriods === undefined) throw new Error('buyer_period_booking_missing')
  for (const [periodKind, period] of [
    ['day', booking.spendingPeriods.daily], ['month', booking.spendingPeriods.monthly],
  ] as const) {
    expect(await readFormanceSpendingPeriod(context, {
      principalRef: booking.principalRef, periodKind,
      periodStartAt: period.periodStartAt, periodEndAt: period.periodEndAt,
    })).toMatchObject({ kind: 'available', units })
  }
}


describe('capability Call Workpool lifecycle', () => {
  it.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')('enforces a distinct daily limit while monthly capacity remains available', async () => {
    const { backend, published, buyer, readBalance, signedAuthorizations } = await prepareFundedSandboxBuyer({
      buyerSetup: backend => registerRotatingBuyer(backend, '5000000'),
    })
    await backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 }))
    const first = await invokeCall(backend, buyer.principal, published.toolRef, 'daily-first', 'daily-first')
    if (first.kind !== 'pending') throw new Error(`daily_first_call_missing:${JSON.stringify(first)}`)
    const inspected = await backend.action(api.capabilityQuotes.quote, await withSourceWrite('protected_action', {
      operationKey: 'daily-second', correlationId: 'daily-second', principal: { ...buyer.principal, scopes: [...buyer.principal.scopes] },
      toolRef: published.toolRef, input: INPUT,
    }))
    const second = inspected.kind === 'committed'
      ? await invokeCall(backend, buyer.principal, published.toolRef, 'daily-second', 'daily-second')
      : inspected
    const balanceAfterSecond = await readBalance()
    for (const [index, result] of [first, second].entries()) {
      if (result.kind !== 'pending') continue
      const key = `daily-cancel-${index}`
      expect(await backend.action(api.capabilityCalls.cancelCall, {
        ...await recoveryActionArgs(buyer.principal, result.callRef, key, `cancel:${key}`), idempotencyKey: key,
      })).toMatchObject({ kind: 'found', state: 'cancelled', callRef: result.callRef })
    }
    await backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 }))
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '10000000' })
    expect(signedAuthorizations).toHaveLength(0)
    expect(providerFetch.mock.calls.filter(([, init]) => new Headers(init?.headers as HeadersInit).has('payment-signature'))).toHaveLength(0)
    expect(second, JSON.stringify({ second, balanceAfterSecond })).toMatchObject({ kind: 'refused', code: 'budget_exceeded' })
    expect(balanceAfterSecond).toMatchObject({ kind: 'available', units: '8800000' })
  })

  it.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')('admits only one concurrent quoted Call against one daily allowance', async () => {
    const { backend, formance, published, buyer, readBalance, signedAuthorizations } = await prepareFundedSandboxBuyer({
      buyerSetup: backend => registerRotatingBuyer(backend, '5000000'),
    })
    await backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 }))
    const keys = ['period-race-one', 'period-race-two']
    const quote = async (key: string) => await backend.action(api.capabilityQuotes.quote, await withSourceWrite('protected_action', {
      operationKey: key, correlationId: key, principal: { ...buyer.principal, scopes: [...buyer.principal.scopes] },
      toolRef: published.toolRef, input: INPUT,
    }))
    for (const key of keys) {
      const offered = await quote(key)
      if (offered.kind !== 'committed') throw new Error(`race_quote_missing:${JSON.stringify(offered)}`)
      quoteByCallKey.set(`${buyer.principal.credentialId}:${key}`, offered.quoteRef)
    }
    const results = await Promise.all(keys.map(key => invokeCall(backend, buyer.principal, published.toolRef, key, key)))
    expect(results.filter(result => result.kind === 'pending'), JSON.stringify(results)).toHaveLength(1)
    expect(results.filter(result => result.kind === 'refused'), JSON.stringify(results)).toHaveLength(1)
    const winner = results.find(result => result.kind === 'pending')
    if (winner?.kind !== 'pending') throw new Error('period_race_winner_missing')
    const booking = await backend.query(internal.moneyManagedCall.readBooking, { callRef: winner.callRef })
    if (booking.kind !== 'available' || booking.booking.spendingPeriods === undefined) throw new Error('period_race_booking_missing')
    expect(await backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toHaveLength(1)
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '8800000' })
    expect(await quote('period-race-refreshed')).toMatchObject({ kind: 'refused', code: 'budget_exceeded', reason: 'daily_limit_exhausted' })
    const key = 'period-race-cancel'
    const cancel = async () => await backend.action(api.capabilityCalls.cancelCall, {
      ...await recoveryActionArgs(buyer.principal, winner.callRef, key, `cancel:${key}`), idempotencyKey: key,
    })
    expect(await cancel()).toMatchObject({ kind: 'found', state: 'cancelled' })
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    expect(await cancel()).toMatchObject({ kind: 'found', state: 'cancelled' })
    await backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 }))
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '10000000' })
    for (const [periodKind, period, units] of [
      ['day', booking.booking.spendingPeriods.daily, '1200000'],
      ['month', booking.booking.spendingPeriods.monthly, '5000000'],
    ] as const) expect(await readFormanceSpendingPeriod(formance, { principalRef: buyer.principal.principalId,
      periodKind, periodStartAt: period.periodStartAt, periodEndAt: period.periodEndAt })).toMatchObject({ kind: 'available', units })
    expect(signedAuthorizations).toHaveLength(0)
    expect(providerFetch.mock.calls.filter(([, init]) => new Headers(init?.headers as HeadersInit).has('payment-signature'))).toHaveLength(0)
  })

  for (const [label, start, monthlyUnits] of [
    ['day', Date.UTC(2026, 8, 14, 23, 59, 50), '2400000'],
    ['month', Date.UTC(2026, 8, 30, 23, 59, 50), '2400000'],
  ] as const) {
    it.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')(`keeps original holds and recovery across a UTC ${label} boundary`, async () => {
      const { backend, formance, published, buyer, readBalance } = await prepareFundedSandboxBuyer({
        initialTime: start,
        buyerSetup: backend => registerRotatingBuyer(backend, monthlyUnits, '2400000'),
      })
      await backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 }))
      const quote = async (key: string) => await backend.action(api.capabilityQuotes.quote, await withSourceWrite('protected_action', {
        operationKey: key, correlationId: key, principal: { ...buyer.principal, scopes: [...buyer.principal.scopes] },
        toolRef: published.toolRef, input: INPUT,
      }))
      const unused = await quote('boundary-unused')
      if (unused.kind !== 'committed') throw new Error(`boundary_quote_missing:${JSON.stringify(unused)}`)
      expect(unused.expiresAt).toBe(start + 10_000)
      const first = await invokeCall(backend, buyer.principal, published.toolRef, 'boundary-first', 'boundary-first')
      if (first.kind !== 'pending') throw new Error(`boundary_first_call_missing:${JSON.stringify(first)}`)
      const old = await backend.query(internal.moneyManagedCall.readBooking, { callRef: first.callRef })
      if (old.kind !== 'available' || old.booking.spendingPeriods === undefined) throw new Error('old_period_booking_missing')
      vi.setSystemTime(start + 10_001)
      const expired = await backend.action(api.capabilityCalls.call, await withSourceWrite('protected_action', {
        operationKey: 'boundary-expired', correlationId: 'boundary-expired', principal: { ...buyer.principal, scopes: [...buyer.principal.scopes] },
        quoteRef: unused.quoteRef, idempotencyKey: 'boundary-expired',
      }))
      expect(expired).toMatchObject({ kind: 'refused' })
      // Accepted replay retains the original Call even though its Quote's day ended.
      expect(await invokeCall(backend, buyer.principal, published.toolRef, 'boundary-first', 'boundary-first-replay'))
        .toMatchObject({ kind: 'pending', callRef: first.callRef })
      const second = await invokeCall(backend, buyer.principal, published.toolRef, 'boundary-second', 'boundary-second')
      if (second.kind !== 'pending') throw new Error(`boundary_second_call_missing:${JSON.stringify(second)}`)
      const current = await backend.query(internal.moneyManagedCall.readBooking, { callRef: second.callRef })
      if (current.kind !== 'available' || current.booking.spendingPeriods === undefined) throw new Error('current_period_booking_missing')
      expect(current.booking.spendingPeriods.daily.periodStartAt).not.toBe(old.booking.spendingPeriods.daily.periodStartAt)
      if (label === 'day') {
        expect(current.booking.spendingPeriods.monthly).toEqual(old.booking.spendingPeriods.monthly)
        expect(await quote('boundary-month-exhausted')).toMatchObject({ kind: 'refused', code: 'budget_exceeded', reason: 'monthly_limit_exhausted' })
      } else {
        expect(current.booking.spendingPeriods.monthly.periodStartAt).not.toBe(old.booking.spendingPeriods.monthly.periodStartAt)
      }
      expect(await readBalance()).toMatchObject({ kind: 'available', units: '7600000' })
      const cancel = async (callRef: string, key: string) => await backend.action(api.capabilityCalls.cancelCall, {
        ...await recoveryActionArgs(buyer.principal, callRef, key, `cancel:${key}`), idempotencyKey: key,
      })
      expect(await cancel(first.callRef, 'boundary-release-original')).toMatchObject({ kind: 'found', state: 'cancelled' })
      // Complete this cancelled Call's canonical refund while the current Call
      // remains held. Drain the full worker queue only after both cancellations.
      expect(await backend.action(internal.moneyManagedCallLifecycle.releaseBeforeSubmission, {
        callRef: first.callRef, now: Date.now(),
      })).toMatchObject({ kind: 'accepted', state: 'released' })
      expect(await cancel(first.callRef, 'boundary-release-original')).toMatchObject({ kind: 'found', state: 'cancelled' })
      const periodBalance = async (booking: FormanceManagedCallBooking, periodKind: 'day' | 'month') => {
        const period = periodKind === 'day' ? booking.spendingPeriods!.daily : booking.spendingPeriods!.monthly
        return await readFormanceSpendingPeriod(formance, { principalRef: booking.principalRef, periodKind,
          periodStartAt: period.periodStartAt, periodEndAt: period.periodEndAt })
      }
      expect(await periodBalance(old.booking, 'day')).toMatchObject({ kind: 'available', units: '2400000' })
      expect(await periodBalance(current.booking, 'day')).toMatchObject({ kind: 'available', units: '1200000' })
      // A late old-month release changes the old month; it never tops up the new month.
      if (label === 'month') expect(await periodBalance(old.booking, 'month')).toMatchObject({ kind: 'available', units: '2400000' })
      expect(await periodBalance(current.booking, 'month')).toMatchObject({ kind: 'available', units: '1200000' })
      expect(await readBalance()).toMatchObject({ kind: 'available', units: '8800000' })
      expect(await cancel(second.callRef, 'boundary-release-current')).toMatchObject({ kind: 'found', state: 'cancelled' })
      await backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 }))
      await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
      expect(await readBalance()).toMatchObject({ kind: 'available', units: '10000000' })
    })
  }

  it.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')('refuses a quoted purchase after funds are reserved and permits continuation only after funding', async () => {
    const { backend, formance, published, buyer, readBalance, signedAuthorizations } = await prepareFundedSandboxBuyer({
      accountPrincipalUnits: '1200000', maximumConcurrentCalls: 2,
    })
    await backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 }))
    const quote = async (key: string) => await backend.action(api.capabilityQuotes.quote, await withSourceWrite('protected_action', {
      operationKey: key, correlationId: key, principal: { ...buyer.principal, scopes: [...buyer.principal.scopes] },
      toolRef: published.toolRef, input: INPUT,
    }))
    for (const key of ['funds-first', 'funds-second']) {
      const result = await quote(key)
      if (result.kind !== 'committed') throw new Error('funds_quote_missing')
      quoteByCallKey.set(`${buyer.principal.credentialId}:${key}`, result.quoteRef)
    }
    const first = await invokeCall(backend, buyer.principal, published.toolRef, 'funds-first', 'funds-first')
    if (first.kind !== 'pending') throw new Error('funds_first_call_missing')
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '0' })
    const refused = await invokeCall(backend, buyer.principal, published.toolRef, 'funds-second', 'funds-second')
    expect(refused).toMatchObject({
      kind: 'refused', code: 'commercial_policy_unavailable', retryable: false,
      nextAction: 'Request a new Quote for this Tool to check current funds and spending limits. Contact AE support if the purchase remains unavailable.',
    })
    expect(await backend.run(async ctx => await ctx.db.query('capabilityCalls').collect())).toHaveLength(1)
    const shortfall = await quote('funds-refresh')
    expect(shortfall).toMatchObject({ kind: 'refused', code: 'insufficient_balance', retryable: false })
    if (shortfall.kind !== 'refused' || shortfall.continuation?.action !== 'funding.handoff.create') throw new Error('funds_handoff_missing')
    const replayedShortfall = await quote('funds-refresh-repeat')
    if (replayedShortfall.kind !== 'refused') throw new Error('funds_handoff_replay_missing')
    expect(replayedShortfall.continuation).toEqual(shortfall.continuation)
    const amount = shortfall.continuation.input.principalAmount
    expect(amount).toMatchObject({ currency: 'AUD', exponent: 6 })
    const fundingQuote = quoteAudAccountFunding(BigInt(amount.units), audFundingPolicyFromCommercialControls(PRODUCTION_COMMERCIAL_POLICY_CONTROLS))
    if (fundingQuote === undefined) throw new Error('funds_topup_quote_invalid')
    // Verified funding settlement enters through the existing ledger workflow;
    // Stripe Checkout itself is outside this source integration fixture.
    const funding = {
      commandRef: 'funds-topup', idempotencyKey: shortfall.continuation.input.idempotencyKey,
      accountRef: buyer.principal.ownerId, processorRef: 'stripe:sandbox:funds-topup',
      principalUnits: amount.units, serviceFeeUnits: fundingQuote.serviceFeeUnits.toString(),
      taxUnits: fundingQuote.taxUnits.toString(), totalUnits: fundingQuote.totalUnits.toString(),
      policyDigest: canonicalDigest({ fixture: 'funds-topup' }), externalEvidenceDigest: canonicalDigest({ funding: 'verified sandbox topup' }),
    }
    const funded = await bookFormanceFundingSettlement(formance, funding)
    expect(funded, JSON.stringify(funded)).toMatchObject({ kind: 'completed', replayed: false })
    expect(await bookFormanceFundingSettlement(formance, funding)).toMatchObject({ kind: 'completed', replayed: true })
    const refreshed = await quote('funds-after-topup')
    if (refreshed.kind !== 'committed') throw new Error('funds_refreshed_quote_missing')
    quoteByCallKey.set(`${buyer.principal.credentialId}:funds-second`, refreshed.quoteRef)
    const second = await invokeCall(backend, buyer.principal, published.toolRef, 'funds-second', 'funds-second')
    expect(second).toMatchObject({ kind: 'pending' })
    if (second.kind !== 'pending') throw new Error('funds_second_call_missing')
    for (const [index, callRef] of [first.callRef, second.callRef].entries()) {
      const key = `funds-cancel-${index}`
      expect(await backend.action(api.capabilityCalls.cancelCall, {
        ...await recoveryActionArgs(buyer.principal, callRef, key, `cancel:${key}`), idempotencyKey: key,
      })).toMatchObject({ kind: 'found', state: 'cancelled', callRef })
    }
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    await backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 }))
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    expect(await readBalance()).toMatchObject({ kind: 'available', units: (1200000n + BigInt(amount.units)).toString() })
    expect(signedAuthorizations).toHaveLength(0)
    expect(providerFetch.mock.calls.filter(([, init]) => new Headers(init?.headers as HeadersInit).has('payment-signature'))).toHaveLength(0)
  })

  it.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true').each([
    { capacity: 'spending allowance', limitUnits: '1200000', maximumConcurrentCalls: 2 },
    { capacity: 'concurrency allowance', limitUnits: '2400000', maximumConcurrentCalls: 1 },
  ])('retains one Agent $capacity through registered credential replacement', async ({ limitUnits, maximumConcurrentCalls }) => {
    let registered: Awaited<ReturnType<typeof registerRotatingBuyer>> | undefined
    const { backend, formance, published, buyer, readBalance, signedAuthorizations } = await prepareFundedSandboxBuyer({
      buyerSetup: async backend => { registered = await registerRotatingBuyer(backend, limitUnits, limitUnits, maximumConcurrentCalls); return registered },
    })
    if (registered === undefined) throw new Error('rotating_buyer_not_registered')
    const { owner, input, subject, sign } = registered
    await backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 }))
    const accepted = await invokeCall(backend, buyer.principal, published.toolRef, 'rotation-purchase', 'rotation-purchase')
    expect(accepted).toMatchObject({ kind: 'pending' })
    if (accepted.kind !== 'pending') throw new Error('rotation_purchase_not_accepted')
    const booking = await backend.query(internal.moneyManagedCall.readBooking, { callRef: accepted.callRef })
    if (booking.kind !== 'available') throw new Error('rotation_booking_missing')
    await expectAgentPeriodBalances(formance, booking.booking, (BigInt(limitUnits) - 1200000n).toString())
    const replacement = {
      principalRef: buyer.principal.principalId, replacementMode: 'planned' as const,
      issuanceKey: 'rotating-buyer-successor', grantRef: issuedAgentGrantRef(subject, 'rotating-buyer-successor'),
      credentialId: 'credential:rotating-buyer-successor', applicationRef: input.applicationRef, environment: input.environment,
      scopes: input.scopes, authorityMode: input.authorityMode, toolAccess: input.toolAccess, toolRefs: input.toolRefs,
      spendingPolicy: input.spendingPolicy, createdAt: Date.now(), expiresAt: input.expiresAt,
    }
    const prepared = await owner.mutation(api.agentAccessPrincipals.prepareCredentialReplacementForServer, {
      ...replacement, serviceAuth: await sign('agentAccessPrincipals.prepareCredentialReplacementForServer', replacement),
    })
    expect(prepared).toMatchObject({ kind: 'recorded', generation: 2 })
    if (prepared.kind !== 'recorded' && prepared.kind !== 'replayed') throw new Error('rotation_not_prepared')
    const successor: TestPrincipal = { ...buyer.principal, credentialId: replacement.credentialId }
    const quote = async (principal: TestPrincipal, suffix: string) => await backend.action(api.capabilityQuotes.quote,
      await withSourceWrite('protected_action', { operationKey: `rotation:quote:${suffix}`, correlationId: `rotation:quote:${suffix}`,
        principal: { ...principal, scopes: [...principal.scopes] }, toolRef: published.toolRef, input: INPUT }))
    expect(await quote(successor, 'before-promotion')).toMatchObject({ kind: 'refused', code: 'grant_not_found' })
    const transition = { principalRef: buyer.principal.principalId, successorCredentialRef: prepared.successorCredentialRef, successorGrantRef: replacement.grantRef }
    expect(await owner.mutation(api.agentAccessPrincipals.promoteCredentialReplacementForServer, {
      ...transition, serviceAuth: await sign('agentAccessPrincipals.promoteCredentialReplacementForServer', transition),
    })).toMatchObject({ kind: 'completed', providerCredentialId: buyer.principal.credentialId })
    const [oldQuote, newQuote] = await Promise.all([quote(buyer.principal, 'revoked'), quote(successor, 'promoted')])
    expect(oldQuote).toMatchObject({ kind: 'refused', code: 'grant_not_found' })
    if (maximumConcurrentCalls === 1) {
      expect(newQuote).toMatchObject({ kind: 'committed' })
      expect(await invokeCall(backend, successor, published.toolRef, 'rotation-over-concurrency', 'rotation-over-concurrency'))
        .toMatchObject({ kind: 'refused', code: 'concurrency_limited' })
    } else {
      expect(newQuote).toMatchObject({ kind: 'refused', code: 'budget_exceeded', reason: 'daily_limit_exhausted' })
    }
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '8800000' })
    expect(await backend.run(async ctx => await ctx.db.query('capabilityCalls').collect())).toHaveLength(1)
    const cancel = async (callRef: string, key: string) => await backend.action(api.capabilityCalls.cancelCall, {
      ...await recoveryActionArgs(successor, callRef, key, `cancel:${key}`), idempotencyKey: key,
    })
    expect(await cancel(accepted.callRef, 'rotation-cancel-original')).toMatchObject({ kind: 'found', state: 'cancelled', callRef: accepted.callRef })
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '10000000' })
    const resumed = await invokeCall(backend, successor, published.toolRef, 'rotation-after-refund', 'rotation-after-refund')
    expect(resumed).toMatchObject({ kind: 'pending' })
    if (resumed.kind !== 'pending') throw new Error('rotation_continuation_not_accepted')
    const nextBooking = await backend.query(internal.moneyManagedCall.readBooking, { callRef: resumed.callRef })
    expect(nextBooking).toMatchObject({ kind: 'available', booking: { principalRef: buyer.principal.principalId,
      agentBudgetGeneration: booking.booking.agentBudgetGeneration, spendingPeriods: booking.booking.spendingPeriods } })
    expect(await cancel(resumed.callRef, 'rotation-cancel-next')).toMatchObject({ kind: 'found', state: 'cancelled' })
    await backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 }))
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '10000000' })
    await expectAgentPeriodBalances(formance, booking.booking, limitUnits)
    expect(signedAuthorizations).toHaveLength(0)
    expect(providerFetch.mock.calls.filter(([, init]) => new Headers(init?.headers as HeadersInit).has('payment-signature'))).toHaveLength(0)
  })

  it.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')('updates owner limits without reviving stale Quotes, reminting usage or stranding accepted Calls', async () => {
    let registered: Awaited<ReturnType<typeof registerRotatingBuyer>> | undefined
    const { backend, formance, published, buyer, readBalance, signedAuthorizations } = await prepareFundedSandboxBuyer({
      buyerSetup: async backend => { registered = await registerRotatingBuyer(backend, '3600000', '3600000'); return registered },
    })
    if (registered === undefined) throw new Error('policy_buyer_not_registered')
    const owner = registered.owner
    await backend.run(async ctx => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 }))
    const quote = async (suffix: string) => backend.action(api.capabilityQuotes.quote, await withSourceWrite('protected_action', {
      principal: { ...buyer.principal, scopes: [...buyer.principal.scopes] }, toolRef: published.toolRef, input: INPUT,
      operationKey: `policy-quote:${suffix}`, correlationId: `policy-quote:${suffix}`,
    }))
    const stale = await quote('before-change')
    if (stale.kind !== 'committed') throw new Error('original_policy_quote_missing')
    const first = await invokeCall(backend, buyer.principal, published.toolRef, 'policy-first', 'policy-first')
    if (first.kind !== 'pending') throw new Error('policy_first_call_missing')
    const original = await backend.query(internal.moneyManagedCall.readBooking, { callRef: first.callRef })
    if (original.kind !== 'available') throw new Error('policy_original_booking_missing')
    await expectAgentPeriodBalances(formance, original.booking, '2400000')
    const amount = (units: string) => ({ currency: 'AUD', exponent: 6, units })
    const update = (expectedGeneration: number, units: string, key: string) => owner.mutation(api.agentSpendingPolicy.updateForServer, {
      principalRef: buyer.principal.principalId, expectedGeneration, idempotencyKey: key,
      maximumSpendPerCall: amount('1200000'), maximumDailySpend: amount(units), maximumMonthlySpend: amount(units),
      correlationRef: `policy-update:${key}`,
    })
    expect(await owner.query(api.agentSpendingPolicy.readCurrent, { principalRef: buyer.principal.principalId }))
      .toMatchObject({ kind: 'current', generation: 1, maximumDailySpend: amount('3600000') })
    const lowered = await update(1, '1200000', 'lower')
    expect(lowered).toMatchObject({ kind: 'completed', generation: 2 })
    expect(await update(1, '1200000', 'lower')).toMatchObject({ kind: 'replayed', generation: 2 })
    expect(await backend.action(api.capabilityCalls.call, await withSourceWrite('protected_action', {
      principal: { ...buyer.principal, scopes: [...buyer.principal.scopes] }, quoteRef: stale.quoteRef,
      idempotencyKey: 'stale-policy-call', operationKey: 'stale-policy-call', correlationId: 'stale-policy-call',
    }))).toMatchObject({ kind: 'refused', code: 'operation_not_current' })
    expect(await backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toHaveLength(1)
    expect(await backend.run(ctx => ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', stale.quoteRef)).unique()))
      .toMatchObject({ state: 'issued' })
    expect(await quote('lowered')).toMatchObject({ kind: 'refused', code: 'budget_exceeded', reason: 'daily_limit_exhausted' })
    await expectAgentPeriodBalances(formance, original.booking, '0')
    expect(await backend.mutation(internal.capabilityCalls.reconcileCallWorkloadAuthority, { callRef: first.callRef }))
      .toMatchObject({ kind: 'authorized', authority: { grantRef: buyer.grantRef, grantGeneration: 1 } })
    expect(await backend.query(internal.moneyManagedCall.readBooking, { callRef: first.callRef })).toEqual(original)
    expect(await invokeCall(backend, buyer.principal, published.toolRef, 'policy-first', 'policy-first-replay'))
      .toMatchObject({ kind: 'pending', callRef: first.callRef })

    // A real native increase succeeds before its source acknowledgement. A newer
    // owner decision must recover that exact pending command, then only its delta.
    expect(await update(2, '2400000', 'intermediate')).toMatchObject({ kind: 'completed', generation: 3 })
    const pending = await backend.mutation(internal.capabilityQuotes.prepareSpendingPeriods, {
      principal: { ...buyer.principal, scopes: [...buyer.principal.scopes] }, toolRef: published.toolRef,
    })
    if (pending.kind !== 'prepared' || pending.commands.length !== 2) throw new Error('policy_pending_delta_missing')
    const submitted = await backend.action(internal.moneyFormance.adjustSpendingPeriod, pending.commands[0]!)
    expect(submitted).toMatchObject({ kind: 'completed', replayed: false })
    expect(await update(3, '3600000', 'latest')).toMatchObject({ kind: 'completed', generation: 4 })
    const latest = await quote('latest-after-lost-ack')
    expect(latest).toMatchObject({ kind: 'committed' })
    await expectAgentPeriodBalances(formance, original.booking, '2400000')
    expect(await backend.action(internal.moneyFormance.adjustSpendingPeriod, pending.commands[0]!))
      .toMatchObject({ kind: 'completed', replayed: true,
        transactionRefs: submitted.kind === 'completed' ? submitted.transactionRefs : [] })
    expect(await update(1, '1200000', 'lower')).toMatchObject({ kind: 'replayed', generation: 2 })
    expect(await owner.query(api.agentSpendingPolicy.readCurrent, { principalRef: buyer.principal.principalId }))
      .toMatchObject({ kind: 'current', generation: 4, maximumDailySpend: amount('3600000') })
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '8800000' })
    const second = await invokeCall(backend, buyer.principal, published.toolRef, 'policy-second', 'policy-second')
    if (second.kind !== 'pending') throw new Error('new_policy_call_missing')
    await expectAgentPeriodBalances(formance, original.booking, '1200000')
    for (const result of [first, second]) {
      const key = `policy-cancel:${result.callRef}`
      expect(await backend.action(api.capabilityCalls.cancelCall, {
        ...await recoveryActionArgs(buyer.principal, result.callRef, key, `cancel:${key}`), idempotencyKey: key,
      })).toMatchObject({ kind: 'found', state: 'cancelled', callRef: result.callRef })
    }
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    await expectAgentPeriodBalances(formance, original.booking, '3600000')
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '10000000' })
    expect(signedAuthorizations).toHaveLength(0)
    expect(providerFetch.mock.calls.filter(([, init]) => new Headers(init?.headers as HeadersInit).has('payment-signature'))).toHaveLength(0)
  })

  it.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')('preserves buyer credit and Agent allowance when concurrent quoted Calls exhaust treasury capacity', async () => {
    // Observe the real ledger rejection without replacing its request or result.
    const nativeBulkErrors: unknown[] = []
    const realFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args) => {
      const response = await realFetch(...args)
      const body = await response.clone().json().catch(() => null) as { errorCode?: string; data?: Array<{ responseType?: string }> } | null
      if (body?.errorCode !== undefined) nativeBulkErrors.push(body)
      if (Array.isArray(body?.data) && body.data.some(row => row.responseType === 'ERROR')) nativeBulkErrors.push(...body.data)
      return response
    })
    const { backend, formance, published, buyer, signedAuthorizations, readBalance } = await prepareFundedSandboxBuyer({ treasuryTotalUnits: '2000000', maximumConcurrentCalls: 2 })
    await backend.run(async (ctx) => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 }))
    const keys = ['treasury-first', 'treasury-second']
    for (const key of keys) {
      const quote = await backend.action(api.capabilityQuotes.quote, await withSourceWrite('protected_action', {
        operationKey: `test:${key}:quote`, correlationId: `test:${key}:quote`,
        principal: { ...buyer.principal, scopes: [...buyer.principal.scopes] }, toolRef: published.toolRef, input: INPUT,
      }))
      expect(quote).toMatchObject({ kind: 'committed' })
      if (quote.kind !== 'committed') throw new Error('treasury_contention_quote_missing')
      quoteByCallKey.set(`${buyer.principal.credentialId}:${key}`, quote.quoteRef)
    }
    const quoted = await backend.run(async (ctx) => await ctx.db.query('capabilityQuotes')
      .withIndex('by_quoteRef', q => q.eq('quoteRef', quoteByCallKey.get(`${buyer.principal.credentialId}:${keys[0]}`)!)).unique())
    if (quoted === null) throw new Error('treasury_contention_quote_not_persisted')
    const exposureBefore = await readFormanceDisplayBalance(formance, {
      balanceKind: 'legal_customer_exposure', subjectRef: quoted.legalCustomerRef, generation: quoted.legalCustomerGeneration, now: Date.now(),
    })
    if (exposureBefore.kind !== 'available') throw new Error('treasury_contention_exposure_missing')
    const results = await Promise.all(keys.map(key => invokeCall(backend, buyer.principal, published.toolRef, key, key)))
    expect(results.filter(result => result.kind === 'pending')).toHaveLength(1)
    expect(results.filter(result => result.kind === 'refused'), JSON.stringify({ results, nativeBulkErrors })).toEqual([expect.objectContaining({
      code: 'commercial_policy_unavailable', retryable: false,
    })])
    expect(nativeBulkErrors).toContainEqual(expect.objectContaining({
      errorCode: 'INSUFFICIENT_FUND', errorDescription: expect.stringContaining('@treasury:corporate:'),
    }))
    const winner = results.find(result => result.kind === 'pending')
    if (winner?.kind !== 'pending') throw new Error('treasury_contention_winner_missing')
    const material = await backend.query(internal.moneyManagedCall.readBooking, { callRef: winner.callRef })
    if (material.kind !== 'available') throw new Error('treasury_contention_booking_missing')
    const assertCapacity = async () => {
      await expectAgentPeriodBalances(formance, material.booking, '3800000')
      expect(await readBalance()).toMatchObject({ kind: 'available', units: '8800000' })
      for (const [balanceKind, subjectRef, generation, units] of [
        ['treasury_usdc', material.booking.treasuryRef, material.booking.treasuryGeneration, '0'],
        ['legal_customer_exposure', material.booking.legalCustomerRef, material.booking.legalCustomerGeneration, (BigInt(exposureBefore.units) - 1200000n).toString()],
      ] as const) {
        expect(await readFormanceDisplayBalance(formance, { balanceKind, subjectRef, generation, now: Date.now() }))
          .toMatchObject({ kind: 'available', units })
      }
      const rows = await backend.run(async (ctx) => await ctx.db.query('capabilityCalls').collect())
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ callRef: winner.callRef, formanceFinancialState: 'reserved' })
      expect(signedAuthorizations).toHaveLength(0)
      expect(providerFetch.mock.calls.filter(([, init]) => new Headers(init?.headers as HeadersInit).has('payment-signature'))).toHaveLength(0)
    }
    await assertCapacity()
    const loserKey = keys[results.findIndex(result => result.kind === 'refused')]!
    expect(await invokeCall(backend, buyer.principal, published.toolRef, loserKey, `${loserKey}:retry`)).toMatchObject({
      kind: 'refused', code: 'commercial_policy_unavailable', retryable: false,
    })
    await assertCapacity()
    expect(await backend.action(api.capabilityCalls.cancelCall, {
      ...await recoveryActionArgs(buyer.principal, winner.callRef, 'treasury-cancel-winner', 'cancel:treasury-cancel-winner'),
      idempotencyKey: 'treasury-cancel-winner',
    })).toMatchObject({ kind: 'found', state: 'cancelled', callRef: winner.callRef })
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '10000000' })
    // The refused command remains usable once actual capacity is available.
    const resumed = await invokeCall(backend, buyer.principal, published.toolRef, loserKey, `${loserKey}:capacity-restored`)
    expect(resumed).toMatchObject({ kind: 'pending' })
    if (resumed.kind !== 'pending') throw new Error('treasury_contention_retry_not_accepted')
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '8800000' })
    expect(await backend.action(api.capabilityCalls.cancelCall, {
      ...await recoveryActionArgs(buyer.principal, resumed.callRef, 'treasury-cancel-resumed', 'cancel:treasury-cancel-resumed'),
      idempotencyKey: 'treasury-cancel-resumed',
    })).toMatchObject({ kind: 'found', state: 'cancelled', callRef: resumed.callRef })
    await backend.run(async (ctx) => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 }))
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '10000000' })
    await expectAgentPeriodBalances(formance, material.booking, '5000000')
    for (const [balanceKind, subjectRef, generation, units] of [
      ['treasury_usdc', material.booking.treasuryRef, material.booking.treasuryGeneration, '1000000'],
      ['legal_customer_exposure', material.booking.legalCustomerRef, material.booking.legalCustomerGeneration, exposureBefore.units],
    ] as const) {
      expect(await readFormanceDisplayBalance(formance, { balanceKind, subjectRef, generation, now: Date.now() }))
        .toMatchObject({ kind: 'available', units })
    }
    expect(signedAuthorizations).toHaveLength(0)
    expect(providerFetch.mock.calls.filter(([, init]) => new Headers(init?.headers as HeadersInit).has('payment-signature'))).toHaveLength(0)
  })

  it.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true').each(['none', 'before_dispatch', 'after_claim'])('buys a sandbox Tool through an exact Quote, real AUD ledger and durable worker without a second purchase on replay or a retained hold after revocation (policy update: %s)', async (policyUpdatePhase) => {
    let registered: Awaited<ReturnType<typeof registerRotatingBuyer>> | undefined
    const { gatewayUrl, formance, backend, published, buyer, resource, payer, signedAuthorizations, readBalance } = await prepareFundedSandboxBuyer(policyUpdatePhase !== 'none' ? {
      buyerSetup: async backend => { registered = await registerRotatingBuyer(backend, '5000000', '5000000'); return registered },
    } : {})
    let revocationGrantRef = buyer.grantRef
    const updatePolicyForAcceptedCall = async () => {
      if (registered === undefined) throw new Error('policy_worker_owner_missing')
      const updated = await registered.owner.mutation(api.agentSpendingPolicy.updateForServer, {
        principalRef: buyer.principal.principalId, expectedGeneration: 1,
        idempotencyKey: 'policy-before-worker', correlationRef: 'policy-before-worker',
        maximumSpendPerCall: { currency: 'AUD', exponent: 6, units: '1200000' },
        maximumDailySpend: { currency: 'AUD', exponent: 6, units: '3600000' },
        maximumMonthlySpend: { currency: 'AUD', exponent: 6, units: '3600000' },
      })
      if (updated.kind !== 'completed') throw new Error('policy_worker_update_failed')
      revocationGrantRef = updated.grantRef
    }

    let raceCallRef: string | undefined
    let claimRaceResult: unknown
    let fenceRaceResult: unknown
    const settlementHash: Hex = `0x${'4'.repeat(64)}`
    const deliveries: Array<{ payment: string; output: { result: string } }> = []
    providerFetch.mockImplementation(async (_url, init) => {
      const payment = new Headers(init?.headers as HeadersInit).get('payment-signature')
      if (payment === null) return new UndiciResponse('', { status: 402, headers: { 'Payment-Required': encodePaymentRequiredHeader(resource.paymentRequired) } })
      const decoded = decodePaymentSignatureHeader(payment)
      const authorization = (decoded.payload as { authorization: { from: Hex; to: Hex; value: string; validAfter: string; validBefore: string; nonce: Hex } }).authorization
      const output = { result: 'literal sandbox buyer result' }
      deliveries.push({ payment, output })
      if (raceCallRef === undefined) throw new Error('buyer_race_call_missing')
      fenceRaceResult = await backend.mutation(internal.capabilityCalls.refuseUnclaimed, {
        callRef: raceCallRef, principalId: buyer.principal.principalId, credentialId: buyer.principal.credentialId,
        idempotencyKey: 'buyer-purchase', code: 'test_refusal_race', retryable: false,
      })
      external.receipt.mockResolvedValue({
        transactionHash: settlementHash, status: 'success', confirmations: 12n, blockHash: `0x${'5'.repeat(64)}`,
        blockNumber: 100n, observedBlockTimestamp: BigInt(Math.floor(Date.now() / 1000)), authorizationState: true,
        transactionTo: BASE_SEPOLIA_USDC_ADDRESS,
        transactionInput: encodeFunctionData({ abi: eip3009ABI, functionName: 'transferWithAuthorization', args: [
          authorization.from, authorization.to, BigInt(authorization.value), BigInt(authorization.validAfter), BigInt(authorization.validBefore),
          authorization.nonce, 27, `0x${'b'.repeat(64)}`, `0x${'c'.repeat(64)}`,
        ] }),
        logs: [{ address: BASE_SEPOLIA_USDC_ADDRESS,
          data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(authorization.value)]),
          topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: authorization.from, to: authorization.to } }),
        }],
      })
      return new UndiciResponse(JSON.stringify(output), { status: 200, headers: { 'Content-Type': 'application/json',
        'Payment-Response': encodePaymentResponseHeader({ success: true, transaction: settlementHash, network: BASE_SEPOLIA_NETWORK, payer: payer.address }),
      } })
    })
    vi.mocked(defaultDnsResolver.lookup).mockImplementation(async () => {
      if (raceCallRef !== undefined && claimRaceResult === undefined) {
        const current = await readEvidence(backend, raceCallRef)
        if (current.control?.control.control.state === 'leased' && current.attempt?.release.state !== 'possibly_released') {
          if (policyUpdatePhase === 'after_claim') await updatePolicyForAcceptedCall()
          claimRaceResult = await backend.mutation(internal.capabilityCalls.refuseUnclaimed, {
            callRef: raceCallRef, principalId: buyer.principal.principalId, credentialId: buyer.principal.credentialId,
            idempotencyKey: 'buyer-purchase', code: 'test_refusal_race', retryable: false,
          })
        }
      }
      return [{ address: '93.184.216.34', family: 4 }]
    })
    const pending = await invokeCall(backend, buyer.principal, published.toolRef, 'buyer-purchase', 'buyer-purchase')
    expect(pending).toMatchObject({ kind: 'pending' })
    if (pending.kind !== 'pending') throw new Error('buyer_call_not_pending')
    raceCallRef = pending.callRef
    for (const mismatchedIdentity of [
      { principalId: 'unrelated-principal' }, { credentialId: 'unrelated-credential' }, { idempotencyKey: 'another-purchase' },
    ]) {
      expect(await backend.mutation(internal.capabilityCalls.refuseUnclaimed, {
        callRef: pending.callRef, principalId: buyer.principal.principalId, credentialId: buyer.principal.credentialId,
        idempotencyKey: 'buyer-purchase', ...mismatchedIdentity, code: 'test_wrong_identity', retryable: false,
      })).toEqual({ kind: 'not_found' })
    }
    const beforeWork = await readEvidence(backend, pending.callRef)
    expect(beforeWork.call).toMatchObject({ formanceFinancialState: 'reserved' })
    expect(beforeWork.call?.sellerOnboardingCanary).toBeUndefined()
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '8800000' })
    if (policyUpdatePhase === 'before_dispatch') await updatePolicyForAcceptedCall()
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    const completed = await readEvidence(backend, pending.callRef)
    expect(claimRaceResult, JSON.stringify(completed.call?.result)).toMatchObject({ kind: 'claimed' })
    expect(fenceRaceResult, JSON.stringify(completed.call?.result)).toMatchObject({ kind: 'possibly_released' })
    expect(completed.call, JSON.stringify(completed.call?.result)).toMatchObject({ state: 'completed', formanceFinancialState: 'settled', result: {
      kind: 'completed', callRef: pending.callRef, output: { result: 'literal sandbox buyer result' },
      usage: { chargeState: 'paid', amount: { currency: 'AUD', units: '1200000', exponent: 6 } }, receipt: {
        commercialModel: 'account_aud', state: 'settled', buyerCharge: { currency: 'AUD', units: '1200000', exponent: 6 },
        providerObligation: { amount: { currency: 'USDC', units: '1000000', exponent: 6 } },
      },
    } })
    const quote = await backend.run(async (ctx) => await ctx.db.query('capabilityQuotes')
      .withIndex('by_quoteRef', q => q.eq('quoteRef', completed.call!.quoteRef!)).unique())
    expect(quote).toMatchObject({ state: 'consumed', consumedCallRef: pending.callRef, decisionAudUnits: '1200000', sourceUsdcUnits: '1000000' })
    const reservations = completed.call?.formanceReservationRefs ?? []
    const settlements = completed.call?.formanceSettlementRefs ?? []
    expect(reservations).toHaveLength(3)
    expect(settlements).toHaveLength(2)
    const reserve = await readFormanceTransactionByReference(formance, reservations[0]!)
    const capture = await readFormanceTransactionByReference(formance, settlements[0]!)
    expect(reserve).toMatchObject({ kind: 'found', template: 'CALL_RESERVED_AUD', metadata: { account_digest: formanceAccountMetadataDigest(buyer.principal.ownerId) } })
    expect(capture).toMatchObject({ kind: 'found', template: 'BUYER_SALE_SETTLED' })
    if (reserve.kind !== 'found' || capture.kind !== 'found' || quote === null) throw new Error('buyer_ledger_evidence_missing')
    const callDigest = canonicalDigest({ format: 'ae.formance-account-segment:v1', value: { kind: 'call', reference: pending.callRef } }).replace('sha256:', '')
    expect(reserve.metadata.call_digest).toBe(callDigest)
    expect(capture.metadata.call_digest).toBe(callDigest)
    expect(capture.metadata.commitment_digest).toBe(quote.evidenceDigest.replace('sha256:', ''))
    const callReserved = reserve.postings.find(row => row.source.endsWith(':available') && row.source.startsWith('accounts:'))
    expect(callReserved).toMatchObject({ asset: 'AUD/6', amountUnits: '1200000' })
    expect(await readFormanceAccount(formance, callReserved!.destination)).toMatchObject({ kind: 'completed', volumes: { 'AUD/6': { balanceUnits: '0' } } })
    expect(capture.postings.filter(row => row.source === callReserved!.destination).reduce((sum, row) => sum + BigInt(row.amountUnits), 0n)).toBe(1200000n)
    const balanceAfter = await readBalance()
    expect(balanceAfter).toMatchObject({ kind: 'available', units: '8800000' })
    const replay = await invokeCall(backend, buyer.principal, published.toolRef, 'buyer-purchase', 'buyer-purchase-replay')
    expect(replay).toMatchObject({ kind: 'completed', callRef: pending.callRef, output: { result: 'literal sandbox buyer result' } })
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '8800000' })
    const rows = await backend.run(async (ctx) => await ctx.db.query('capabilityCalls').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]?.formanceReservationRefs).toEqual(reservations)
    expect(rows[0]?.formanceSettlementRefs).toEqual(settlements)
    expect(deliveries).toHaveLength(1)
    expect(signedAuthorizations).toHaveLength(1)
    expect(completed.history.map(row => row.kind)).toEqual(['claim_before_effect', 'release_fence_before_network', 'terminal_returned'])

    // A second accepted purchase is revoked before its worker can claim it.
    // The buyer retains the funds; revoked authority permits no Provider payment.
    await backend.run(async (ctx) => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 }))
    const revoked = await invokeCall(backend, buyer.principal, published.toolRef, 'buyer-revoked', 'buyer-revoked')
    expect(revoked).toMatchObject({ kind: 'pending' })
    if (revoked.kind !== 'pending') throw new Error('buyer_revocation_call_not_pending')
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '7600000' })
    expect(await backend.mutation(internal.agentAccessPolicy.revokeGrant, {
      grantRef: revocationGrantRef, ownerId: buyer.principal.ownerId,
      credentialId: buyer.principal.credentialId, principalId: buyer.principal.principalId, updatedAt: Date.now(),
    })).toMatchObject({ kind: 'revoked' })
    let failedRefundRequests = 0
    const originalFetch = globalThis.fetch
    const refundFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input)
      const requestMethod = init?.method ?? (input instanceof Request ? input.method : 'GET')
      if (requestUrl.startsWith(gatewayUrl) && requestMethod === 'POST') {
        failedRefundRequests += 1
        throw new TypeError('test_refund_gateway_unavailable')
      }
      return await originalFetch(input, init)
    })
    await backend.run(async (ctx) => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 }))
    vi.advanceTimersByTime(120_000)
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    const refused = await readEvidence(backend, revoked.callRef)
    expect(refused.call).toMatchObject({ state: 'refused', formanceFinancialState: 'reserved',
      result: { kind: 'refused', code: 'grant_not_found' },
      reconciliation: { disposition: 'automatic', reason: 'refund_pending' } })
    expect(failedRefundRequests).toBeGreaterThan(0)
    expect(await backend.mutation(internal.capabilityCalls.refuseUnclaimed, {
      callRef: revoked.callRef, principalId: buyer.principal.principalId, credentialId: buyer.principal.credentialId,
      idempotencyKey: 'buyer-revoked', code: 'later_refusal_must_not_replace_original', retryable: true,
    })).toEqual({ kind: 'refused', releaseRequired: true })
    const refusalReplay = await readEvidence(backend, revoked.callRef)
    expect(refusalReplay.call?.result).toEqual(refused.call?.result)
    expect(refusalReplay.call?.reconciliation).toEqual(refused.call?.reconciliation)
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '7600000' })
    expect(await backend.action(internal.capabilityCallWorker.run, { callRef: revoked.callRef })).toEqual({ kind: 'none' })
    refundFetch.mockRestore()

    // Simulate interruption after the ledger committed, before source financial
    // finalization, by performing that real existing external booking step alone.
    const material = await backend.query(internal.moneyManagedCall.readBooking, { callRef: revoked.callRef })
    if (material.kind !== 'available') throw new Error('buyer_refund_booking_missing')
    const ledgerRelease = await backend.action(internal.moneyFormance.releaseManagedCall, {
      booking: material.booking, externalEvidenceDigest: material.booking.quoteDigest, submissionProvenAbsent: true,
    })
    expect(ledgerRelease).toMatchObject({ kind: 'completed', replayed: false })
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '8800000' })
    expect((await readEvidence(backend, revoked.callRef)).call?.formanceFinancialState).toBe('reserved')
    vi.advanceTimersByTime(3_600_000)
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const workload = await backend.query(internal.workloadCron.admit, { name: 'reconcile due facilitator invocations' })
    expect(await backend.action(internal.capabilityCallWorker.reconcileScheduled, { workload }))
      .toMatchObject({ selected: 1, claimed: 1, completed: 1, retried: 0, manualReview: 0 })
    const released = await readEvidence(backend, revoked.callRef)
    expect(released.call).toMatchObject({ state: 'refused', formanceFinancialState: 'released',
      result: { kind: 'refused', code: 'grant_not_found' } })
    expect(released.call?.reconciliation).toBeUndefined()
    expect(released.call?.formanceSettlementRefs).toBeUndefined()
    if (ledgerRelease.kind !== 'completed') throw new Error('buyer_refund_ledger_missing')
    expect(released.call?.formanceReleaseRefs).toEqual(ledgerRelease.transactionRefs)
    expect(await backend.action(internal.capabilityCallWorker.reconcilePreClaimRefund, { callRef: revoked.callRef }))
      .toEqual({ kind: 'not_claimed' })
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '8800000' })
    expect(refused.history).toHaveLength(0)
    expect(deliveries).toHaveLength(1)
    expect(signedAuthorizations).toHaveLength(1)
  }, 30_000)

  it.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true').each(['before claim', 'after possible submission'] as const)(
    'resumes a paid Call from fresh installed CLI processes after acknowledgement loss %s', async (interruption) => {
      const { backend, published, buyer, resource, signedAuthorizations, readBalance } = await prepareFundedSandboxBuyer()
      await backend.run(async (ctx) => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 }))
      let paidRequests = 0
      providerFetch.mockImplementation(async (_url, init) => {
        if (!new Headers(init?.headers as HeadersInit).has('payment-signature')) {
          return new UndiciResponse('', { status: 402, headers: { 'Payment-Required': encodePaymentRequiredHeader(resource.paymentRequired) } })
        }
        paidRequests += 1
        throw new TypeError('test_provider_response_lost_after_submission')
      })
      let loseAcknowledgement = true
      const restoreTransport = setPublicSourceTransportForTests({
        query: backend.query as ConvexSourceTransport['query'],
        mutation: backend.mutation as ConvexSourceTransport['mutation'],
        action: backend.action as ConvexSourceTransport['action'],
      })
      const served = await serveCallRoutes({
        apiKeyId: buyer.principal.credentialId, apiKeySubject: 'user_paid_recovery',
        scopes: buyer.principal.scopes, principal: buyer.principal,
        loseCallAcknowledgement: () => {
          const lose = loseAcknowledgement
          loseAcknowledgement = false
          return lose
        },
      })
      const root = await mkdtemp(join(tmpdir(), 'ae-paid-recovery-'))
      const cliDist = resolve('packages/cli/dist')
      const cliDistWasPresent = await access(cliDist).then(() => true, () => false)
      try {
        const cli = await installPackagedCli(root)
        const runFreshCli = async (args: readonly string[]) => {
          const result = await execFileAsync(cli, [...args, '--base-url', served.origin, '--json'], {
            env: { ...process.env, AE_CONFIG_DIR: join(root, 'config'), AE_API_KEY: buyer.principal.credentialId, AE_API_KEY_ORIGIN: served.origin },
            maxBuffer: 4 * 1024 * 1024,
          }).then(({ stdout }) => ({ status: 0, stdout }), (error: { code: number; stdout: string }) => ({ status: error.code, stdout: error.stdout }))
          return { status: result.status, result: JSON.parse(result.stdout) as Record<string, unknown> }
        }
        const first = await runFreshCli(['call', published.toolRef, '--input', JSON.stringify(INPUT), '--idempotency-key', 'paid-recovery-purchase'])
        expect(first).toMatchObject({ status: 1, result: { code: 'call-transport-unknown' } })
        const recoveryRef = (first.result.detail as { recoveryRef: string }).recoveryRef
        expect(recoveryRef).toEqual(expect.any(String))
        const calls = await backend.run(async (ctx) => await ctx.db.query('capabilityCalls').collect())
        expect(calls).toHaveLength(1)
        const callRef = calls[0]!.callRef
        const reservationRefs = calls[0]!.formanceReservationRefs
        expect(reservationRefs).toHaveLength(3)
        expect(await readBalance()).toMatchObject({ kind: 'available', units: '8800000' })
        if (interruption === 'after possible submission') {
          await backend.run(async (ctx) => await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 }))
          vi.advanceTimersByTime(120_000)
          await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
          expect((await readEvidence(backend, callRef)).call).toMatchObject({ state: 'reconciliation_required' })
        }
        const resumed = await runFreshCli(['call', 'resume', recoveryRef])
        expect(resumed, JSON.stringify(resumed)).toMatchObject({ status: 0, result: { callRef } })
        const status = await runFreshCli(['status', callRef])
        expect(status).toMatchObject({ status: 0, result: {
          kind: 'found', callRef, state: interruption === 'before claim' ? 'in_progress' : 'reconciliation_required',
        } })
        const cancelled = await runFreshCli(['cancel', callRef, '--idempotency-key', 'paid-recovery-cancel'])
        expect(cancelled, JSON.stringify(cancelled)).toMatchObject({ status: 0, result: {
          kind: 'found', callRef, state: interruption === 'before claim' ? 'cancelled' : 'reconciliation_required',
        } })
        await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
        const retained = await readEvidence(backend, callRef)
        expect(retained.call?.formanceReservationRefs).toEqual(reservationRefs)
        expect(retained.call?.formanceSettlementRefs).toBeUndefined()
        if (interruption === 'before claim') {
          expect(retained.call?.formanceFinancialState).toBe('released')
          expect(retained.call?.formanceReleaseRefs).toHaveLength(2)
          expect(retained.call?.reconciliation).toBeUndefined()
        } else {
          expect(['possibly_submitted', 'outcome_unknown']).toContain(retained.call?.formanceFinancialState)
          expect(retained.call?.formanceReleaseRefs).toBeUndefined()
        }
        expect(await readBalance()).toMatchObject({ kind: 'available', units: interruption === 'before claim' ? '10000000' : '8800000' })
        expect(paidRequests).toBe(interruption === 'before claim' ? 0 : 1)
        expect(signedAuthorizations).toHaveLength(paidRequests)
        expect(await backend.run(async (ctx) => await ctx.db.query('capabilityCalls').collect())).toHaveLength(1)
        expect(await runFreshCli(['call', 'resume', recoveryRef])).toMatchObject({ status: 0, result: { callRef } })
        expect(await readBalance()).toMatchObject({ kind: 'available', units: interruption === 'before claim' ? '10000000' : '8800000' })
        expect(paidRequests).toBe(interruption === 'before claim' ? 0 : 1)
        expect(signedAuthorizations).toHaveLength(interruption === 'before claim' ? 0 : 1)
        if (interruption === 'after possible submission') {
          const statusResponse = await fetch(`${served.origin}/api/v1/calls/${encodeURIComponent(callRef)}`, {
            headers: { Authorization: `Bearer ${buyer.principal.credentialId}` },
          })
          expect(statusResponse.status).toBe(200)
          const current = callStatusResultSchema.parse(await statusResponse.json())
          expect(status.result).toMatchObject(current)
          if (current.kind !== 'found' || current.attemptRef === undefined || current.effectGeneration === undefined) throw new Error('paid_recovery_identity_missing')
          const unsupportedRelease = {
            kind: 'action_invocation_reconciliation', version: 1, evidenceRef: 'client:unverified-absence', source: 'client',
            invocationRef: callRef, attemptRef: current.attemptRef, effectGeneration: current.effectGeneration,
            resolution: 'not_released', observedAt: new Date().toISOString(),
          }
          const reconciled = await runFreshCli(['recover', callRef, JSON.stringify({
            ...unsupportedRelease, digest: canonicalDigest(unsupportedRelease),
          }), '--idempotency-key', 'paid-recovery-unverified-release'])
          expect(reconciled, JSON.stringify(reconciled)).toMatchObject({ status: 0, result: { kind: 'found', callRef, state: 'reconciliation_required' } })
          const freshPurchase = await runFreshCli(['call', published.toolRef, '--input', JSON.stringify(INPUT)])
          expect(freshPurchase).toMatchObject({ status: 1, result: { code: 'call-recovery-required' } })
          expect(await backend.run(async (ctx) => await ctx.db.query('capabilityCalls').collect())).toHaveLength(1)
          expect(await readBalance()).toMatchObject({ kind: 'available', units: '8800000' })
          expect(paidRequests).toBe(1)
          expect(signedAuthorizations).toHaveLength(1)
        }
      } finally {
        restoreTransport()
        await served.close()
        await rm(root, { recursive: true, force: true })
        if (!cliDistWasPresent) await rm(cliDist, { recursive: true, force: true })
      }
    }, 120_000,
  )

  it('executes once, replays without another effect, and refuses a revoked grant before claim', async () => {
    const signingSecretSentinel = 'call-workpool-signing-secret-sentinel-32-bytes'
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', signingSecretSentinel)
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-12T00:00:00Z'))

    const backend = convexTestWithWorkers()
    await seedCommercialPolicies(backend, Date.now())
    const toolRef = await seedKeylessLookup(backend)
    const now = Date.now()
    const first = await seedPrincipal(backend, 'success', now, toolRef)
    await expect(backend.query(
      internal.capabilitySupplyTools.readCurrentPublishedToolSnapshot,
      { toolRef },
    )).resolves.toMatchObject({ toolJson: expect.any(String) })
    const revoked = await seedPrincipal(backend, 'revoked', now, toolRef)
    await expect(backend.query(internal.agentAccessPolicy.readActiveGrant, {
      credentialId: first.principal.credentialId,
      environment: first.principal.environment,
      principalId: first.principal.principalId,
      applicationRef: first.principal.applicationRef,
      now,
    })).resolves.toMatchObject({ grantRef: first.grantRef })

    const providerOutput = { result: 'ok' }
    let historyObservedDuringProvider: string[] = []
    let pendingCallRef: string | undefined
    providerFetch.mockImplementation(async (input) => {
      expect(String(input)).toContain('workpool-lookup.example.test')
      const providerCallRef = pendingCallRef
      if (providerCallRef === undefined) {
        throw new Error('Call reference not assigned before provider transport')
      }
      historyObservedDuringProvider = await backend.run(async (ctx) => (
        (await ctx.db.query('actionExecutionHistory')
          .withIndex('by_executionRef_and_executionVersion', (query) => (
            query.eq('executionRef', providerCallRef)
          ))
          .order('asc')
          .collect())
          .map((row) => row.kind)
      ))
      return new UndiciResponse(JSON.stringify(providerOutput), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    providerFetch.mockClear()

    await expect(invokeCall(
      backend,
      first.principal,
      toolRef,
      'call-workpool-forged',
      'forged',
      {
        ...first.principal,
      principalId: revoked.principal.principalId,
      ownerId: revoked.principal.ownerId,
      },
    )).resolves.toMatchObject({
      kind: 'refused',
      code: 'invocation_runtime_unavailable',
    })
    expect(providerFetch).not.toHaveBeenCalled()

    const pending = await invokeCall(backend, first.principal, toolRef, 'call-workpool-success', 'success')
    expect(pending.kind).toBe('pending')
    if (pending.kind !== 'pending') throw new Error('successful operation did not enqueue')
    const successfulCallRef = pending.callRef
    pendingCallRef = successfulCallRef
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))

    const completed = await readEvidence(backend, successfulCallRef)
    const completedResult = completed.call?.result
    expect(completedResult).toMatchObject({ kind: 'completed' })
    if (completedResult?.kind !== 'completed') throw new Error('completed operation result missing')
    expect(completed.call).toMatchObject({
      state: 'completed',
      dispatchState: 'completed',
      workId: expect.any(String),
      result: { kind: 'completed', callRef: successfulCallRef, toolRef },
    })
    expect(completed.control?.control.control).toMatchObject({ state: 'terminal' })
    expect(completed.attempt?.release).toMatchObject({ state: 'released' })
    expect(completed.attempt?.outcome).toMatchObject({ state: 'returned' })
    expect(completed.history.map((row) => row.kind)).toEqual([
      'claim_before_effect',
      'release_fence_before_network',
      'terminal_returned',
    ])
    expect(completed.history.map((row) => row.executionVersion)).toEqual([1, 2, 3])
    expect(completedResult.output).toEqual(providerOutput)
    await expect(backend.action(
      api.capabilityCalls.readCallStatus,
      await recoveryActionArgs(
        first.principal,
        successfulCallRef,
        'status-owner',
        `status:${successfulCallRef}`,
      ),
    )).resolves.toMatchObject({
      kind: 'found',
      callRef: successfulCallRef,
      toolRef,
      state: 'terminal',
      result: {
        kind: 'completed',
        toolRef,
        output: providerOutput,
      },
    })
    await expect(backend.action(
      api.capabilityCalls.readCallStatus,
      await recoveryActionArgs(
        revoked.principal,
        successfulCallRef,
        'status-isolated',
        `status:${successfulCallRef}`,
      ),
    )).resolves.toMatchObject({
      kind: 'refused',
      callRef: successfulCallRef,
      code: 'invocation_not_found',
    })
    await expect(backend.action(
      api.capabilityCalls.cancelCall,
      {
        ...await recoveryActionArgs(
          revoked.principal,
          successfulCallRef,
          'cancel-isolated',
          'cancel:cancel-isolated',
        ),
        idempotencyKey: 'cancel-isolated',
      },
    )).resolves.toMatchObject({
      kind: 'refused',
      callRef: successfulCallRef,
      code: 'invocation_not_found',
    })
    await expect(backend.action(
      api.capabilityCalls.reconcileCall,
      {
        ...await recoveryActionArgs(
          revoked.principal,
          successfulCallRef,
          'reconcile-isolated',
          'reconcile:reconcile-isolated',
        ),
        idempotencyKey: 'reconcile-isolated',
        evidence: {
          kind: 'action_invocation_reconciliation',
          version: 1,
          evidenceRef: 'test:call-workpool:reconcile-isolated',
          source: 'test',
          invocationRef: successfulCallRef,
          attemptRef: completed.attempt?.attemptRef ?? 'attempt:missing',
          effectGeneration: 1,
          resolution: 'not_released',
          observedAt: new Date().toISOString(),
          digest: canonicalDigest({ invocationRef: successfulCallRef, isolated: true }),
        },
      },
    )).resolves.toMatchObject({
      kind: 'refused',
      callRef: successfulCallRef,
      code: 'invocation_not_found',
    })
    const statusVariants = await backend.run(async (ctx) => {
      const source = await ctx.db.query('capabilityCalls')
        .withIndex('by_callRef', (query) => query.eq('callRef', successfulCallRef))
        .unique()
      if (source === null) throw new Error('call_workpool_status_source_missing')
      const {
        _id: _sourceId,
        _creationTime: _sourceCreationTime,
        attemptRef: sourceAttemptRef,
        ...material
      } = source
      const variants = [
        {
          suffix: 'paid-settled',
          state: 'completed' as const,
          dispatchState: 'completed' as const,
          receipt: publicReceipt('settled', 'paid-settled'),
        },
        {
          suffix: 'refunded',
          state: 'refused' as const,
          dispatchState: 'failed' as const,
          receipt: publicReceipt('refunded', 'refunded'),
        },
        {
          suffix: 'reconciliation-required',
          state: 'reconciliation_required' as const,
          dispatchState: 'reconciliation_required' as const,
          receipt: publicReceipt('reconciliation_required', 'reconciliation-required'),
        },
      ]
      const refs: Array<{ callRef: string; receiptState: typeof variants[number]['receipt']['state'] }> = []
      for (const variant of variants) {
        const variantCallRef = `${successfulCallRef}:${variant.suffix}`
        const usage = {
          usageRef: `usage:call-workpool:${variant.suffix}`,
          observedAt: Date.now(),
          chargeState: variant.suffix === 'refunded' ? 'refunded' as const : 'paid' as const,
          amount: variant.receipt.totalBuyerCharge,
          priceDigest: variant.receipt.priceDigest,
          transactionRef: variant.receipt.transactionRef,
        }
        const result = variant.state === 'completed'
          ? {
              kind: 'completed' as const,
              callRef: variantCallRef,
              toolRef,
              output: { result: variant.suffix },
              evidenceHash: variant.receipt.evidenceHash,
              usage,
              receipt: variant.receipt,
            }
          : variant.state === 'refused'
            ? {
                kind: 'refused' as const,
                toolRef,
                code: 'provider_output_invalid',
                retryable: false,
                receipt: variant.receipt,
              }
            : {
                kind: 'reconciliation_required' as const,
                callRef: variantCallRef,
                toolRef,
                evidence: {
                  attemptRef: `attempt:call-workpool:${variant.suffix}`,
                  effectGeneration: 1,
                  requiredAt: variant.receipt.issuedAt,
                  retry: 'reconcile_before_retry' as const,
                  evidenceSource: 'test:call-workpool',
                },
                receipt: variant.receipt,
              }
        await ctx.db.insert('capabilityCalls', {
          ...material,
          callRef: variantCallRef,
          idempotencyKey: `idempotency:call-workpool:${variant.suffix}`,
          state: variant.state,
          dispatchState: variant.dispatchState,
          result,
          usage,
          evidenceHash: variant.receipt.evidenceHash,
          ...(variant.state === 'reconciliation_required'
            ? { attemptRef: `attempt:call-workpool:${variant.suffix}` }
            : sourceAttemptRef === undefined
              ? {}
              : { attemptRef: sourceAttemptRef }),
        })
        refs.push({ callRef: variantCallRef, receiptState: variant.receipt.state })
      }
      return refs
    })
    for (const variant of statusVariants) {
      const status = await backend.action(
        api.capabilityCalls.readCallStatus,
        await recoveryActionArgs(
          first.principal,
          variant.callRef,
          `status-${variant.receiptState}`,
          `status:${variant.callRef}`,
        ),
      )
      expect(status).toMatchObject({
        kind: 'found',
        callRef: variant.callRef,
        toolRef,
        receipt: { state: variant.receiptState },
        result: { receipt: { state: variant.receiptState } },
      })
    }
    const canonicalCommandJson = JSON.stringify({
      control: completed.control,
      attempt: completed.attempt,
      history: completed.history,
    })
    expect(canonicalCommandJson).not.toContain(JSON.stringify(providerOutput))
    expect(canonicalCommandJson).not.toContain(signingSecretSentinel)
    expect(completed.projection).toMatchObject({
      callRef: successfulCallRef,
      accountRef: first.principal.ownerId,
      principalRef: first.principal.principalId,
      state: 'completed',
      deliveryState: 'delivered',
      paymentState: 'not_applicable',
    })
    expect(historyObservedDuringProvider).toEqual([
      'claim_before_effect',
      'release_fence_before_network',
    ])
    expect(providerFetch).toHaveBeenCalledTimes(1)
    const workId = completed.call?.workId

    const replay = await invokeCall(backend, first.principal, toolRef, 'call-workpool-success', 'replay')
    expect(replay).toEqual(completedResult)
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    const replayed = await readEvidence(backend, successfulCallRef)
    expect(replayed.call?.workId).toBe(workId)
    expect(replayed.history).toHaveLength(3)
    expect(replayed.call).toEqual(completed.call)
    expect(providerFetch).toHaveBeenCalledTimes(1)

    await backend.run(async (ctx) => {
      await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 })
    })
    const revokedPending = await invokeCall(backend, revoked.principal, toolRef, 'call-workpool-revoked', 'revoked')
    expect(revokedPending.kind).toBe('pending')
    if (revokedPending.kind !== 'pending') throw new Error('revoked Call did not enqueue')
    const revokedGrant = await backend.mutation(internal.agentAccessPolicy.revokeGrant, {
      grantRef: revoked.grantRef,
      ownerId: revoked.principal.ownerId,
      credentialId: revoked.principal.credentialId,
      principalId: revoked.principal.principalId,
      updatedAt: Date.now(),
    })
    expect(revokedGrant.kind).toBe('revoked')
    await backend.run(async (ctx) => {
      await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 })
    })
    vi.advanceTimersByTime(120_000)
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))

    const refused = await readEvidence(backend, revokedPending.callRef)
    expect(refused.call).toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: {
        kind: 'refused',
        toolRef,
        code: 'grant_not_found',
      },
    })
    expect(refused.control).toBeNull()
    expect(refused.attempt).toBeNull()
    expect(refused.projection).toBeNull()
    expect(providerFetch).toHaveBeenCalledTimes(1)
  }, 15_000)

  it('runs the installed CLI through served routes and one real durable backend receipt', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-12T00:00:00Z'))
    installTestSourceWriteSecret()
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'served-cli-route-signing-secret-material-32')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:served-cli')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])

    const backend = convexTestWithWorkers()
    await seedCommercialPolicies(backend, Date.now())
    const toolRef = await seedKeylessLookup(backend, 'workpool-lookup-primary')
    const alternativeToolRef = await seedKeylessLookup(backend, 'workpool-lookup-alternative')
    const scopes = [CUSTOMER_REQUEST_SPENDING_POLICY_SCOPE, MARKET_TOOLS_CALL_SCOPE] as const
    const seeded = await seedPrincipal(backend, 'served-cli', Date.now(), toolRef, scopes)
    const principal = seeded.principal
    const apiKeyId = principal.credentialId
    const apiKeySubject = 'user_served_cli'

    const providerOutput = { result: 'served-cli-ok' }
    providerFetch.mockResolvedValue(new UndiciResponse(JSON.stringify(providerOutput), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    providerFetch.mockClear()

    const queryBackend = backend.query as ConvexSourceTransport['query']
    const mutationBackend = backend.mutation as ConvexSourceTransport['mutation']
    const actionBackend = backend.action as ConvexSourceTransport['action']
    const transport: ConvexSourceTransport = {
      query: queryBackend,
      mutation: mutationBackend,
      action: async <Action extends FunctionReference<'action'>>(
        reference: Action,
        args: FunctionArgs<Action>,
      ): Promise<FunctionReturnType<Action>> => {
        const result = await actionBackend(reference, args)
        if (getFunctionName(reference) === 'capabilityCalls:call') {
          await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
        }
        return result
      },
    }
    const restoreTransport = setPublicSourceTransportForTests(transport)
    const served = await serveCallRoutes({ apiKeyId, apiKeySubject, scopes, principal })
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'ae-served-cli-'))
    const cliHome = join(temporaryRoot, 'home')
    const cliDist = resolve('packages/cli/dist')
    const cliDistWasPresent = await access(cliDist).then(() => true, () => false)
    await mkdir(cliHome)
    try {
      const cli = await installPackagedCli(temporaryRoot)
      const runCli = async (args: readonly string[]): Promise<unknown> => {
        const executed = await execFileAsync(cli, [...args, '--base-url', served.origin, '--json'], {
          env: {
            ...process.env,
            AE_API_KEY: apiKeyId,
            AE_API_KEY_ORIGIN: served.origin,
            XDG_CONFIG_HOME: cliHome,
          },
          maxBuffer: 4 * 1024 * 1024,
        })
        return JSON.parse(executed.stdout) as unknown
      }

      const search = await runCli(['search', 'lookup']) as {
        kind: string
        items: Array<{ toolRef: string }>
        nextCommand: string
      }
      const comparedToolRefs = search.items.map((item) => item.toolRef)
      expect(search.kind).toBe('ok')
      expect(comparedToolRefs).toEqual(expect.arrayContaining([
        toolRef,
        alternativeToolRef,
      ]))
      expect(search.nextCommand).toBe(`ae compare ${comparedToolRefs.slice(0, 4).join(' ')} --base-url ${served.origin} --json`)
      await expect(runCli(['describe', toolRef])).resolves.toMatchObject({
        kind: 'found',
        tool: { toolRef },
      })
      await expect(runCli(['compare', ...comparedToolRefs])).resolves.toMatchObject({
        kind: 'ok',
        tools: expect.arrayContaining([
          expect.objectContaining({ toolRef }),
          expect.objectContaining({ toolRef: alternativeToolRef }),
        ]),
      })
      const idempotencyKey = 'served-cli-golden-replay'
      const completed = await runCli([
        'call',
        toolRef,
        '--input',
        JSON.stringify(INPUT),
        '--idempotency-key',
        idempotencyKey,
        '--wait',
      ]) as { kind: string; callRef: string; toolRef: string; output: unknown }
      expect(completed).toMatchObject({
        kind: 'completed',
        toolRef,
        output: providerOutput,
      })
      expect(completed).not.toHaveProperty('idempotencyKey')
      const status = callStatusResultSchema.parse(await runCli(['status', completed.callRef]))
      expect(status).toMatchObject({
        kind: 'found',
        callRef: completed.callRef,
        toolRef,
        state: 'terminal',
        usage: { chargeState: 'free_tier' },
        result: { kind: 'completed', output: providerOutput },
      })
      expect(projectCallReceipt(status)).toMatchObject({
        version: 'ae.public-invocation-receipt:v1',
        callRef: completed.callRef,
        toolRef,
        complete: true,
        resultKind: 'completed',
        usage: { chargeState: 'free_tier' },
        evidenceHash: expect.any(String),
      })
      await expect(runCli([
        'call',
        toolRef,
        '--input',
        JSON.stringify(INPUT),
        '--idempotency-key',
        idempotencyKey,
        '--wait',
      ])).resolves.toEqual(completed)
      expect(providerFetch).toHaveBeenCalledTimes(1)
    } finally {
      await served.close()
      restoreTransport()
      await rm(temporaryRoot, { recursive: true, force: true })
      if (!cliDistWasPresent) await rm(cliDist, { recursive: true, force: true })
    }
  }, 120_000)
})
