import { Response as UndiciResponse } from 'undici'
import { expect, vi } from 'vitest'
import { encodePaymentRequiredHeader } from '@x402/core/http'
import type { PaymentRequired } from '@x402/core/types'
import { privateKeyToAccount } from 'viem/accounts'

import { api, internal } from '../../convex/_generated/api'
import { reconcileTreasuryDeposits } from '../../convex/lib/money/treasury/deposits'
import {
  convexTestWithWorkers,
  createTestAgentPrincipal,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import { admitPublication, seedCatalogOffering } from './capability-publication-harness'
import { prepareOwnerPublicationCommand, x402SourceForConnection } from './capability-supply-owner-funnel-harness'
import { installTestSourceWriteSecret, withSourceWrite } from '../helpers/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  CUSTOMER_REQUEST_SPENDING_POLICY_SCOPE,
  MARKET_TOOLS_CALL_SCOPE,
} from '@/modules/agent-access/contract'
import {
  buildAgentAccessPolicy,
} from '@/modules/agent-access/policy'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { capabilitySupplyGraphPorts } from '../../convex/lib/capabilitySupply/graphPorts/ports'
import { qualifySuppliedCandidate, x402SellerClaimDigest } from '@/modules/capability-supply/public'
import { createX402ProviderConnection } from '@/modules/capability-supply/provider-connection'
import { toRow as providerConnectionRow } from '../../convex/lib/capabilitySupply/providerConnections/codecs'
import { issuedAgentGrantRef } from '@/modules/agent-access/issued-agent-binding'
import { createCustomerRequestServiceAssertion, toStableHashValue } from '@/modules/agent-access/service-auth-envelope'
import { createFormanceContext, installPackage4FormanceSchema } from '@/modules/money/formance'
import { bookFormanceFundingSettlement, readFormanceDisplayBalance } from '@/modules/money/formance-workflows'
import { BASE_MAINNET_NETWORK, BASE_MAINNET_USDC_ADDRESS, BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC_ADDRESS, cdpX402CustodyConfigurationFromEnvironment,
  cdpX402CustodyBudgetRef, cdpX402PolicyRulesDigest } from '@/modules/capability-supply/server'
import { admitDiscoveredToolFixture } from '../helpers/discovered-tool-fixture'


export const INPUT = { request: 'lookup' } as const
export const quoteByCallKey = new Map<string, string>()

export type TestPrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'production' | 'sandbox'
  scopes: readonly string[]
  authorityMode: 'spending_policy'
}>

export async function seedPrincipal(
  backend: ConvexFixtureBackend,
  suffix: string,
  _now: number,
  toolRef: string,
  scopesOverride?: readonly string[],
  options: { environment?: 'production' | 'sandbox'; spendUnits?: string; maximumConcurrentCalls?: number } = {},
): Promise<{ principal: TestPrincipal; grantRef: string }> {
  const result = await createTestAgentPrincipal(backend, suffix, {
    ...(options.environment !== undefined ? { environment: options.environment } : {}),
    ...(options.spendUnits !== undefined ? { spendUnits: options.spendUnits } : {}),
    ...(scopesOverride !== undefined ? { scopes: scopesOverride } : {}),
    resourceRefs: [toolRef],
    ...(options.maximumConcurrentCalls !== undefined ? { maximumConcurrentCalls: options.maximumConcurrentCalls } : {}),
  })
  return {
    principal: result.principal as unknown as TestPrincipal,
    grantRef: result.grantRef,
  }
}

export async function registerRotatingBuyer(backend: ConvexFixtureBackend, monthlyUnits = '12000', dailyUnits = '12000', maximumConcurrentCalls = 2) {
  const subject = 'user_rotating-buyer'
  const owner = (await publishedBusinessOwner(backend, 'rotating-buyer')).owner
  const serviceKey = 'rotating-buyer-service-test-key-32-bytes'
  vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', serviceKey)
  const sign = async (operation: string, command: Record<string, unknown>) => {
    const assertion = await createCustomerRequestServiceAssertion({
      key: serviceKey, operation, command: toStableHashValue(command), issuedAt: Date.now(),
      principal: { principalId: 'ae:server-function', ownerId: 'ae:server-function', credentialId: 'ae:server-function', scopes: [MARKET_TOOLS_CALL_SCOPE] },
    })
    return { ...assertion, scopes: [...assertion.scopes] }
  }
  const limit = { currency: 'AUD' as const, units: '12000', exponent: 6 as const }
  const policy = buildAgentAccessPolicy({ environment: 'sandbox', currency: 'AUD', exponent: 6,
    maximumSpendPerCall: limit, maximumDailySpend: { ...limit, units: dailyUnits }, maximumMonthlySpend: { ...limit, units: monthlyUnits } })
  const input = {
    issuanceKey: 'rotating-buyer-initial', grantRef: issuedAgentGrantRef(subject, 'rotating-buyer-initial'),
    credentialId: 'credential:rotating-buyer-initial', displayName: 'Rotating buyer',
    applicationRef: 'agentic-economy', environment: 'sandbox' as const,
    scopes: [CUSTOMER_REQUEST_SPENDING_POLICY_SCOPE, MARKET_TOOLS_CALL_SCOPE], authorityMode: 'spending_policy' as const,
    toolAccess: 'all_admitted' as const, toolRefs: [],
    spendingPolicy: { ...policy, budget: { ...policy.budget, maximumConcurrentCalls } },
    createdAt: Date.now(), expiresAt: Date.now() + 600_000,
  }
  expect(await owner.mutation(api.agentAccessPrincipals.registerIssuedAgentBindingForServer, {
    ...input, serviceAuth: await sign('agentAccessPrincipals.registerIssuedAgentBindingForServer', input),
  })).toMatchObject({ kind: 'recorded' })
  const row = await backend.run(async ctx => await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', q => q.eq('credentialId', input.credentialId)).unique())
  if (row === null) throw new Error('rotating_buyer_missing')
  const principal: TestPrincipal = { principalId: row.principalId, ownerId: row.ownerId, credentialId: row.credentialId,
    applicationRef: row.applicationRef, environment: 'sandbox', scopes: [...row.scopes], authorityMode: 'spending_policy' }
  return { principal, grantRef: input.grantRef, owner, input, subject, sign }
}

export type FundedSandboxBuyerMocks = {
  providerFetch: { mockImplementation: (fn: any) => void }
  external: {
    cdpClient: { mockReturnValue: (val: any) => void }
    receipt: any
  }
}

export type PrepareBuyerOptions = {
  treasuryTotalUnits?: string
  maximumConcurrentCalls?: number
  accountPrincipalUnits?: string
  initialTime?: number
  buyerSetup?: (backend: ConvexFixtureBackend) => Promise<{ principal: TestPrincipal; grantRef: string }>
}


export async function prepareFundedSandboxBuyer(options: PrepareBuyerOptions & {
  mocks: FundedSandboxBuyerMocks
}) {
  return await prepareFundedBuyer(options, 'sandbox')
}

export async function prepareFundedProductionBuyer(options: PrepareBuyerOptions & {
  mocks: FundedSandboxBuyerMocks
}) {
  return await prepareFundedBuyer(options, 'production')
}

async function prepareFundedBuyer(options: PrepareBuyerOptions & {
  mocks: FundedSandboxBuyerMocks
}, environment: 'sandbox' | 'production') {
  const { external, providerFetch } = options.mocks
  const localGatewayUrl = process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:3069'
  const gatewayUrl = environment === 'production' ? 'https://formance-buyer.example.test' : localGatewayUrl
  const ledger = `ae-buyer-${Date.now()}-${process.pid}`
  // Exercise production configuration and ledger metadata with an explicitly
  // simulated network boundary. The native ledger remains the loopback service.
  if (environment === 'production') {
    expect(['127.0.0.1', 'localhost']).toContain(new URL(localGatewayUrl).hostname)
    const nativeFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      return url.origin === gatewayUrl
        ? nativeFetch(new Request(new URL(`${url.pathname}${url.search}`, localGatewayUrl), request))
        : nativeFetch(request)
    })
    vi.stubEnv('AE_FORMANCE_ACCESS_CLIENT_ID', 'fixture-client')
    vi.stubEnv('AE_FORMANCE_ACCESS_CLIENT_SECRET', 'fixture-secret')
  }
  vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', environment === 'production' ? 'production' : 'development')
  const formance = createFormanceContext({ environment, gatewayUrl, ledger, requestTimeoutMs: 10_000,
    ...(environment === 'production' ? { accessClientId: 'fixture-client', accessClientSecret: 'fixture-secret' } : {}) })
  expect(await installPackage4FormanceSchema(formance)).toMatchObject({ kind: 'completed' })
  vi.stubEnv('AE_FORMANCE_ENVIRONMENT', environment)
  vi.stubEnv('AE_FORMANCE_GATEWAY_URL', gatewayUrl)
  vi.stubEnv('AE_FORMANCE_LEDGER', ledger)
  vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'buyer-integration-signing-secret-test-32-bytes')
  vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:buyer-integration')
  const network = environment === 'production' ? BASE_MAINNET_NETWORK : BASE_SEPOLIA_NETWORK
  const asset = environment === 'production' ? BASE_MAINNET_USDC_ADDRESS : BASE_SEPOLIA_USDC_ADDRESS
  vi.stubEnv('AE_X402_RPC_URLS_JSON', JSON.stringify({
    [network]: environment === 'production'
      ? ['https://rpc-a.example.test', 'https://rpc-b.example.test']
      : ['https://rpc.example.test'],
  }))
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
    { type: 'evmTypedDataVerifyingContract', addresses: [asset], operator: 'in' },
    { type: 'evmTypedDataField', types: typedData, conditions: [
      { path: 'from', operator: 'in', addresses: [payer.address] }, { path: 'value', operator: '<=', value: '10000' },
    ] },
  ] }] }
  const projectPolicy = { id: projectPolicyId, scope: 'project' as const, rules: [
    { action: 'reject', operation: 'signEvmTypedData', criteria: [
      { type: 'evmTypedDataVerifyingContract', addresses: [asset], operator: 'not in' },
    ] },
    { action: 'reject', operation: 'signEvmTypedData', criteria: [
      { type: 'evmTypedDataField', types: typedData, conditions: [{ path: 'value', operator: '>', value: '10000' }] },
    ] },
  ] }
  const policyDigest = cdpX402PolicyRulesDigest(accountPolicy, projectPolicy)
  if (policyDigest === undefined) throw new Error('buyer_policy_fixture_invalid')
  for (const [name, value] of Object.entries({
    AE_X402_CUSTODY_ENABLED: 'true', AE_X402_CUSTODY_MAX_ATOMIC: '10000', AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '10000000',
    AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC: '5000000', AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC: '1000000',
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

  vi.useFakeTimers()
  if (options.initialTime !== undefined) vi.setSystemTime(options.initialTime)
  const backend = convexTestWithWorkers()
  await backend.run(async (ctx) => {
    await ctx.db.insert('moneyReferenceRates', { pair: 'USDC/AUD', rate: '1.2', fetchedAt: Date.now() })
    await ctx.db.insert('platformLaunch', { environment, paymentsOpenTo: 'everyone', resumePaymentsOpenTo: 'everyone',
      revision: 1, updatedAt: Date.now() })
  })
  // The real observer/controller now owns the native opening; Quotes cannot
  // create treasury money. Only the external finalized chain read is a fixture.
  const treasuryOpening = await reconcileTreasuryDeposits({ runQuery: backend.query, runMutation: backend.mutation } as unknown as Parameters<typeof reconcileTreasuryDeposits>[0], {
    formance, admit: async () => true,
    chainRead: async () => ({ kind: 'observed', environment, network, asset: asset.toLowerCase(),
      address: payer.address.toLowerCase(), fromBlock: '100',
      checkpoint: { blockNumber: '100', blockHash: `0x${'1'.repeat(64)}`,
        balanceUnits: options.treasuryTotalUnits ?? '10000000' },
      blockTimestamp: Date.now() - 1_000, transfers: [], caughtUp: true, observedAt: Date.now(),
    }),
  })
  expect(treasuryOpening, JSON.stringify(treasuryOpening)).toMatchObject({ kind: 'completed' })
  if (environment === 'production') {
    const discovered = await admitDiscoveredToolFixture(backend)
    const paymentRequired = structuredClone(discovered.paymentRequired) as PaymentRequired
    const capturedResource = new URL(paymentRequired.resource.url)
    const input = Object.fromEntries(capturedResource.searchParams.entries())
    if (Object.keys(input).length === 0) throw new Error('buyer_production_input_fixture_missing')
    const resource = { paymentRequired }
    providerFetch.mockImplementation(async () => new UndiciResponse('', {
      status: 402,
      headers: { 'Payment-Required': encodePaymentRequiredHeader(paymentRequired) },
    }))
    const buyer = options.buyerSetup === undefined
      ? await seedPrincipal(
          backend,
          'funded-production-buyer',
          Date.now(),
          discovered.toolRef,
          [CUSTOMER_REQUEST_SPENDING_POLICY_SCOPE, MARKET_TOOLS_CALL_SCOPE],
          {
            environment,
            spendUnits: '5000000',
            ...(options.maximumConcurrentCalls === undefined
              ? {}
              : { maximumConcurrentCalls: options.maximumConcurrentCalls }),
          },
        )
      : await options.buyerSetup(backend)
    const custody = cdpX402CustodyConfigurationFromEnvironment()
    if (custody === undefined) throw new Error('buyer_custody_fixture_invalid')
    expect(await backend.mutation(internal.moneyTreasury.recordObservation, {
      environment,
      custodyRef: cdpX402CustodyBudgetRef(custody, environment),
      custodyGeneration: custody.credentialGeneration,
      network,
      asset: 'USDC',
      exponent: 6,
      observationRef: 'buyer-journey:production-treasury',
      totalUnits: options.treasuryTotalUnits ?? '10000000',
      bufferUnits: '10000',
      evidenceRef: 'cdp:buyer-journey:production-treasury',
      evidenceDigest: canonicalDigest({ treasury: 'buyer-journey-production' }),
      observedAt: Date.now(),
    })).toMatchObject({ kind: 'accepted' })
    const principalUnits = options.accountPrincipalUnits ?? '10000000'
    const funding = await bookFormanceFundingSettlement(formance, {
      commandRef: 'buyer-journey:production-funding',
      idempotencyKey: 'buyer-journey:production-funding',
      accountRef: buyer.principal.ownerId,
      processorRef: 'stripe:production:buyer-journey',
      principalUnits,
      serviceFeeUnits: '500000',
      taxUnits: '50000',
      totalUnits: (BigInt(principalUnits) + 550000n).toString(),
      policyDigest,
      externalEvidenceDigest: canonicalDigest({ funding: 'verified production fixture' }),
    })
    expect(funding, JSON.stringify(funding)).toMatchObject({ kind: 'completed', replayed: false })
    const readBalance = async () => await readFormanceDisplayBalance(formance, {
      balanceKind: 'account_aud', subjectRef: buyer.principal.ownerId, now: Date.now(),
    })
    expect(await readBalance()).toMatchObject({ kind: 'available', units: principalUnits })
    return {
      gatewayUrl,
      formance,
      backend,
      published: { toolRef: discovered.toolRef },
      buyer,
      resource,
      payer,
      signedAuthorizations,
      readBalance,
      input,
    }
  }
  const provider = await publishedBusinessOwner(backend, 'buyer-journey-provider')
  const offeringRef = 'catalog-offering:buyer-journey'
  const sourceHash = canonicalDigest({ offeringRef, revision: 1 })
  await seedCatalogOffering(backend, provider.businessId, 'buyer-journey', '/paid-lookup', 'POST')
  await backend.run(async (ctx) => {
    const revision = await ctx.db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => query.eq('offeringRef', offeringRef).eq('revision', 1))
      .unique()
    const path = await ctx.db.query('offeringAccessPaths')
      .withIndex('by_offeringRef_and_status', (query) => query.eq('offeringRef', offeringRef).eq('status', 'published'))
      .unique()
    if (revision === null || path === null) throw new Error('buyer_catalog_fixture_missing')
    await ctx.db.patch(revision._id, { sourceHash })
    await ctx.db.patch(path._id, {
      offeringSourceHash: sourceHash,
      sourceHash: canonicalDigest({
        accessPathRef: path.accessPathRef,
        offeringSourceHash: sourceHash,
        descriptor: path.descriptor,
      }),
    })
  })
  const endpoint = 'https://buyer-journey.example.test/paid-lookup'
  const baseSource = x402SourceForConnection(
    endpoint,
    'connection:owner:x402',
    'provider:x402:buyer-journey',
  )
  const source = { ...baseSource, commercial: { ...baseSource.commercial, authority: {
    kind: 'provider_connection' as const, connectionRef: 'connection:owner:x402', providerRef: 'provider:x402:buyer-journey',
  } } }
  const resource = source.resource as { paymentRequired: PaymentRequired }
  providerFetch.mockImplementation(async () => new UndiciResponse('', {
    status: 402, headers: { 'Payment-Required': encodePaymentRequiredHeader(resource.paymentRequired) },
  }))
  const sellerClaim = {
    businessId: String(provider.businessId), endpointUrl: endpoint, method: 'POST' as const,
    observationDigest: canonicalDigest({ kind: 'official-x402-v2-unpaid-inspection', endpoint,
      network, payTo: '0xbA667287B8Ef89565F8fD7AcD4d22Ce98E0f39cd' }),
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
      declaredAccessPathRef: accessPath.accessPathRef, accessPathSourceHash: accessPath.sourceHash }, environment)
  if (prepared.kind !== 'prepared') throw new Error(`buyer_tool_prepare:${prepared.reason}`)
  const published = await provider.owner.mutation(
    api.capabilitySupply.stageOwnerX402Capability,
    await withSourceWrite('catalog_publish', (() => {
      const {
        runtimeEnvironment: _runtimeEnvironment,
        proof: _proof,
        sourceWrite: _sourceWrite,
        sourceWriteRequest: _sourceWriteRequest,
        ...unsignedPrepared
      } = prepared.command
      return {
        ...unsignedPrepared,
        sellerClaim,
        evidenceRefs: [
          `x402-payee-claim:${x402SellerClaimDigest(sellerClaim)}`,
          `x402-endpoint-inspection:${sellerClaim.observationDigest}`,
        ],
        operationKey: 'buyer-journey:stage',
        correlationId: 'buyer-journey:stage',
      }
    })()),
  )
  if (published.kind !== 'published') throw new Error(`buyer_tool_publish:${JSON.stringify(published)}`)
  await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
  // Draining publication work advances fake time; money fixtures use the requested boundary clock.
  if (options.initialTime !== undefined) vi.setSystemTime(options.initialTime)
  expect(await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: published.publicationRef, expectedRevision: published.publicationRevision, credentialState: 'ready', healthState: 'healthy',
    validUntil: Date.now() + 3_600_000, operationKey: 'buyer-journey:ready', correlationId: 'buyer-journey',
    reasonCode: 'test_readiness', evidenceRefs: ['test:buyer-journey'],
  })).toMatchObject({ kind: 'observed' })
  await admitPublication(backend, published, `buyer-journey-${environment}`)
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
  const buyer = options.buyerSetup === undefined
    ? await seedPrincipal(backend, 'funded-buyer', Date.now(), published.toolRef, [CUSTOMER_REQUEST_SPENDING_POLICY_SCOPE, MARKET_TOOLS_CALL_SCOPE],
      { environment, spendUnits: '5000000', ...(options.maximumConcurrentCalls === undefined ? {} : { maximumConcurrentCalls: options.maximumConcurrentCalls }) })
    : await options.buyerSetup(backend)
  expect(buyer.principal.ownerId).not.toBe(provider.canonicalAccountRef)
  const custody = cdpX402CustodyConfigurationFromEnvironment()
  if (custody === undefined) throw new Error('buyer_custody_fixture_invalid')
  expect(await backend.mutation(internal.moneyTreasury.recordObservation, {
    environment, custodyRef: cdpX402CustodyBudgetRef(custody, environment), custodyGeneration: custody.credentialGeneration,
    network, asset: 'USDC', exponent: 6, observationRef: 'buyer-journey:treasury',
    totalUnits: options.treasuryTotalUnits ?? '10000000', bufferUnits: '10000', evidenceRef: 'cdp:buyer-journey:treasury',
    evidenceDigest: canonicalDigest({ treasury: 'buyer-journey' }), observedAt: Date.now(),
  })).toMatchObject({ kind: 'accepted' })
  const principalUnits = options.accountPrincipalUnits ?? '10000000'
  const funding = await bookFormanceFundingSettlement(formance, {
    commandRef: 'buyer-journey:funding', idempotencyKey: 'buyer-journey:funding', accountRef: buyer.principal.ownerId,
    processorRef: `stripe:${environment}:buyer-journey`, principalUnits, serviceFeeUnits: '500000', taxUnits: '50000', totalUnits: (BigInt(principalUnits) + 550000n).toString(),
    policyDigest, externalEvidenceDigest: canonicalDigest({ funding: `verified ${environment} fixture` }),
  })
  expect(funding, JSON.stringify(funding)).toMatchObject({ kind: 'completed', replayed: false })
  const readBalance = async () => await readFormanceDisplayBalance(formance, { balanceKind: 'account_aud', subjectRef: buyer.principal.ownerId, now: Date.now() })
  expect(await readBalance()).toMatchObject({ kind: 'available', units: principalUnits })
  return { gatewayUrl, formance, backend, published, buyer, resource, payer, signedAuthorizations, readBalance, input: INPUT }
}
