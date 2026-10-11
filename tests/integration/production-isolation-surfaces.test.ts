import { mockModel } from '@convex-dev/agent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import type { IndexedSource } from '../../convex/lib/market/directoryIndex/contracts'
import { reconcileReadyItems } from '../../convex/lib/capabilitySupply/facilitatorDiscovery/readyItems'
import { createChatAgent } from '../../convex/lib/chat/tools/agent'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { admitFacilitatorDiscoveryItems } from '@/modules/capability-supply/server'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import * as networkServer from '@/modules/network-guard/server'
import { handleSandboxReferenceRequest } from '@/routes/api.v1.sandbox-reference'
import { handleProviderConsequenceRequest } from '@/routes/api.internal.provider-consequence'
import {
  providerConsequenceInvocationDigest, providerConsequenceTicketClaimsDigest,
  type CanonicalProviderConsequenceTicket,
} from '@/modules/capability-execution/provider-consequence-runtime'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'
import { createTestProviderInvocation } from '../helpers/route-transport-fixtures'
import captured from '../fixtures/x402-bazaar/timezone-payment-required-2026-08-19.json'

const external = vi.hoisted(() => ({ oidc: vi.fn() }))
vi.mock('@vercel/oidc', () => ({ getVercelOidcToken: external.oidc }))

beforeEach(() => { vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production') })
afterEach(() => {
  setHttpRateLimitAdmissionForTests(undefined)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  external.oidc.mockReset()
})

describe('production surface isolation', () => {
  it('refuses every development seed registration and hides the sandbox route before admission', async () => {
    const backend = convexTestWithMarketComponents()
    await expect(backend.mutation(internal.devSeed.seedDevCatalog, {})).rejects.toThrow('dev_seed_deployment_refused')
    for (const cursor of [null, 'continuation']) {
      await expect(backend.mutation(internal.devSeed.seedOfferingSupply, { cursor })).rejects.toThrow('dev_seed_deployment_refused')
    }
    await expect(backend.mutation(internal.devSeed.publishSandboxTool, {})).rejects.toThrow('dev_seed_deployment_refused')
    await expect(backend.mutation(internal.devSeed.seedSandboxSpendingPolicy, {})).rejects.toThrow('dev_seed_deployment_refused')
    expect(await backend.run(async ctx => ({
      publications: await ctx.db.query('capabilityPublications').collect(),
      businesses: await ctx.db.query('businesses').collect(),
      principals: await ctx.db.query('principals').collect(),
      bindings: await ctx.db.query('moneyLegalCustomerBindings').collect(),
    }))).toEqual({ publications: [], businesses: [], principals: [], bindings: [] })
    const admission = vi.fn(async () => ({ ok: true as const }))
    setHttpRateLimitAdmissionForTests(admission)
    const request = () => new Request('http://ae.test/api/v1/sandbox-reference', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    expect((await handleSandboxReferenceRequest(request())).status).toBe(404)
    expect(admission).not.toHaveBeenCalled()
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    expect((await handleSandboxReferenceRequest(request())).status).toBe(200)
    expect(admission).toHaveBeenCalledOnce()
  })

  it('admits only mainnet discovery and rechecks a valid sandbox draft before publication', async () => {
    const backend = convexTestWithMarketComponents()
    const mainnet = structuredClone(captured.paymentRequired)
    const sandbox = { ...mainnet, accepts: mainnet.accepts.map(accept => ({
      ...accept, network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    })) }
    expect((await admitFacilitatorDiscoveryItems([sandbox])).admitted).toEqual([])
    expect((await admitFacilitatorDiscoveryItems([mainnet])).admitted).toHaveLength(1)
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const accepted = await admitFacilitatorDiscoveryItems([sandbox])
    expect(accepted.admitted).toHaveLength(1)
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const workload = await backend.query(internal.workloadCron.admit, { name: 'refresh facilitator discovery' })
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const result = await backend.mutation(internal.facilitatorDiscovery.reconcile, {
      items: [...reconcileReadyItems(accepted.admitted)], complete: false,
      deadlineAt: Date.now() + 60_000, workload,
    })
    expect(result.toolRefs).toEqual([])
    expect(await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).toEqual([])
  })

  it('hides sandbox listings across directory reads and native chat search even when the query requests sandbox', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const workload = await backend.query(internal.workloadCron.admit, { name: 'refresh Agentic Economy API registry' })
    const generation = 'production-isolation-directory'
    await backend.run(async ctx => {
      await ctx.db.insert('marketExternalRegistryGenerations', {
        generation, source: 'coinbase', status: 'refreshing', startedAt: 1, ingestedCount: 0, nextOffset: 0,
      })
      await ctx.db.insert('marketExternalRegistryState', {
        key: 'coinbase', refreshGeneration: generation, lastAttemptAt: 1, lastAttemptStatus: 'refreshing',
      })
    })
    const rows: IndexedSource[] = ['base-sepolia', 'base'].map(network => {
      const resource = `https://provider.test/${network}`
      const source = { resource, type: 'http' }
      return { resource, sourceJson: JSON.stringify(source), sourceDigest: canonicalDigest(source), admission: { kind: 'quotable' as const }, entry: {
        resource, title: `Sandbox weather ${network}`, description: 'Sandbox weather lookup',
        protocol: 'http', provider: 'provider.test', metadataJson: '', category: 'Weather', tags: [],
        activity: { calls30d: 5, payers30d: 2 }, output: { fields: [], schemaJson: '{}' },
        provenance: { directory: 'Coinbase Bazaar', metadata: 'provider_declared', updatedAt: new Date().toISOString() },
        prices: [{ network, scheme: 'exact', amount: '1000', decimalAmount: '0.001', symbol: 'USDC' }],
      } }
    })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, {
      generation, offset: 0, reportedTotal: 2, observedAt: 2, runStartedAt: 1, workload, items: rows,
    })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, {
      generation, offset: 100, reportedTotal: 2, observedAt: 3, runStartedAt: 1, workload, items: [],
    })
    const paginationOpts = { cursor: null, numItems: 12 }
    expect(await backend.query(api.x402DirectoryIndex.browse, { paginationOpts }))
      .toMatchObject({ kind: 'ok', page: [{ entry: { resource: 'https://provider.test/base' } }] })
    expect(await backend.query(api.x402DirectoryIndex.searchCompact, { query: 'sandbox weather', paginationOpts }))
      .toMatchObject({ kind: 'ok', page: [{ resource: 'https://provider.test/base' }] })
    expect(await backend.query(api.x402DirectoryIndex.resource, { resource: 'https://provider.test/base-sepolia' }))
      .toEqual({ kind: 'not_found' })
    expect(await backend.query(internal.x402DirectoryIndex.selectedSource, { resource: 'https://provider.test/base-sepolia' }))
      .toEqual({ kind: 'not_found' })
    expect(await backend.query(internal.x402DirectoryIndex.firstEligiblePage, { generation }))
      .toEqual(['https://provider.test/base'])
    const search = await backend.action(async ctx => {
      const agent = createChatAgent(mockModel())
      const tool = agent.options.tools?.registry_tools_search
      if (tool?.execute === undefined) throw new Error('search_tool_missing')
      return await Reflect.apply(tool.execute, { ...tool, ctx }, [
        { query: 'sandbox weather', source: 'coinbase', limit: 8 },
        { toolCallId: 'isolation-search', messages: [{ role: 'user', content: 'Find sandbox weather testnet Tools' }] },
      ])
    })
    expect(search).toMatchObject({ kind: 'match', results: [{ title: 'Sandbox weather base', access: 'ae_callable' }] })
    expect(JSON.stringify(search)).not.toContain('base-sepolia')
  })

  it('refuses valid raw-key x402 ticket issuance and execution before any external consequence', async () => {
    const now = Date.now()
    const invocation = createTestProviderInvocation({ now, adapterId: 'x402-fetch:v2' })
    const invocationDigest = providerConsequenceInvocationDigest(invocation)
    if (invocationDigest === undefined) throw new Error('provider_invocation_invalid')
    const pointer = { secretRef: `sec_${'1'.repeat(32)}`, activeGeneration: `sgn_${'2'.repeat(32)}`, pointerRevision: 1 }
    const ticket: CanonicalProviderConsequenceTicket = {
      version: 'provider-consequence:v1', ticketRef: 'provider-ticket:isolation', effectRef: 'effect:isolation',
      requestDigest: canonicalDigest('isolation'), invocationDigest, issuedAt: now - 1_000, expiresAt: now + 10_000,
      callRef: 'call:test', toolRef: 'tool:test', leaseRef: 'lease:test', connectionRef: 'connection:test',
      authorityGeneration: 7, providerRef: 'provider:test', adapterId: 'x402-fetch:v2',
      authorityDigest: invocation.authority.authorityDigest, grantedScopes: ['provider:invoke'], grantedResources: ['tool:test'],
      readinessValidUntil: now + 120_000, owningAccountRef: `acc_${'1'.repeat(32)}`,
      activeAccountRef: `acc_${'1'.repeat(32)}`, actorPrincipalRef: `prn_${'2'.repeat(32)}`,
      grantRef: 'grant:test', grantGeneration: 3, secret: pointer, paymentSecret: pointer,
    }
    const envelope = { ticket, ticketClaimsDigest: providerConsequenceTicketClaimsDigest(ticket), signingSecret: pointer,
      journalToken: 'a'.repeat(43) }
    const environment = {
      AE_DEPLOYMENT_ENVIRONMENT: 'production', AE_INFISICAL_BASE_URL: 'https://app.infisical.com',
      AE_INFISICAL_PLATFORM_PROJECT_ID: 'platform', AE_INFISICAL_PLATFORM_ENVIRONMENT: 'production',
      AE_INFISICAL_PLATFORM_SECRET_PATH: '/platform', AE_INFISICAL_PLATFORM_MACHINE_IDENTITY_ID: 'platform-identity',
      AE_INFISICAL_CUSTOMER_PROJECT_ID: 'customer', AE_INFISICAL_CUSTOMER_ENVIRONMENT: 'production',
      AE_INFISICAL_CUSTOMER_SECRET_PATH: '/customer', AE_INFISICAL_CUSTOMER_MACHINE_IDENTITY_ID: 'customer-identity',
      CONVEX_SITE_URL: 'https://isolation.convex.site',
      AE_SECRET_LIFECYCLE_RPC_TOKEN: 't'.repeat(43),
    }
    const fetch = vi.fn(async () => Response.json({ kind: 'unavailable' }))
    vi.stubGlobal('fetch', fetch)
    const send = vi.spyOn(networkServer, 'sendGuardedHttpRequest')
      .mockImplementation(fetch)
    const request = (action: 'issue' | 'execute') => new Request('https://ae.test/api/internal/provider-consequence', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${'t'.repeat(43)}` },
      body: JSON.stringify({ ...envelope, action, ...(action === 'issue' ? {} : {
        signedTicket: `${ticket.ticketRef}.${ticket.expiresAt}.${'a'.repeat(64)}`, invocation,
      }) }),
    })
    for (const action of ['issue', 'execute'] as const) {
      const response = await handleProviderConsequenceRequest(request(action), environment)
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({ kind: 'unavailable' })
    }
    expect(fetch).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(external.oidc).not.toHaveBeenCalled()
    // The same envelope reaches attestation in development, proving parsing and configuration are valid.
    expect((await handleProviderConsequenceRequest(request('issue'), {
      ...environment, AE_DEPLOYMENT_ENVIRONMENT: 'development',
    })).status).toBe(409)
    expect(fetch).toHaveBeenCalledOnce()
  })
})
