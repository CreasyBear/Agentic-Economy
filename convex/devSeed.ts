import { internalMutation, type MutationCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { internal } from './_generated/api'
import { v } from 'convex/values'

import {
  buildDevSeedCatalogState,
  DEV_SEED_BUSINESS_FIXTURES,
} from '../src/modules/dev/public'
import { persistDevSeedCatalogState } from './devSeedStore'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { AGENT_ACCESS_DEFAULT_APPLICATION_REF } from '@/modules/agent-access/agent-access'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import {
  MAX_ACCESS_PATHS_PER_OFFERING,
  MAX_OFFERINGS_PER_BUSINESS,
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

// Self-healing bootstrap for the local-E2E consent loop's fixed owner-side
// agent credential (ak_local_e2e_owner). The bypass consent flow registers
// per-consent grants for this credential through the normal serviceAuth'd
// registerGrantForServer path, which requires this principal row to exist
// beforehand (convex/agentAccessPolicy.ts). Insert-if-absent via the
// by_principalId unique index, so it is safe to run on every bring-up.
const LOCAL_E2E_OWNER_CREDENTIAL_ID = 'ak_local_e2e_owner'
const LOCAL_E2E_OWNER_PRINCIPAL_ID = `clerk_api_key:${LOCAL_E2E_OWNER_CREDENTIAL_ID}`
const LOCAL_E2E_OWNER_ACCOUNT_REF = 'acc_acce2e0000000000000000000000000'

export const ensureLocalE2EOwnerIdentity = internalMutation({
  args: {},
  returns: v.object({
    kind: v.literal('ensured'),
    created: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const now = Date.now()
    const created: string[] = []
    const principal = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', LOCAL_E2E_OWNER_PRINCIPAL_ID))
      .unique()
    if (principal === null) {
      await ctx.db.insert('agentAccessPrincipals', {
        principalId: LOCAL_E2E_OWNER_PRINCIPAL_ID,
        ownerId: LOCAL_E2E_OWNER_ACCOUNT_REF,
        credentialId: LOCAL_E2E_OWNER_CREDENTIAL_ID,
        applicationRef: AGENT_ACCESS_DEFAULT_APPLICATION_REF,
        environment: 'sandbox',
        scopes: [MARKET_OPERATIONS_INVOKE_SCOPE],
        authorityMode: 'approve_each',
        grantGeneration: 1,
        policyDigest: 'local-e2e-owner-key',
        lifecycle: 'active',
        recordedAt: now,
        lastSeenAt: now,
      })
      created.push('agentAccessPrincipal')
    }
    return { kind: 'ensured' as const, created }
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
    // Reconcile existing capability publications before catalog and offering ingest.
    const bundle = buildDevSeedCatalogState(DEV_SEED_BUSINESS_FIXTURES, authority.accountRef)
    const result = await persistDevSeedCatalogState(ctx.db, bundle, authority.accountRef)
    let offeringSeed: {
      processed: number
      seeded: number
      errors: string[]
      nextCursor: string | null
      done: boolean
    } = await ctx.runMutation(internal.devSeed.seedOfferingSupply, { cursor: null })
    while (true) {
      if (offeringSeed.errors.length > 0) {
        throw new Error(`dev_seed_offering_supply:${offeringSeed.errors.join(',')}`)
      }
      if (offeringSeed.done) break
      if (offeringSeed.nextCursor === null) throw new Error('dev_seed_offering_supply_cursor_missing')
      offeringSeed = await ctx.runMutation(internal.devSeed.seedOfferingSupply, {
        cursor: offeringSeed.nextCursor,
      })
    }
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
    .take(MAX_OFFERINGS_PER_BUSINESS + 1)
  if (offerings.length > MAX_OFFERINGS_PER_BUSINESS) return { kind: 'error', code: 'offering_capacity_exceeded' }
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
}

export const DEV_SEED_PRICE_BY_SLUG: Readonly<Record<string, OfferingPrice>> = Object.fromEntries(
  Object.entries(DEV_SEED_PRICING_BY_SLUG).flatMap(([slug, summary]) => {
    const price = DEV_SEED_PRICE_BY_PRICING_SUMMARY[summary]
    return price === undefined ? [] : [[slug, price]]
  }),
)
