import { degradeBackend } from '@/lib/observability/degrade-backend'
import { env, internalMutation, type MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import type { UserIdentity } from 'convex/server'

import type { JsonValue } from '@/modules/capability-contract/public'

import {
  buildDevSeedCatalogState,
  DEV_SEED_BUSINESS_FIXTURES,
  type DevSeedBusinessFixture,
} from '../src/modules/dev/public'
import {
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  validateX402PaymentRequired,
} from '@/modules/capability-supply/convex'
import {
  createX402ProviderConnection,
  isCanonicalCredentiallessX402ProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import { toDomain, toRow } from './lib/providerConnections/lifecycle'
import { publishCapabilityForSeed } from './capabilitySupplyPublish'
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
 *   - the credential id is minted per consent by `issueAgentAccessKey`
 *     (src/modules/agent-access/agent-access.ts, called via issueGrantKey
 *     above), so there is no fixed local credential to pre-bind.
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
export async function requireLocalE2EOwnerAuthority(ctx: MutationCtx): Promise<LocalE2EOwnerAuthority> {
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
 * Sandbox reference Tools.
 *
 * A fresh local deployment has no routeable supply, so nothing can be Quoted.
 * This publishes the named sandbox Tools through the real capability-supply
 * publish command (publishCapabilityForSeed → publishBootstrapCapability →
 * publishPreparedCapabilityCommand); no capabilityPublications row is ever
 * written here directly. Every id, slug and price is fixed, so a rerun finds
 * each existing publication through by_publicationRef_and_revision and reports
 * `created: false`.
 *
 * Two Tools are seeded, each under its own business:
 *
 *  1. `sandbox-aecon-reference` — the deterministic fixture Tool. Its endpoint
 *     is not reachable from anywhere, so it proves discovery, pricing and Quote
 *     admission and nothing further.
 *  2. `sandbox-aecon-testnet` — the real Base Sepolia x402 reference provider
 *     (tools/release/package5-reference-provider). Seeded only on a deployment
 *     that carries that provider's own env, bound through `x402-fetch:v2`, and
 *     priced at the exact atomic USDC amount the provider charges, so its Call
 *     leg can actually settle.
 *
 * Sibling businesses rather than two Offerings on one business:
 * `seedBusinessOfferings` keys `pricingSummary`/`price` by business slug and
 * applies that one pair to every Offering the business publishes, so a second
 * Offering under `sandbox-aecon-reference` would be forced to carry the first
 * Tool's AUD price. The two are also genuinely different providers — different
 * endpoint, different payee, different settlement network — so one business
 * each is the truthful shape as well as the workable one.
 */
type SandboxToolTransport = Readonly<{
  authority:
    | Readonly<{ kind: 'public_upstream' }>
    | Readonly<{ kind: 'provider_connection'; connectionRef: string; providerRef: string }>
  adapter: Readonly<{ adapterId: string; config: Readonly<Record<string, JsonValue>> }>
}>

type SandboxToolSpec = Readonly<{
  businessSlug: string
  businessName: string
  label: string
  capabilityId: string
  summary: string
  contractDescription: string
  /** Input property the contract carries the caller's request in. */
  requestField: string
  /** Output property the completion evidence is read from. */
  resultField: string
  inputSchema: Readonly<Record<string, unknown>>
  outputSchema: Readonly<Record<string, unknown>>
  recovery: 'retry_safe' | 'reconcile_required'
  endpointUrl: string
  method: 'POST'
  pricingSummary: string
  /**
   * The publication no longer carries a display price of its own; every
   * reader derives it from this pricing config (managed_x402 for the
   * testnet Tool, fixed_aud for the reference Tool).
   */
  pricingConfig: Readonly<Record<string, JsonValue>>
  offeringPrice: OfferingPrice
  materialTerms: readonly Readonly<{ termId: string; label: string; value: string }>[]
  commercialFixture: string
  ownerMessage: string
  sourceLabel: string
  serviceAreaSummary: string
  availabilitySummary: string
  authenticationSummary: string
  accessPathSummary: string
  searchTerms: readonly string[]
  /**
   * How the publication is imported. An `ae_envelope` source may only carry an
   * `http-json:v1` binding (publication/draft.ts pins one adapter per source
   * kind), so the paid Tool is imported as the `x402` source that derives its
   * own `x402-fetch:v2` binding from the provider's payment terms.
   */
  source:
    | Readonly<{ kind: 'ae_envelope'; transport: SandboxToolTransport }>
    | Readonly<{
        kind: 'x402'
        payTo: string
        connectionRef: string
        providerRef: string
        requestTimeoutMs: number
        paymentRequired: Readonly<Record<string, JsonValue>>
        providerPrice: Readonly<{ currency: string; units: string; exponent: number }>
      }>
}>

const SANDBOX_TOOL_NETWORK_ID = 'ae:public'

const sandboxToolOfferingId = (spec: SandboxToolSpec) => `capability-offering:${spec.businessSlug}:v1`
const sandboxToolBindingId = (spec: SandboxToolSpec) => `capability-binding:${spec.businessSlug}:x402:v1`
const sandboxToolAccessPathRef = (spec: SandboxToolSpec) => `access:${spec.businessSlug}:x402`
const sandboxToolSourceRevision = (spec: SandboxToolSpec) => `seed:sandbox:${spec.businessSlug}:v1`
const sandboxToolEvidenceRef = (spec: SandboxToolSpec) => `private:evidence:dev-seed:${spec.businessSlug}`

/*
 * The sandbox Tool price facts.
 *
 * `/tools/<ref>` and `ae describe` read the capability-supply publication
 * price; the business page reads the catalog Offering's `price` /
 * `pricingSummary`. Both are published below from the same spec constants, so a
 * reader can never be quoted two different numbers for the same Tool.
 */
const SANDBOX_TOOL_BUSINESS_SLUG = 'sandbox-aecon-reference'
const SANDBOX_TOOL_LABEL = 'AEcon sandbox reference Tool'
const SANDBOX_TOOL_CAPABILITY_ID = 'sandbox.aecon-reference'
// The sandbox commercial-policy fixture every sandbox money gate resolves to
// (src/modules/money/internal/commercial-policy.ts). Declared on the seeded
// Tool so the fixture the Quote path admits is visible in the seed itself.
const SANDBOX_TOOL_COMMERCIAL_FIXTURE = 'managed_x402_deterministic_v1'

/*
 * The reference Tool's endpoint is AEcon's own sandbox counterparty
 * (`src/routes/api.v1.sandbox-reference.ts`), reached through this
 * deployment's own public origin - never a hard-coded host. On loopback (local
 * dev) the readiness probe's SSRF guard refuses the target by design, so the
 * Tool stays unlisted locally; on a hosted HTTPS origin it becomes healthy
 * (Wells 1+2 decision D9 A). Without `AE_SITE_URL` there is no origin to
 * publish against, so the Tool is skipped rather than published against a
 * guessed URL.
 */
const SANDBOX_REFERENCE_ROUTE_PATH = '/api/v1/sandbox-reference'
export const SANDBOX_REFERENCE_SKIP_SITE_URL_MISSING = 'AE_SITE_URL_missing'

function sandboxReferenceEndpointUrl(): string | undefined {
  const origin = env.AE_SITE_URL?.trim()
  if (origin === undefined || origin.length === 0) return undefined
  try {
    const url = new URL(origin)
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    const validOrigin = (url.protocol === 'https:' || (url.protocol === 'http:' && loopback))
      && url.username === '' && url.password === ''
    return validOrigin ? new URL(SANDBOX_REFERENCE_ROUTE_PATH, origin).toString() : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'sandboxReferenceEndpointUrl', reason: 'invalid_response' })
  }
}

function sandboxReferenceToolSpec(endpointUrl: string): SandboxToolSpec {
  return {
    businessSlug: SANDBOX_TOOL_BUSINESS_SLUG,
    businessName: 'AEcon sandbox reference provider',
    label: SANDBOX_TOOL_LABEL,
    capabilityId: SANDBOX_TOOL_CAPABILITY_ID,
    summary: 'Deterministic sandbox Tool that returns one structured reference result.',
    contractDescription: 'Return a deterministic sandbox reference result for a structured request.',
    requestField: 'request',
    resultField: 'result',
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
    recovery: 'retry_safe',
    endpointUrl,
    method: 'POST',
    pricingSummary: SANDBOX_TOOL_PRICING_SUMMARY,
    pricingConfig: {
      version: 'pricing:v3',
      kind: 'fixed_aud',
      currency: 'AUD',
      exponent: 6,
      amountUnits: SANDBOX_TOOL_PRICE_AMOUNT.units,
    },
    offeringPrice: SANDBOX_TOOL_OFFERING_PRICE,
    materialTerms: [{
      termId: 'sandbox-fixture',
      label: 'Sandbox commercial fixture',
      value: SANDBOX_TOOL_COMMERCIAL_FIXTURE,
    }],
    commercialFixture: SANDBOX_TOOL_COMMERCIAL_FIXTURE,
    ownerMessage: 'Sandbox-only reference provider seeded for local Quote bring-up.',
    sourceLabel: `Sandbox reference fixture ${SANDBOX_TOOL_COMMERCIAL_FIXTURE} ${endpointUrl}`,
    serviceAreaSummary: 'Sandbox network only',
    availabilitySummary: 'Always available in the sandbox environment',
    authenticationSummary: `Sandbox x402 fixture ${SANDBOX_TOOL_COMMERCIAL_FIXTURE}.`,
    accessPathSummary: 'Sandbox x402 access path for the seeded reference Tool.',
    searchTerms: ['sandbox', 'sandbox reference tool', SANDBOX_TOOL_COMMERCIAL_FIXTURE],
    source: {
      kind: 'ae_envelope',
      transport: {
        authority: { kind: 'public_upstream' },
        adapter: {
          adapterId: 'http-json:v1',
          config: { method: 'POST', requestTimeoutMs: 10_000 },
        },
      },
    },
  }
}

/*
 * The Base Sepolia x402 reference provider.
 *
 * Every fact below except the endpoint host and the payee is the provider's
 * own published constant (tools/release/package5-reference-provider/core.ts):
 * `exact` scheme on Base Sepolia, USDC, 1000 atomic units, 60s timeout,
 * `POST /x402/execute`. The host and payee are deployment facts, so they are
 * read from the same two environment names the provider deployment itself
 * requires — never hard-coded here.
 */
const SANDBOX_TESTNET_BUSINESS_SLUG = 'sandbox-aecon-testnet'
const SANDBOX_TESTNET_LABEL = 'AEcon sandbox testnet reference Tool'
const SANDBOX_TESTNET_CAPABILITY_ID = 'sandbox.aecon-testnet-reference'
const SANDBOX_TESTNET_COMMERCIAL_FIXTURE = 'package5_reference_provider_x402_base_sepolia'
const SANDBOX_TESTNET_ROUTE_PATH = '/x402/execute'
const SANDBOX_TESTNET_ATOMIC_AMOUNT = '1000'
const SANDBOX_TESTNET_USDC_EXPONENT = 6
const SANDBOX_TESTNET_MAX_TIMEOUT_SECONDS = 60
const SANDBOX_TESTNET_CONNECTION_REF = `connection:x402:${SANDBOX_TESTNET_BUSINESS_SLUG}`
const SANDBOX_TESTNET_PROVIDER_REF = `provider:x402:${SANDBOX_TESTNET_BUSINESS_SLUG}`
const SANDBOX_TESTNET_PRICING_SUMMARY = 'USDC 0.001 per Call (Base Sepolia testnet)'
const SANDBOX_TESTNET_PRICE_AMOUNT = {
  currency: 'USDC',
  units: SANDBOX_TESTNET_ATOMIC_AMOUNT,
  exponent: SANDBOX_TESTNET_USDC_EXPONENT,
} as const
const SANDBOX_TESTNET_OFFERING_PRICE: OfferingPrice = {
  kind: 'fixed',
  amount: { ...SANDBOX_TESTNET_PRICE_AMOUNT },
  unit: 'call',
  taxTreatment: 'unstated',
}

/*
 * The reference provider's own environment names
 * (tools/release/package5-reference-provider/api/fixture.ts). A deployment that
 * runs the paid leg has to know the same two facts the provider deployment
 * knows, so the seed reads them under the provider's names rather than minting
 * a second name for the same value.
 *
 * They are not declared in `convex/convex.config.ts`, so the typed `env` object
 * is widened for the read. Convex populates every deployment environment
 * variable regardless of declaration; declaring them there (and in
 * `.env.example`) is the follow-up that makes them typed.
 */
const SANDBOX_TESTNET_ORIGIN_ENV = 'AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN'
const SANDBOX_TESTNET_PAY_TO_ENV = 'AE_PACKAGE5_FIXTURE_X402_PAY_TO'

export const SANDBOX_TESTNET_SKIP_ORIGIN_MISSING = 'AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN_missing'
export const SANDBOX_TESTNET_SKIP_PAY_TO_MISSING = 'AE_PACKAGE5_FIXTURE_X402_PAY_TO_missing'

function readSeedEnvironmentValue(name: string): string | undefined {
  const value = (env as Readonly<Record<string, string | undefined>>)[name]?.trim()
  return value === undefined || value.length === 0 ? undefined : value
}

function sandboxTestnetEndpointUrl(): string | undefined {
  const origin = readSeedEnvironmentValue(SANDBOX_TESTNET_ORIGIN_ENV)
  if (origin === undefined) return undefined
  try {
    const url = new URL(SANDBOX_TESTNET_ROUTE_PATH, origin)
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      ? url.toString()
      : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'sandboxTestnetEndpointUrl', reason: 'invalid_response' })
  }
}

function sandboxTestnetPaymentRequired(
  endpointUrl: string,
  payTo: string,
): Readonly<Record<string, JsonValue>> {
  return validateX402PaymentRequired({
    x402Version: 2,
    resource: { url: endpointUrl },
    accepts: [{
      scheme: 'exact',
      network: BASE_SEPOLIA_NETWORK,
      amount: SANDBOX_TESTNET_ATOMIC_AMOUNT,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      payTo,
      maxTimeoutSeconds: SANDBOX_TESTNET_MAX_TIMEOUT_SECONDS,
      extra: { name: 'USDC', version: '2' },
    }],
  }) as Readonly<Record<string, JsonValue>>
}

function sandboxTestnetToolSpec(endpointUrl: string, payTo: string): SandboxToolSpec {
  return {
    businessSlug: SANDBOX_TESTNET_BUSINESS_SLUG,
    businessName: 'AEcon sandbox testnet reference provider',
    label: SANDBOX_TESTNET_LABEL,
    capabilityId: SANDBOX_TESTNET_CAPABILITY_ID,
    summary: 'Base Sepolia x402 reference Tool that returns one deterministic structured result.',
    contractDescription: 'Return the reference provider’s deterministic result for a structured value.',
    requestField: 'value',
    resultField: 'value',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { value: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['value'],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        sourceKind: { type: 'string' },
        value: { type: 'string' },
        provider: { type: 'string' },
      },
      required: ['sourceKind', 'value', 'provider'],
      additionalProperties: false,
    },
    // A settled x402 payment is not replayable: recovery reconciles, never retries.
    recovery: 'reconcile_required',
    endpointUrl,
    method: 'POST',
    pricingSummary: SANDBOX_TESTNET_PRICING_SUMMARY,
    // Managed x402: the buyer total is settled by a binding Quote in AUD, so
    // the publication displays `on_request` (derived from this pricing
    // config) and the provider's own atomic charge is carried below.
    pricingConfig: {
      version: 'pricing:v3',
      kind: 'managed_x402',
      effectTiming: 'payment_required_before_effect',
      sourceRequirement: {
        network: BASE_SEPOLIA_NETWORK,
        asset: BASE_SEPOLIA_USDC_ADDRESS,
        atomicUnits: SANDBOX_TESTNET_ATOMIC_AMOUNT,
      },
      pricingPolicyRef: 'pricing-policy:managed-x402-reference:v1',
      publicDisplay: 'on_request',
    },
    offeringPrice: SANDBOX_TESTNET_OFFERING_PRICE,
    materialTerms: [
      {
        termId: 'sandbox-fixture',
        label: 'Sandbox commercial fixture',
        value: SANDBOX_TESTNET_COMMERCIAL_FIXTURE,
      },
      {
        termId: 'provider-amount',
        label: 'Listed Provider amount',
        value: `${SANDBOX_TESTNET_ATOMIC_AMOUNT} atomic USDC on ${BASE_SEPOLIA_NETWORK}`,
      },
      {
        termId: 'buyer-total',
        label: 'Buyer total',
        value: 'Confirmed in AUD by a binding Quote for your input.',
      },
    ],
    commercialFixture: SANDBOX_TESTNET_COMMERCIAL_FIXTURE,
    ownerMessage: 'Base Sepolia x402 reference provider seeded for the real paid-Call proof.',
    sourceLabel: `Package 5 reference provider ${SANDBOX_TESTNET_COMMERCIAL_FIXTURE} ${endpointUrl}`,
    serviceAreaSummary: 'Base Sepolia testnet only',
    availabilitySummary: 'Always available while the reference provider deployment is up',
    authenticationSummary: 'x402 exact scheme on Base Sepolia USDC; no provider credential.',
    accessPathSummary: 'Base Sepolia x402 access path for the reference provider Tool.',
    searchTerms: ['sandbox', 'testnet', 'x402', 'base sepolia', 'usdc'],
    source: {
      kind: 'x402',
      payTo,
      connectionRef: SANDBOX_TESTNET_CONNECTION_REF,
      providerRef: SANDBOX_TESTNET_PROVIDER_REF,
      requestTimeoutMs: 30_000,
      paymentRequired: sandboxTestnetPaymentRequired(endpointUrl, payTo),
      providerPrice: { ...SANDBOX_TESTNET_PRICE_AMOUNT },
    },
  }
}

function sandboxToolFixture(spec: SandboxToolSpec): DevSeedBusinessFixture {
  return {
    requestedSlug: spec.businessSlug,
    businessName: spec.businessName,
    category: 'API services',
    suburb: 'Sandbox',
    stateTerritory: 'External',
    ownerMessage: spec.ownerMessage,
    sourceLabel: spec.sourceLabel,
    offerings: [{
      name: spec.label,
      category: 'API services',
      summary: spec.summary,
      serviceAreaSummary: spec.serviceAreaSummary,
      availabilitySummary: spec.availabilitySummary,
      pricingSummary: spec.pricingSummary,
      accessPaths: [],
      firstRequestMode: 'not_available_yet',
      publicDisclosure: 'This sandbox provider is reached programmatically, not by human request.',
      noContactReason: 'Sandbox fixture provider publishes no human contact path.',
    }],
  }
}

function sandboxToolContractMetadata(spec: SandboxToolSpec): Readonly<Record<string, unknown>> {
  return {
    capabilityId: spec.capabilityId,
    version: 1,
    name: spec.label,
    description: spec.contractDescription,
    customerAnnotations: [
      { annotationId: 'request', document: 'input', pointer: `/${spec.requestField}`, label: 'Request', role: 'request' },
      { annotationId: 'result', document: 'output', pointer: `/${spec.resultField}`, label: 'Result', role: 'completion_evidence' },
    ],
    dataUse: [{
      effectId: 'request_release',
      inputPointer: `/${spec.requestField}`,
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
    evidence: [{ evidenceId: 'result', outputPointer: `/${spec.resultField}`, purpose: 'completion' }],
    lifecycle: { idempotency: 'required', recovery: spec.recovery },
  }
}

function sandboxToolContractDocumentJson(spec: SandboxToolSpec): string {
  return JSON.stringify({
    contractFormat: 'ae.capability-contract:v2',
    ...sandboxToolContractMetadata(spec),
    inputSchema: spec.inputSchema,
    outputSchema: spec.outputSchema,
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
 * Publishes the catalog side of a sandbox Tool through the same system
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
  spec: SandboxToolSpec,
  owningAccountRef: string,
  now: number,
): Promise<{ businessId: Id<'businesses'>; origin: SandboxToolCatalogOrigin }> {
  const accessPathRef = sandboxToolAccessPathRef(spec)
  const bundle = buildDevSeedCatalogState([sandboxToolFixture(spec)], owningAccountRef)
  const persisted = await persistDevSeedCatalogState(ctx.db, bundle, owningAccountRef)
  const businessId = persisted.businessIdsBySlug[spec.businessSlug]
  if (businessId === undefined) throw new Error('dev_seed_sandbox_tool_business_missing')
  const offeringRef = bundle.state.offerings[0]?.offeringRef
  if (offeringRef === undefined) throw new Error('dev_seed_sandbox_tool_offering_missing')

  const business = await ctx.db.get(businessId)
  if (business === null) throw new Error('dev_seed_sandbox_tool_business_missing')
  const priced = await seedBusinessOfferings(
    ctx,
    business,
    now,
    { [spec.businessSlug]: spec.pricingSummary },
    { [spec.businessSlug]: spec.offeringPrice },
  )
  if (priced.kind === 'error') throw new Error(`dev_seed_sandbox_tool_pricing_${priced.code}`)

  const offering = await ctx.db.query('businessOfferings')
    .withIndex('by_offeringRef', (query) => query.eq('offeringRef', offeringRef))
    .unique()
  if (offering === null) throw new Error('dev_seed_sandbox_tool_offering_missing')
  const existingPath = await ctx.db.query('offeringAccessPaths')
    .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', accessPathRef))
    .unique()
  if (existingPath === null
    || existingPath.status !== 'published'
    || existingPath.offeringRevision !== offering.currentRevision) {
    const upserted = await upsertOfferingAccessPathCommand(ctx, {
      businessId,
      offeringRef,
      accessPathRef,
      expectedRevision: offering.currentRevision,
      operationKey: `seed:sandbox-tool-access-path:${spec.businessSlug}:${offering.currentRevision}`,
      descriptor: {
        kind: 'external_operation',
        name: spec.label,
        summary: spec.accessPathSummary,
        url: spec.endpointUrl,
        method: spec.method,
        authenticationSummary: spec.authenticationSummary,
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
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', accessPathRef))
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

type SeededSandboxTool = Readonly<{
  created: boolean
  publicationRef: string
  publicationRevision: number
  toolRef: string
}>

/**
 * Publishes one sandbox Tool: catalog origin, publication.
 *
 * The catalog side runs on EVERY invocation: the publication is created once,
 * but the priced Offering revision it binds to and the business's search
 * documents have to be re-asserted on each boot. Readiness is never written
 * here — the hourly `refresh capability supply readiness` workload is the
 * only writer of the readiness fact.
 */
async function publishSeededSandboxTool(
  ctx: MutationCtx,
  spec: SandboxToolSpec,
  owningAccountRef: string,
  now: number,
  prepareBusiness?: (businessId: Id<'businesses'>) => Promise<void>,
): Promise<SeededSandboxTool> {
  const publicationRef = sandboxToolOfferingId(spec)
  const evidenceRefs = [sandboxToolEvidenceRef(spec)]
  const { businessId, origin } = await ensureSandboxToolCatalogOrigin(ctx, spec, owningAccountRef, now)
  if (prepareBusiness !== undefined) await prepareBusiness(businessId)

  const existing = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', publicationRef).eq('revision', 1)
    ))
    .unique()

  const target: SeededSandboxTool = existing !== null
    ? {
        created: false,
        publicationRef: existing.publicationRef,
        publicationRevision: existing.revision,
        toolRef: existing.toolRef,
      }
    : await createSandboxToolPublication(ctx, spec, evidenceRefs, businessId, origin, now)

  return target
}

const seededSandboxToolValue = v.union(
  v.object({ capabilityId: v.string(), toolRef: v.string(), created: v.boolean() }),
  v.object({ capabilityId: v.string(), skipped: v.string() }),
)

export const publishSandboxTool = internalMutation({
  args: {},
  returns: v.object({
    created: v.boolean(),
    publicationId: v.string(),
    publicationRevision: v.number(),
    toolRef: v.string(),
    businessSlug: v.string(),
    tools: v.array(seededSandboxToolValue),
  }),
  handler: async (ctx) => {
    // Same deployment guard the money seed uses: never seed sandbox supply into
    // a deployment whose bypass owner account already carries a production agent.
    await requireLocalE2EOwnerAuthority(ctx)
    await provisionDevSeedCatalogIdentityRows(ctx)
    const authority = await admitDevSeedCatalogAuthority(ctx, 'publishSandboxTool')
    const now = Date.now()

    const referenceEndpointUrl = sandboxReferenceEndpointUrl()
    const reference = referenceEndpointUrl === undefined
      ? undefined
      : await publishSeededSandboxTool(
          ctx,
          sandboxReferenceToolSpec(referenceEndpointUrl),
          authority.accountRef,
          now,
        )
    const testnet = await publishSeededSandboxTestnetTool(ctx, authority.accountRef, now)

    return {
      created: reference?.created ?? false,
      publicationId: reference?.publicationRef ?? '',
      publicationRevision: reference?.publicationRevision ?? 0,
      toolRef: reference?.toolRef ?? '',
      businessSlug: SANDBOX_TOOL_BUSINESS_SLUG,
      tools: [
        reference === undefined
          ? { capabilityId: SANDBOX_TOOL_CAPABILITY_ID, skipped: SANDBOX_REFERENCE_SKIP_SITE_URL_MISSING }
          : { capabilityId: SANDBOX_TOOL_CAPABILITY_ID, toolRef: reference.toolRef, created: reference.created },
        testnet,
      ],
    }
  },
})

/**
 * Seeds the Base Sepolia reference provider Tool, or reports why it was not.
 *
 * A deployment without the reference provider's env has nowhere to send a paid
 * Call, so the Tool is skipped rather than published against a guessed URL: a
 * published Tool that cannot settle is worse than an absent one.
 */
async function publishSeededSandboxTestnetTool(
  ctx: MutationCtx,
  owningAccountRef: string,
  now: number,
): Promise<
  | Readonly<{ capabilityId: string; toolRef: string; created: boolean }>
  | Readonly<{ capabilityId: string; skipped: string }>
> {
  const endpointUrl = sandboxTestnetEndpointUrl()
  if (endpointUrl === undefined) {
    return { capabilityId: SANDBOX_TESTNET_CAPABILITY_ID, skipped: SANDBOX_TESTNET_SKIP_ORIGIN_MISSING }
  }
  const payTo = readSeedEnvironmentValue(SANDBOX_TESTNET_PAY_TO_ENV)
  if (payTo === undefined || !/^0x[0-9a-f]{40}$/iu.test(payTo)) {
    return { capabilityId: SANDBOX_TESTNET_CAPABILITY_ID, skipped: SANDBOX_TESTNET_SKIP_PAY_TO_MISSING }
  }
  const spec = sandboxTestnetToolSpec(endpointUrl, payTo)
  const seeded = await publishSeededSandboxTool(
    ctx,
    spec,
    owningAccountRef,
    now,
    (businessId) => ensureSandboxTestnetProviderConnection(ctx, businessId, endpointUrl, payTo, now),
  )
  return {
    capabilityId: SANDBOX_TESTNET_CAPABILITY_ID,
    toolRef: seeded.toolRef,
    created: seeded.created,
  }
}

/**
 * The credential-less x402 provider connection the binding's authority names.
 *
 * `x402-fetch:v2` never admits a keyless binding (transport-adapters.ts), so a
 * real x402 Tool needs a provider connection row exactly as facilitator
 * discovery mints one for a discovered x402 resource. Nothing secret is stored:
 * the connection carries the resource URL and the payee only.
 */
async function ensureSandboxTestnetProviderConnection(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  endpointUrl: string,
  payTo: string,
  now: number,
): Promise<void> {
  const providerAccountRef = `x402:${endpointUrl}`
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', SANDBOX_TESTNET_CONNECTION_REF))
    .unique()
  if (existing !== null) {
    const connection = toDomain(existing)
    if (connection.lifecycle === 'active'
      && connection.businessId === String(businessId)
      && connection.providerRef === SANDBOX_TESTNET_PROVIDER_REF
      && connection.providerAccountRef === providerAccountRef
      && isCanonicalCredentiallessX402ProviderConnection(connection)) return
    // The fixture moved or was revoked. Say so instead of publishing a Tool
    // bound to authority that no longer describes the endpoint.
    throw new Error('dev_seed_sandbox_testnet_connection_stale')
  }
  const business = await ctx.db.get(businessId)
  if (business === null) throw new Error('dev_seed_sandbox_testnet_business_missing')
  const commandId = `dev-seed:sandbox-testnet-connection:${canonicalDigest({ endpointUrl, payTo }).slice(7)}`
  const created = createX402ProviderConnection({
    commandId,
    connectionRef: SANDBOX_TESTNET_CONNECTION_REF,
    businessId: String(businessId),
    providerRef: SANDBOX_TESTNET_PROVIDER_REF,
    providerAccountRef,
    resourceUrl: endpointUrl,
    method: 'POST',
    payee: payTo,
    evidenceRefs: [`private:evidence:dev-seed:${SANDBOX_TESTNET_BUSINESS_SLUG}`],
    owningAccountRef: business.owningAccountRef,
    installedByPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
    authorityGrantRef: DEV_SEED_CATALOG_GRANT_REF,
    authorityGrantGeneration: 1,
  }, now)
  if (created.kind !== 'applied') {
    throw new Error(`dev_seed_sandbox_testnet_connection_${created.kind === 'refused' ? created.code : created.kind}`)
  }
  await ctx.db.insert(
    'capabilityProviderConnections',
    toRow(created.connection, commandId, created.commandDigest),
  )
}

async function createSandboxToolPublication(
  ctx: MutationCtx,
  spec: SandboxToolSpec,
  evidenceRefs: readonly string[],
  businessId: Id<'businesses'>,
  origin: SandboxToolCatalogOrigin,
  now: number,
): Promise<SeededSandboxTool & Readonly<{ created: true }>> {
  const commercialRelationship = {
    kind: 'none' as const,
    summary: 'Sandbox fixture supply with no commercial influence.',
    influencesEligibility: false,
    influencesInclusion: false,
    influencesOrder: false,
    evidenceRefs: [...evidenceRefs],
  }
  const presentation = {
    label: spec.label,
    summary: spec.summary,
    materialTerms: spec.materialTerms.map((term) => ({ ...term })),
    commercialRelationship,
  }
  // What the Tool publishes. For managed x402 that is `on_request`: the buyer
  // total is a binding Quote, not a listed number.
  const offering = {
    offeringId: sandboxToolOfferingId(spec),
    networkId: SANDBOX_TOOL_NETWORK_ID,
    origin,
    presentation: { ...presentation },
    searchTerms: [...spec.searchTerms],
    registrationEvidenceRefs: [...evidenceRefs],
  }
  const published = await publishCapabilityForSeed(ctx, {
    businessId: String(businessId),
    runtimeEnvironment: 'sandbox',
    source: sandboxToolPublicationSource(spec, presentation, evidenceRefs),
    sourceRevision: sandboxToolSourceRevision(spec),
    pricingConfig: { ...spec.pricingConfig },
    offering,
    // The x402 importer derives its own `x402-fetch:v2` binding from the
    // provider's payment terms; only the envelope Tool declares one here.
    ...(spec.source.kind === 'ae_envelope'
      ? { binding: sandboxToolEnvelopeBinding(spec, spec.source.transport, evidenceRefs) }
      : {}),
    origin,
    operationKey: `seed:sandbox-tool-publish:${spec.businessSlug}:v1`,
    correlationId: `seed:sandbox-tool:${spec.businessSlug}`,
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

function sandboxToolEnvelopeBinding(
  spec: SandboxToolSpec,
  transport: SandboxToolTransport,
  evidenceRefs: readonly string[],
) {
  return {
    bindingId: sandboxToolBindingId(spec),
    endpointUrl: spec.endpointUrl,
    authority: { ...transport.authority },
    continuation: { kind: 'single_response' as const, evidenceRefs: [...evidenceRefs] },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: [...evidenceRefs] },
    adapter: {
      adapterId: transport.adapter.adapterId,
      config: { ...transport.adapter.config },
    },
    registrationEvidenceRefs: [...evidenceRefs],
  }
}

/**
 * The import the publish command normalizes.
 *
 * The x402 importer checks the *submitted* commercial price against the
 * provider's own resource price, so the source carries the atomic USDC amount
 * while the published Offering above carries `on_request`.
 */
function sandboxToolPublicationSource(
  spec: SandboxToolSpec,
  presentation: Readonly<Record<string, unknown>>,
  evidenceRefs: readonly string[],
): unknown {
  const offeringId = sandboxToolOfferingId(spec)
  if (spec.source.kind === 'ae_envelope') {
    return {
      kind: 'ae_envelope',
      documentJson: sandboxToolContractDocumentJson(spec),
      offering: {
        offeringId,
        networkId: SANDBOX_TOOL_NETWORK_ID,
        presentation: { ...presentation },
        searchTerms: [...spec.searchTerms],
        registrationEvidenceRefs: [...evidenceRefs],
      },
      binding: sandboxToolEnvelopeBinding(spec, spec.source.transport, evidenceRefs),
      evidenceRefs: [...evidenceRefs],
    }
  }
  const source = spec.source
  return {
    kind: 'x402',
    resource: {
      resourceUrl: spec.endpointUrl,
      price: { ...source.providerPrice },
      method: spec.method,
      scheme: 'exact',
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      payTo: source.payTo,
      routeAmountExponent: source.providerPrice.exponent,
      assetAmountExponent: source.providerPrice.exponent,
      paymentRequired: source.paymentRequired,
      inputSchema: spec.inputSchema,
      outputSchema: spec.outputSchema,
    },
    contract: sandboxToolContractMetadata(spec),
    commercial: {
      offering: {
        offeringId,
        networkId: SANDBOX_TOOL_NETWORK_ID,
        presentation: { ...presentation, price: { kind: 'fixed', amount: { ...source.providerPrice } } },
        searchTerms: [...spec.searchTerms],
        registrationEvidenceRefs: [...evidenceRefs],
      },
      bindingId: sandboxToolBindingId(spec),
      authority: {
        kind: 'provider_connection',
        connectionRef: source.connectionRef,
        providerRef: source.providerRef,
      },
      registrationEvidenceRefs: [...evidenceRefs],
      requestTimeoutMs: source.requestTimeoutMs,
    },
    evidenceRefs: [...evidenceRefs],
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
