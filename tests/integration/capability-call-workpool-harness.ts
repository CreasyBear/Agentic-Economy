import { Response as UndiciResponse } from 'undici'
import { expect, vi } from 'vitest'
import { encodePaymentRequiredHeader } from '@x402/core/http'
import type { PaymentRequired } from '@x402/core/types'
import type { WorkId } from '@convex-dev/workpool'
import { privateKeyToAccount } from 'viem/accounts'

import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
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
import { capabilitySupplyGraphPorts } from '../../convex/capabilitySupplyGraphPorts'
import { qualifySuppliedCandidate, x402SellerClaimDigest } from '@/modules/capability-supply/public'
import { createX402ProviderConnection } from '@/modules/capability-supply/provider-connection'
import { toRow as providerConnectionRow } from '../../convex/lib/providerConnections/codecs'
import { issuedAgentGrantRef } from '@/modules/agent-access/issued-agent-binding'
import { createCustomerRequestServiceAssertion, toStableHashValue } from '@/modules/agent-access/service-auth-envelope'
import { createFormanceContext, installPackage4FormanceSchema } from '@/modules/money/formance'
import { bookFormanceFundingSettlement, readFormanceDisplayBalance } from '@/modules/money/formance-workflows'
import { BASE_MAINNET_NETWORK, BASE_MAINNET_USDC_ADDRESS, BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC_ADDRESS, cdpX402CustodyConfigurationFromEnvironment,
  cdpX402CustodyBudgetRef, cdpX402PolicyRulesDigest } from '@/modules/capability-supply/server'
import {
  SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
  SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
  SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
  SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
  SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
  SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
} from '../../convex/capabilitySupplyCanaryFunding'
import { marketDispatchWorkpool } from '../../convex/marketDispatchWorkpool'
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
    rate: { mockImplementation: (fn: any) => void }
  }
}

export type PrepareBuyerOptions = {
  treasuryTotalUnits?: string
  maximumConcurrentCalls?: number
  accountPrincipalUnits?: string
  initialTime?: number
  buyerSetup?: (backend: ConvexFixtureBackend) => Promise<{ principal: TestPrincipal; grantRef: string }>
}

async function promotePaidBuyerFixtureAfterSellerCanary(input: Readonly<{
  backend: ConvexFixtureBackend
  owner: ReturnType<ConvexFixtureBackend['withIdentity']>
  businessId: Id<'businesses'>
  offeringRef: string
  sourceHash: string
  publicationRef: string
  publicationRevision: number
  toolRef: string
}>): Promise<void> {
  await input.backend.mutation(
    internal.capabilitySupplyCanaryFunding.provisionSellerOnboardingCanaryFunding,
    { now: Date.now() },
  )
  const command = await withSourceWrite('catalog_publish', {
    businessId: input.businessId,
    offeringRef: input.offeringRef,
    offeringRevision: 1,
    offeringSourceHash: input.sourceHash,
    publicationRef: input.publicationRef,
    publicationRevision: input.publicationRevision,
    operationKey: 'buyer-journey:seller-canary',
    correlationId: 'buyer-journey:seller-canary',
  })
  const readiness = await input.owner.action(
    api.capabilitySupplyOwnerSupply.runOwnerSupplyReadiness,
    command,
  )
  expect(readiness).toMatchObject({
    step: 'readiness', state: 'completed', publicationRef: input.publicationRef, toolRef: input.toolRef,
  })
  const requested = await input.owner.action(
    api.capabilitySupplyOwnerSupply.runOwnerSupplyTest,
    command,
  )
  if (requested.state !== 'completed'
    || requested.canaryRef === undefined
    || requested.callRef === undefined) {
    throw new Error(`buyer_seller_canary_request_failed:${JSON.stringify(requested)}`)
  }
  const call = await input.backend.run(async (ctx) => ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', requested.callRef!))
    .unique())
  if (call?.sellerOnboardingCanary === undefined) throw new Error('buyer_seller_canary_call_missing')
  if (call.workId === undefined) throw new Error('buyer_seller_canary_work_missing')
  const canaryWorkId = call.workId as WorkId
  expect(call.sellerOnboardingCanary.funding).toMatchObject({
    budgetRef: SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
    principalId: SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
    ownerId: SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
    credentialId: SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
    applicationRef: SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
    grantRef: SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
    grantGeneration: SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
    requestedSpend: {
      currency: 'USD',
      units: SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
      exponent: 6,
    },
  })
  const completedAt = Date.now()
  const output = { result: 'contract-valid canary output' }
  const evidenceHash = canonicalDigest({ canaryRef: requested.canaryRef, output })
  const quoted = call.sellerOnboardingCanary.funding.requestedSpend
  const zero = { currency: quoted.currency, units: '0', exponent: quoted.exponent }
  await input.backend.mutation(internal.capabilityCalls.record, {
    callRef: call.callRef,
    principalId: call.principalId,
    state: 'completed',
    dispatchState: 'completed',
    result: {
      kind: 'completed', callRef: call.callRef, toolRef: call.toolRef, output, evidenceHash,
      receipt: {
        commercialModel: 'seller_canary_x402',
        receiptRef: `seller-canary-receipt:${requested.canaryRef}:controlled-worker`,
        state: 'settled',
        providerQuotedAmount: quoted,
        agenticEconomyFee: zero,
        totalBuyerAuthorization: zero,
        priceDigest: call.sellerOnboardingCanary.priceDigest,
        network: BASE_SEPOLIA_NETWORK,
        asset: BASE_SEPOLIA_USDC_ADDRESS,
        settlementTransactionHash: `0x${'1'.repeat(64)}`,
        paymentIdentifier: `seller-canary-payment:${requested.canaryRef}`,
        externalSettlementRef: `seller-canary-settlement:${requested.canaryRef}`,
        refundState: 'not_applicable',
        lossState: 'none',
        evidenceHash,
        issuedAt: new Date(completedAt).toISOString(),
      },
    },
    evidenceHash,
    now: completedAt,
  })
  expect(await input.backend.mutation(
    internal.catalogOfferingMutations.promoteAdmittedSellerCanary,
    { canaryRef: requested.canaryRef },
  )).toMatchObject({ kind: 'promoted', toolRef: input.toolRef })
  await input.backend.run(async (ctx) => await marketDispatchWorkpool.cancel(ctx, canaryWorkId))
  await input.backend.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await input.backend.run(async (ctx) => await marketDispatchWorkpool.status(ctx, canaryWorkId)))
    .toEqual({ state: 'finished' })
  expect(await input.backend.mutation(
    internal.catalogOfferingMutations.promoteAdmittedSellerCanary,
    { canaryRef: requested.canaryRef },
  )).toMatchObject({ kind: 'replayed', toolRef: input.toolRef })
  const buyerLedger = await input.backend.run(async (ctx) => ({
    usage: await ctx.db.query('moneyUsageEvents').collect(),
    obligations: await ctx.db.query('moneyProviderObligations').collect(),
  }))
  expect(buyerLedger).toEqual({ usage: [], obligations: [] })
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
  const gatewayUrl = process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:3069'
  const ledger = `ae-buyer-${Date.now()}-${process.pid}`
  // The application path may be production, but this external ledger is the
  // maintained loopback simulator. Production Formance transport requires HTTPS.
  const formance = createFormanceContext({ environment: 'sandbox', gatewayUrl, ledger, requestTimeoutMs: 10_000 })
  expect(await installPackage4FormanceSchema(formance)).toMatchObject({ kind: 'completed' })
  vi.stubEnv('AE_FORMANCE_ENVIRONMENT', 'sandbox')
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
      { path: 'from', operator: 'in', addresses: [payer.address] }, { path: 'value', operator: '<=', value: '1000000' },
    ] },
  ] }] }
  const projectPolicy = { id: projectPolicyId, scope: 'project' as const, rules: [
    { action: 'reject', operation: 'signEvmTypedData', criteria: [
      { type: 'evmTypedDataVerifyingContract', addresses: [asset], operator: 'not in' },
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
  if (options.initialTime !== undefined) vi.setSystemTime(options.initialTime)
  const backend = convexTestWithWorkers()
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
  expect(await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: published.publicationRef, expectedRevision: published.publicationRevision, credentialState: 'ready', healthState: 'healthy',
    validUntil: Date.now() + 3_600_000, operationKey: 'buyer-journey:ready', correlationId: 'buyer-journey',
    reasonCode: 'test_readiness', evidenceRefs: ['test:buyer-journey'],
  })).toMatchObject({ kind: 'observed' })
  if (environment === 'sandbox') {
    await promotePaidBuyerFixtureAfterSellerCanary({
      backend,
      owner: provider.owner,
      businessId: provider.businessId,
      offeringRef,
      sourceHash,
      publicationRef: published.publicationRef,
      publicationRevision: published.publicationRevision,
      toolRef: published.toolRef,
    })
  } else {
    await admitPublication(backend, published, 'buyer-journey-production')
  }
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
