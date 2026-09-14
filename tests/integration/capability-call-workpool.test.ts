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
import { privateKeyToAccount } from 'viem/accounts'
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from 'convex/server'

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
import { prepareOwnerPublicationCommand, x402Source } from './capability-supply-owner-funnel-harness'
import { installTestSourceWriteSecret, withSourceWrite, withSourceWriteCommand } from '../helpers/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  CUSTOMER_REQUEST_SPENDING_POLICY_SCOPE,
  MARKET_TOOLS_CALL_SCOPE,
} from '@/modules/agent-access/contract'
import {
  buildAgentAccessPolicy,
  createAgentAccessGrant,
} from '@/modules/agent-access/policy'
import {
  COMMERCIAL_POLICY_FAMILIES,
} from '@/modules/money/public'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../helpers/commercial-policy-fixtures'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { capabilitySupplyGraphPorts } from '../../convex/capabilitySupplyGraphPorts'
import { qualifySuppliedCandidate, x402SellerClaimDigest } from '@/modules/capability-supply/public'
import { createX402ProviderConnection } from '@/modules/capability-supply/provider-connection'
import { toRow as providerConnectionRow } from '../../convex/lib/providerConnections/codecs'
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
} from '@/lib/server/call-api'
import { projectCallReceipt } from '@/modules/capability-execution/call-receipt-view'
import { callStatusResultSchema } from '@/modules/capability-execution/call-recovery.actions'
import { createFormanceContext, installPackage4FormanceSchema, readFormanceAccount, readFormanceTransactionByReference } from '@/modules/money/formance'
import { bookFormanceFundingSettlement, formanceAccountMetadataDigest, readFormanceDisplayBalance } from '@/modules/money/formance-workflows'
import { BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC_ADDRESS, cdpX402CustodyConfigurationFromEnvironment,
  cdpX402CustodyBudgetRef, cdpX402PolicyRulesDigest } from '@/modules/capability-supply/server'

const INPUT = { request: 'lookup' } as const
const quoteByCallKey = new Map<string, string>()

type TestPrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'production' | 'sandbox'
  scopes: readonly string[]
  authorityMode: 'spending_policy'
}>

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

async function seedPrincipal(
  backend: ConvexFixtureBackend,
  suffix: string,
  now: number,
  toolRef: string,
  scopesOverride?: readonly string[],
  options: { environment?: 'production' | 'sandbox'; spendUnits?: string } = {},
): Promise<{ principal: TestPrincipal; grantRef: string }> {
  const ref = (kind: 'prn' | 'acc' | 'grt' | 'eid' | 'crd' | 'own', material: string) =>
    `${kind}_${canonicalDigest({ kind, material }).slice(7, 39)}`
  const principalId = ref('prn', suffix)
  const ownerId = ref('acc', suffix)
  const credentialId = `credential:call-workpool:${suffix}`
  const principal = {
    principalId,
    ownerId,
    credentialId,
    applicationRef: 'agentic-economy',
    environment: options.environment ?? 'production',
    scopes: [...(scopesOverride ?? [MARKET_TOOLS_CALL_SCOPE])],
    authorityMode: 'spending_policy' as const,
  }
  const grantRef = ref('grt', suffix)
  const amount = { currency: 'AUD' as const, units: options.spendUnits ?? '0', exponent: 6 as const }
  const policy = buildAgentAccessPolicy({
    environment: principal.environment,
    currency: 'AUD',
    exponent: 6,
    maximumSpendPerCall: amount,
    maximumDailySpend: amount,
    maximumMonthlySpend: amount,
  }
  )
  const expiresAt = now + 7 * 24 * 60 * 60 * 1_000
  const grantDecision = createAgentAccessGrant({
    grantRef,
    principalId: principal.principalId,
    ownerId: principal.ownerId,
    applicationRef: principal.applicationRef,
    credentialId: principal.credentialId,
    environment: principal.environment,
    toolAccess: 'all_admitted',
    toolRefs: [],
    authorityMode: principal.authorityMode,
    spendingPolicy: policy,
    lifecycle: 'active',
    generation: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  })
  if (grantDecision.kind !== 'accepted') throw new Error(`call_grant_refused:${grantDecision.code}`)
  const grant = grantDecision.grant
  const bindingRef = ref('eid', suffix)
  const canonicalCredentialRef = ref('crd', suffix)
  const ownershipRef = ref('own', suffix)
  const action = {
    actorPrincipalRef: principalId,
    activeAccountRef: ownerId,
    correlationRef: `correlation:call-workpool:${suffix}`,
    idempotencyRef: `idempotency:call-workpool:${suffix}`,
  }
  await backend.run(async (ctx) => {
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef,
      principalRef: principalId,
      providerNamespace: 'clerk/api-key',
      providerIdentifier: credentialId,
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: 1,
      bindIdempotencyRef: `bind:call-workpool:${suffix}`,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('credentials', {
      credentialRef: canonicalCredentialRef,
      bindingRef,
      principalRef: principalId,
      type: 'api_key',
      lifecycle: 'active',
      generation: 1,
      issueIdempotencyRef: `issue:call-workpool:${suffix}`,
      revision: 1,
      issuedAt: now,
      expiresAt: grant.expiresAt,
      updatedAt: now,
    })
    await ctx.db.insert('principals', {
      principalRef: principalId,
      kind: 'agent',
      displayName: `Call worker ${suffix}`,
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('accounts', {
      accountRef: ownerId,
      displayName: `Operation worker account ${suffix}`,
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: principalId,
      creationIdempotencyRef: `account:call-workpool:${suffix}`,
      initialOwnershipRef: ownershipRef,
      currentOwnershipRef: ownershipRef,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      lastAction: action,
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef,
      accountRef: ownerId,
      ownerPrincipalRef: principalId,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: now,
      createdBy: action,
    })
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef,
      accountRef: ownerId,
      actorPrincipalRef: principalId,
      subjectPrincipalRef: principalId,
      scopes: [...principal.scopes].sort(),
      resourceRefs: [toolRef],
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt: grant.expiresAt,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: now,
      createdBy: action,
    })
  })
  const recordedPrincipal = await backend.mutation(internal.agentAccessPrincipals.recordAgentPrincipal, {
    ...principal,
    scopes: [...principal.scopes],
    ownerTokenIdentifier: `token:call-workpool:${suffix}`,
    grantGeneration: 1,
    spendingPolicyDigest: grant.spendingPolicyDigest,
    lifecycle: 'active',
    seenAt: now,
  })
  if (recordedPrincipal.kind !== 'recorded') throw new Error(`principal fixture failed: ${recordedPrincipal.kind}`)
  const recordedGrant = await backend.mutation(internal.agentAccessPolicy.upsertGrant, { grant })
  if (recordedGrant.kind !== 'recorded') throw new Error(`grant fixture failed: ${recordedGrant.kind}`)
  return { principal, grantRef }
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
}>): Promise<Readonly<{ origin: string; close: () => Promise<void> }>> {
  const authenticate = async () => ({
    isAuthenticated: true as const,
    tokenType: 'api_key' as const,
    id: input.apiKeyId,
    subject: input.apiKeySubject,
    scopes: input.scopes,
    claims: { aeEnvironment: 'production' },
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
        const callRef = decodeURIComponent(url.pathname.slice('/api/v1/calls/'.length))
        response = await handleCallStatusGet(request, callRef, { authenticate, resolvePrincipal })
      } else {
        response = Response.json({ code: 'route_not_found' }, { status: 404 })
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

describe('capability Call Workpool lifecycle', () => {
  it.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')('buys a sandbox Tool through an exact Quote, real AUD ledger and durable worker without a second purchase on replay or a retained hold after revocation', async () => {
    const gatewayUrl = process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:3069'
    const ledger = `ae-buyer-${Date.now()}-${process.pid}`
    const formance = createFormanceContext({ environment: 'sandbox', gatewayUrl, ledger, requestTimeoutMs: 10_000 })
    expect(await installPackage4FormanceSchema(formance)).toMatchObject({ kind: 'completed' })
    vi.stubEnv('AE_FORMANCE_ENVIRONMENT', 'sandbox')
    vi.stubEnv('AE_FORMANCE_GATEWAY_URL', gatewayUrl)
    vi.stubEnv('AE_FORMANCE_LEDGER', ledger)
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'buyer-integration-signing-secret-test-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:buyer-integration')
    vi.stubEnv('AE_X402_RPC_URLS_JSON', JSON.stringify({ [BASE_SEPOLIA_NETWORK]: ['https://rpc.example.test'] }))
    installTestSourceWriteSecret()
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])

    // CDP's external API is replaced, while the real custody policy, signing-intent,
    // fingerprint and authorization code runs against these documented responses.
    const payer = privateKeyToAccount(`0x${'11'.repeat(32)}`)
    const accountPolicyId = '11111111-1111-4111-8111-111111111111'
    const projectPolicyId = '22222222-2222-4222-8222-222222222222'
    const typedData = { primaryType: 'TransferWithAuthorization', types: { TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] } }
    const accountPolicy = { id: accountPolicyId, scope: 'account' as const, rules: [{ action: 'accept', operation: 'signEvmTypedData', criteria: [
      { type: 'evmTypedDataVerifyingContract', addresses: [BASE_SEPOLIA_USDC_ADDRESS], operator: 'in' },
      { type: 'evmTypedDataField', types: typedData, conditions: [
        { path: 'from', operator: 'in', addresses: [payer.address] }, { path: 'value', operator: '<=', value: '1000000' },
      ] },
    ] }] }
    const projectPolicy = { id: projectPolicyId, scope: 'project' as const, rules: [
      { action: 'reject', operation: 'signEvmTypedData', criteria: [
        { type: 'evmTypedDataVerifyingContract', addresses: [BASE_SEPOLIA_USDC_ADDRESS], operator: 'not in' },
      ] },
      { action: 'reject', operation: 'signEvmTypedData', criteria: [
        { type: 'evmTypedDataField', types: typedData, conditions: [{ path: 'value', operator: '>', value: '1000000' }] },
      ] },
    ] }
    const policyDigest = cdpX402PolicyRulesDigest(accountPolicy, projectPolicy)
    if (policyDigest === undefined) throw new Error('buyer_policy_fixture_invalid')
    for (const [name, value] of Object.entries({
      AE_X402_CUSTODY_ENABLED: 'true', AE_X402_CUSTODY_MAX_ATOMIC: '1000000', AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '10000000',
      CDP_API_KEY_ID: 'test-key-id', CDP_API_KEY_SECRET: 'test-key-secret', CDP_WALLET_SECRET: 'test-wallet-secret',
      AE_X402_CDP_ACCOUNT_NAME: 'buyer-source-integration', AE_X402_CDP_EXPECTED_EVM_ADDRESS: payer.address,
      AE_X402_CDP_ACCOUNT_POLICY_ID: accountPolicyId, AE_X402_CDP_PROJECT_POLICY_ID: projectPolicyId,
      AE_X402_CDP_POLICY_RULES_DIGEST: policyDigest, AE_X402_CDP_CREDENTIAL_GENERATION: '1',
    })) vi.stubEnv(name, value)
    const signedAuthorizations: string[] = []
    external.cdpClient.mockReturnValue({
      policies: { getPolicyById: async ({ id }: { id: string }) => id === accountPolicyId ? accountPolicy : projectPolicy },
      evm: {
        getAccount: async () => ({ address: payer.address, policies: [accountPolicyId, projectPolicyId] }),
        signTypedData: async (data: Parameters<typeof payer.signTypedData>[0] & { idempotencyKey: string }) => {
          const signature = await payer.signTypedData(data)
          signedAuthorizations.push(data.idempotencyKey)
          return { signature }
        },
      },
    })
    external.rate.mockImplementation(async () => ({ source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.2', fetchedAt: Date.now() }))

    vi.useFakeTimers()
    const backend = convexTestWithWorkers()
    const provider = await publishedBusinessOwner(backend, 'buyer-journey-provider')
    const offeringRef = 'catalog-offering:buyer-journey'
    const sourceHash = 'catalog-source:buyer-journey'
    await seedCatalogOffering(backend, provider.businessId, 'buyer-journey', '/paid-lookup', 'POST')
    const endpoint = 'https://buyer-journey.example.test/paid-lookup'
    const baseSource = x402Source('sandbox', endpoint)
    const source = { ...baseSource, commercial: { ...baseSource.commercial, authority: {
      kind: 'provider_connection' as const, connectionRef: 'connection:owner:x402', providerRef: 'provider:x402:buyer-journey',
    } } }
    const resource = source.resource as { paymentRequired: Parameters<typeof encodePaymentRequiredHeader>[0] }
    providerFetch.mockImplementation(async () => new UndiciResponse('', {
      status: 402, headers: { 'Payment-Required': encodePaymentRequiredHeader(resource.paymentRequired) },
    }))
    const sellerClaim = {
      businessId: String(provider.businessId), endpointUrl: endpoint, method: 'POST' as const,
      observationDigest: canonicalDigest({ kind: 'official-x402-v2-unpaid-inspection', endpoint,
        network: BASE_SEPOLIA_NETWORK, payTo: '0xbA667287B8Ef89565F8fD7AcD4d22Ce98E0f39cd' }),
      payTo: '0xbA667287B8Ef89565F8fD7AcD4d22Ce98E0f39cd', expiresAt: Date.now() + 300_000,
    }
    const connection = createX402ProviderConnection({
      commandId: 'connection:buyer-journey:create', connectionRef: 'connection:owner:x402',
      businessId: String(provider.businessId), providerRef: 'provider:x402:buyer-journey', providerAccountRef: `x402:${endpoint}`,
      resourceUrl: endpoint, method: sellerClaim.method, payee: sellerClaim.payTo,
      evidenceRefs: [`x402-payee-claim:${x402SellerClaimDigest(sellerClaim)}`, `x402-endpoint-inspection:${sellerClaim.observationDigest}`],
      owningAccountRef: provider.canonicalAccountRef, installedByPrincipalRef: provider.canonicalPrincipalRef,
      authorityGrantRef: 'grant:buyer-provider-fixture', authorityGrantGeneration: 1,
    }, Date.now())
    if (connection.kind !== 'applied') throw new Error(`buyer_connection_fixture:${connection.kind}`)
    await backend.run(async (ctx) => await ctx.db.insert('capabilityProviderConnections',
      providerConnectionRow(connection.connection, connection.connection.lastCommandId ?? '', connection.commandDigest)))
    const accessPath = await backend.run(async (ctx) => await ctx.db.query('offeringAccessPaths')
      .withIndex('by_offeringRef_and_status', q => q.eq('offeringRef', offeringRef).eq('status', 'published')).unique())
    if (accessPath === null) throw new Error('buyer_access_path_fixture_missing')
    const prepared = await prepareOwnerPublicationCommand(backend, provider.businessId, offeringRef, 1, sourceHash,
      source, 'buyer-journey:publish', { kind: 'catalog_offering', offeringRef, offeringRevision: 1, offeringSourceHash: sourceHash,
        declaredAccessPathRef: accessPath.accessPathRef, accessPathSourceHash: accessPath.sourceHash }, 'sandbox')
    if (prepared.kind !== 'prepared') throw new Error(`buyer_tool_prepare:${prepared.reason}`)
    const published = await provider.owner.mutation(api.capabilitySupply.publishPreparedCapability, prepared.command)
    if (published.kind !== 'published') throw new Error(`buyer_tool_publish:${published.kind}`)
    await admitPublication(backend, published, 'buyer-journey')
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    expect(await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: published.publicationRef, expectedRevision: published.publicationRevision, credentialState: 'ready', healthState: 'healthy',
      validUntil: Date.now() + 3_600_000, operationKey: 'buyer-journey:ready', correlationId: 'buyer-journey',
      reasonCode: 'test_readiness', evidenceRefs: ['test:buyer-journey'],
    })).toMatchObject({ kind: 'observed' })
    const qualification = await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityPublications').withIndex('by_publicationRef_and_revision', q => q
        .eq('publicationRef', published.publicationRef).eq('revision', published.publicationRevision)).unique()
      if (row === null) throw new Error('buyer_publication_missing')
      return await qualifySuppliedCandidate(capabilitySupplyGraphPorts(ctx.db), { candidate: {
        publicationRef: row.publicationRef, revision: row.revision, networkId: row.networkId, businessId: row.businessId,
        offeringId: row.offeringId, bindingId: row.bindingId, contractRef: { capabilityId: row.capabilityId, version: row.version, contractDigest: row.contractDigest },
      }, now: Date.now() })
    })
    expect(qualification, JSON.stringify(qualification)).toMatchObject({ status: 'eligible', reasons: [] })
    const buyer = await seedPrincipal(backend, 'funded-buyer', Date.now(), published.toolRef, undefined,
      { environment: 'sandbox', spendUnits: '5000000' })
    expect(buyer.principal.ownerId).not.toBe(provider.canonicalAccountRef)
    const custody = cdpX402CustodyConfigurationFromEnvironment()
    if (custody === undefined) throw new Error('buyer_custody_fixture_invalid')
    expect(await backend.mutation(internal.moneyTreasury.recordObservation, {
      environment: 'sandbox', custodyRef: cdpX402CustodyBudgetRef(custody, 'sandbox'), custodyGeneration: custody.credentialGeneration,
      network: BASE_SEPOLIA_NETWORK, asset: 'USDC', exponent: 6, observationRef: 'buyer-journey:treasury',
      totalUnits: '10000000', bufferUnits: '1000000', evidenceRef: 'cdp:buyer-journey:treasury',
      evidenceDigest: canonicalDigest({ treasury: 'buyer-journey' }), observedAt: Date.now(),
    })).toMatchObject({ kind: 'accepted' })
    const funding = await bookFormanceFundingSettlement(formance, {
      commandRef: 'buyer-journey:funding', idempotencyKey: 'buyer-journey:funding', accountRef: buyer.principal.ownerId,
      processorRef: 'stripe:sandbox:buyer-journey', principalUnits: '10000000', serviceFeeUnits: '500000', taxUnits: '50000', totalUnits: '10550000',
      policyDigest, externalEvidenceDigest: canonicalDigest({ funding: 'verified sandbox fixture' }),
    })
    expect(funding, JSON.stringify(funding)).toMatchObject({ kind: 'completed', replayed: false })
    const readBalance = async () => await readFormanceDisplayBalance(formance, { balanceKind: 'account_aud', subjectRef: buyer.principal.ownerId, now: Date.now() })
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '10000000' })

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
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    const completed = await readEvidence(backend, pending.callRef)
    expect(claimRaceResult).toMatchObject({ kind: 'claimed' })
    expect(fenceRaceResult).toMatchObject({ kind: 'possibly_released' })
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
      grantRef: buyer.grantRef, ownerId: buyer.principal.ownerId,
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
    expect(await backend.action(internal.capabilityCallWorker.reconcilePreClaimRefusal, { callRef: revoked.callRef }))
      .toEqual({ kind: 'not_claimed' })
    expect(await readBalance()).toMatchObject({ kind: 'available', units: '8800000' })
    expect(refused.history).toHaveLength(0)
    expect(deliveries).toHaveLength(1)
    expect(signedAuthorizations).toHaveLength(1)
  }, 30_000)

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
