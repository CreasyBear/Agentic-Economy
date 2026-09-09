import { convexTest, type TestConvex } from 'convex-test'
import { makeFunctionReference, type UserIdentity } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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
  it('publishes exactly one sandbox Tool and replays the second run', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDevCatalogAuthority(backend)

    const first = await backend.mutation(internal.devSeed.publishSandboxTool, {})
    expect(first).toMatchObject({ created: true, businessSlug: SANDBOX_TOOL_BUSINESS_SLUG })
    expect(first.toolRef).toMatch(/^operation:v1:/u)

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
})

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
  })

  it('admits a Quote inspection for the seeded Tool after the bypass connect flow', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDevCatalogAuthority(backend)

    const published = await backend.mutation(internal.devSeed.publishSandboxTool, {})
    const seeded = await backend.mutation(internal.devSeed.seedSandboxSpendingPolicy, {})
    expect(seeded.created).toBe(true)

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

  it('re-asserts sandbox readiness on every publish so a rebooted deployment stays Quoteable', async () => {
    const backend = convexTestWithMarketComponents()
    await seedDevCatalogAuthority(backend)

    const published = await backend.mutation(internal.devSeed.publishSandboxTool, {})
    await backend.mutation(internal.devSeed.seedSandboxSpendingPolicy, {})
    const agent = await runBypassConnect(backend, 'ak_local_e2e_9b71a0c3fd12')

    // The scheduled probe cannot reach the fixture endpoint, so it can only
    // ever land `unavailable` over the seeded readiness fact, and the readiness
    // window is shorter than the gap between two local boots.
    await backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => query
          .eq('publicationRef', published.publicationId)
          .eq('revision', published.publicationRevision))
        .unique()
      if (publication === null) throw new Error('seeded publication missing')
      await ctx.db.patch(publication._id, {
        credentialState: 'unavailable',
        healthState: 'unhealthy',
        readinessValidUntil: Date.now() - 1,
      })
    })
    await expect(prepareQuoteSubjects(backend, agent, published.toolRef))
      .resolves.toMatchObject({ kind: 'refused' })

    const rebooted = await backend.mutation(internal.devSeed.publishSandboxTool, {})
    expect(rebooted.created).toBe(false)
    const readiness = await backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => query
          .eq('publicationRef', published.publicationId)
          .eq('revision', published.publicationRevision))
        .unique()
      return publication === null
        ? null
        : {
            credentialState: publication.credentialState,
            healthState: publication.healthState,
            future: (publication.readinessValidUntil ?? 0) > Date.now(),
          }
    })
    expect(readiness).toEqual({ credentialState: 'ready', healthState: 'healthy', future: true })

    await expect(prepareQuoteSubjects(backend, agent, published.toolRef))
      .resolves.toMatchObject({ kind: 'prepared' })
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
