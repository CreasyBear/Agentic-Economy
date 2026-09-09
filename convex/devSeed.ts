import { internalMutation, type MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import type { UserIdentity } from 'convex/server'

import {
  buildDevSeedCatalogState,
  DEV_SEED_BUSINESS_FIXTURES,
  type DevSeedBusinessFixture,
} from '../src/modules/dev/public'
import { publishCapabilityForSeed } from './capabilitySupplyPublish'
import { observeCapabilityReadinessHandler } from './capabilitySupplyProbes'
import { ensureOwnerIdentityForAuthenticatedIdentity } from './interactiveAuthority'
import { resolveAndBindLegalCustomer } from './lib/moneyLegalCustomer'
import { persistDevSeedCatalogState } from './devSeedStore'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  MAX_ACCESS_PATHS_PER_OFFERING,
  type OfferingPrice,
} from '@/modules/catalog/public'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  readCatalogDescriptor,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './catalog'
import {
  admitDevSeedCatalogAuthority,
  DEV_SEED_CATALOG_ACCOUNT_NAME,
  DEV_SEED_CATALOG_ACCOUNT_REF,
  DEV_SEED_CATALOG_PRINCIPAL_NAME,
  DEV_SEED_CATALOG_PRINCIPAL_REF,
  DEV_SEED_CATALOG_RESOURCE,
  DEV_SEED_CATALOG_SCOPE,
  reviseBusinessOfferingCommand,
  upsertOfferingAccessPathCommand,
} from './catalogOfferingMutations'

const DEV_SEED_CATALOG_OWNERSHIP_REF = 'own_d2000000000000000000000000000001'
const DEV_SEED_CATALOG_GRANT_REF = 'grt_d2000000000000000000000000000001'
// Each provision refreshes the fixture grant's live window so a deployment that
// sat idle past a previous TTL self-heals on the next seed run instead of
// failing delegation admission with dev_seed_catalog_authority_denied.
const DEV_SEED_CATALOG_GRANT_TTL_MS = 60 * 60 * 1000

// Self-healing bootstrap for the dev-catalog seed's fixed machine identity
// (prn_d200…/acc_d200…/own_d200…/grt_d200…). admitDevSeedCatalogAuthority
// remains the sole authority sink: this only inserts the canonical rows it
// consumes (same shapes as tests/integration/dev-seed-public-catalog-facts.test.ts)
// when absent, so it is safe to run on every stack bring-up.
export async function provisionDevSeedCatalogIdentityRows(ctx: MutationCtx): Promise<string[]> {
  const now = Date.now()
  const created: string[] = []
  const principal = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', DEV_SEED_CATALOG_PRINCIPAL_REF))
    .unique()
  if (principal === null) {
    await ctx.db.insert('principals', {
      principalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      kind: 'workload',
      displayName: DEV_SEED_CATALOG_PRINCIPAL_NAME,
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    created.push('principal')
  }
  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', DEV_SEED_CATALOG_ACCOUNT_REF))
    .unique()
  if (account === null) {
    await ctx.db.insert('accounts', {
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      displayName: DEV_SEED_CATALOG_ACCOUNT_NAME,
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      creationIdempotencyRef: 'dev-seed-account:create',
      initialOwnershipRef: DEV_SEED_CATALOG_OWNERSHIP_REF,
      currentOwnershipRef: DEV_SEED_CATALOG_OWNERSHIP_REF,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      lastAction: {
        actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
        activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        correlationRef: 'dev-seed-account:create',
        idempotencyRef: 'dev-seed-account:create',
      },
    })
    created.push('account')
  }
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', DEV_SEED_CATALOG_OWNERSHIP_REF))
    .unique()
  if (ownership === null) {
    await ctx.db.insert('accountOwnerships', {
      ownershipRef: DEV_SEED_CATALOG_OWNERSHIP_REF,
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      ownerPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: now,
      createdBy: {
        actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
        activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        correlationRef: 'dev-seed-ownership:create',
        idempotencyRef: 'dev-seed-ownership:create',
      },
    })
    created.push('ownership')
  }
  const grant = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', DEV_SEED_CATALOG_GRANT_REF))
    .unique()
  if (grant === null) {
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef: DEV_SEED_CATALOG_GRANT_REF,
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      subjectPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      scopes: [DEV_SEED_CATALOG_SCOPE],
      resourceRefs: [DEV_SEED_CATALOG_RESOURCE],
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt: now + DEV_SEED_CATALOG_GRANT_TTL_MS,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: now,
      createdBy: {
        actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
        activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        correlationRef: 'dev-seed-grant:create',
        idempotencyRef: 'dev-seed-grant:create',
      },
    })
    created.push('grant')
  } else if (grant.lifecycle !== 'active' || grant.expiresAt <= now) {
    await ctx.db.patch(grant._id, {
      lifecycle: 'active',
      expiresAt: now + DEV_SEED_CATALOG_GRANT_TTL_MS,
      revision: grant.revision + 1,
    })
    created.push('grant')
  }
  return created
}

export const provisionDevSeedCatalogIdentity = internalMutation({
  args: {},
  returns: v.object({
    kind: v.literal('ensured'),
    created: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const created = await provisionDevSeedCatalogIdentityRows(ctx)
    return { kind: 'ensured' as const, created }
  },
})

/*
 * Local-E2E owner identity.
 *
 * Shape (a): the local Clerk-bypass `ae connect` already creates the canonical
 * agent identity Quote needs. `src/lib/server/agent-access-oauth-api.ts`
 * (issueGrantKey -> issueAgentAccessKey) calls
 * `agentAccessPrincipals.registerIssuedAgentBindingForServer`, and that one
 * mutation writes the whole chain in a single transaction: the `prn_` agent
 * Principal, its Membership in the owner Account, the `clerk/api-key`
 * externalIdentityBinding, the api_key Credential, the root
 * authorityDelegationGrants row (DelegationService.issueRoot), the
 * agentAccessGrants row and the agentAccessPrincipals row. It is the ONLY
 * writer of an `agent` Principal in the product.
 *
 * So the seed must not mint an agent identity of its own:
 *   - that mutation is public and gated on a verified Clerk identity plus an
 *     HMAC service assertion, so an internal seed mutation cannot call it, and
 *   - the bypass credential id is minted per consent
 *     (`localKeyId`, src/lib/server/local-e2e-agent-key.ts), so there is no
 *     fixed local credential to pre-bind.
 * The previous fabricated `clerk_api_key:ak_local_e2e_owner` principal could
 * never be admitted anyway: `candidateMatchesCanonical`
 * (convex/lib/callLifecycle/authorityHandlers.ts) requires
 * `principalId === canonical.principalRef`, and a principalRef must match the
 * `prn_...` pattern.
 *
 * What the seed owns instead is the OWNER side that `ae connect` attaches to:
 * the interactive owner identity for the fixed bypass session token
 * (`src/lib/server/convex-source.ts` sets subject `dev-seed-owner-session`),
 * provisioned through the same product helper the interactive path uses
 * (`ensureOwnerIdentityForAuthenticatedIdentity`,
 * convex/interactiveAuthority.ts), plus that account's legal-customer binding.
 * Because provisioning is keyed on the provider token identifier, a later
 * `ae connect` finds and reuses this exact Principal + Account rather than
 * creating a second identity.
 */
const LOCAL_E2E_OPERATOR_SUBJECT = 'dev-seed-owner-session'
const LOCAL_E2E_OWNER_IDENTITY: UserIdentity = Object.freeze({
  subject: LOCAL_E2E_OPERATOR_SUBJECT,
  issuer: 'https://convex.test',
  tokenIdentifier: `https://convex.test|${LOCAL_E2E_OPERATOR_SUBJECT}`,
  name: 'Dev Seed Owner',
})

type LocalE2EOwnerAuthority = Readonly<{ principalRef: string; accountRef: string }>

/**
 * Idempotently ensure the bypass owner's canonical interactive identity and
 * return its current Principal + Account. Both sandbox seed commands below
 * write only sandbox-scoped facts, so a deployment whose owner account already
 * carries a production agent refuses instead of seeding into it.
 */
async function requireLocalE2EOwnerAuthority(ctx: MutationCtx): Promise<LocalE2EOwnerAuthority> {
  const refs = await ensureOwnerIdentityForAuthenticatedIdentity(ctx, LOCAL_E2E_OWNER_IDENTITY)
  if (refs === null) throw new Error('dev_seed_local_e2e_owner_identity_unavailable')
  const accountRef = refs.accountRef ?? (await ctx.db.query('accountOwnerships')
    .withIndex('by_ownerPrincipalRef_and_lifecycle', (query) => query
      .eq('ownerPrincipalRef', refs.principalRef)
      .eq('lifecycle', 'active'))
    .unique())?.accountRef
  if (accountRef === undefined) throw new Error('dev_seed_local_e2e_owner_account_missing')
  const production = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_ownerId_and_lifecycle', (query) => query
      .eq('ownerId', accountRef)
      .eq('lifecycle', 'active'))
    .take(50)
  const offending = production.find(({ environment }) => environment !== 'sandbox')
  if (offending !== undefined) {
    throw new Error(
      `dev_seed_requires_sandbox_principal: ${offending.principalId} is ${offending.environment}, not sandbox`,
    )
  }
  return { principalRef: refs.principalRef, accountRef }
}

export const ensureLocalE2EOwnerIdentity = internalMutation({
  args: {},
  returns: v.object({
    kind: v.literal('ensured'),
    principalRef: v.string(),
    accountRef: v.string(),
  }),
  handler: async (ctx) => {
    const owner = await requireLocalE2EOwnerAuthority(ctx)
    return { kind: 'ensured' as const, ...owner }
  },
})

type SeedDevCatalogResult = Readonly<{
  kind: 'seeded'
  seededSlugs: string[]
  businessIdsBySlug: Record<string, string>
}>

export const seedDevCatalog = internalMutation({
  args: {},
  returns: v.object({
    kind: v.literal('seeded'),
    seededSlugs: v.array(v.string()),
    businessIdsBySlug: v.record(v.string(), v.string()),
  }),
  handler: async (ctx): Promise<SeedDevCatalogResult> => {
    // Self-heal the fixed dev-seed identity before authority admission.
    await provisionDevSeedCatalogIdentityRows(ctx)
    const authority = await admitDevSeedCatalogAuthority(ctx, 'seedDevCatalog')
    // The development catalog owns only its declared fixtures. Market
    // Operations are admitted through supplier/facilitator flows, so startup
    // must never sweep or rewrite unrelated supplier businesses.
    const bundle = buildDevSeedCatalogState(DEV_SEED_BUSINESS_FIXTURES, authority.accountRef)
    const result = await persistDevSeedCatalogState(ctx.db, bundle, authority.accountRef)
    return {
      ...result,
      kind: 'seeded' as const,
      seededSlugs: [...result.seededSlugs],
      businessIdsBySlug: { ...result.businessIdsBySlug },
    }
  },
})



export const seedOfferingSupply = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    processed: v.number(),
    seeded: v.number(),
    errors: v.array(v.string()),
    nextCursor: v.union(v.string(), v.null()),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await admitDevSeedCatalogAuthority(ctx, `seedOfferingSupply:${args.cursor ?? 'start'}`)
    const now = Date.now()
    const page = await ctx.db.query('businesses').paginate({ cursor: args.cursor, numItems: 10 })
    const errors: string[] = []
    let seeded = 0
    for (const business of page.page) {
      const result = await seedBusinessOfferings(
        ctx,
        business,
        now,
        DEV_SEED_PRICING_BY_SLUG,
        DEV_SEED_PRICE_BY_SLUG,
      )
      if (result.kind === 'error') {
        errors.push(`${business.slug}:${result.code}`)
        continue
      }
      seeded += result.seeded
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.devSeed.seedOfferingSupply, { cursor: page.continueCursor })
    }
    return {
      processed: page.page.length,
      seeded,
      errors,
      nextCursor: page.isDone ? null : page.continueCursor,
      done: page.isDone,
    }
  },
})

export async function seedBusinessOfferings(
  ctx: MutationCtx,
  business: Doc<'businesses'>,
  now: number,
  pricingBySlug: Readonly<Record<string, string>>,
  priceBySlug: Readonly<Record<string, OfferingPrice>>,
): Promise<{ kind: 'ok'; seeded: number } | { kind: 'error'; code: string }> {
  const offerings = await ctx.db
    .query('businessOfferings')
    .withIndex('by_businessId_and_status', (query) => query.eq('businessId', business._id))
    .collect()
  let seeded = 0

  for (const offering of offerings) {
    let revision = await ctx.db
      .query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision)
      ))
      .unique()
    if (revision === null) return { kind: 'error', code: 'revision_not_found' }
    const pricingSummary = pricingBySlug[business.slug]
    const price = priceBySlug[business.slug]
    if (pricingSummary !== undefined) {
      const facts = {
        name: revision.name,
        category: revision.category,
        summary: revision.summary,
        ...(revision.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: revision.serviceAreaSummary }),
        ...(revision.availabilitySummary === undefined ? {} : { availabilitySummary: revision.availabilitySummary }),
        pricingSummary,
        ...(price === undefined ? {} : { price }),
      }
      const priceMatches = canonicalDigest(revision.price ?? null) === canonicalDigest(price ?? null)
      if (revision.pricingSummary !== pricingSummary || !priceMatches) {
        const revised = await reviseBusinessOfferingCommand(ctx, {
          businessId: business._id,
          offeringRef: offering.offeringRef,
          expectedRevision: revision.revision,
          operationKey: `seed:offering-pricing:${business.slug}:${offering.offeringRef}:${canonicalDigest({ pricingSummary, price: price ?? null })}`,
          facts,
        }, now)
        if (revised.kind === 'error') return { kind: 'error', code: `pricing_${revised.code}` }
        revision = await ctx.db
          .query('businessOfferingRevisions')
          .withIndex('by_offeringRef_and_revision', (query) => (
            query.eq('offeringRef', offering.offeringRef).eq('revision', revised.currentRevision ?? offering.currentRevision)
          ))
          .unique()
        if (revision === null) return { kind: 'error', code: 'revision_not_found_after_pricing' }
      }
      const accessPaths = await ctx.db.query('offeringAccessPaths')
        .withIndex('by_offeringRef_and_status', (query) => query.eq('offeringRef', offering.offeringRef))
        .take(MAX_ACCESS_PATHS_PER_OFFERING + 1)
      if (accessPaths.length > MAX_ACCESS_PATHS_PER_OFFERING) {
        return { kind: 'error', code: 'access_path_capacity_exceeded' }
      }
      for (const accessPath of accessPaths) {
        if (accessPath.status === 'withdrawn') continue
        if (
          accessPath.offeringRevision === revision.revision
          && accessPath.offeringSourceHash === revision.sourceHash
        ) {
          continue
        }
        const updated = await upsertOfferingAccessPathCommand(ctx, {
          businessId: business._id,
          offeringRef: offering.offeringRef,
          accessPathRef: accessPath.accessPathRef,
          expectedRevision: revision.revision,
          operationKey: `seed:offering-access-path:${business.slug}:${accessPath.accessPathRef}:${revision.revision}`,
          descriptor: readCatalogDescriptor(accessPath.descriptor),
        }, now)
        if (updated.kind === 'error') return { kind: 'error', code: `access_path_${updated.code}` }
      }
    }

    seeded += 1
  }
  const sourceDb = ctx.db
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(sourceDb, business._id, now)
  const rebuilt = await rebuildBusinessSupplyProjectionSnapshotCommand({
    db: sourceDb,
    sourceDb,
    businessId: business._id,
    support,
    now,
  })
  if (rebuilt.kind === 'error') return { kind: 'error', code: `projection_${rebuilt.code}` }
  return { kind: 'ok', seeded }
}

/*
 * The sandbox Tool's single price fact.
 *
 * `/tools/<ref>` and `ae describe` read the capability-supply publication
 * price; the business page reads the catalog Offering's `price` /
 * `pricingSummary`. Both are published below from these three constants, so a
 * reader can never be quoted two different numbers for the same Tool.
 */
const SANDBOX_TOOL_PRICING_SUMMARY = 'AUD 1.00 per Call (sandbox)'
const SANDBOX_TOOL_PRICE_AMOUNT = { currency: 'AUD', units: '1000000', exponent: 6 } as const
const SANDBOX_TOOL_OFFERING_PRICE: OfferingPrice = {
  kind: 'fixed',
  amount: { ...SANDBOX_TOOL_PRICE_AMOUNT },
  unit: 'call',
  // The sandbox fixture publishes no tax position, so neither does its twin.
  taxTreatment: 'unstated',
}

const DEV_SEED_PRICING_BY_SLUG: Readonly<Record<string, string>> = Object.fromEntries(
  DEV_SEED_BUSINESS_FIXTURES.flatMap((fixture) => fixture.offerings.flatMap((offering) => (
    offering.pricingSummary === undefined ? [] : [[fixture.requestedSlug, offering.pricingSummary]]
  ))),
)

/**
 * The comparable twin of each seeded `pricingSummary`, authored by hand against
 * the sentence it sits beside. Nothing is parsed out of the prose at runtime:
 * the two are independent published facts, and a fixture sentence with no entry
 * here seeds prose only, exactly as it did before prices existed.
 */
const DEV_SEED_PRICE_BY_PRICING_SUMMARY: Readonly<Record<string, OfferingPrice>> = {
  'Demo price — $180 call-out, quoted before work starts': { kind: 'fixed', amount: { currency: 'AUD', units: '18000', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — $140 first hour, then $95 per hour': { kind: 'from', amount: { currency: 'AUD', units: '14000', exponent: 2 }, unit: 'hour', taxTreatment: 'inclusive' },
  'Demo price — $95 check-up and clean': { kind: 'fixed', amount: { currency: 'AUD', units: '9500', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — $350 first consultation': { kind: 'fixed', amount: { currency: 'AUD', units: '35000', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — $55 per hour, 3 hour minimum': { kind: 'from', amount: { currency: 'AUD', units: '5500', exponent: 2 }, unit: 'hour', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 5,000–7,000 typical wedding investment': { kind: 'from', amount: { currency: 'AUD', units: '500000', exponent: 2 }, unit: 'day', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 250 per additional hour': { kind: 'from', amount: { currency: 'AUD', units: '25000', exponent: 2 }, unit: 'hour', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 1,800 wedding coverage package': { kind: 'fixed', amount: { currency: 'AUD', units: '180000', exponent: 2 }, unit: 'day', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 4,500 base funeral service': { kind: 'fixed', amount: { currency: 'AUD', units: '450000', exponent: 2 }, unit: 'job', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 4,200 base funeral service': { kind: 'fixed', amount: { currency: 'AUD', units: '420000', exponent: 2 }, unit: 'job', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 4,800 base funeral service': { kind: 'fixed', amount: { currency: 'AUD', units: '480000', exponent: 2 }, unit: 'job', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 150 check-up and clean': { kind: 'fixed', amount: { currency: 'AUD', units: '15000', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 199 check-up, scale and clean': { kind: 'fixed', amount: { currency: 'AUD', units: '19900', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 139 check-up and clean': { kind: 'fixed', amount: { currency: 'AUD', units: '13900', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  [SANDBOX_TOOL_PRICING_SUMMARY]: SANDBOX_TOOL_OFFERING_PRICE,
}

export const DEV_SEED_PRICE_BY_SLUG: Readonly<Record<string, OfferingPrice>> = Object.fromEntries(
  Object.entries(DEV_SEED_PRICING_BY_SLUG).flatMap(([slug, summary]) => {
    const price = DEV_SEED_PRICE_BY_PRICING_SUMMARY[summary]
    return price === undefined ? [] : [[slug, price]]
  }),
)

/*
 * Sandbox reference Tool.
 *
 * A fresh local deployment has no routeable supply, so nothing can be Quoted.
 * This publishes exactly one named sandbox Tool through the real
 * capability-supply publish command (publishCapabilityForSeed →
 * publishBootstrapCapability → publishPreparedCapabilityCommand); no
 * capabilityPublications row is ever written here directly. Every id, slug and
 * price is fixed, so a rerun finds the existing publication through
 * by_publicationRef_and_revision and reports `created: false`.
 */
const SANDBOX_TOOL_BUSINESS_SLUG = 'sandbox-aecon-reference'
const SANDBOX_TOOL_LABEL = 'AEcon sandbox reference Tool'
const SANDBOX_TOOL_CAPABILITY_ID = 'sandbox.aecon-reference'
const SANDBOX_TOOL_OFFERING_ID = `capability-offering:${SANDBOX_TOOL_BUSINESS_SLUG}:v1`
const SANDBOX_TOOL_BINDING_ID = `capability-binding:${SANDBOX_TOOL_BUSINESS_SLUG}:x402:v1`
const SANDBOX_TOOL_ACCESS_PATH_REF = `access:${SANDBOX_TOOL_BUSINESS_SLUG}:x402`
const SANDBOX_TOOL_ENDPOINT_URL = 'https://sandbox.aecon-reference.example/x402/reference'
const SANDBOX_TOOL_METHOD = 'POST'
const SANDBOX_TOOL_NETWORK_ID = 'ae:public'
const SANDBOX_TOOL_SOURCE_REVISION = `seed:sandbox:${SANDBOX_TOOL_BUSINESS_SLUG}:v1`
const SANDBOX_TOOL_EVIDENCE_REF = `private:evidence:dev-seed:${SANDBOX_TOOL_BUSINESS_SLUG}`
// The sandbox commercial-policy fixture every sandbox money gate resolves to
// (src/modules/money/internal/commercial-policy.ts). Declared on the seeded
// Tool so the fixture the Quote path admits is visible in the seed itself.
const SANDBOX_TOOL_COMMERCIAL_FIXTURE = 'managed_x402_deterministic_v1'
const SANDBOX_TOOL_READINESS_TTL_MS = 60 * 60 * 1000

const SANDBOX_TOOL_FIXTURE: DevSeedBusinessFixture = {
  requestedSlug: SANDBOX_TOOL_BUSINESS_SLUG,
  businessName: 'AEcon sandbox reference provider',
  category: 'API services',
  suburb: 'Sandbox',
  stateTerritory: 'External',
  ownerMessage: 'Sandbox-only reference provider seeded for local Quote bring-up.',
  sourceLabel: `Sandbox reference fixture ${SANDBOX_TOOL_COMMERCIAL_FIXTURE} https://sandbox.aecon-reference.example/`,
  offerings: [{
    name: SANDBOX_TOOL_LABEL,
    category: 'API services',
    summary: 'Deterministic sandbox Tool that returns one structured reference result.',
    serviceAreaSummary: 'Sandbox network only',
    availabilitySummary: 'Always available in the sandbox environment',
    pricingSummary: SANDBOX_TOOL_PRICING_SUMMARY,
    accessPaths: [],
    firstRequestMode: 'not_available_yet',
    publicDisclosure: 'This sandbox provider is reached programmatically, not by human request.',
    noContactReason: 'Sandbox fixture provider publishes no human contact path.',
  }],
}

function sandboxToolContractDocumentJson(): string {
  return JSON.stringify({
    contractFormat: 'ae.capability-contract:v2',
    capabilityId: SANDBOX_TOOL_CAPABILITY_ID,
    version: 1,
    name: SANDBOX_TOOL_LABEL,
    description: 'Return a deterministic sandbox reference result for a structured request.',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { request: { type: 'string', minLength: 1 } },
      required: ['request'],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { result: { type: 'string' } },
      required: ['result'],
      additionalProperties: false,
    },
    customerAnnotations: [
      { annotationId: 'request', document: 'input', pointer: '/request', label: 'Request', role: 'request' },
      { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
    ],
    dataUse: [{
      effectId: 'request_release',
      inputPointer: '/request',
      classification: 'personal',
      phase: 'execution',
      recipient: { kind: 'selected_binding' },
      purposes: ['return_requested_result'],
    }],
    effects: [{
      effectId: 'request_release',
      class: 'data_release',
      authority: 'mandate_or_explicit',
      reversibility: 'irreversible',
    }],
    evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
    lifecycle: { idempotency: 'required', recovery: 'retry_safe' },
  })
}

type SandboxToolCatalogOrigin = Readonly<{
  kind: 'catalog_offering'
  offeringRef: string
  offeringRevision: number
  offeringSourceHash: string
  declaredAccessPathRef: string
  accessPathSourceHash: string
}>

/**
 * Publishes the catalog side of the sandbox Tool through the same system
 * offering commands the dev catalog already uses, then returns the exact
 * catalog origin the publication must bind to.
 *
 * The price twin is seeded here, BEFORE the publication binds its origin: the
 * revise that carries `price` mints a new Offering revision and source hash,
 * so pricing afterwards would leave the publication bound to a revision that
 * no longer exists and the Tool would stop qualifying as routeable.
 */
async function ensureSandboxToolCatalogOrigin(
  ctx: MutationCtx,
  owningAccountRef: string,
  now: number,
): Promise<{ businessId: Id<'businesses'>; origin: SandboxToolCatalogOrigin }> {
  const bundle = buildDevSeedCatalogState([SANDBOX_TOOL_FIXTURE], owningAccountRef)
  const persisted = await persistDevSeedCatalogState(ctx.db, bundle, owningAccountRef)
  const businessId = persisted.businessIdsBySlug[SANDBOX_TOOL_BUSINESS_SLUG]
  if (businessId === undefined) throw new Error('dev_seed_sandbox_tool_business_missing')
  const offeringRef = bundle.state.offerings[0]?.offeringRef
  if (offeringRef === undefined) throw new Error('dev_seed_sandbox_tool_offering_missing')

  const business = await ctx.db.get(businessId)
  if (business === null) throw new Error('dev_seed_sandbox_tool_business_missing')
  const priced = await seedBusinessOfferings(
    ctx,
    business,
    now,
    { [SANDBOX_TOOL_BUSINESS_SLUG]: SANDBOX_TOOL_PRICING_SUMMARY },
    { [SANDBOX_TOOL_BUSINESS_SLUG]: SANDBOX_TOOL_OFFERING_PRICE },
  )
  if (priced.kind === 'error') throw new Error(`dev_seed_sandbox_tool_pricing_${priced.code}`)

  const offering = await ctx.db.query('businessOfferings')
    .withIndex('by_offeringRef', (query) => query.eq('offeringRef', offeringRef))
    .unique()
  if (offering === null) throw new Error('dev_seed_sandbox_tool_offering_missing')
  const existingPath = await ctx.db.query('offeringAccessPaths')
    .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', SANDBOX_TOOL_ACCESS_PATH_REF))
    .unique()
  if (existingPath === null
    || existingPath.status !== 'published'
    || existingPath.offeringRevision !== offering.currentRevision) {
    const upserted = await upsertOfferingAccessPathCommand(ctx, {
      businessId,
      offeringRef,
      accessPathRef: SANDBOX_TOOL_ACCESS_PATH_REF,
      expectedRevision: offering.currentRevision,
      operationKey: `seed:sandbox-tool-access-path:${SANDBOX_TOOL_BUSINESS_SLUG}:${offering.currentRevision}`,
      descriptor: {
        kind: 'external_operation',
        name: SANDBOX_TOOL_LABEL,
        summary: 'Sandbox x402 access path for the seeded reference Tool.',
        url: SANDBOX_TOOL_ENDPOINT_URL,
        method: SANDBOX_TOOL_METHOD,
        authenticationSummary: `Sandbox x402 fixture ${SANDBOX_TOOL_COMMERCIAL_FIXTURE}.`,
        provenance: 'business_declared',
      },
    }, now)
    if (upserted.kind === 'error') {
      throw new Error(`dev_seed_sandbox_tool_access_path_${upserted.code}`)
    }
  }

  const [revision, accessPath] = await Promise.all([
    ctx.db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', offeringRef).eq('revision', offering.currentRevision)
      ))
      .unique(),
    ctx.db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', SANDBOX_TOOL_ACCESS_PATH_REF))
      .unique(),
  ])
  if (revision === null) throw new Error('dev_seed_sandbox_tool_revision_missing')
  if (accessPath === null) throw new Error('dev_seed_sandbox_tool_access_path_missing')
  return {
    businessId,
    origin: {
      kind: 'catalog_offering',
      offeringRef,
      offeringRevision: offering.currentRevision,
      offeringSourceHash: revision.sourceHash,
      declaredAccessPathRef: accessPath.accessPathRef,
      accessPathSourceHash: accessPath.sourceHash,
    },
  }
}

export const publishSandboxTool = internalMutation({
  args: {},
  returns: v.object({
    created: v.boolean(),
    publicationId: v.string(),
    publicationRevision: v.number(),
    toolRef: v.string(),
    businessSlug: v.string(),
  }),
  handler: async (ctx) => {
    // Same deployment guard the money seed uses: never seed sandbox supply into
    // a deployment whose bypass owner account already carries a production agent.
    await requireLocalE2EOwnerAuthority(ctx)
    const evidenceRefs = [SANDBOX_TOOL_EVIDENCE_REF]
    // Catalog side first, on EVERY invocation: the publication is created once,
    // but the priced Offering revision it binds to and the business's search
    // documents have to be re-asserted on each boot for the same reason the
    // readiness fact below does.
    await provisionDevSeedCatalogIdentityRows(ctx)
    const authority = await admitDevSeedCatalogAuthority(ctx, 'publishSandboxTool')
    const now = Date.now()
    const { businessId, origin } = await ensureSandboxToolCatalogOrigin(ctx, authority.accountRef, now)

    const existing = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => (
        query.eq('publicationRef', SANDBOX_TOOL_OFFERING_ID).eq('revision', 1)
      ))
      .unique()

    const target = existing !== null
      ? {
          created: false,
          publicationRef: existing.publicationRef,
          publicationRevision: existing.revision,
          toolRef: existing.toolRef,
        }
      : await createSandboxToolPublication(ctx, evidenceRefs, businessId, origin, now)

    // The publish command only schedules a readiness probe, and the fixture
    // endpoint is not reachable from a local stack: that probe can only ever
    // land `unavailable` over the seeded fact, and the readiness window is
    // shorter than the gap between two local boots. So re-assert the sandbox
    // readiness fact on EVERY invocation - not just the run that created the
    // publication - through the documented curated-seed helper, so each boot
    // leaves the Tool routeable for Quote instead of `readiness_unobserved`.
    const observed = await observeCapabilityReadinessHandler(ctx, {
      publicationRef: target.publicationRef,
      expectedRevision: target.publicationRevision,
      credentialState: 'ready',
      healthState: 'healthy',
      validUntil: Date.now() + SANDBOX_TOOL_READINESS_TTL_MS,
      operationKey: `seed:sandbox-tool-readiness:${SANDBOX_TOOL_BUSINESS_SLUG}:${target.publicationRevision}`,
      correlationId: `seed:sandbox-tool:${SANDBOX_TOOL_BUSINESS_SLUG}`,
      reasonCode: 'dev_seed_sandbox_tool_readiness',
      evidenceRefs: [...evidenceRefs],
    })
    if (observed.kind === 'refused') {
      throw new Error(`dev_seed_sandbox_tool_readiness_refused:${observed.reason}`)
    }

    return {
      created: target.created,
      publicationId: target.publicationRef,
      publicationRevision: target.publicationRevision,
      toolRef: target.toolRef,
      businessSlug: SANDBOX_TOOL_BUSINESS_SLUG,
    }
  },
})

async function createSandboxToolPublication(
  ctx: MutationCtx,
  evidenceRefs: readonly string[],
  businessId: Id<'businesses'>,
  origin: SandboxToolCatalogOrigin,
  now: number,
): Promise<{ created: true; publicationRef: string; publicationRevision: number; toolRef: string }> {
  const offering = {
    offeringId: SANDBOX_TOOL_OFFERING_ID,
    networkId: SANDBOX_TOOL_NETWORK_ID,
    origin,
    presentation: {
      label: SANDBOX_TOOL_LABEL,
      summary: 'Deterministic sandbox Tool that returns one structured reference result.',
      price: {
        kind: 'fixed' as const,
        amount: { ...SANDBOX_TOOL_PRICE_AMOUNT },
      },
      materialTerms: [{
        termId: 'sandbox-fixture',
        label: 'Sandbox commercial fixture',
        value: SANDBOX_TOOL_COMMERCIAL_FIXTURE,
      }],
      commercialRelationship: {
        kind: 'none' as const,
        summary: 'Sandbox fixture supply with no commercial influence.',
        influencesEligibility: false,
        influencesInclusion: false,
        influencesOrder: false,
        evidenceRefs: [...evidenceRefs],
      },
    },
    searchTerms: ['sandbox', 'sandbox reference tool', SANDBOX_TOOL_COMMERCIAL_FIXTURE],
    registrationEvidenceRefs: [...evidenceRefs],
  }
  const binding = {
    bindingId: SANDBOX_TOOL_BINDING_ID,
    endpointUrl: SANDBOX_TOOL_ENDPOINT_URL,
    authority: { kind: 'public_upstream' as const },
    continuation: { kind: 'single_response' as const, evidenceRefs: [...evidenceRefs] },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: [...evidenceRefs] },
    adapter: {
      adapterId: 'http-json:v1',
      config: { method: SANDBOX_TOOL_METHOD, requestTimeoutMs: 10_000 },
    },
    registrationEvidenceRefs: [...evidenceRefs],
  }
  const published = await publishCapabilityForSeed(ctx, {
    businessId: String(businessId),
    runtimeEnvironment: 'sandbox',
    source: {
      kind: 'ae_envelope',
      documentJson: sandboxToolContractDocumentJson(),
      offering,
      binding,
      evidenceRefs: [...evidenceRefs],
    },
    sourceRevision: SANDBOX_TOOL_SOURCE_REVISION,
    offering,
    binding,
    origin,
    operationKey: `seed:sandbox-tool-publish:${SANDBOX_TOOL_BUSINESS_SLUG}:v1`,
    correlationId: `seed:sandbox-tool:${SANDBOX_TOOL_BUSINESS_SLUG}`,
    reasonCode: 'dev_seed_sandbox_tool',
    evidenceRefs: [...evidenceRefs],
    now,
  })
  if (published.kind === 'refused') {
    throw new Error(`dev_seed_sandbox_tool_publish_refused:${published.reason}`)
  }
  return {
    created: true,
    publicationRef: published.publicationRef,
    publicationRevision: published.publicationRevision,
    toolRef: published.toolRef,
  }
}

/*
 * Sandbox money authority for the local bypass owner.
 *
 * The agent side of Quote authority belongs to `ae connect` (see the shape (a)
 * note above `requireLocalE2EOwnerAuthority`): that flow writes the canonical
 * agent Principal, its delegation root and its agentAccessGrants row, and Quote
 * resolves all three live. The one fact `ae connect` never writes is the owning
 * account's money identity, so this seeds exactly that - the
 * moneyLegalCustomerBindings row `capabilityQuotes.prepareFinancialSubjects`
 * reads - through its own command (`resolveAndBindLegalCustomer`,
 * convex/lib/moneyLegalCustomer.ts). Nothing behind that command is patched,
 * and no secret material is written.
 */
export const seedSandboxSpendingPolicy = internalMutation({
  args: {},
  returns: v.object({
    created: v.boolean(),
    accountRef: v.string(),
    legalCustomerRef: v.string(),
  }),
  handler: async (ctx) => {
    const owner = await requireLocalE2EOwnerAuthority(ctx)
    const existing = await ctx.db.query('moneyLegalCustomerBindings')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', owner.accountRef))
      .unique()
    const bound = await resolveAndBindLegalCustomer(ctx, owner.accountRef, Date.now())
    if (bound.kind === 'refused') {
      throw new Error(`dev_seed_sandbox_legal_customer_${bound.code}`)
    }
    return {
      created: existing === null,
      accountRef: owner.accountRef,
      legalCustomerRef: bound.legalCustomerRef,
    }
  },
})
