import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { prepareIndexedDirectorySource } from '../../convex/x402DirectoryIndexSource'
import { convexModules, convexTestWithMarketComponents, publishedBusinessOwner } from '../helpers/convex-fixtures'
import { admitDiscoveredToolFixture } from '../helpers/discovered-tool-fixture'
import { seedPaymentReadiness, seedTreasuryReadinessFacts } from '../helpers/payment-readiness-fixture'
import { seedAgent, seedCommercialPolicies, validCustodyEnvironment, type QuotePrincipal } from '../helpers/quote-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import { encodeX402PaymentRequiredHeader } from '@/modules/capability-supply/server'
import timezonePaymentRequired20260819Fixture from '../fixtures/x402-bazaar/timezone-payment-required-2026-08-19.json'
const fixture = timezonePaymentRequired20260819Fixture

const sdk = vi.hoisted(() => ({ list: vi.fn(), search: vi.fn() }))
vi.mock('@coinbase/cdp-sdk', () => ({ listX402DiscoveryResources: sdk.list, searchX402Resources: sdk.search }))
/** An unpaid x402 v2 challenge, sent the way sellers send it: in the PAYMENT-REQUIRED header. */
function challenge(paymentRequired: Readonly<Record<string, unknown>>): Response {
  return new Response('{}', { status: 402, headers: { 'content-type': 'application/json', 'payment-required': encodeX402PaymentRequiredHeader(paymentRequired as never) } })
}
const guard = vi.hoisted(() => ({ isPublic: vi.fn(async () => true), send: vi.fn() }))
vi.mock('@/modules/network-guard/public', async (actual) => ({ ...(await actual<object>()), isPublicHttpTarget: guard.isPublic }))
vi.mock('@/modules/network-guard/server', async (actual) => ({ ...(await actual<object>()), sendGuardedHttpRequest: guard.send }))
const payment = fixture.paymentRequired
const item = { ...payment, resource: payment.resource.url, description: payment.resource.description, serviceName: payment.resource.serviceName, type: 'http' }

describe('selected directory resource resolution', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production') })
  afterEach(() => vi.unstubAllEnvs())

  it('refuses missing deployment and opposite-network requests before index or upstream lookup', async () => {
    const backend = convexTest(schema, convexModules)
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', undefined)
    expect(await backend.action(internal.x402Directory.resolve, { resource: item.resource })).toEqual({ kind: 'unavailable', reason: 'source_unavailable' })
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    expect(await backend.action(internal.x402Directory.resolve, { resource: item.resource, network: 'base-sepolia' })).toEqual({ kind: 'unavailable', reason: 'resource_filters_mismatch' })
    expect(sdk.list).not.toHaveBeenCalled()
    expect(sdk.search).not.toHaveBeenCalled()
    expect(await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).toEqual([])
  })

  it.each([
    ['production', 'production', 'eip155:8453', false],
    ['production', 'production', 'eip155:8453', true],
    ['development', 'sandbox', 'eip155:84532', false],
    ['development', 'sandbox', 'eip155:84532', true],
  ] as const)('resolves only its own payment option: deployment=%s, environment=%s, network=%s, reversed=%s', async (deployment, environment, network, reverse) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', deployment)
    const backend = convexTest(schema, convexModules)
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const mainnet = payment.accepts[0]!
    const sepolia = { ...mainnet, network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' }
    const mixed = { ...item, accepts: reverse ? [sepolia, mainnet] : [mainnet, sepolia] }
    sdk.list.mockResolvedValue({ items: [mixed], pagination: { offset: 0, limit: 20, total: 1 } })
    const result = await backend.action(internal.x402Directory.resolve, { resource: item.resource })
    expect(result).toMatchObject({ kind: 'ready' })
    const publications = await backend.run(ctx => ctx.db.query('capabilityPublications').collect())
    expect(publications).toHaveLength(1)
    expect(publications[0]?.runtimeEnvironment).toBe(environment)
    const pricing = publications[0]?.pricingConfigJson
    if (pricing === undefined) throw new Error('expected_publication_pricing')
    expect(JSON.parse(pricing)).toMatchObject({ sourceRequirement: { network } })
  })

  it.each(['production', 'development'])('refuses an opposite-network upstream resource in %s', async (deployment) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', deployment)
    const backend = convexTest(schema, convexModules)
    const opposite = deployment === 'production'
      ? { ...item, accepts: payment.accepts.map(accept => ({ ...accept, network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' })) }
      : item
    sdk.list.mockResolvedValue({ items: [opposite], pagination: { offset: 0, limit: 20, total: 1 } })
    // Filtered off the page, the URL is read live; its own 402 still offers only the opposite network.
    guard.send.mockResolvedValue(challenge({ x402Version: 2, resource: { url: item.resource }, accepts: opposite.accepts }))
    expect(await backend.action(internal.x402Directory.resolve, { resource: item.resource })).toEqual({ kind: 'unavailable', reason: 'chain_unsupported' })
    expect(await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).toEqual([])
  })

  it('materializes only the exact selected resource using fresh SDK metadata', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    sdk.list.mockResolvedValue({ items: [item, { resource: 'https://other.test/tool', type: 'mcp' }], pagination: { offset: 0, limit: 20, total: 2 } })
    const result = await backend.action(internal.x402Directory.resolve, { resource: item.resource })
    expect(result).toMatchObject({ kind: 'ready', toolRef: expect.any(String) })
    expect(sdk.list).toHaveBeenCalledExactlyOnceWith({ limit: 20, offset: 0 })
    const rows = await backend.run((ctx) => ctx.db.query('capabilityPublications').collect())
    expect(rows).toHaveLength(1)
  })

  it('resolves the exact completed-index snapshot independently of upstream search rank or page', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const workload = await backend.query(internal.workloadCron.admit, { name: 'refresh Agentic Economy API registry' })
    const generation = 'coinbase-selected-resource'
    await backend.run(async ctx => {
      await ctx.db.insert('marketExternalRegistryGenerations', { generation, source: 'coinbase', status: 'refreshing', startedAt: 1, ingestedCount: 0, nextOffset: 0 })
      await ctx.db.insert('marketExternalRegistryState', { key: 'coinbase', refreshGeneration: generation, lastAttemptAt: 1, lastAttemptStatus: 'refreshing' })
    })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 1, observedAt: 2, runStartedAt: 1, workload, items: [await prepareIndexedDirectorySource(item)] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 1, observedAt: 3, runStartedAt: 1, workload, items: [] })
    const result = await backend.action(internal.x402Directory.resolve, { resource: item.resource, query: 'unrelated search', offset: 10000 })
    expect(result).toMatchObject({ kind: 'ready', toolRef: expect.any(String) })
    expect(sdk.list).not.toHaveBeenCalled()
    expect(sdk.search).not.toHaveBeenCalled()
    expect(await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).toHaveLength(1)
  })

  it('resolves a registry listing id from the completed index to the same publication as its URL', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const workload = await backend.query(internal.workloadCron.admit, { name: 'refresh Agentic Economy API registry' })
    const generation = 'coinbase-listing-ref'
    await backend.run(async ctx => {
      await ctx.db.insert('marketExternalRegistryGenerations', { generation, source: 'coinbase', status: 'refreshing', startedAt: 1, ingestedCount: 0, nextOffset: 0 })
      await ctx.db.insert('marketExternalRegistryState', { key: 'coinbase', refreshGeneration: generation, lastAttemptAt: 1, lastAttemptStatus: 'refreshing' })
    })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 1, observedAt: 2, runStartedAt: 1, workload, items: [await prepareIndexedDirectorySource(item)] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 1, observedAt: 3, runStartedAt: 1, workload, items: [] })
    const id = (await backend.run(ctx => ctx.db.query('marketExternalRegistryEntries').collect()))[0]?.documentId
    expect(id).toMatch(/^registry:[0-9a-f]{64}$/u)
    expect(await backend.query(api.x402DirectoryIndex.detailById, { id: id! })).toMatchObject({ kind: 'found', item: { choice: { access: 'ae_callable', toolRef: id } } })
    const byId = await backend.action(internal.x402Directory.resolve, { resource: id! })
    expect(byId).toMatchObject({ kind: 'ready', toolRef: expect.stringMatching(/^operation:v1:/u) })
    expect(await backend.action(internal.x402Directory.resolve, { resource: item.resource })).toEqual(byId)
    expect(await backend.action(internal.x402Directory.resolve, { resource: `registry:${'0'.repeat(64)}` })).toEqual({ kind: 'unavailable', reason: 'resource_not_found' })
    expect(sdk.list).not.toHaveBeenCalled()
    const publications = await backend.run(ctx => ctx.db.query('capabilityPublications').collect())
    expect(publications).toHaveLength(1)
    const indexRows = await backend.run(ctx => ctx.db.query('marketDirectorySearchEntries').withIndex('by_generation_and_sourceRouteRef', q => q.eq('generation', generation)).collect())
    expect([...new Set(indexRows.map(row => row.sourceRouteRef))]).toEqual([publications[0]?.sourceRouteRef])
    expect(await backend.query(api.x402DirectoryIndex.detailById, { id: id! })).toMatchObject({ kind: 'found', item: { choice: { toolRef: (byId as { toolRef: string }).toolRef } } })
  })

  it('resolves a one-payer listing to a found Tool; payers and eligibility stay row signals', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const workload = await backend.query(internal.workloadCron.admit, { name: 'refresh Agentic Economy API registry' })
    const generation = 'coinbase-one-payer'
    const onePayer = { ...item, quality: { ...item.quality, l30DaysUniquePayers: 1 } }
    await backend.run(async ctx => {
      await ctx.db.insert('marketExternalRegistryGenerations', { generation, source: 'coinbase', status: 'refreshing', startedAt: 1, ingestedCount: 0, nextOffset: 0 })
      await ctx.db.insert('marketExternalRegistryState', { key: 'coinbase', refreshGeneration: generation, lastAttemptAt: 1, lastAttemptStatus: 'refreshing' })
    })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 0, reportedTotal: 1, observedAt: 2, runStartedAt: 1, workload, items: [await prepareIndexedDirectorySource(onePayer)] })
    await backend.mutation(internal.x402DirectoryIndexStore.applyPage, { generation, offset: 100, reportedTotal: 1, observedAt: 3, runStartedAt: 1, workload, items: [] })
    const rows = await backend.run(ctx => ctx.db.query('marketDirectorySearchEntries').collect())
    expect(rows.every(row => row.eligible === false)).toBe(true)
    const id = (await backend.run(ctx => ctx.db.query('marketExternalRegistryEntries').collect()))[0]?.documentId
    const result = await backend.action(internal.x402Directory.resolve, { resource: id! })
    expect(result).toMatchObject({ kind: 'ready', toolRef: expect.stringMatching(/^operation:v1:/u) })
  })

  it('refuses a resource not present on the reread page without fetching its URL', async () => {
    const backend = convexTest(schema, convexModules)
    sdk.search.mockResolvedValue({ resources: [item], partialResults: false })
    const result = await backend.action(internal.x402Directory.resolve, { resource: 'http://127.0.0.1/private', query: 'timezone' })
    expect(result).toEqual({ kind: 'unavailable', reason: 'resource_not_found' })
    expect(sdk.search).toHaveBeenCalledExactlyOnceWith({ query: 'timezone', network: 'eip155:8453', limit: 20 })
    expect(await backend.run((ctx) => ctx.db.query('capabilityPublications').collect())).toEqual([])
  })

  it('publishes an unlisted https URL from its own live 402 through the SSRF guard', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    sdk.list.mockResolvedValue({ items: [], pagination: { offset: 0, limit: 20, total: 0 } })
    const url = 'https://unlisted.example.com/weather'
    guard.send.mockResolvedValue(challenge({ x402Version: 2, resource: { url, description: 'Current weather' }, accepts: [payment.accepts[0]!] }))
    const result = await backend.action(internal.x402Directory.resolve, { resource: url })
    expect(result).toMatchObject({ kind: 'ready', toolRef: expect.stringMatching(/^operation:v1:/u) })
    expect(guard.isPublic).toHaveBeenCalled()
    expect(guard.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ method: 'GET', url }), expect.any(Number))
    expect(await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).toHaveLength(1)
  })

  it('refuses an unlisted https URL whose target is not public without sending', async () => {
    const backend = convexTest(schema, convexModules)
    sdk.list.mockResolvedValue({ items: [], pagination: { offset: 0, limit: 20, total: 0 } })
    guard.isPublic.mockResolvedValueOnce(false)
    expect(await backend.action(internal.x402Directory.resolve, { resource: 'https://internal.example.com/x' }))
      .toEqual({ kind: 'unavailable', reason: 'resource_invalid' })
    expect(guard.send).not.toHaveBeenCalled()
    expect(await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).toEqual([])
  })

  it('names an unlisted URL that answers without a 402 as not payable, not as missing', async () => {
    const backend = convexTest(schema, convexModules)
    sdk.list.mockResolvedValue({ items: [], pagination: { offset: 0, limit: 20, total: 0 } })
    guard.send.mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    expect(await backend.action(internal.x402Directory.resolve, { resource: 'https://free.example.com/x' }))
      .toEqual({ kind: 'unavailable', reason: 'resource_not_payable' })
    expect(await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).toEqual([])
  })

  it('returns selected-resource admission refusal without requiring workload state', async () => {
    const backend = convexTest(schema, convexModules)
    sdk.list.mockResolvedValue({ items: [{ resource: 'https://provider.test/tool', type: 'mcp', x402Version: 2 }], pagination: { offset: 0, limit: 20, total: 1 } })
    const result = await backend.action(internal.x402Directory.resolve, { resource: 'https://provider.test/tool' })
    expect(result.kind).toBe('unavailable')
    expect(await backend.run((ctx) => ctx.db.query('capabilityPublications').collect())).toEqual([])
  })

  it('repeats the exact filtered SDK search when resolving the selected resource', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    sdk.search.mockResolvedValue({ resources: [item], partialResults: true })
    const result = await backend.action(internal.x402Directory.resolve, { resource: item.resource, query: 'timezone', network: 'eip155:8453', provider: '402timezones.vercel.app', maxUsdPrice: 0.1 })
    expect(result).toMatchObject({ kind: 'ready', toolRef: expect.any(String) })
    expect(sdk.search).toHaveBeenCalledExactlyOnceWith({ query: 'timezone', network: 'eip155:8453', urlSubstring: '://402timezones.vercel.app/', maxUsdPrice: '0.1', limit: 20 })
    expect(sdk.list).not.toHaveBeenCalled()
  })

  it('refuses invalid resolution filters before any source request or publication', async () => {
    const backend = convexTest(schema, convexModules)
    const result = await backend.action(internal.x402Directory.resolve, { resource: item.resource, provider: 'https://example.com/private' })
    expect(result).toEqual({ kind: 'unavailable', reason: 'query_invalid' })
    expect(sdk.search).not.toHaveBeenCalled()
    expect(sdk.list).not.toHaveBeenCalled()
    expect(await backend.run((ctx) => ctx.db.query('capabilityPublications').collect())).toEqual([])
  })

})

describe('public Quote on a raw https URL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    vi.stubEnv('AE_FORMANCE_ENVIRONMENT', 'production')
    for (const [name, value] of Object.entries(validCustodyEnvironment)) vi.stubEnv(name, value)
    vi.stubEnv('AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC', '100000')
    vi.stubEnv('AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC', '10000')
  })
  afterEach(() => vi.unstubAllEnvs())

  async function readyBuyer() {
    const backend = convexTestWithMarketComponents()
    const fixture = await admitDiscoveredToolFixture(backend, { withoutExample: true })
    const owner = await publishedBusinessOwner(backend, 'url-quote-buyer')
    await seedCommercialPolicies(backend, 'url-quote', Date.now())
    await seedTreasuryReadinessFacts(backend, { observation: 'create' })
    await seedPaymentReadiness(backend)
    const agent = await seedAgent(backend, owner, fixture.toolRef, 'url-quote', '20000000')
    const publications = async () => (await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).length
    return { backend, fixture, agent, publications }
  }
  const command = (principal: QuotePrincipal, operationKey: string) => ({
    operationKey, correlationId: operationKey, principal, toolRef: item.resource,
    input: { from: 'UTC', to: 'America/New_York', time: '12:00' },
  })

  it.each(['missing', 'changed'] as const)('refuses a %s admission before resolve fetches or publishes anything', async (admission) => {
    const { backend, agent, publications } = await readyBuyer()
    const before = await publications()
    const unsigned = command(agent.principal, `url-quote:${admission}`)
    const args = admission === 'missing' ? unsigned : { ...await withSourceWrite('protected_action', unsigned), toolRef: 'https://unlisted.example.com/weather' }
    expect(await backend.action(api.capabilityQuotes.quote, args as never)).toMatchObject({
      kind: 'refused', code: 'inspection_unavailable',
      reason: admission === 'missing' ? 'missing_source_write_admission' : 'source_write_command_mismatch',
    })
    expect(guard.send).not.toHaveBeenCalled()
    expect(sdk.list).not.toHaveBeenCalled()
    expect(sdk.search).not.toHaveBeenCalled()
    expect(await publications()).toBe(before)
    expect(await backend.run(ctx => ctx.db.query('capabilityQuotes').collect())).toEqual([])
  })

  it('refuses a caller with no current Agent grant before resolve fetches or publishes anything', async () => {
    const { backend, agent, publications } = await readyBuyer()
    const before = await publications()
    const args = await withSourceWrite('protected_action', command({ ...agent.principal, principalId: 'principal:not-granted' }, 'url-quote:grantless'))
    expect(await backend.action(api.capabilityQuotes.quote, args as never)).toMatchObject({ kind: 'refused', code: 'grant_not_found' })
    expect(guard.send).not.toHaveBeenCalled()
    expect(sdk.list).not.toHaveBeenCalled()
    expect(await publications()).toBe(before)
  })

  // Without a Formance ledger the Quote stops at the spending-period sync, after admission,
  // resolution and the financial subjects have all run against the resolved operation ref.
  it('admits a URL Quote signed over the URL, prices the resolved operation ref, and refuses its replay', async () => {
    const { backend, fixture, agent, publications } = await readyBuyer()
    sdk.list.mockResolvedValue({ items: [item], pagination: { offset: 0, limit: 20, total: 1 } })
    const args = await withSourceWrite('protected_action', command(agent.principal, 'url-quote:valid'))
    expect(await backend.action(api.capabilityQuotes.quote, args)).toMatchObject({
      kind: 'refused', reason: 'spending_period_command_pending', toolRef: fixture.toolRef,
      continuation: { action: 'tool.quote', args: { toolRef: fixture.toolRef } },
    })
    expect(await publications()).toBe(1)
    const directoryReads = sdk.list.mock.calls.length
    expect(await backend.action(api.capabilityQuotes.quote, args)).toMatchObject({ kind: 'refused', code: 'inspection_unavailable', reason: 'source_write_nonce_replayed' })
    // Consume-then-act: the replay is refused before resolve reads the directory again.
    expect(sdk.list.mock.calls.length).toBe(directoryReads)
    expect(await backend.run(ctx => ctx.db.query('capabilityQuotes').collect())).toEqual([])
    expect(await backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
  })
})
