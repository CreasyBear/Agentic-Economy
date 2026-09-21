import { convexTest } from 'convex-test'
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http'
import { eip3009ABI } from '@x402/evm'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { validatePaymentRequired } from '@x402/core/schemas'
import type { fetch as UndiciFetch } from 'undici'
import { Response as UndiciResponse } from 'undici'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, components, internal } from '../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import schema from '../../convex/schema'
import {
  createTestAgentPrincipal,
  convexModules as modules,
  convexTestWithWorkers,
} from '../helpers/convex-fixtures'
import {
  createPublishedBusinessOwner,
  directSource,
  openApiSource,
  prepareOwnerPublicationCommand,
  seedCatalogOffering,
  seedPaidX402Publication,
} from './capability-supply-owner-funnel-harness'
import { withSourceWrite } from '../helpers/source-write-admission'
import { seedCommercialPolicies as seedQuoteCommercialPolicies } from '../helpers/quote-fixtures'
import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
  cdpX402CustodyBudgetRef,
  cdpX402CustodyConfigurationFromEnvironment,
  cdpX402PolicyRulesDigest,
} from '@/modules/capability-supply/server'
import { createFormanceContext, installPackage4FormanceSchema } from '@/modules/money/formance'
import { bookFormanceFundingSettlement } from '@/modules/money/formance-workflows'

const readinessFetch = vi.hoisted(() => vi.fn<typeof UndiciFetch>())
const productionExternal = vi.hoisted(() => ({ cdpClient: vi.fn(), receipt: vi.fn(), rate: vi.fn() }))
vi.mock('@coinbase/cdp-sdk', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  CdpClient: class { constructor() { return productionExternal.cdpClient() } },
}))
vi.mock('@/modules/capability-supply/server', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  readGuardedX402EvmReceipt: productionExternal.receipt,
}))
vi.mock('@/modules/money/reference-rate', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  fetchCoinbaseReferenceRate: productionExternal.rate,
}))
vi.mock('undici', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  fetch: readinessFetch,
}))

describe('owner capability publication admission', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    readinessFetch.mockReset()
    productionExternal.cdpClient.mockReset()
    productionExternal.receipt.mockReset()
    productionExternal.rate.mockReset()
  })

  it.each(['owner', 'agent'] as const)(
    'exercises the supported %s sandbox x402 publication and validation boundary',
    async (publisher) => {
      const backend = convexTestWithWorkers({ pauseWorkpool: true })
      const slug = `publish-canary-${publisher}`
      vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ])
      const fixture = await seedPaidX402Publication(backend, slug, {
        publisher,
        price: { currency: 'USD', units: '1', exponent: 6 },
        routeAmountExponent: 6,
        assetAmount: '1',
        onPaymentRequired(paymentRequired) {
          if (paymentRequired.x402Version !== 2) {
            throw new Error('x402_payment_required_v2_expected')
          }
          readinessFetch.mockImplementation(async () => new UndiciResponse('', {
            status: 402,
            headers: {
              'Payment-Required': encodePaymentRequiredHeader(
                paymentRequired as Parameters<typeof encodePaymentRequiredHeader>[0],
              ),
            },
          }) as never)
        },
      })
      expect(readinessFetch).toHaveBeenCalled()
      const stagedTarget = await backend.query(
        internal.capabilitySupply.readOwnerStagedCapabilityProbeTarget,
        {
          publicationRef: fixture.published.publicationRef,
          expectedRevision: fixture.published.publicationRevision,
          businessId: fixture.businessId,
          now: Date.now(),
        },
      )
      if (stagedTarget.kind !== 'available') {
        throw new Error(`staged_probe_target_unavailable:${stagedTarget.reason}`)
      }
      const expectedPayment = JSON.parse(stagedTarget.target.expectedPaymentJson ?? '{}') as {
        scheme: string
        network: string
        asset: string
        payTo: string
        currency: string
        routeAmountExponent: number
        assetAmountExponent: number
        paidAmount: { currency: string; units: string; exponent: number }
      }
      expect(expectedPayment).toMatchObject({
        network: 'eip155:84532',
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        currency: 'USD',
        routeAmountExponent: 6,
        assetAmountExponent: 6,
        paidAmount: { currency: 'USDC', units: '1', exponent: 6 },
      })
      const amount = (
        BigInt(expectedPayment.paidAmount.units)
        * 10n ** BigInt(expectedPayment.assetAmountExponent - expectedPayment.paidAmount.exponent)
      ).toString()
      const exactChallenge = validatePaymentRequired({
        x402Version: 2,
        resource: { url: fixture.endpoint },
        accepts: [{
          scheme: expectedPayment.scheme,
          network: expectedPayment.network,
          amount,
          asset: expectedPayment.asset,
          payTo: expectedPayment.payTo,
          maxTimeoutSeconds: 60,
          extra: { name: 'USD Coin', version: '2', assetTransferMethod: 'eip3009' },
        }],
      })
      if (exactChallenge.x402Version !== 2) {
        throw new Error('x402_payment_required_v2_expected')
      }
      readinessFetch.mockImplementation(async () => new UndiciResponse('', {
        status: 402,
        headers: {
          'Payment-Required': encodePaymentRequiredHeader(
            exactChallenge as Parameters<typeof encodePaymentRequiredHeader>[0],
          ),
        },
      }) as never)

      await backend.mutation(
        internal.capabilitySupplyCanaryFunding.provisionSellerOnboardingCanaryFunding,
        { now: Date.now() },
      )
      const command = await withSourceWrite('catalog_publish', {
        businessId: fixture.businessId,
        offeringRef: fixture.offeringRef,
        offeringRevision: 1,
        offeringSourceHash: fixture.sourceHash,
        publicationRef: fixture.published.publicationRef,
        publicationRevision: fixture.published.publicationRevision,
        operationKey: `seller-canary:${slug}`,
        correlationId: `seller-canary:${slug}`,
      })
      if (publisher === 'agent') {
        expect(fixture.agentPrincipal).toBeDefined()
        await expect(backend.run(async (ctx) => ctx.db
          .query('capabilityCalls')
          .withIndex('by_sellerOnboardingCanary_target', (query) => query
            .eq('sellerOnboardingCanary.businessId', String(fixture.businessId))
            .eq('sellerOnboardingCanary.offeringRef', fixture.offeringRef)
            .eq('sellerOnboardingCanary.offeringRevision', 1)
            .eq('sellerOnboardingCanary.offeringSourceHash', fixture.sourceHash)
            .eq('sellerOnboardingCanary.publicationRef', fixture.published.publicationRef)
            .eq('sellerOnboardingCanary.publicationRevision', fixture.published.publicationRevision))
          .collect())).resolves.toEqual([])
        return
      }
      const readiness = await fixture.owner.action(
        api.capabilitySupplyOwnerSupply.runOwnerSupplyReadiness,
        command,
      )
      if (readiness.state === 'refused') {
        const readback = await fixture.owner.query(
          api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
          { businessId: fixture.businessId },
        )
        throw new Error(`owner_readiness_refused:${readiness.refusal}:${JSON.stringify(readback)}`)
      }
      expect(readiness).toMatchObject({
        step: 'readiness',
        state: 'completed',
        publicationRef: fixture.published.publicationRef,
        toolRef: fixture.published.toolRef,
      })
      const requested = await fixture.owner.action(
        api.capabilitySupplyOwnerSupply.runOwnerSupplyTest,
        command,
      )
      if (requested.state === 'refused') {
        throw new Error(`seller_canary_request_refused:${requested.refusal}`)
      }
      expect(requested).toMatchObject({
        step: 'test',
        state: 'completed',
        toolRef: fixture.published.toolRef,
        canaryRef: expect.any(String),
        callRef: expect.any(String),
      })
      if (requested.state !== 'completed'
        || requested.canaryRef === undefined
        || requested.callRef === undefined) {
        throw new Error('seller_canary_request_missing')
      }

      await expect(
        fixture.owner.action(
          api.capabilitySupplyOwnerSupply.runOwnerSupplyTest,
          await withSourceWrite('catalog_publish', {
            businessId: fixture.businessId,
            offeringRef: fixture.offeringRef,
            offeringRevision: 1,
            offeringSourceHash: fixture.sourceHash,
            publicationRef: fixture.published.publicationRef,
            publicationRevision: fixture.published.publicationRevision,
            operationKey: `seller-canary:${slug}`,
            correlationId: `seller-canary:${slug}`,
          }),
        ),
      ).resolves.toMatchObject({
        state: 'completed',
        canaryRef: requested.canaryRef,
        callRef: requested.callRef,
      })

      const call = await backend.run(async (ctx) => ctx.db
        .query('capabilityCalls')
        .withIndex('by_callRef', (query) => query.eq('callRef', requested.callRef!))
        .unique())
      if (call?.sellerOnboardingCanary === undefined) {
        throw new Error('seller_canary_call_missing')
      }
      const completedAt = Date.now()
      const evidenceHash = canonicalDigest({
        canaryRef: requested.canaryRef,
        output: { result: 'contract-valid canary output' },
      })
      const quoted = call.sellerOnboardingCanary.funding.requestedSpend
      const zero = { currency: quoted.currency, units: '0', exponent: quoted.exponent }
      await backend.mutation(internal.capabilityCalls.record, {
        callRef: call.callRef,
        principalId: call.principalId,
        state: 'completed',
        dispatchState: 'completed',
        result: {
          kind: 'completed',
          callRef: call.callRef,
          toolRef: call.toolRef,
          output: { result: 'contract-valid canary output' },
          evidenceHash,
          receipt: {
            commercialModel: 'seller_canary_x402',
            receiptRef: `seller-canary-receipt:${requested.canaryRef}:controlled-worker`,
            state: 'settled',
            providerQuotedAmount: quoted,
            agenticEconomyFee: zero,
            totalBuyerAuthorization: zero,
            priceDigest: call.sellerOnboardingCanary.priceDigest,
            network: 'eip155:84532',
            asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
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

      const promoted = await backend.mutation(
        internal.catalogOfferingMutations.promoteAdmittedSellerCanary,
        { canaryRef: requested.canaryRef },
      )
      expect(promoted).toMatchObject({
        kind: 'promoted',
        toolRef: fixture.published.toolRef,
      })
      await expect(
        backend.mutation(internal.catalogOfferingMutations.promoteAdmittedSellerCanary, {
          canaryRef: requested.canaryRef,
        }),
      ).resolves.toMatchObject({ kind: 'replayed', toolRef: fixture.published.toolRef })
      await expect(
        backend.query(api.capabilitySupplyTools.detail, { toolRef: fixture.published.toolRef }),
      ).resolves.toMatchObject({ kind: 'found', tool: { toolRef: fixture.published.toolRef } })
      const quoteAgent = await createTestAgentPrincipal(
        backend,
        `quote-${slug}`,
        {
          environment: 'sandbox',
          spendUnits: '5000000',
          resourceRefs: [fixture.published.toolRef],
        },
      )
      const quote = await backend.action(
        api.capabilityQuotes.quote,
        await withSourceWrite('protected_action', {
          operationKey: `quote:${slug}`,
          correlationId: `quote:${slug}`,
          principal: quoteAgent.principal,
          toolRef: fixture.published.toolRef,
          input: { request: 'hello' },
        }),
      )
      expect(quote).toMatchObject({
        kind: 'refused',
        code: 'inspection_unavailable',
        retryable: true,
        toolRef: fixture.published.toolRef,
        continuation: { action: 'tool.quote' },
      })

      const state = await backend.run(async (ctx) => ({
        canaries: await ctx.db.query('capabilityCalls')
          .withIndex('by_sellerOnboardingCanary_canaryRef', (query) => (
            query.eq('sellerOnboardingCanary.canaryRef', requested.canaryRef!)
          ))
          .collect(),
        buyerUsage: await ctx.db.query('moneyUsageEvents').collect(),
        buyerObligations: await ctx.db.query('moneyProviderObligations').collect(),
      }))
      expect(state).toMatchObject({
        canaries: [expect.objectContaining({ state: 'completed' })],
        buyerUsage: [],
        buyerObligations: [],
      })
    },
  )

  it.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')(
    'executes one production owner canary through mainnet custody before promotion and Quote admission',
    async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'owner-production-canary-signing-secret-32-bytes')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:owner-production-canary')
    vi.stubEnv('AE_X402_RPC_URLS_JSON', JSON.stringify({
      [BASE_MAINNET_NETWORK]: ['https://rpc-a.example.test', 'https://rpc-b.example.test'],
    }))
    const payer = privateKeyToAccount(`0x${'31'.repeat(32)}`)
    const accountPolicyId = '31111111-1111-4111-8111-111111111111'
    const projectPolicyId = '32222222-2222-4222-8222-222222222222'
    const typedData = { primaryType: 'TransferWithAuthorization', types: { TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] } }
    const accountPolicy = { id: accountPolicyId, scope: 'account' as const, rules: [{ action: 'accept', operation: 'signEvmTypedData', criteria: [
      { type: 'evmTypedDataVerifyingContract', addresses: [BASE_MAINNET_USDC_ADDRESS], operator: 'in' },
      { type: 'evmTypedDataField', types: typedData, conditions: [
        { path: 'from', operator: 'in', addresses: [payer.address] },
        { path: 'value', operator: '<=', value: '10000' },
      ] },
    ] }] }
    const projectPolicy = { id: projectPolicyId, scope: 'project' as const, rules: [
      { action: 'reject', operation: 'signEvmTypedData', criteria: [
        { type: 'evmTypedDataVerifyingContract', addresses: [BASE_MAINNET_USDC_ADDRESS], operator: 'not in' },
      ] },
      { action: 'reject', operation: 'signEvmTypedData', criteria: [
        { type: 'evmTypedDataField', types: typedData, conditions: [{ path: 'value', operator: '>', value: '10000' }] },
      ] },
    ] }
    const policyDigest = cdpX402PolicyRulesDigest(accountPolicy, projectPolicy)
    if (policyDigest === undefined) throw new Error('production_canary_policy_invalid')
    for (const [name, value] of Object.entries({
      AE_X402_CUSTODY_ENABLED: 'true', AE_X402_CUSTODY_MAX_ATOMIC: '10000', AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '50000',
      CDP_API_KEY_ID: 'production-canary-key', CDP_API_KEY_SECRET: 'production-canary-secret', CDP_WALLET_SECRET: 'production-canary-wallet',
      AE_X402_CDP_ACCOUNT_NAME: 'production-canary', AE_X402_CDP_EXPECTED_EVM_ADDRESS: payer.address,
      AE_X402_CDP_ACCOUNT_POLICY_ID: accountPolicyId, AE_X402_CDP_PROJECT_POLICY_ID: projectPolicyId,
      AE_X402_CDP_POLICY_RULES_DIGEST: policyDigest, AE_X402_CDP_CREDENTIAL_GENERATION: '1',
    })) vi.stubEnv(name, value)
    const signatures: string[] = []
    productionExternal.cdpClient.mockReturnValue({
      policies: { getPolicyById: async ({ id }: { id: string }) => id === accountPolicyId ? accountPolicy : projectPolicy },
      evm: {
        getAccount: async () => ({ name: 'production-canary', address: payer.address, policies: [accountPolicyId, projectPolicyId] }),
        signTypedData: async (data: Parameters<typeof payer.signTypedData>[0] & { idempotencyKey: string }) => {
          signatures.push(data.idempotencyKey)
          return { signature: await payer.signTypedData(data) }
        },
      },
    })
    productionExternal.rate.mockResolvedValue({
      source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.2', fetchedAt: Date.now(),
    })

    let challenge: Parameters<typeof encodePaymentRequiredHeader>[0] | undefined
    const fixture = await seedPaidX402Publication(backend, 'owner-production-canary', {
      environment: 'production',
      price: { currency: 'USD', units: '10000', exponent: 6 },
      routeAmountExponent: 6,
      assetAmount: '10000',
      onPaymentRequired(value) {
        const validated = validatePaymentRequired(value)
        if (validated.x402Version !== 2) throw new Error('production_canary_challenge_v2_required')
        challenge = validated as Parameters<typeof encodePaymentRequiredHeader>[0]
        readinessFetch.mockResolvedValue(new UndiciResponse('', {
          status: 402,
          headers: { 'Payment-Required': encodePaymentRequiredHeader(challenge) },
        }) as never)
      },
    })
    if (challenge === undefined || challenge.x402Version !== 2) throw new Error('production_canary_challenge_missing')
    const issuedAt = Date.now()
    await expect(backend.mutation(
      internal.capabilitySupplyCanaryFunding.provisionProductionSellerOnboardingCanaryFunding,
      { generation: 1, issuedAt, expiresAt: issuedAt + 60 * 60_000, now: issuedAt },
    )).resolves.toMatchObject({ kind: 'ensured', generation: 1 })
    const command = await withSourceWrite('catalog_publish', {
      businessId: fixture.businessId,
      offeringRef: fixture.offeringRef,
      offeringRevision: 1,
      offeringSourceHash: fixture.sourceHash,
      publicationRef: fixture.published.publicationRef,
      publicationRevision: fixture.published.publicationRevision,
      operationKey: 'owner-production-canary',
      correlationId: 'owner-production-canary',
    })
    expect(await fixture.owner.action(api.capabilitySupplyOwnerSupply.runOwnerSupplyReadiness, command))
      .toMatchObject({ step: 'readiness', state: 'completed' })
    const requested = await fixture.owner.action(api.capabilitySupplyOwnerSupply.runOwnerSupplyTest, command)
    if (requested.state !== 'completed' || requested.canaryRef === undefined || requested.callRef === undefined) {
      throw new Error(`production_canary_request_failed:${JSON.stringify(requested)}`)
    }

    let authorization: { from: Hex; to: Hex; value: string; validAfter: string; validBefore: string; nonce: Hex } | undefined
    const settlementHash: Hex = `0x${'9'.repeat(64)}`
    readinessFetch.mockImplementation(async (_url, init) => {
      const payment = new Headers(init?.headers as HeadersInit).get('payment-signature')
      if (payment === null) return new UndiciResponse('', {
        status: 402,
        headers: { 'Payment-Required': encodePaymentRequiredHeader(challenge!) },
      }) as never
      authorization = (decodePaymentSignatureHeader(payment).payload as { authorization: typeof authorization }).authorization
      return new UndiciResponse(JSON.stringify({ result: 'production canary output' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Payment-Response': encodePaymentResponseHeader({
            success: true, transaction: settlementHash, network: BASE_MAINNET_NETWORK, payer: payer.address,
          }),
        },
      }) as never
    })
    productionExternal.receipt.mockImplementation(async () => {
      if (authorization === undefined) throw new Error('production_canary_authorization_missing')
      return {
        transactionHash: settlementHash, status: 'success', confirmations: 12n,
        blockHash: `0x${'8'.repeat(64)}`, blockNumber: 101n,
        observedBlockTimestamp: BigInt(Math.floor(Date.now() / 1000)), authorizationState: true,
        transactionTo: BASE_MAINNET_USDC_ADDRESS,
        transactionInput: encodeFunctionData({
          abi: eip3009ABI, functionName: 'transferWithAuthorization',
          args: [authorization.from, authorization.to, BigInt(authorization.value), BigInt(authorization.validAfter),
            BigInt(authorization.validBefore), authorization.nonce, 27, `0x${'d'.repeat(64)}`, `0x${'e'.repeat(64)}`],
        }),
        logs: [{ address: BASE_MAINNET_USDC_ADDRESS,
          data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(authorization.value)]),
          topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: authorization.from, to: authorization.to } }),
        }],
      }
    })
    await backend.run(async (ctx) => ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 }))
    await backend.finishAllScheduledFunctions(() => undefined)
    const completed = await backend.query(internal.capabilitySupplyOwnerCanary.readSellerOnboardingCanaryEvidence, {
      canaryRef: requested.canaryRef,
    })
    expect(completed).toMatchObject({ state: 'completed', result: {
      kind: 'completed', output: { result: 'production canary output' }, receipt: {
        network: BASE_MAINNET_NETWORK, asset: BASE_MAINNET_USDC_ADDRESS,
      },
    } })
    expect(signatures).toHaveLength(1)
    await expect(backend.mutation(internal.catalogOfferingMutations.promoteAdmittedSellerCanary, {
      canaryRef: requested.canaryRef,
    })).resolves.toMatchObject({ kind: 'promoted', toolRef: fixture.published.toolRef })
    await expect(backend.query(api.capabilitySupplyTools.detail, { toolRef: fixture.published.toolRef }))
      .resolves.toMatchObject({ kind: 'found', tool: { toolRef: fixture.published.toolRef } })
    const gatewayUrl = process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:3069'
    const formanceLedger = `ae-owner-production-${Date.now()}-${process.pid}`
    const formance = createFormanceContext({
      environment: 'sandbox',
      gatewayUrl,
      ledger: formanceLedger,
      requestTimeoutMs: 10_000,
    })
    expect(await installPackage4FormanceSchema(formance)).toMatchObject({ kind: 'completed' })
    vi.stubEnv('AE_FORMANCE_ENVIRONMENT', 'sandbox')
    vi.stubEnv('AE_FORMANCE_GATEWAY_URL', gatewayUrl)
    vi.stubEnv('AE_FORMANCE_LEDGER', formanceLedger)
    await seedQuoteCommercialPolicies(backend, 'owner-production', Date.now())
    const quoteAgent = await createTestAgentPrincipal(backend, 'owner-production-quote', {
      environment: 'production', spendUnits: '5000000', resourceRefs: [fixture.published.toolRef],
    })
    const custody = cdpX402CustodyConfigurationFromEnvironment()
    if (custody === undefined) throw new Error('owner_production_custody_missing')
    await expect(backend.mutation(internal.moneyTreasury.recordObservation, {
      environment: 'production',
      custodyRef: cdpX402CustodyBudgetRef(custody, 'production'),
      custodyGeneration: custody.credentialGeneration,
      network: BASE_MAINNET_NETWORK,
      asset: 'USDC',
      exponent: 6,
      observationRef: 'owner-production:treasury',
      totalUnits: '50000',
      bufferUnits: '10000',
      evidenceRef: 'cdp:owner-production:treasury',
      evidenceDigest: canonicalDigest({ treasury: 'owner-production' }),
      observedAt: Date.now(),
    })).resolves.toMatchObject({ kind: 'accepted' })
    expect(await bookFormanceFundingSettlement(formance, {
      commandRef: 'owner-production:funding',
      idempotencyKey: 'owner-production:funding',
      accountRef: quoteAgent.principal.ownerId,
      processorRef: 'stripe:owner-production',
      principalUnits: '5000000',
      serviceFeeUnits: '500000',
      taxUnits: '50000',
      totalUnits: '5550000',
      policyDigest,
      externalEvidenceDigest: canonicalDigest({ funding: 'owner-production' }),
    })).toMatchObject({ kind: 'completed', replayed: false })
    const quote = await backend.action(api.capabilityQuotes.quote, await withSourceWrite('protected_action', {
      operationKey: 'owner-production:quote',
      correlationId: 'owner-production:quote',
      principal: quoteAgent.principal,
      toolRef: fixture.published.toolRef,
      input: { request: 'hello' },
    }))
    expect(quote).toMatchObject({
      kind: 'committed',
      toolRef: fixture.published.toolRef,
      price: { currency: 'AUD', units: '12000', exponent: 6 },
      sourceRequirement: { currency: 'USDC', units: '10000', exponent: 6 },
    })
    const ledger = await backend.run(async (ctx) => ({
      usage: await ctx.db.query('moneyUsageEvents').collect(),
      obligations: await ctx.db.query('moneyProviderObligations').collect(),
    }))
    expect(ledger).toEqual({ usage: [], obligations: [] })
    },
    30_000,
  )

  it('refuses anonymous and wrong-owner admission without publication', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await createPublishedBusinessOwner(
      backend,
      'owner-auth',
    )
    const { businessId: wrongBusinessId, owner: wrongOwner } =
      await createPublishedBusinessOwner(backend, 'other-owner')
    const offeringRef = 'catalog-offering:owner-auth'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      'catalog-source:owner-auth:v1',
    )
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      'catalog-source:owner-auth:v1',
      openApiSource(),
      `owner-supply:${offeringRef}:1`,
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: 'catalog-source:owner-auth:v1',
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_publication_prepare_failed:${prepared.reason}`)

    await expect(
      backend.mutation(
        api.capabilitySupply.publishPreparedCapability,
        prepared.command,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      reason: 'authorization_denied',
    })
    await expect(
      wrongOwner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        prepared.command,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      reason: 'authorization_denied',
    })
    await expect(
      backend.run(async (ctx) =>
        ctx.db.query('capabilityPublications').take(10),
      ),
    ).resolves.toHaveLength(0)

    await expect(
      backend.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, {
        businessId,
      }),
    ).resolves.toEqual({ kind: 'error', code: 'unauthenticated' })
    await expect(
      wrongOwner.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, {
        businessId: wrongBusinessId,
      }),
    ).resolves.toMatchObject({
      kind: 'available',
      businessId: wrongBusinessId,
      offerings: [],
    })
  })

  it('refuses a stale catalog revision before publication', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-stale-revision',
    )
    const offeringRef = 'catalog-offering:owner-stale-revision'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      2,
      1,
      'catalog-source:owner-stale-revision:v1',
    )
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      'catalog-source:owner-stale-revision:v1',
      openApiSource(),
      `owner-supply:${offeringRef}:1`,
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: 'catalog-source:owner-stale-revision:v1',
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_publication_prepare_failed:${prepared.reason}`)

    await expect(
      owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        prepared.command,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      reason: 'catalog_offering_origin_changed',
    })
    await expect(
      backend.run(async (ctx) =>
        ctx.db.query('capabilityPublications').take(10),
      ),
    ).resolves.toHaveLength(0)
  })

  it('refuses an ae envelope whose catalog source hash is stale', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-stale-hash',
    )
    const offeringRef = 'catalog-offering:owner-stale-hash'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      'catalog-source:owner-stale-hash:v2',
    )
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      'catalog-source:owner-stale-hash:v2',
      directSource('catalog-source:owner-stale-hash:v1'),
      'owner-supply:owner-stale-hash',
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_publication_prepare_failed:${prepared.reason}`)

    await expect(
      owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        prepared.command,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      reason: 'catalog_offering_origin_changed',
    })
    await expect(
      backend.run(async (ctx) =>
        ctx.db.query('capabilityPublications').take(10),
      ),
    ).resolves.toHaveLength(0)
  })

  it('refuses malformed source and admits a valid OpenAPI source through the canonical command', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-valid',
    )
    const offeringRef = 'catalog-offering:owner-valid'
    const sourceHash = 'catalog-source:owner-valid:v1'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      sourceHash,
    )

    const malformed = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      { ...openApiSource(), document: '{' },
      'owner-supply:owner-valid:malformed',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    expect(malformed).toEqual({ kind: 'refused', reason: 'source_invalid' })
    await expect(
      backend.run(async (ctx) =>
        ctx.db.query('capabilityPublications').take(10),
      ),
    ).resolves.toHaveLength(0)

    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('owner.valid'),
      'owner-supply:owner-valid:admit',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_publication_prepare_failed:${prepared.reason}`)

    // Owner readback must resolve its publication binding by identity, not a global first-page scan.
    await backend.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert('capabilityTransportBindings', {
          bindingId: `binding:unrelated:${index}`,
          offeringId: `offering:unrelated:${index}`,
          networkId: 'ae:public',
          capabilityId: `unrelated.${index}`,
          version: 1,
          contractDigest: `sha256:${'0'.repeat(64)}`,
          endpointUrl: 'https://unrelated.example.test',
          authority: { kind: 'public_upstream' },
          continuation: { kind: 'single_response', evidenceRefs: [] },
          cancellation: { kind: 'unsupported', evidenceRefs: [] },
          adapterId: 'http-json:v1',
          configJson: '{}',
          configDigest: `sha256:${'1'.repeat(64)}`,
          registrationEvidenceRefs: [],
          registrationHash: `sha256:${'2'.repeat(64)}`,
          admission: 'not_admitted',
          conformance: 'not_conformant',
          admissionEvidenceRefs: [],
          conformanceEvidenceRefs: [],
          eligibilityHash: `sha256:${'3'.repeat(64)}`,
          registeredAt: index,
          updatedAt: index,
        })
      }
    })

    const admitted = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      prepared.command,
    )
    if (admitted.kind === 'refused')
      throw new Error(`owner_publication_failed:${admitted.reason}`)
    expect(admitted).toMatchObject({
      kind: 'published',
      publicationRef: 'offering:owner:lookup',
      publicationRevision: 1,
      authorityMode: 'provider_owned',
      sourceKind: 'openapi_http',
      sourceRevision: 'owner-api/2026-08-09',
      priceDigest: expect.stringMatching(/^sha256:/),
    })
    const rows = await backend.run(async (ctx) => ({
      publications: await ctx.db.query('capabilityPublications').take(10),
      offerings: await ctx.db.query('capabilityOfferings').take(10),
    }))
    expect(rows.publications).toHaveLength(1)
    expect(rows.offerings[0]?.origin).toEqual({
      kind: 'catalog_offering',
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash: sourceHash,
    })

    const readback = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
      { businessId },
    )
    if (readback.kind !== 'available')
      throw new Error(`owner_readback_kind:${readback.kind}`)
    expect(readback.businessId).toBe(businessId)
    const readbackOffering = readback.offerings[0]
    if (readbackOffering === undefined)
      throw new Error('owner_readback_offering_missing')
    expect(readbackOffering).toMatchObject({ offeringRef, revision: 1 })
    expect(readbackOffering.source).toEqual({
      kind: 'openapi_http',
      selector: { path: '/lookup', method: 'post' },
      revision: admitted.sourceRevision,
      digest: admitted.sourceDigest,
    })
    expect(readbackOffering.pricing).toEqual({
      config: {
        version: 'pricing:v3',
        kind: 'fixed_aud',
        currency: 'AUD',
        exponent: 6,
        amountUnits: '1000000',
      },
      priceDigest: admitted.priceDigest,
    })
    expect(readbackOffering.admission).toEqual({ state: 'admitted' })
    expect(readbackOffering.publicationRef).toBe(admitted.publicationRef)
    expect(readbackOffering.publication).toMatchObject({
      state: 'current',
      publicationRef: admitted.publicationRef,
      publicationRevision: admitted.publicationRevision,
      toolRef: admitted.toolRef,
    })
    expect(readbackOffering.publication?.source).toEqual({
      kind: 'openapi_http',
      selector: { path: '/lookup', method: 'post' },
      revision: admitted.sourceRevision,
      digest: admitted.sourceDigest,
    })
    expect(readbackOffering.publication?.pricing).toEqual({
      config: {
        version: 'pricing:v3',
        kind: 'fixed_aud',
        currency: 'AUD',
        exponent: 6,
        amountUnits: '1000000',
      },
      priceDigest: admitted.priceDigest,
    })
    expect(readbackOffering.publication?.binding).toMatchObject({
      bindingId: admitted.bindingId,
      admission: 'admitted',
      conformance: 'conformant',
    })
  })

  it('consumes one owner proof for one exact publication command', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-proof-binding',
    )
    const offeringRef = 'catalog-offering:owner-proof-binding'
    const sourceHash = 'catalog-source:owner-proof-binding:v1'
    await seedCatalogOffering(backend, businessId, offeringRef, 1, 1, sourceHash)
    const origin = {
      kind: 'catalog_offering' as const,
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash: sourceHash,
    }
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('owner.proof.binding'),
      'owner-proof-binding:publish',
      origin,
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_publication_prepare_failed:${prepared.reason}`)
    const {
      proof,
      sourceWrite: _sourceWrite,
      sourceWriteRequest: _sourceWriteRequest,
      ...unsignedWithoutProof
    } = prepared.command
    const withoutProof = await withSourceWrite('catalog_publish', unsignedWithoutProof)
    await expect(
      owner.mutation(api.capabilitySupply.publishPreparedCapability, withoutProof),
    ).resolves.toEqual({ kind: 'refused', reason: 'reauthentication_required' })
    await expect(
      backend.run(async (ctx) => ({
        publications: await ctx.db.query('capabilityPublications').collect(),
        proofs: await ctx.db.query('consequenceProofUses').collect(),
      })),
    ).resolves.toEqual({ publications: [], proofs: [] })

    await expect(
      owner.mutation(api.capabilitySupply.publishPreparedCapability, prepared.command),
    ).resolves.toMatchObject({ kind: 'published', publicationRevision: 1 })
    const changed = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('owner.proof.binding'),
      'owner-proof-binding:changed-command',
      origin,
    )
    if (changed.kind === 'refused')
      throw new Error(`owner_publication_changed_prepare_failed:${changed.reason}`)
    const {
      sourceWrite: _changedSourceWrite,
      sourceWriteRequest: _changedSourceWriteRequest,
      ...changedUnsigned
    } = changed.command
    const changedWithReplayedProof = await withSourceWrite('catalog_publish', {
      ...changedUnsigned,
      proof,
    })
    await expect(
      owner.mutation(api.capabilitySupply.publishPreparedCapability, changedWithReplayedProof),
    ).resolves.toEqual({ kind: 'refused', reason: 'command_changed' })
    await expect(
      backend.run(async (ctx) => ({
        publications: await ctx.db.query('capabilityPublications').collect(),
        proofs: await ctx.db.query('consequenceProofUses').collect(),
      })),
    ).resolves.toMatchObject({
      publications: [expect.objectContaining({ revision: 1 })],
      proofs: [expect.objectContaining({ reverificationId: proof.reverificationId })],
    })
  })
})
