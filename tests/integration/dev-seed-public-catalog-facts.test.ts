import { convexTest, type TestConvex } from 'convex-test'
import { makeFunctionReference, type UserIdentity } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules, convexTestWithMarketComponents } from '../helpers/convex-fixtures'
import { DEV_SEED_BUSINESS_COUNT, DEV_SEED_BUSINESS_FIXTURES } from '../../src/modules/dev/public'
import { eligibleSupplyPorts } from '../../convex/capabilitySupplyEligiblePorts'
import { listRouteableCapabilitySupply } from '../../src/modules/capability-supply/public'
import {
  DEV_SEED_CATALOG_ACCOUNT_REF,
  DEV_SEED_CATALOG_PRINCIPAL_REF,
} from '../../convex/catalogOfferingMutations'
import { AGENT_ACCESS_DEFAULT_APPLICATION_REF } from '../../src/modules/agent-access/agent-access'
import { MARKET_TOOLS_CALL_SCOPE, agentAuthorityScopeForMode } from '../../src/modules/agent-access/contract'
import { issuedAgentGrantRef } from '../../src/modules/agent-access/issued-agent-binding'
import { buildAgentAccessPolicy } from '../../src/modules/agent-access/policy'
import {
  createCustomerRequestServiceAssertion,
  toStableHashValue,
} from '../../src/modules/agent-access/service-auth-envelope'
import { withSourceWrite } from '../helpers/source-write-admission'
import { observeCapabilityReadinessHandler } from '../../convex/capabilitySupplyProbes'

type SeedBackend = TestConvex<typeof schema>

type CatalogOffering = {
  availabilitySummary?: string
  pricingSummary?: string
  accessPaths: readonly { kind: string; channel?: string }[]
}

type CatalogPage = {
  page: readonly {
    slug: string
    publishedPhone?: string
    offerings: readonly CatalogOffering[]
  }[]
  isDone: boolean
  continueCursor: string
}

const SANDBOX_TOOL_BUSINESS_SLUG = 'sandbox-aecon-reference'
const SANDBOX_TOOL_CAPABILITY_ID = 'sandbox.aecon-reference'
const SANDBOX_TOOL_BINDING_ID = `capability-binding:${SANDBOX_TOOL_BUSINESS_SLUG}:x402:v1`
const SANDBOX_TOOL_EVIDENCE_REF = `private:evidence:dev-seed:${SANDBOX_TOOL_BUSINESS_SLUG}`
const SANDBOX_TESTNET_BUSINESS_SLUG = 'sandbox-aecon-testnet'
const SANDBOX_TESTNET_CAPABILITY_ID = 'sandbox.aecon-testnet-reference'
const SANDBOX_TESTNET_OFFERING_ID = `capability-offering:${SANDBOX_TESTNET_BUSINESS_SLUG}:v1`
const SANDBOX_TESTNET_EVIDENCE_REF = `private:evidence:dev-seed:${SANDBOX_TESTNET_BUSINESS_SLUG}`
// The two facts tools/release/package5-reference-provider itself requires. The
// seed reads them under the provider's own env names, so the test supplies them
// the same way a keyed deployment does.
const FIXTURE_ORIGIN_ENV = 'AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN'
const FIXTURE_PAY_TO_ENV = 'AE_PACKAGE5_FIXTURE_X402_PAY_TO'
const FIXTURE_ORIGIN = 'https://package5-reference-provider.example'
const FIXTURE_ENDPOINT_URL = `${FIXTURE_ORIGIN}/x402/execute`
const FIXTURE_PAY_TO = '0x209693Bc6afc0C5328bA36FaF03C514EF312287C'
const SKIPPED_WITHOUT_FIXTURE_URL = {
  capabilityId: SANDBOX_TESTNET_CAPABILITY_ID,
  skipped: 'AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN_missing',
} as const
// The reference Tool's own endpoint is derived from this deployment's public
// origin (AE_SITE_URL), never a hard-coded host. Without it the reference
// entry is skipped rather than published against a guessed URL.
const SITE_URL_ENV = 'AE_SITE_URL'
const SITE_URL = 'https://sandbox.example.test'
const SANDBOX_REFERENCE_ENDPOINT_URL = `${SITE_URL}/api/v1/sandbox-reference`
const SKIPPED_WITHOUT_SITE_URL = {
  capabilityId: SANDBOX_TOOL_CAPABILITY_ID,
  skipped: 'AE_SITE_URL_missing',
} as const

type SandboxSupplyFacts = {
  sandboxBusinessSlugs: readonly string[]
  publications: readonly {
    publicationRef: string
    runtimeEnvironment: string
    searchText: string | undefined
  }[]
  legacySandboxBindings: readonly string[]
  legacySandboxPublications: readonly string[]
}

type CatalogRow = {
  slug: string
  availabilitySummary: string | null
  pricingSummary: string | null
  publishedPhone: string | null
  phonePaths: number
}


/**
 * The Offering API's whole claim over v1 is that it can carry price and
 * availability. A catalog where every business publishes neither proves the
 * projection compiles and nothing else, and a catalog where every business
 * publishes a placeholder actively lies. This asserts the seeded supply
 * demonstrates all four states through the real public read.
 */
describe('dev-seeded public catalog decision facts', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not scan or mutate unrelated supplier businesses during catalog bootstrap', async () => {
    const backend = convexTest(schema, modules)
    await seedDevCatalogAuthority(backend)
    const foreignBusinessId = await backend.run(async (ctx) => ctx.db.insert('businesses', {
      owningAccountRef: 'acc_foreign_supplier',
      slug: 'foreign-unpublished-supplier',
      name: 'Foreign Unpublished Provider',
      normalizedName: 'foreign unpublished supplier',
      category: 'External service',
      businessContext: {
        kind: 'programmable_provider',
        website: 'https://supplier.example/',
        providerIdentifier: 'foreign-unpublished-supplier',
      },
      publicStatus: 'unpublished',
      trustTier: 'claimed',
      sourceHash: 'sha256:foreign-unpublished-supplier',
      createdAt: 1,
      updatedAt: 1,
    }))

    await expect(backend.mutation(internal.devSeed.seedDevCatalog, {})).resolves.toMatchObject({
      kind: 'seeded',
      seededSlugs: [],
    })
    await expect(backend.run(async (ctx) => ctx.db.get(foreignBusinessId))).resolves.toMatchObject({
      owningAccountRef: 'acc_foreign_supplier',
      publicStatus: 'unpublished',
      updatedAt: 1,
    })
  })

  it('publishes a catalog without retired seed rows', async () => {
    const backend = convexTest(schema, modules)
    await seedDevCatalogAuthority(backend)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await runOfferingCutover(backend)

    const rows = await readEveryCatalogRow(backend)
    const canonicalSlugs = DEV_SEED_BUSINESS_FIXTURES
      .map(({ requestedSlug }) => requestedSlug)
      .sort()
    expect(canonicalSlugs).toHaveLength(DEV_SEED_BUSINESS_COUNT)
    expect(rows.map((row) => row.slug).sort()).toEqual(canonicalSlugs)
    expect(rows).toEqual([])
  })

  it('has no retired seed rows to republish after eviction', async () => {
    const backend = convexTest(schema, modules)
    await seedDevCatalogAuthority(backend)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await runOfferingCutover(backend)
    expect(await readEveryCatalogRow(backend)).toEqual([])
  })
  /**
   * Without the reference provider's env there is nowhere to send a paid Call,
   * so the second Tool is skipped rather than published against a guessed URL,
   * and the first Tool is seeded exactly as it always was.
   */
  it('publishes only the fixture sandbox Tool when the reference provider env is absent', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDevCatalogAuthority(backend)
    setSiteUrlEnvironment()
    clearReferenceProviderEnvironment()

    const first = await backend.mutation(internal.devSeed.publishSandboxTool, {})
    expect(first).toMatchObject({ created: true, businessSlug: SANDBOX_TOOL_BUSINESS_SLUG })
    expect(first.toolRef).toMatch(/^operation:v1:/u)
    expect(first.tools).toEqual([
      { capabilityId: SANDBOX_TOOL_CAPABILITY_ID, toolRef: first.toolRef, created: true },
      SKIPPED_WITHOUT_FIXTURE_URL,
    ])

    const seeded = await readSandboxSupply(backend)
    expect(seeded.sandboxBusinessSlugs).toEqual([SANDBOX_TOOL_BUSINESS_SLUG])
    expect(seeded.publications).toHaveLength(1)
    const [publication] = seeded.publications
    expect(publication?.publicationRef).toBe(first.publicationId)
    expect(publication?.runtimeEnvironment).toBe('sandbox')
    expect(publication?.searchText ?? '').not.toBe('')
    expect((publication?.searchText ?? '').toLowerCase()).toContain('sandbox')
    expect(seeded.legacySandboxBindings).toEqual([])
    expect(seeded.legacySandboxPublications).toEqual([])

    const replay = await backend.mutation(internal.devSeed.publishSandboxTool, {})
    expect(replay).toEqual({
      created: false,
      publicationId: first.publicationId,
      publicationRevision: first.publicationRevision,
      toolRef: first.toolRef,
      businessSlug: SANDBOX_TOOL_BUSINESS_SLUG,
      tools: [
        { capabilityId: SANDBOX_TOOL_CAPABILITY_ID, toolRef: first.toolRef, created: false },
        SKIPPED_WITHOUT_FIXTURE_URL,
      ],
    })
    expect(await readSandboxSupply(backend)).toEqual(seeded)

    const routeable = await backend.run(async (ctx) => (
      listRouteableCapabilitySupply(eligibleSupplyPorts(ctx.db), {
        networkId: 'ae:public',
        limit: 64,
        now: Date.now(),
      })
    ))
    expect(routeable.kind).toBe('available')
    if (routeable.kind === 'available') {
      expect(routeable.supplies.some(({ binding }) => binding.endpointUrl.includes('/api/sandbox/'))).toBe(false)
    }
  }, 300_000)

  /**
   * A Tool nobody can price and nobody can find is not seeded supply. The
   * business page reads the catalog Offering's own `price`, and
   * `/api/businesses/search` reads `registrySearchDocuments`: neither is
   * written by the capability-supply publish command, so both have to be
   * facts `publishSandboxTool` itself guarantees, on every run.
   */
  it('seeds the sandbox Tool with one price fact and a findable search document', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDevCatalogAuthority(backend)
    setSiteUrlEnvironment()
    clearReferenceProviderEnvironment()

    await backend.mutation(internal.devSeed.publishSandboxTool, {})
    const seeded = await readSandboxPriceFacts(backend)

    // One AUD 1.00: the publication price `/tools/<ref>` and `ae describe`
    // read, and the catalog price twin the business page reads.
    expect(seeded.publicationPrice).toEqual({ currency: 'AUD', units: '1000000', exponent: 6 })
    expect(seeded.revisionPrice).toEqual({
      kind: 'fixed',
      amount: seeded.publicationPrice,
      unit: 'call',
      taxTreatment: 'unstated',
    })

    const detail = await readSandboxCatalogDetail(backend)
    expect(detail.price).toEqual(seeded.revisionPrice)
    expect(detail.pricingSummary).toBe('AUD 1.00 per Call (sandbox)')

    expect(await readCapabilityBindingEndpointUrl(backend, SANDBOX_TOOL_BINDING_ID))
      .toBe(SANDBOX_REFERENCE_ENDPOINT_URL)

    expect(await searchSandboxSlugs(backend, 'sandbox')).toEqual([SANDBOX_TOOL_BUSINESS_SLUG])
    expect(await searchSandboxSlugs(backend, 'AEcon sandbox reference provider'))
      .toEqual([SANDBOX_TOOL_BUSINESS_SLUG])

    const documents = await readSandboxSearchDocumentIds(backend)
    expect(documents).toHaveLength(1)

    // A second boot re-asserts both facts without minting a second Offering
    // revision, search document or publication.
    const replay = await backend.mutation(internal.devSeed.publishSandboxTool, {})
    expect(replay.created).toBe(false)
    expect(await readSandboxPriceFacts(backend)).toEqual(seeded)
    expect(await readSandboxCatalogDetail(backend)).toEqual(detail)
    expect(await readSandboxSearchDocumentIds(backend)).toEqual(documents)
    expect(await searchSandboxSlugs(backend, 'sandbox')).toEqual([SANDBOX_TOOL_BUSINESS_SLUG])
    expect(await searchSandboxSlugs(backend, 'AEcon sandbox reference provider'))
      .toEqual([SANDBOX_TOOL_BUSINESS_SLUG])
  }, 300_000)

  /**
   * `AE_SITE_URL` is this deployment's own public origin - there is no host to
   * guess it from. Without it the reference Tool is skipped, exactly like the
   * Base Sepolia Tool is skipped without the reference provider's own env.
   */
  it('publishes neither business when AE_SITE_URL is unset', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDevCatalogAuthority(backend)
    clearSiteUrlEnvironment()
    clearReferenceProviderEnvironment()

    const published = await backend.mutation(internal.devSeed.publishSandboxTool, {})
    expect(published.tools).toEqual([SKIPPED_WITHOUT_SITE_URL, SKIPPED_WITHOUT_FIXTURE_URL])
    expect((await readSandboxSupply(backend)).sandboxBusinessSlugs).toEqual([])
  }, 300_000)
})

function clearReferenceProviderEnvironment(): void {
  vi.stubEnv(FIXTURE_ORIGIN_ENV, '')
  vi.stubEnv(FIXTURE_PAY_TO_ENV, '')
}

function setReferenceProviderEnvironment(): void {
  vi.stubEnv(FIXTURE_ORIGIN_ENV, FIXTURE_ORIGIN)
  vi.stubEnv(FIXTURE_PAY_TO_ENV, FIXTURE_PAY_TO)
}

function setSiteUrlEnvironment(): void {
  vi.stubEnv(SITE_URL_ENV, SITE_URL)
}

function clearSiteUrlEnvironment(): void {
  vi.stubEnv(SITE_URL_ENV, '')
}

/**
 * Records the readiness fact the hourly `refresh capability supply readiness`
 * workload would have written, for one seeded sandbox Tool's own binding.
 * `publishSandboxTool` never writes readiness itself, so any assertion that
 * depends on a Tool being routeable/Quoteable has to establish that fact.
 */
async function recordSandboxToolReadiness(
  backend: SeedBackend,
  target: Readonly<{
    publicationRef: string
    publicationRevision: number
    businessSlug: string
    evidenceRef: string
  }>,
): Promise<void> {
  const observed = await backend.run(async (ctx) => (
    // simulates the hourly readiness probe; the seed itself never writes readiness
    observeCapabilityReadinessHandler(ctx, {
      publicationRef: target.publicationRef,
      expectedRevision: target.publicationRevision,
      credentialState: 'ready',
      healthState: 'healthy',
      validUntil: Date.now() + 60 * 60 * 1000,
      operationKey: `test:sandbox-tool-readiness:${target.businessSlug}:${target.publicationRevision}`,
      correlationId: `test:sandbox-tool:${target.businessSlug}`,
      reasonCode: 'dev_seed_sandbox_tool_readiness',
      evidenceRefs: [target.evidenceRef],
    })
  ))
  if (observed.kind === 'refused') {
    throw new Error(`test_sandbox_tool_readiness_refused:${observed.reason}`)
  }
}

async function readCapabilityBindingEndpointUrl(backend: SeedBackend, bindingId: string): Promise<string> {
  return await backend.run(async (ctx) => {
    const binding = await ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', bindingId))
      .unique()
    if (binding === null) throw new Error(`binding missing: ${bindingId}`)
    return binding.endpointUrl
  })
}

/**
 * The paid leg of Well 1 needs supply that can actually settle. The fixture
 * Tool cannot: its endpoint resolves nowhere. This proves the seed publishes a
 * second, real Base Sepolia x402 Tool beside it whenever the deployment carries
 * the reference provider's own env - both discoverable, both priced, each under
 * its own business - and that a reboot re-asserts both without minting a thing.
 */
describe('dev-seeded Base Sepolia reference Tool', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('publishes exactly the two named sandbox Tools and replays the second run', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDevCatalogAuthority(backend)
    setSiteUrlEnvironment()
    setReferenceProviderEnvironment()

    const first = await backend.mutation(internal.devSeed.publishSandboxTool, {})
    expect(first).toMatchObject({ created: true, businessSlug: SANDBOX_TOOL_BUSINESS_SLUG })
    expect(first.tools).toEqual([
      { capabilityId: SANDBOX_TOOL_CAPABILITY_ID, toolRef: first.toolRef, created: true },
      {
        capabilityId: SANDBOX_TESTNET_CAPABILITY_ID,
        toolRef: expect.stringMatching(/^operation:v1:/u) as unknown as string,
        created: true,
      },
    ])

    const seeded = await readSandboxSupply(backend)
    expect(seeded.sandboxBusinessSlugs)
      .toEqual([SANDBOX_TOOL_BUSINESS_SLUG, SANDBOX_TESTNET_BUSINESS_SLUG].sort())
    expect(seeded.publications).toHaveLength(2)
    for (const publication of seeded.publications) {
      expect(publication.runtimeEnvironment).toBe('sandbox')
      expect((publication.searchText ?? '').toLowerCase()).toContain('sandbox')
    }
    expect(seeded.legacySandboxBindings).toEqual([])
    expect(seeded.legacySandboxPublications).toEqual([])

    // The Base Sepolia leg is bound to the provider's own terms: its endpoint
    // comes from the env, and its price is the 1000 atomic USDC the reference
    // provider charges - the same number on the publication and the catalog.
    const testnet = await readTestnetBinding(backend)
    expect(testnet).toEqual({
      endpointUrl: FIXTURE_ENDPOINT_URL,
      adapterId: 'x402-fetch:v2',
      network: 'eip155:84532',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo: FIXTURE_PAY_TO,
      amount: '1000',
    })
    // Managed x402 publishes `on_request`: the buyer total is a binding Quote,
    // and the provider's own 1000 atomic USDC is the pricing config's source
    // requirement. The catalog twin carries the same provider amount.
    expect(await readSandboxPriceFacts(backend, SANDBOX_TESTNET_BUSINESS_SLUG)).toMatchObject({
      publicationPrice: { kind: 'on_request' },
      revisionPrice: {
        kind: 'fixed',
        amount: { currency: 'USDC', units: '1000', exponent: 6 },
        unit: 'call',
        taxTreatment: 'unstated',
      },
    })
    expect(await readTestnetPricingConfig(backend)).toEqual({
      version: 'pricing:v3',
      kind: 'managed_x402',
      effectTiming: 'payment_required_before_effect',
      sourceRequirement: {
        network: 'eip155:84532',
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        atomicUnits: '1000',
      },
      pricingPolicyRef: 'pricing-policy:managed-x402-reference:v1',
      publicDisplay: 'on_request',
    })

    // Both Tools are findable through the same public read a buyer uses.
    expect([...await searchSandboxSlugs(backend, 'sandbox')].sort())
      .toEqual([SANDBOX_TOOL_BUSINESS_SLUG, SANDBOX_TESTNET_BUSINESS_SLUG].sort())
    expect(await searchSandboxSlugs(backend, 'AEcon sandbox testnet reference provider'))
      .toContain(SANDBOX_TESTNET_BUSINESS_SLUG)
    expect(await readSandboxSearchDocumentIds(backend, SANDBOX_TESTNET_BUSINESS_SLUG))
      .toHaveLength(1)

    // The whole point of the second Tool: it is routeable, so a Call can reach
    // the real Base Sepolia endpoint. Provider-connection authority, binding
    // admission and readiness all have to hold for it to appear here. The
    // hourly probe is the only writer of that readiness fact in production, so
    // the test records it here for the testnet Tool's own binding.
    await recordSandboxToolReadiness(backend, {
      publicationRef: SANDBOX_TESTNET_OFFERING_ID,
      publicationRevision: 1,
      businessSlug: SANDBOX_TESTNET_BUSINESS_SLUG,
      evidenceRef: SANDBOX_TESTNET_EVIDENCE_REF,
    })
    const routeable = await backend.run(async (ctx) => (
      listRouteableCapabilitySupply(eligibleSupplyPorts(ctx.db), {
        networkId: 'ae:public',
        limit: 64,
        now: Date.now(),
      })
    ))
    expect(routeable.kind).toBe('available')
    if (routeable.kind === 'available') {
      expect(routeable.supplies.map(({ binding }) => binding.endpointUrl))
        .toContain(FIXTURE_ENDPOINT_URL)
    }

    const replay = await backend.mutation(internal.devSeed.publishSandboxTool, {})
    const testnetEntry = first.tools[1]
    if (!testnetEntry || !('toolRef' in testnetEntry)) throw new Error('expected a created testnet tool entry')
    expect(replay).toEqual({
      created: false,
      publicationId: first.publicationId,
      publicationRevision: first.publicationRevision,
      toolRef: first.toolRef,
      businessSlug: SANDBOX_TOOL_BUSINESS_SLUG,
      tools: [
        { capabilityId: SANDBOX_TOOL_CAPABILITY_ID, toolRef: first.toolRef, created: false },
        {
          capabilityId: SANDBOX_TESTNET_CAPABILITY_ID,
          toolRef: testnetEntry.toolRef,
          created: false,
        },
      ],
    })
    expect(await readSandboxSupply(backend)).toEqual(seeded)
    expect(await readTestnetBinding(backend)).toEqual(testnet)
  }, 300_000)

  it('keeps seeding the fixture Tool when only the payee env is missing', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDevCatalogAuthority(backend)
    setSiteUrlEnvironment()
    vi.stubEnv(FIXTURE_ORIGIN_ENV, FIXTURE_ORIGIN)
    vi.stubEnv(FIXTURE_PAY_TO_ENV, '')

    const published = await backend.mutation(internal.devSeed.publishSandboxTool, {})
    expect(published.tools).toEqual([
      { capabilityId: SANDBOX_TOOL_CAPABILITY_ID, toolRef: published.toolRef, created: true },
      {
        capabilityId: SANDBOX_TESTNET_CAPABILITY_ID,
        skipped: 'AE_PACKAGE5_FIXTURE_X402_PAY_TO_missing',
      },
    ])
    expect((await readSandboxSupply(backend)).sandboxBusinessSlugs)
      .toEqual([SANDBOX_TOOL_BUSINESS_SLUG])
  }, 300_000)
})

async function readTestnetPricingConfig(backend: SeedBackend): Promise<unknown> {
  return await backend.run(async (ctx) => {
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => query
        .eq('publicationRef', `capability-offering:${SANDBOX_TESTNET_BUSINESS_SLUG}:v1`)
        .eq('revision', 1))
      .unique()
    if (publication === null) throw new Error('testnet publication missing')
    return JSON.parse(publication.pricingConfigJson ?? 'null') as unknown
  })
}

async function readTestnetBinding(backend: SeedBackend): Promise<{
  endpointUrl: string
  adapterId: string
  network: unknown
  asset: unknown
  payTo: unknown
  amount: unknown
}> {
  return await backend.run(async (ctx) => {
    const binding = await ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query
        .eq('bindingId', `capability-binding:${SANDBOX_TESTNET_BUSINESS_SLUG}:x402:v1`))
      .unique()
    if (binding === null) throw new Error('testnet binding missing')
    const config = JSON.parse(binding.configJson) as Record<string, unknown>
    const paymentRequired = JSON.parse(String(config.paymentRequiredJson)) as {
      accepts: readonly Record<string, unknown>[]
    }
    return {
      endpointUrl: binding.endpointUrl,
      adapterId: binding.adapterId,
      network: config.network,
      asset: config.asset,
      payTo: config.payTo,
      amount: paymentRequired.accepts[0]?.amount,
    }
  })
}

async function readSandboxPriceFacts(
  backend: SeedBackend,
  slug: string = SANDBOX_TOOL_BUSINESS_SLUG,
): Promise<{
  publicationPrice: unknown
  revisionPrice: unknown
  revisionCount: number
}> {
  return await backend.run(async (ctx) => {
    const business = await ctx.db.query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', slug))
      .unique()
    if (business === null) throw new Error('sandbox business missing')
    const offering = await ctx.db.query('businessOfferings')
      .withIndex('by_businessId_and_status', (query) => query.eq('businessId', business._id))
      .unique()
    if (offering === null) throw new Error('sandbox offering missing')
    const revisions = await ctx.db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => query.eq('offeringRef', offering.offeringRef))
      .collect()
    const current = revisions.find(({ revision }) => revision === offering.currentRevision)
    const supply = await ctx.db.query('capabilityOfferings')
      .withIndex('by_businessId_and_status', (query) => query.eq('businessId', business._id).eq('status', 'active'))
      .unique()
    if (supply === null) throw new Error('sandbox capability offering missing')
    const publicationPrice = supply.presentation.price
    return {
      publicationPrice: publicationPrice.kind === 'fixed' ? publicationPrice.amount : publicationPrice,
      revisionPrice: current?.price,
      revisionCount: revisions.length,
    }
  })
}

async function readSandboxCatalogDetail(
  backend: SeedBackend,
  slug: string = SANDBOX_TOOL_BUSINESS_SLUG,
): Promise<{
  price: unknown
  pricingSummary: string | undefined
}> {
  const result = await backend.query(api.catalog.getPublicBusinessCatalogBySlug, { slug })
  if (result.kind !== 'available') throw new Error(`sandbox catalog unavailable: ${result.kind}`)
  const offering = result.catalog.offerings[0]
  return { price: offering?.price, pricingSummary: offering?.pricingSummary }
}

async function searchSandboxSlugs(backend: SeedBackend, query: string): Promise<readonly string[]> {
  const page = await backend.query(api.registry.searchPublicBusinessOfferingSupply, { query })
  return page.items.map(({ slug }) => slug)
}

async function readSandboxSearchDocumentIds(
  backend: SeedBackend,
  slug: string = SANDBOX_TOOL_BUSINESS_SLUG,
): Promise<readonly string[]> {
  return await backend.run(async (ctx) => (await ctx.db.query('registrySearchDocuments')
    .withIndex('by_business', (query) => query.eq('businessSlug', slug))
    .collect())
    .map(({ documentId }) => documentId)
    .sort())
}

async function readSandboxSupply(backend: SeedBackend): Promise<SandboxSupplyFacts> {
  return await backend.run(async (ctx) => {
    const [businesses, bindings, publications] = await Promise.all([
      ctx.db.query('businesses').collect(),
      ctx.db.query('capabilityTransportBindings').collect(),
      ctx.db.query('capabilityPublications').collect(),
    ])
    return {
      sandboxBusinessSlugs: businesses
        .filter(({ slug }) => slug.startsWith('sandbox-'))
        .map(({ slug }) => slug)
        .sort(),
      publications: publications
        .filter(({ runtimeEnvironment }) => runtimeEnvironment === 'sandbox')
        .map(({ publicationRef, runtimeEnvironment, searchText }) => ({
          publicationRef,
          runtimeEnvironment,
          searchText,
        }))
        .sort((left, right) => left.publicationRef.localeCompare(right.publicationRef)),
      legacySandboxBindings: bindings
        .filter(({ capabilityId, endpointUrl }) => (
          capabilityId === 'sandbox.checkup_quote' || endpointUrl.includes('/api/sandbox/')
        ))
        .map(({ bindingId }) => bindingId)
        .sort(),
      legacySandboxPublications: publications
        .filter(({ capabilityId, sourceDescriptorJson }) => (
          capabilityId === 'sandbox.checkup_quote' || sourceDescriptorJson?.includes('/api/sandbox/') === true
        ))
        .map(({ publicationRef }) => publicationRef)
        .sort(),
    }
  })
}

async function runOfferingCutover(backend: SeedBackend): Promise<void> {
  let cursor: string | null = null
  for (let page = 0; page < 40; page += 1) {
    const step: { errors: readonly string[]; done: boolean; nextCursor: string | null } =
      await backend.mutation(internal.devSeed.seedOfferingSupply, { cursor })
    expect(step.errors).toEqual([])
    if (step.done) return
    cursor = step.nextCursor
  }
  throw new Error('dev seed offering cutover did not finish')
}

async function readEveryCatalogRow(backend: SeedBackend): Promise<readonly CatalogRow[]> {
  const rows: CatalogRow[] = []
  let cursor: string | null = null
  for (let page = 0; page < 20; page += 1) {
    const result: CatalogPage = await backend.query(api.registry.listPublicBusinessOfferingSupply, {
      paginationOpts: { cursor, numItems: 50 },
    })
    for (const item of result.page) {
      rows.push({
        slug: item.slug,
        availabilitySummary: item.offerings[0]?.availabilitySummary ?? null,
        pricingSummary: item.offerings[0]?.pricingSummary ?? null,
        publishedPhone: item.publishedPhone ?? null,
        phonePaths: item.offerings.reduce(
          (count, offering) => count + offering.accessPaths.filter((path) => path.kind === 'human_request' && path.channel === 'phone').length,
          0,
        ),
      })
    }
    if (result.isDone) return rows
    cursor = result.continueCursor
  }
  throw new Error('dev seed catalog paging did not finish')
}

async function seedDevCatalogAuthority(backend: SeedBackend): Promise<void> {
  await backend.run(async (ctx) => {
    const ownershipRef = 'own_d2000000000000000000000000000001'
    await ctx.db.insert('principals', {
      principalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      kind: 'workload',
      displayName: 'Agentic Economy development catalog seed workload',
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('accounts', {
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      displayName: 'Agentic Economy development catalog seed account',
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      creationIdempotencyRef: 'dev-seed-account:create',
      initialOwnershipRef: ownershipRef,
      currentOwnershipRef: ownershipRef,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      lastAction: {
        actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
        activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        correlationRef: 'dev-seed-account:create',
        idempotencyRef: 'dev-seed-account:create',
      },
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef,
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      ownerPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
        activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        correlationRef: 'dev-seed-ownership:create',
        idempotencyRef: 'dev-seed-ownership:create',
      },
    })
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef: 'grt_d2000000000000000000000000000001',
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      subjectPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      scopes: ['catalog:dev_seed'],
      resourceRefs: ['catalog:dev-seed'],
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt: Date.now() + 300_000,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
        activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        correlationRef: 'dev-seed-grant:create',
        idempotencyRef: 'dev-seed-grant:create',
      },
    })
  })
}


/**
 * The dev seed's whole reason to exist is that a fresh local deployment can be
 * Quoted. Publishing the sandbox Tool proves the supply side only: this proves
 * the authority side end to end, through the exact seams `npm run dev:local`
 * and `ae connect` use in local Clerk-bypass mode.
 */
const LOCAL_E2E_OPERATOR_SUBJECT = 'dev-seed-owner-session'
// Mirrors the admin-auth identity src/lib/server/convex-source.ts installs when
// VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E is on.
const bypassOwnerIdentity: UserIdentity = {
  subject: LOCAL_E2E_OPERATOR_SUBJECT,
  issuer: 'https://convex.test',
  tokenIdentifier: `https://convex.test|${LOCAL_E2E_OPERATOR_SUBJECT}`,
  name: 'Dev Seed Owner',
}
const REGISTER_ISSUED_BINDING_OPERATION = 'agentAccessPrincipals.registerIssuedAgentBindingForServer'
const SERVICE_FUNCTION_KEY = 'dev-seed-quote-server-function-key-32-bytes'
const registerIssuedAgentBindingForServer = makeFunctionReference<
  'mutation',
  Record<string, unknown>,
  Readonly<{ kind: string }>
>('agentAccessPrincipals:registerIssuedAgentBindingForServer')

describe('dev-seeded sandbox Tool Quote admission', () => {
  const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN

  beforeEach(() => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_FUNCTION_KEY
  })

  afterEach(() => {
    if (previousServiceKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServiceKey
    vi.unstubAllEnvs()
  })

  it('admits a Quote inspection for the seeded Tool after the bypass connect flow', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDevCatalogAuthority(backend)
    setSiteUrlEnvironment()

    const published = await backend.mutation(internal.devSeed.publishSandboxTool, {})
    const seeded = await backend.mutation(internal.devSeed.seedSandboxSpendingPolicy, {})
    expect(seeded.created).toBe(true)

    // simulates the hourly readiness probe; the seed itself never writes readiness
    await recordSandboxToolReadiness(backend, {
      publicationRef: published.publicationId,
      publicationRevision: published.publicationRevision,
      businessSlug: SANDBOX_TOOL_BUSINESS_SLUG,
      evidenceRef: SANDBOX_TOOL_EVIDENCE_REF,
    })

    const agent = await runBypassConnect(backend, 'ak_local_e2e_28f0c1d4e5a6')
    // `ae connect` owns the agent identity: it must land under the same owner
    // account the seed provisioned, not a second one.
    expect(agent.ownerId).toBe(seeded.accountRef)
    expect(agent.principalId).toMatch(/^prn_[0-9a-f]{32}$/u)

    await expect(prepareQuoteSubjects(backend, agent, published.toolRef))
      .resolves.toMatchObject({
        kind: 'prepared',
        accountRef: seeded.accountRef,
        principalRef: agent.principalId,
        legalCustomerRef: seeded.legalCustomerRef,
      })
  }, 300_000)

  it('does not write readiness observations', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDevCatalogAuthority(backend)
    setSiteUrlEnvironment()

    const published = await backend.mutation(internal.devSeed.publishSandboxTool, {})

    const readReadiness = () => backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => query
          .eq('publicationRef', published.publicationId)
          .eq('revision', published.publicationRevision))
        .unique()
      if (publication === null) throw new Error('seeded publication missing')
      return {
        credentialState: publication.credentialState,
        healthState: publication.healthState,
        readinessObservedAt: publication.readinessObservedAt,
        readinessValidUntil: publication.readinessValidUntil,
      }
    })

    // Nothing in `publishSandboxTool` writes readiness - not on the run that
    // creates the publication, and not on a rebooted deployment's replay.
    const unobserved = {
      credentialState: 'unobserved',
      healthState: 'unobserved',
      readinessObservedAt: undefined,
      readinessValidUntil: undefined,
    }
    expect(await readReadiness()).toEqual(unobserved)
    const rebooted = await backend.mutation(internal.devSeed.publishSandboxTool, {})
    expect(rebooted.created).toBe(false)
    expect(await readReadiness()).toEqual(unobserved)

    // simulates the hourly readiness probe; the seed itself never writes readiness
    await recordSandboxToolReadiness(backend, {
      publicationRef: published.publicationId,
      publicationRevision: published.publicationRevision,
      businessSlug: SANDBOX_TOOL_BUSINESS_SLUG,
      evidenceRef: SANDBOX_TOOL_EVIDENCE_REF,
    })
    const afterRecording = await readReadiness()
    expect(afterRecording.credentialState).toBe('ready')
    expect(afterRecording.healthState).toBe('healthy')
    expect(afterRecording.readinessObservedAt).toEqual(expect.any(Number) as unknown as number)
    expect(afterRecording.readinessValidUntil).toBeGreaterThan(Date.now())
  }, 300_000)
})

type ConnectedAgent = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  scopes: readonly string[]
  authorityMode: 'read_only' | 'approval_required' | 'spending_policy' | 'unrestricted_test_only'
}>

/**
 * Drive the local Clerk-bypass `ae connect` server flow: arm the interactive
 * owner authority the way `createAuthenticatedConvexClient` does, then register
 * the issued agent binding through the same mutation
 * `src/modules/agent-access/agent-access.functions.ts` calls. That single
 * mutation writes the canonical agent Principal, Membership, api-key binding,
 * Credential, delegation root grant and Agent access grant.
 */
async function runBypassConnect(backend: SeedBackend, credentialId: string): Promise<ConnectedAgent> {
  const owner = backend.withIdentity(bypassOwnerIdentity)
  await expect(owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}))
    .resolves.toBe(true)

  const now = Date.now()
  const issuanceKey = `oauth-local-e2e-${credentialId.slice(-12)}`
  const amount = (units: string) => ({ currency: 'AUD' as const, units, exponent: 6 as const })
  const command = {
    issuanceKey,
    grantRef: issuedAgentGrantRef(LOCAL_E2E_OPERATOR_SUBJECT, issuanceKey),
    credentialId,
    displayName: 'AEcon local CLI',
    applicationRef: AGENT_ACCESS_DEFAULT_APPLICATION_REF,
    environment: 'sandbox' as const,
    scopes: [agentAuthorityScopeForMode('spending_policy'), MARKET_TOOLS_CALL_SCOPE],
    authorityMode: 'spending_policy' as const,
    toolAccess: 'all_admitted' as const,
    toolRefs: [] as readonly string[],
    spendingPolicy: buildAgentAccessPolicy({
      environment: 'sandbox',
      currency: 'AUD',
      exponent: 6,
      maximumSpendPerCall: amount('1000000'),
      maximumDailySpend: amount('5000000'),
      maximumMonthlySpend: amount('5000000'),
    }),
    createdAt: now,
    expiresAt: now + 3_600_000,
  }
  const serviceAuth = await createCustomerRequestServiceAssertion({
    key: SERVICE_FUNCTION_KEY,
    operation: REGISTER_ISSUED_BINDING_OPERATION,
    command: toStableHashValue({ ...command, scopes: [...command.scopes], toolRefs: [...command.toolRefs] }),
    principal: {
      principalId: 'ae:server-function',
      ownerId: 'ae:server-function',
      credentialId: 'ae:server-function',
      scopes: [MARKET_TOOLS_CALL_SCOPE],
    },
    issuedAt: now,
  })
  const registered = await owner.mutation(registerIssuedAgentBindingForServer, { ...command, serviceAuth })
  expect(registered.kind).toBe('recorded')

  const stored = await backend.run(async (ctx) => ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (query) => query.eq('credentialId', credentialId))
    .unique())
  if (stored === null) throw new Error('connected agent principal missing')
  return {
    principalId: stored.principalId,
    ownerId: stored.ownerId,
    credentialId: stored.credentialId,
    applicationRef: stored.applicationRef,
    environment: stored.environment,
    scopes: [...stored.scopes],
    authorityMode: stored.authorityMode,
  }
}

/**
 * The Quote inspection `capabilityQuotes.quote` runs first, and the one that
 * refuses `grant_not_found` when agent authority cannot be resolved.
 */
async function prepareQuoteSubjects(
  backend: SeedBackend,
  agent: ConnectedAgent,
  toolRef: string,
): Promise<Readonly<{ kind: string; code?: string }>> {
  return await backend.mutation(
    internal.capabilityQuotes.prepareFinancialSubjects,
    await withSourceWrite('protected_action', {
      operationKey: `test:dev-seed-quote:${toolRef.slice(-12)}:${agent.credentialId}`,
      correlationId: `test:dev-seed-quote:${agent.credentialId}`,
      principal: { ...agent, scopes: [...agent.scopes] },
      toolRef,
      input: { request: 'ping' },
    }),
  )
}
