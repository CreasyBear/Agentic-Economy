import { internalMutation, type DatabaseWriter, type MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import schema from './schema'

import {
  buildDevSeedCatalogState,
  DEV_SEED_BUSINESS_FIXTURES,
  DEV_SEED_OWNER_CLERK_USER_ID,
  type DevSeedBusinessFixture,
} from '../src/modules/dev/public'
import { persistDevSeedCatalogState } from './devSeedStore'
import { claimBusinessCommand } from './business'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  ensureCatalogProjectionControlsCommand,
  publishBusinessCatalogCommand,
  readCatalogDescriptor,
  rebuildBusinessSupplyProjectionSnapshotCommand,
  reviseBusinessOfferingCommand,
  upsertOfferingAccessPathCommand,
} from './catalog'
import { seedDiscoveryManifestForBusinessCommand } from './discovery'
import { registerCapabilityContractDocument } from './capabilityContractDocuments'
import { encodeCapabilityContractDocument } from '@/modules/capability-contract-registry/public'
import {
  publishCapabilityForSeed,
  registerCapabilityBindingCommand,
  registerCapabilityOfferingCommand,
  setCapabilitySupplyEligibilityCommand,
} from './capabilitySupply'
import {
  MAX_ACCESS_PATHS_PER_OFFERING,
  MAX_OFFERINGS_PER_BUSINESS,
  type OfferingAccessPathDescriptor,
  type OfferingPrice,
} from '@/modules/catalog/public'
import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import { capabilityOfferingRegistrationHash } from '@/modules/capability-supply/public'
import {
  SANDBOX_PROVIDER_PROFILES,
  SANDBOX_ROUTE_PROVIDER_PROFILES,
  SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT,
  SANDBOX_V2_LEGACY_CAPABILITY_CONTRACT_DOCUMENT,
  SANDBOX_V2_PRIOR_CAPABILITY_CONTRACT_DOCUMENT,
} from '@/modules/sandbox-supply/public'
import {
  SANDBOX_WORKFLOW_PROVIDER_PROFILES,
  historicalItineraryBuilderCapabilityContractDocument,
  historicalProcurementBriefCapabilityContractDocument,
  sandboxWorkflowCapabilityContractDocument,
  type SandboxWorkflowProviderKey,
} from '@/modules/sandbox-supply/workflow-cohorts'
 
type SandboxAuthority = Readonly<{ kind: 'keyless' }>

function sandboxAuthority(_scope: string): SandboxAuthority {
  return { kind: 'keyless' }
}

export const resetDevData = internalMutation({
  args: {},
  returns: v.object({ cleared: v.number(), done: v.boolean() }),
  handler: async (ctx) => {
    let cleared = 0
    const budget = 2000
    for (const table of Object.keys(schema.tables)) {
      if (cleared >= budget) return { cleared, done: false }
      const docs = await ctx.db.query(table as never).take(budget - cleared)
      for (const doc of docs as ReadonlyArray<{ _id: Id<never> }>) {
        await ctx.db.delete(doc._id)
        cleared += 1
      }
    }
    return { cleared, done: cleared === 0 }
  },
})

export const seedDevCatalog = internalMutation({
  args: {},
  returns: v.object({
    seededSlugs: v.array(v.string()),
    ownerClerkUserId: v.string(),
    ownerId: v.string(),
    supportRecordId: v.string(),
    businessIdsBySlug: v.record(v.string(), v.string()),
  }),
  handler: async (ctx) => {
    // Persist the source catalog before linking curated capabilities to its offerings.
    const bundle = buildDevSeedCatalogState(DEV_SEED_BUSINESS_FIXTURES)
    const result = await persistDevSeedCatalogState(ctx.db, bundle)
    // Then port the AE-curated Exa + Frankfurter capabilities through the generic
    // Contract -> Offering -> Binding -> Publication path.
    await ctx.runMutation(internal.curatedProviders.seed, {})
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
    await ctx.scheduler.runAfter(0, internal.devSeed.seedDiscoveryManifests, { cursor: null })
    return {
      ...result,
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
    const now = Date.now()
    if (args.cursor === null) {
      await ensureCatalogProjectionControlsCommand(ctx.db, {
        actorRef: 'system:dev-seed',
        operationKey: 'seed:operator-control',
        correlationId: 'seed:operator-control',
        reasonCode: 'dev_seed_enable',
        evidenceRefs: ['seed:operator-control'],
      }, now)
    }
    const page = await ctx.db.query('businesses').paginate({ cursor: args.cursor, numItems: 10 })
    const errors: string[] = []
    let seeded = 0
    for (const business of page.page) {
      const result = await seedBusinessOfferings(ctx, business, now)
      if (result.kind === 'error') {
        errors.push(`${business.slug}:${result.code}`)
        continue
      }
      seeded += result.seeded
      if (business.slug === 'adelaide-dental-clinic') {
        const callable = await seedAdelaideCheckupAccessPath(ctx, business._id, now)
        if (callable.kind === 'error') errors.push(`${business.slug}:callable_${callable.code}`)
      }
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

async function seedAdelaideCheckupAccessPath(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  now: number,
): Promise<{ kind: 'ok' } | { kind: 'error'; code: string }> {
  const offeringRows = await ctx.db.query('businessOfferings')
    .withIndex('by_businessId_and_status', (query) => query.eq('businessId', businessId).eq('status', 'published'))
    .take(1)
  const offering = offeringRows[0]
  if (offering === undefined) return { kind: 'error', code: 'offering_not_found' }
  const revision = await ctx.db.query('businessOfferingRevisions')
    .withIndex('by_offeringRef_and_revision', (query) => query.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision))

    .unique()
  if (revision === null) return { kind: 'error', code: 'revision_not_found' }
  if (revision.price?.kind !== 'fixed' || revision.price.amount === undefined) {
    return { kind: 'error', code: 'fixed_price_not_found' }
  }
  const siteUrl = process.env.AE_SITE_URL?.trim() || 'https://agentic-economy-phi.vercel.app'
  const accessPathRef = 'access:adelaide-dental-clinic:callable'
  const descriptor: OfferingAccessPathDescriptor = {
    kind: 'external_operation',
    name: revision.name,
    summary: 'Quotes this published offering through the labelled sandbox provider.',
    url: new URL('/api/sandbox/adelaide-dental-clinic/checkup-quote', siteUrl).href,
    method: 'POST',
    pricingSummary: revision.pricingSummary ?? 'Published fixed price.',
    provenance: 'business_declared',
  }
  const business = await ctx.db.get(businessId)
  const owner = business === null ? null : await ctx.db.get(business.ownerId)
  if (owner === null) return { kind: 'error', code: 'owner_not_found' }
  const sourceDb = ctx.db
  const result = await upsertOfferingAccessPathCommand(sourceDb, {
    actorRef: owner.clerkUserId,
    businessId,
    offeringRef: offering.offeringRef,
    accessPathRef,
    expectedRevision: revision.revision,
    operationKey: `seed:access-path:${accessPathRef}:${revision.revision}:${canonicalDigest(descriptor)}`,
    descriptor,
  }, now)
  if (result.kind === 'error') return { kind: 'error', code: result.code }
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(sourceDb, businessId, now)
  const rebuilt = await rebuildBusinessSupplyProjectionSnapshotCommand({
    db: sourceDb,
    sourceDb,
    businessId,
    support,
    now,
  })
  return rebuilt.kind === 'ok'
    ? { kind: 'ok' }
    : { kind: 'error', code: `projection_${rebuilt.code}` }
}
async function seedBusinessOfferings(
  ctx: MutationCtx,
  business: Doc<'businesses'>,
  now: number,
): Promise<{ kind: 'ok'; seeded: number } | { kind: 'error'; code: string }> {
  const offerings = await ctx.db
    .query('businessOfferings')
    .withIndex('by_businessId_and_status', (query) => query.eq('businessId', business._id))
    .take(MAX_OFFERINGS_PER_BUSINESS + 1)
  if (offerings.length > MAX_OFFERINGS_PER_BUSINESS) return { kind: 'error', code: 'offering_capacity_exceeded' }
  const owner = await ctx.db.get(business.ownerId)
  if (owner === null) return { kind: 'error', code: 'owner_not_found' }
  let seeded = 0

  for (const offering of offerings) {
    let revision = await ctx.db
      .query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision)
      ))
      .unique()
    if (revision === null) return { kind: 'error', code: 'revision_not_found' }
    const pricingSummary = DEV_SEED_PRICING_BY_SLUG[business.slug]
    const price = DEV_SEED_PRICE_BY_SLUG[business.slug]
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
        const revised = await reviseBusinessOfferingCommand(ctx.db, {
          actorRef: owner.clerkUserId,
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
        const updated = await upsertOfferingAccessPathCommand(ctx.db, {
          actorRef: owner.clerkUserId,
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

export const seedDiscoveryManifests = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    processed: v.number(),
    generated: v.number(),
    skipped: v.number(),
    nextCursor: v.union(v.string(), v.null()),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const page = await ctx.db.query('businesses').paginate({ cursor: args.cursor, numItems: 10 })
    let generated = 0
    let skipped = 0
    for (const business of page.page) {
      const result = await seedDiscoveryManifestForBusinessCommand(ctx.db, business, now)
      if (result === 'generated') generated += 1
      else skipped += 1
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.devSeed.seedDiscoveryManifests, { cursor: page.continueCursor })
    }
    return { processed: page.page.length, generated, skipped, nextCursor: page.isDone ? null : page.continueCursor, done: page.isDone }
  },
})

export const setSandboxOptionEligibility = internalMutation({
  args: {
    profile: v.union(v.literal('one'), v.literal('two')),
    decision: v.union(v.literal('admit'), v.literal('revoke')),
    operationKey: v.string(),
  },
  returns: v.union(
    v.object({
      kind: v.union(v.literal('eligible'), v.literal('ineligible')),
      offeringId: v.string(),
      bindingId: v.string(),
      eligibilityHash: v.string(),
    }),
    v.object({ kind: v.literal('refused'), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const profile = SANDBOX_PROVIDER_PROFILES[args.profile]
    const [offering, binding] = await Promise.all([
      ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.offeringId))
        .unique(),
      ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', profile.v4BindingId))
        .unique(),
    ])
    if (offering === null || binding === null) {
      return { kind: 'refused' as const, reason: 'sandbox_option_registration_missing' }
    }
    return await setCapabilitySupplyEligibilityCommand(ctx.db, {
      actor: { kind: 'system', ref: 'system:dev-substitution-proof' },
      context: {
        operationKey: args.operationKey,
        correlationId: `dev:substitution:${args.profile}`,
        reasonCode: 'labelled_sandbox_registration_substitution_proof',
        evidenceRefs: ['dev:sandbox-registration-only-substitution'],
      },
      eligibility: {
        offeringId: offering.offeringId,
        bindingId: binding.bindingId,
        contractRef: {
          capabilityId: offering.capabilityId,
          version: offering.version,
          contractDigest: offering.contractDigest,
        },
        decision: args.decision,
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['dev:sandbox-registration-only-substitution'],
        conformanceEvidenceRefs: ['dev:sandbox-registration-only-substitution'],
      },
    }, Date.now())
  },
})

export const seedTestCapabilityPublication = internalMutation({
  args: {},
  returns: v.object({
    publicationRef: v.string(),
    authority: v.union(
      v.object({ kind: v.literal('keyless') }),
      v.object({
        kind: v.literal('provider_connection'),
        connectionRef: v.string(),
        providerRef: v.string(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const profile = SANDBOX_PROVIDER_PROFILES.one
    const [business, initialOffering, initialBinding] = await Promise.all([
      ctx.db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', profile.slug))
        .unique(),
      ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.offeringId))
        .unique(),
      ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', profile.v4BindingId))
        .unique(),
    ])
    let offering = initialOffering
    let binding = initialBinding
    if (business !== null && (offering === null || binding === null)) {
      const registrations = await registerSandboxV2SupplyRegistrations(ctx.db, Date.now())
      await admitSandboxV2Supply(ctx.db, registrations, Date.now() + 500)
      ;[offering, binding] = await Promise.all([
        ctx.db.query('capabilityOfferings')
          .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.offeringId))
          .unique(),
        ctx.db.query('capabilityTransportBindings')
          .withIndex('by_bindingId', (query) => query.eq('bindingId', profile.v4BindingId))
          .unique(),
      ])
    }
    if (business === null || offering === null || binding === null || offering.businessId !== business._id) {
      throw new Error('sandbox_capability_publication_supply_missing')
    }
    const publicationRef = await seedSandboxCapabilityPublication(ctx, {
      slug: profile.slug,
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      contractRef: {
        capabilityId: offering.capabilityId,
        version: offering.version,
        contractDigest: offering.contractDigest,
      },
      offeringRegistrationHash: offering.registrationHash,
      bindingRegistrationHash: binding.registrationHash,
    }, Date.now())
    return { publicationRef, authority: binding.authority }
  },
})

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


export async function seedSandboxCapabilityPublication(
  ctx: MutationCtx,
  registration: SandboxV2SupplyRegistration | undefined,
  observedAt: number,
): Promise<string> {
  if (registration === undefined) throw new Error('sandbox_capability_publication_registration_missing')
  const [business, contract, offering, binding] = await Promise.all([
    ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', registration.slug)).unique(),
    ctx.db.query('capabilityContractDocuments').withIndex('by_capabilityId_and_version', (query) => (
      query.eq('capabilityId', registration.contractRef.capabilityId).eq('version', registration.contractRef.version)
    )).unique(),
    ctx.db.query('capabilityOfferings').withIndex('by_offeringId', (query) => query.eq('offeringId', registration.offeringId)).unique(),
    ctx.db.query('capabilityTransportBindings').withIndex('by_bindingId', (query) => query.eq('bindingId', registration.bindingId)).unique(),
  ])
  if (business === null) throw new Error('sandbox_capability_publication_business_missing')
  if (contract === null) throw new Error('sandbox_capability_publication_contract_missing')
  if (offering === null || binding === null || offering.businessId !== business._id || binding.offeringId !== offering.offeringId) {
    throw new Error('sandbox_capability_publication_registration_missing')
  }
  if (
    offering.registrationHash !== registration.offeringRegistrationHash
    || binding.registrationHash !== registration.bindingRegistrationHash
    || offering.contractDigest !== registration.contractRef.contractDigest
    || binding.contractDigest !== registration.contractRef.contractDigest
  ) throw new Error('sandbox_capability_publication_identity_mismatch')
  const result = await publishCapabilityForSeed(ctx, {
    businessId: business._id,
    source: { kind: 'ae_envelope', documentJson: contract.documentJson },
    offering: {
      offeringId: offering.offeringId,
      networkId: offering.networkId,
      ...(offering.origin === undefined ? {} : { origin: offering.origin }),
      presentation: offering.presentation,
      searchTerms: offering.searchTerms,
      registrationEvidenceRefs: offering.registrationEvidenceRefs,
    },
    binding: {
      bindingId: binding.bindingId,
      endpointUrl: binding.endpointUrl,
      authority: binding.authority,
      continuation: binding.continuation,
      cancellation: binding.cancellation,
      adapter: { adapterId: binding.adapterId, config: JSON.parse(binding.configJson) },
      registrationEvidenceRefs: binding.registrationEvidenceRefs,
    },
    operationKey: `seed:capability-publication:${registration.offeringId}`,
    correlationId: `seed:capability-publication:${registration.slug}`,
    reasonCode: 'labelled_sandbox_capability_publication',
    evidenceRefs: ['seed:sandbox-labelled-business'],
    now: observedAt,
  })
  if (result.kind !== 'published') {
    throw new Error(`sandbox_capability_publication_${result.reason}`)
  }
  return result.publicationRef
}

export async function registerSandboxBusinesses(
  db: DatabaseWriter,
  fixtures: readonly DevSeedBusinessFixture[],
  registeredAt: number,
): Promise<{ seededSlugs: string[]; businessIdsBySlug: Record<string, string> }> {
  await ensureCatalogProjectionControlsCommand(db, {
    actorRef: 'system:dev-seed',
    operationKey: 'seed:operator-control',
    correlationId: 'seed:operator-control',
    reasonCode: 'dev_seed_enable',
    evidenceRefs: ['seed:operator-control'],
  }, registeredAt)
  const businessIdsBySlug: Record<string, string> = {}
  for (const [index, fixture] of fixtures.entries()) {
    const now = registeredAt + index * 1_000
    const actor = {
      kind: 'authenticated_owner' as const,
      clerkUserId: DEV_SEED_OWNER_CLERK_USER_ID,
      displayName: 'Dev Seed Owner',
    }
    const claim = await claimBusinessCommand(db, {
      actor,
      facts: {
        name: fixture.businessName,
        category: fixture.category,
        suburb: fixture.suburb,
        stateTerritory: fixture.stateTerritory,
        requestedSlug: fixture.requestedSlug,
        ...(fixture.publishedPhone === undefined ? {} : { publishedPhone: fixture.publishedPhone }),
        ownerMessage: fixture.ownerMessage,
        sourceRefs: [{
          label: fixture.sourceLabel,
          evidenceRef: `private:evidence:dev-seed:${fixture.requestedSlug}`,
          sourceHash: canonicalDigest(`dev-seed:${fixture.requestedSlug}`),
        }],
      },
      operationKey: `seed:claim:${fixture.requestedSlug}`,
      correlationId: `seed:claim:${fixture.requestedSlug}`,
    }, now)
    if (claim.kind !== 'ok') {
      throw new Error(`sandbox_business_claim_${claim.code}:${fixture.requestedSlug}:${claim.reason}`)
    }

    const services = fixture.offerings.map((offering) => ({
      name: offering.name,
      category: offering.category,
      summary: offering.summary,
      serviceArea: offering.serviceAreaSummary,
      hoursOrUnknown: offering.availabilitySummary,
      firstRequest: offering.firstRequestMode === 'not_available_yet'
        ? {
            mode: offering.firstRequestMode,
            publicChannel: 'not_available' as const,
            noContactReason: offering.noContactReason,
          }
        : {
            mode: offering.firstRequestMode,
            publicChannel: 'ae_status_only' as const,
            publicDisclosure: offering.publicDisclosure,
          },
    }))
    const catalogOperationKey = `seed:catalog:${fixture.requestedSlug}:${canonicalDigest(services)}`
    const published = await publishBusinessCatalogCommand(db, {
      actor,
      claimId: claim.claim.claimId,
      operationKey: catalogOperationKey,
      correlationId: catalogOperationKey,
      services,
    }, now + 500)
    if (published.kind === 'ok') {
      businessIdsBySlug[fixture.requestedSlug] = published.business.businessId
    } else if (published.code === 'catalog_publish_operation_conflict' && claim.claim.businessId !== undefined) {
      businessIdsBySlug[fixture.requestedSlug] = claim.claim.businessId
    } else {
      throw new Error(`sandbox_business_publish_${published.code}:${fixture.requestedSlug}:${published.reason}`)
    }
  }
  return { seededSlugs: fixtures.map((fixture) => fixture.requestedSlug), businessIdsBySlug }
}

export type SandboxV2SupplyRegistration = {
  slug: string
  offeringId: string
  bindingId: string
  contractRef: CapabilityContractRef
  offeringRegistrationHash: string
  bindingRegistrationHash: string
}

export async function registerSandboxV2SupplyRegistrations(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  registeredAt: number,
): Promise<SandboxV2SupplyRegistration[]> {
  const encoded = encodeCapabilityContractDocument(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT)
  const contract = await registerCapabilityContractDocument(db, encoded.documentJson, registeredAt)
  if (contract.kind !== 'registered') throw new Error(`sandbox_v2_contract_registration_${contract.reason}`)
  const siteUrl = process.env.AE_SITE_URL?.trim() || 'https://agentic-economy-phi.vercel.app'
  const registered: SandboxV2SupplyRegistration[] = []
  for (const [profileKey, profile] of Object.entries(SANDBOX_PROVIDER_PROFILES)) {
    const business = await db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', profile.slug)).unique()
    if (business === null) throw new Error(`sandbox_v2_business_missing_${profile.slug}`)
    const commandContext = {
      correlationId: `seed:capability-supply:${profile.slug}`,
      reasonCode: 'labelled_sandbox_source_registration',
      evidenceRefs: ['seed:sandbox-labelled-business'],
    }
    const offering = await registerCapabilityOfferingCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: { ...commandContext, operationKey: `seed:capability-offering:${profile.offeringId}` },
      registration: {
        offeringId: profile.offeringId,
        businessId: business._id,
        networkId: 'ae:public',
        contractRef: contract.ref,
        presentation: {
          label: profile.label,
          summary: 'Labelled sandbox supply for source and contract verification only.',
          price: { kind: 'fixed', amount: profile.amount },
          materialTerms: [{ termId: 'sandbox_only', label: 'Environment', value: 'Sandbox only; not real supply.' }],
          commercialRelationship: {
            kind: 'none',
            summary: 'Sandbox verification has no payment, sponsorship, rebate, or ownership relationship.',
            influencesEligibility: false,
            influencesInclusion: false,
            influencesOrder: false,
            evidenceRefs: ['seed:sandbox-commercial-neutrality'],
          },
        },
        searchTerms: [...profile.queryTerms],
        registrationEvidenceRefs: ['seed:sandbox-labelled-business'],
      },
    }, registeredAt)
    if (offering.kind !== 'registered') throw new Error(`sandbox_v2_offering_registration_${offering.reason}`)
    const binding = await registerCapabilityBindingCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: { ...commandContext, operationKey: `seed:capability-binding:${profile.v4BindingId}` },
      registration: {
        bindingId: profile.v4BindingId,
        offeringId: profile.offeringId,
        networkId: 'ae:public',
        contractRef: contract.ref,
        endpointUrl: new URL(`/api/sandbox/capability?profile=${profileKey}&binding=v5`, siteUrl).href,
        authority: sandboxAuthority(profileKey),
        continuation: { kind: 'single_response', evidenceRefs: ['seed:sandbox-single-response'] },
        cancellation: { kind: 'unsupported', evidenceRefs: ['seed:sandbox-no-cancellation'] },
        adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
        registrationEvidenceRefs: ['seed:production-v2-registration-path'],
      },
    }, registeredAt)
    if (binding.kind !== 'registered') throw new Error(`sandbox_v2_binding_registration_${binding.reason}`)
    registered.push({
      slug: profile.slug,
      offeringId: profile.offeringId,
      bindingId: binding.bindingId,
      contractRef: contract.ref,
      offeringRegistrationHash: offering.registrationHash,
      bindingRegistrationHash: binding.registrationHash,
    })
  }
  return registered
}

export async function registerSandboxRouteSupplyRegistrations(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  registeredAt: number,
): Promise<SandboxV2SupplyRegistration[]> {
  return await Promise.all(Object.values(SANDBOX_ROUTE_PROVIDER_PROFILES).map(async (profile) => {
    const providerOrigin = sandboxRouteProviderOrigin(profile)
    const encoded = encodeCapabilityContractDocument(profile.contract)
    const [contract, business] = await Promise.all([
      registerCapabilityContractDocument(db, encoded.documentJson, registeredAt),
      db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', profile.slug)).unique(),
    ])
    if (contract.kind !== 'registered') throw new Error(`sandbox_route_contract_registration_${contract.reason}`)
    if (business === null) throw new Error(`sandbox_route_business_missing_${profile.slug}`)
    const commandContext = {
      correlationId: `seed:capability-supply:${profile.slug}`,
      reasonCode: 'labelled_sandbox_route_registration',
      evidenceRefs: ['seed:sandbox-labelled-business'],
    }
    const offering = await registerCapabilityOfferingCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: { ...commandContext, operationKey: `seed:capability-offering:${profile.offeringId}` },
      registration: {
        offeringId: profile.offeringId, businessId: business._id, networkId: 'ae:public',
        contractRef: contract.ref,
        presentation: {
          label: profile.label,
          summary: 'Labelled sandbox route supply for source and contract verification only.',
          price: { kind: 'fixed', amount: profile.amount },
          materialTerms: [{ termId: 'sandbox_only', label: 'Environment', value: 'Sandbox only; not real supply.' }],
          commercialRelationship: {
            kind: 'none', summary: 'Sandbox verification has no commercial relationship.',
            influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
            evidenceRefs: ['seed:sandbox-commercial-neutrality'],
          },
        },
        searchTerms: [...profile.queryTerms], registrationEvidenceRefs: ['seed:sandbox-labelled-business'],
      },
    }, registeredAt)
    if (offering.kind !== 'registered') throw new Error(`sandbox_route_offering_registration_${offering.reason}`)
    const binding = await registerCapabilityBindingCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: { ...commandContext, operationKey: `seed:capability-binding:${profile.bindingId}` },
      registration: {
        bindingId: profile.bindingId, offeringId: profile.offeringId, networkId: 'ae:public',
        contractRef: contract.ref,
        endpointUrl: new URL(profile.endpointPath, providerOrigin).href,
        authority: sandboxAuthority(profile.slug.replace(/^sandbox-/, '')),
        continuation: { kind: 'single_response', evidenceRefs: ['seed:sandbox-single-response'] },
        cancellation: profile === SANDBOX_ROUTE_PROVIDER_PROFILES.resolver
          ? { kind: 'adapter_managed', evidenceRefs: ['seed:sandbox-adapter-cancellation'] }
          : { kind: 'unsupported', evidenceRefs: ['seed:sandbox-no-cancellation'] },
        adapter: {
          adapterId: 'http-json:v1',
          config: profile === SANDBOX_ROUTE_PROVIDER_PROFILES.resolver
            ? {
                method: 'POST',
                requestTimeoutMs: 5_000,
                cancellation: { path: profile.endpointPath, requestTimeoutMs: 3_000 },
              }
            : { method: 'POST', requestTimeoutMs: 5_000 },
        },
        registrationEvidenceRefs: ['seed:production-v2-registration-path'],
      },
    }, registeredAt)
    if (binding.kind !== 'registered') throw new Error(`sandbox_route_binding_registration_${binding.reason}`)
    return {
      slug: profile.slug, offeringId: profile.offeringId, bindingId: binding.bindingId,
      contractRef: contract.ref, offeringRegistrationHash: offering.registrationHash,
      bindingRegistrationHash: binding.registrationHash,
    }
  }))
}

function sandboxRouteProviderOrigin(
  profile: (typeof SANDBOX_ROUTE_PROVIDER_PROFILES)[keyof typeof SANDBOX_ROUTE_PROVIDER_PROFILES],
): string {
  const profileOrigin = profile === SANDBOX_ROUTE_PROVIDER_PROFILES.resolver
    ? process.env.AE_SANDBOX_ROUTE_RESOLVER_ORIGIN?.trim()
    : process.env.AE_SANDBOX_ROUTE_QUOTER_ORIGIN?.trim()
  return profileOrigin
    || process.env.AE_SANDBOX_PROVIDER_ORIGIN?.trim()
    || process.env.AE_SITE_URL?.trim()
    || 'https://agentic-economy-phi.vercel.app'
}

export async function registerSandboxWorkflowSupplyRegistrations(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  registeredAt: number,
  cohortIds: readonly string[] = [
    'procurement',
    'itinerary',
    'public-event-activation',
    'journey-management',
  ],
): Promise<SandboxV2SupplyRegistration[]> {
  const workflowProfiles = Object.entries(SANDBOX_WORKFLOW_PROVIDER_PROFILES)
    .filter(([, profile]) => cohortIds.includes(profile.cohortId))
  const siteUrl = process.env.AE_SANDBOX_WORKFLOW_ORIGIN?.trim()
    || process.env.AE_SANDBOX_ROUTE_RESOLVER_ORIGIN?.trim()
    || process.env.AE_SITE_URL?.trim()
    || 'https://agentic-economy-phi.vercel.app'
  const registered: SandboxV2SupplyRegistration[] = []
  for (const [providerKey, profile] of workflowProfiles) {
    const document = sandboxWorkflowCapabilityContractDocument(providerKey as SandboxWorkflowProviderKey)
    const encoded = encodeCapabilityContractDocument(document)
    const [contract, business] = await Promise.all([
      registerCapabilityContractDocument(db, encoded.documentJson, registeredAt),
      db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', profile.slug)).unique(),
    ])
    if (contract.kind !== 'registered') throw new Error(`sandbox_workflow_contract_registration_${contract.reason}`)
    if (business === null) throw new Error(`sandbox_workflow_business_missing_${profile.slug}`)
    const commandContext = {
      correlationId: `seed:capability-supply:${profile.slug}`,
      reasonCode: 'labelled_sandbox_workflow_registration',
      evidenceRefs: ['seed:sandbox-labelled-workflow-business'],
    }
    const offering = await registerCapabilityOfferingCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: { ...commandContext, operationKey: `seed:capability-offering:${profile.offeringId}` },
      registration: {
        offeringId: profile.offeringId,
        businessId: business._id,
        networkId: 'ae:public',
        contractRef: contract.ref,
        presentation: {
          label: profile.capabilityName,
          summary: `Labelled sandbox ${profile.cohortLabel.toLowerCase()} workflow evidence only.`,
          price: { kind: 'fixed', amount: profile.amount },
          materialTerms: [{
            termId: 'sandbox_only',
            label: 'Environment',
            value: 'Sandbox only; no real supplier order, payment, or fulfilment.',
          }],
          commercialRelationship: {
            kind: 'none',
            summary: 'Sandbox verification has no commercial relationship.',
            influencesEligibility: false,
            influencesInclusion: false,
            influencesOrder: false,
            evidenceRefs: ['seed:sandbox-commercial-neutrality'],
          },
        },
        searchTerms: [
          profile.cohortLabel,
          profile.capabilityName,
          'workplace catering supplier recommendation',
        ],
        registrationEvidenceRefs: ['seed:sandbox-labelled-workflow-business'],
      },
    }, registeredAt)
    if (offering.kind !== 'registered') throw new Error(`sandbox_workflow_offering_registration_${offering.reason}`)
    const binding = await registerCapabilityBindingCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: { ...commandContext, operationKey: `seed:capability-binding:${profile.bindingId}` },
      registration: {
        bindingId: profile.bindingId,
        offeringId: profile.offeringId,
        networkId: 'ae:public',
        contractRef: contract.ref,
        endpointUrl: new URL(profile.endpointPath, siteUrl).href,
        authority: sandboxAuthority(providerKey),
        continuation: { kind: 'single_response', evidenceRefs: ['seed:sandbox-single-response'] },
        cancellation: { kind: 'unsupported', evidenceRefs: ['seed:sandbox-no-cancellation'] },
        adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
        registrationEvidenceRefs: ['seed:production-v2-registration-path'],
      },
    }, registeredAt)
    if (binding.kind !== 'registered') throw new Error(`sandbox_workflow_binding_registration_${binding.reason}`)
    registered.push({
      slug: profile.slug,
      offeringId: profile.offeringId,
      bindingId: binding.bindingId,
      contractRef: contract.ref,
      offeringRegistrationHash: offering.registrationHash,
      bindingRegistrationHash: binding.registrationHash,
    })
  }
  return registered
}

export async function admitSandboxV2Supply(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  registrations: readonly SandboxV2SupplyRegistration[],
  admittedAt: number,
): Promise<string[]> {
  const admitted: string[] = []
  for (const registration of registrations) {
    const eligibility = await setCapabilitySupplyEligibilityCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: {
        correlationId: `seed:capability-supply:${registration.slug}`,
        operationKey: `seed:capability-eligibility:${registration.bindingId}`,
        reasonCode: 'labelled_sandbox_source_registration',
        evidenceRefs: ['seed:sandbox-labelled-business'],
      },
      eligibility: {
        offeringId: registration.offeringId,
        bindingId: registration.bindingId,
        contractRef: registration.contractRef,
        decision: 'admit',
        expectedOfferingRegistrationHash: registration.offeringRegistrationHash,
        expectedBindingRegistrationHash: registration.bindingRegistrationHash,
        admissionEvidenceRefs: ['seed:sandbox-business-published', 'seed:sandbox-contract-reviewed'],
        conformanceEvidenceRefs: ['seed:sandbox-http-json-conformance'],
      },
    }, admittedAt)
    if (eligibility.kind !== 'eligible') throw new Error(`sandbox_v2_eligibility_${eligibility.kind}`)
    admitted.push(registration.bindingId)
  }
  return admitted
}

export async function retireSandboxV2AcceptanceSupply(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  registrations: readonly SandboxV2SupplyRegistration[],
  retiredAt: number,
): Promise<string[]> {
  const retired: string[] = []
  for (const registration of registrations) {
    const result = await setCapabilitySupplyEligibilityCommand(db, {
      actor: { kind: 'system', ref: 'system:release-proof' },
      context: {
        correlationId: `seed:capability-supply:${registration.slug}`,
        operationKey: `seed:capability-eligibility-retire:${registration.bindingId}`,
        reasonCode: 'labelled_sandbox_acceptance_route_replaced',
        evidenceRefs: ['seed:sandbox-route-acceptance-supersedes-options'],
      },
      eligibility: {
        offeringId: registration.offeringId,
        bindingId: registration.bindingId,
        contractRef: registration.contractRef,
        decision: 'revoke',
        expectedOfferingRegistrationHash: registration.offeringRegistrationHash,
        expectedBindingRegistrationHash: registration.bindingRegistrationHash,
        admissionEvidenceRefs: ['seed:sandbox-route-acceptance-supersedes-options'],
        conformanceEvidenceRefs: ['seed:sandbox-route-acceptance-supersedes-options'],
      },
    }, retiredAt)
    if (result.kind !== 'ineligible') throw new Error(`sandbox_v2_acceptance_retirement_${result.kind}`)
    retired.push(registration.bindingId)
  }
  return retired
}

export async function retireSupersededSandboxRouteSupply(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  registrations: readonly SandboxV2SupplyRegistration[],
  retiredAt: number,
): Promise<string[]> {
  const retired: string[] = []
  const siteUrl = process.env.AE_SITE_URL?.trim() || 'https://agentic-economy-phi.vercel.app'
  const priorSharedProviderOrigin = process.env.AE_SANDBOX_PROVIDER_ORIGIN?.trim() || siteUrl
  const registrationsBySlug = new Map(registrations.map((registration) => [registration.slug, registration]))
  for (const [routeKey, profile] of Object.entries(SANDBOX_ROUTE_PROVIDER_PROFILES)) {
    const corrected = registrationsBySlug.get(profile.slug)
    if (corrected === undefined) throw new Error(`sandbox_route_corrected_registration_missing_${profile.slug}`)
    const contractRef = encodeCapabilityContractDocument(profile.contract).contract.ref
    const business = await db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', profile.slug)).unique()
    const historical = [
      {
        offeringId: profile.priorOfferingId,
        bindingId: profile.priorBindingId,
        endpointUrl: new URL(`/api/sandbox/capability?route=${routeKey}`, siteUrl).href,
      },
      {
        offeringId: profile.priorV2OfferingId,
        bindingId: profile.priorV2BindingId,
        endpointUrl: new URL(profile.endpointPath, siteUrl).href,
      },
      {
        offeringId: profile.priorV3OfferingId,
        bindingId: profile.priorV3BindingId,
        endpointUrl: new URL(profile.endpointPath, priorSharedProviderOrigin).href,
      },
      {
        offeringId: profile.priorV4OfferingId,
        bindingId: profile.priorV4BindingId,
        endpointUrl: new URL(profile.endpointPath, profile === SANDBOX_ROUTE_PROVIDER_PROFILES.resolver
          ? process.env.AE_SANDBOX_ROUTE_RESOLVER_V4_ORIGIN?.trim() || priorSharedProviderOrigin
          : process.env.AE_SANDBOX_ROUTE_QUOTER_V4_ORIGIN?.trim() || priorSharedProviderOrigin).href,
      },
      ...('priorV5OfferingId' in profile ? [{
        offeringId: profile.priorV5OfferingId,
        bindingId: profile.priorV5BindingId,
        endpointUrl: new URL(profile.endpointPath, process.env.AE_SANDBOX_ROUTE_RESOLVER_ORIGIN?.trim()
          || process.env.AE_SANDBOX_PROVIDER_ORIGIN?.trim()
          || siteUrl).href,
      }] : []),
    ] as const
    for (const expected of historical) {
      const [offering, binding] = await Promise.all([
        db.query('capabilityOfferings')
          .withIndex('by_offeringId', (query) => query.eq('offeringId', expected.offeringId)).unique(),
        db.query('capabilityTransportBindings')
          .withIndex('by_bindingId', (query) => query.eq('bindingId', expected.bindingId)).unique(),
      ])
      if (offering === null && binding === null) continue
      const expectedOfferingRegistrationHash = business === null ? undefined : capabilityOfferingRegistrationHash({
        offeringId: expected.offeringId, businessId: business._id, networkId: 'ae:public', contractRef,
        presentation: {
          label: profile.label,
          summary: 'Labelled sandbox route supply for source and contract verification only.',
          price: { kind: 'fixed', amount: profile.amount },
          materialTerms: [{ termId: 'sandbox_only', label: 'Environment', value: 'Sandbox only; not real supply.' }],
          commercialRelationship: {
            kind: 'none', summary: 'Sandbox verification has no commercial relationship.',
            influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
            evidenceRefs: ['seed:sandbox-commercial-neutrality'],
          },
        },
        searchTerms: [...profile.queryTerms], registrationEvidenceRefs: ['seed:sandbox-labelled-business'],
      })
      if (
      offering === null
      || binding === null
      || business === null
      || offering.businessId !== business._id
      || offering.networkId !== 'ae:public'
      || offering.capabilityId !== contractRef.capabilityId
      || offering.version !== contractRef.version
      || offering.contractDigest !== contractRef.contractDigest
      || offering.registrationHash !== expectedOfferingRegistrationHash
      || binding.offeringId !== expected.offeringId
      || binding.networkId !== 'ae:public'
      || binding.capabilityId !== contractRef.capabilityId
      || binding.version !== contractRef.version
      || binding.contractDigest !== contractRef.contractDigest
      || binding.endpointUrl !== expected.endpointUrl
      || binding.authority.kind !== 'keyless'
      || binding.adapterId !== 'http-json:v1'
      || binding.configJson !== '{"method":"POST","requestTimeoutMs":5000}'
      || binding.configDigest !== canonicalDigest({ method: 'POST', requestTimeoutMs: 5_000 })
      || binding.continuation.kind !== 'single_response'
      || binding.continuation.evidenceRefs.length !== 1
      || binding.continuation.evidenceRefs[0] !== 'seed:sandbox-single-response'
      || binding.cancellation.kind !== 'unsupported'
      || binding.cancellation.evidenceRefs.length !== 1
      || binding.cancellation.evidenceRefs[0] !== 'seed:sandbox-no-cancellation'
      || binding.registrationEvidenceRefs.length !== 1
      || binding.registrationEvidenceRefs[0] !== 'seed:production-v2-registration-path'
      ) throw new Error(`sandbox_route_historical_identity_mismatch_${expected.bindingId}`)
      const evidenceRef = 'seed:sandbox-distinct-provider-origins'
      const result = await setCapabilitySupplyEligibilityCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: {
        operationKey: `seed:capability-route-binding-retire:${expected.bindingId}`,
        correlationId: `seed:capability-supply:${profile.slug}`,
        reasonCode: 'labelled_sandbox_route_binding_replaced', evidenceRefs: [evidenceRef],
      },
      eligibility: {
        offeringId: offering.offeringId, bindingId: binding.bindingId, contractRef,
        decision: 'revoke',
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: [evidenceRef], conformanceEvidenceRefs: [evidenceRef],
      },
      }, retiredAt)
      if (result.kind !== 'ineligible') {
        throw new Error(`sandbox_route_historical_retirement_${result.kind}`)
      }
      retired.push(binding.bindingId)
    }
  }
  return retired
}

export async function retireSupersededSandboxProcurementSupply(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  registrations: readonly SandboxV2SupplyRegistration[],
  retiredAt: number,
): Promise<string[]> {
  const retired: string[] = []
  const historicalSiteOrigin = process.env.AE_SITE_URL?.trim()
    || 'https://agentic-economy-phi.vercel.app'
  const historicalWorkflowOrigin = process.env.AE_SANDBOX_WORKFLOW_ORIGIN?.trim()
    || process.env.AE_SANDBOX_ROUTE_RESOLVER_ORIGIN?.trim()
    || historicalSiteOrigin
  const registrationsBySlug = new Map(registrations.map((registration) => [registration.slug, registration]))
  const procurementProfiles = Object.entries(SANDBOX_WORKFLOW_PROVIDER_PROFILES)
    .filter(([, profile]) => profile.cohortId === 'procurement')
  for (const [providerKey, profile] of procurementProfiles) {
    if (registrationsBySlug.get(profile.slug) === undefined) {
      throw new Error(`sandbox_workflow_corrected_registration_missing_${profile.slug}`)
    }
    const document = providerKey === 'procurement-brief'
      ? historicalProcurementBriefCapabilityContractDocument()
      : sandboxWorkflowCapabilityContractDocument(providerKey as SandboxWorkflowProviderKey)
    const historicalOrigin = providerKey === 'procurement-brief'
      ? historicalWorkflowOrigin
      : historicalSiteOrigin
    const contractRef = encodeCapabilityContractDocument(document).contract.ref
    const [business, offering, binding] = await Promise.all([
      db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', profile.slug)).unique(),
      db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.priorOfferingId)).unique(),
      db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', profile.priorBindingId)).unique(),
    ])
    if (offering === null && binding === null) continue
    const expectedOfferingRegistrationHash = business === null ? undefined : capabilityOfferingRegistrationHash({
      offeringId: profile.priorOfferingId,
      businessId: business._id,
      networkId: 'ae:public',
      contractRef,
      presentation: {
        label: profile.capabilityName,
        summary: `Labelled sandbox ${profile.cohortLabel.toLowerCase()} workflow evidence only.`,
        price: { kind: 'fixed', amount: profile.amount },
        materialTerms: [{
          termId: 'sandbox_only',
          label: 'Environment',
          value: 'Sandbox only; no real supplier order, payment, or fulfilment.',
        }],
        commercialRelationship: {
          kind: 'none',
          summary: 'Sandbox verification has no commercial relationship.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: ['seed:sandbox-commercial-neutrality'],
        },
      },
      searchTerms: [
        profile.cohortLabel,
        profile.capabilityName,
        'workplace catering supplier recommendation',
      ],
      registrationEvidenceRefs: ['seed:sandbox-labelled-workflow-business'],
    })
    if (
      business === null
      || offering === null
      || binding === null
      || offering.businessId !== business._id
      || offering.networkId !== 'ae:public'
      || offering.capabilityId !== contractRef.capabilityId
      || offering.version !== contractRef.version
      || offering.contractDigest !== contractRef.contractDigest
      || offering.registrationHash !== expectedOfferingRegistrationHash
      || binding.offeringId !== profile.priorOfferingId
      || binding.networkId !== 'ae:public'
      || binding.capabilityId !== contractRef.capabilityId
      || binding.version !== contractRef.version
      || binding.contractDigest !== contractRef.contractDigest
      || binding.endpointUrl !== new URL(profile.endpointPath, historicalOrigin).href
      || binding.authority.kind !== 'keyless'
      || binding.adapterId !== 'http-json:v1'
      || binding.configJson !== '{"method":"POST","requestTimeoutMs":5000}'
      || binding.configDigest !== canonicalDigest({ method: 'POST', requestTimeoutMs: 5_000 })
      || binding.continuation.kind !== 'single_response'
      || binding.continuation.evidenceRefs.length !== 1
      || binding.continuation.evidenceRefs[0] !== 'seed:sandbox-single-response'
      || binding.cancellation.kind !== 'unsupported'
      || binding.cancellation.evidenceRefs.length !== 1
      || binding.cancellation.evidenceRefs[0] !== 'seed:sandbox-no-cancellation'
      || binding.registrationEvidenceRefs.length !== 1
      || binding.registrationEvidenceRefs[0] !== 'seed:production-v2-registration-path'
    ) throw new Error(`sandbox_workflow_historical_identity_mismatch_${profile.priorBindingId}`)
    const evidenceRef = 'seed:sandbox-workflow-origin-replaced'
    const result = await setCapabilitySupplyEligibilityCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: {
        operationKey: `seed:capability-workflow-binding-retire:${profile.priorBindingId}`,
        correlationId: `seed:capability-supply:${profile.slug}`,
        reasonCode: 'labelled_sandbox_workflow_binding_replaced',
        evidenceRefs: [evidenceRef],
      },
      eligibility: {
        offeringId: offering.offeringId,
        bindingId: binding.bindingId,
        contractRef,
        decision: 'revoke',
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: [evidenceRef],
        conformanceEvidenceRefs: [evidenceRef],
      },
    }, retiredAt)
    if (result.kind !== 'ineligible') {
      throw new Error(`sandbox_workflow_historical_retirement_${result.kind}`)
    }
    retired.push(binding.bindingId)
  }
  return retired
}

export async function retireSupersededSandboxItineraryBuilderSupply(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  registrations: readonly SandboxV2SupplyRegistration[],
  retiredAt: number,
): Promise<string[]> {
  const profile = SANDBOX_WORKFLOW_PROVIDER_PROFILES['itinerary-builder']
  if (profile === undefined) throw new Error('sandbox_workflow_provider_unknown:itinerary-builder')
  if (registrations.every((registration) => registration.slug !== profile.slug)) {
    throw new Error(`sandbox_workflow_corrected_registration_missing_${profile.slug}`)
  }
  const contractRef = encodeCapabilityContractDocument(
    historicalItineraryBuilderCapabilityContractDocument(),
  ).contract.ref
  const historicalOrigin = process.env.AE_SANDBOX_WORKFLOW_ORIGIN?.trim()
    || process.env.AE_SANDBOX_ROUTE_RESOLVER_ORIGIN?.trim()
    || process.env.AE_SITE_URL?.trim()
    || 'https://agentic-economy-phi.vercel.app'
  const [business, offering, binding] = await Promise.all([
    db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', profile.slug)).unique(),
    db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.priorOfferingId)).unique(),
    db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', profile.priorBindingId)).unique(),
  ])
  if (offering === null && binding === null) return []
  const expectedOfferingRegistrationHash = business === null ? undefined : capabilityOfferingRegistrationHash({
    offeringId: profile.priorOfferingId,
    businessId: business._id,
    networkId: 'ae:public',
    contractRef,
    presentation: {
      label: profile.capabilityName,
      summary: `Labelled sandbox ${profile.cohortLabel.toLowerCase()} workflow evidence only.`,
      price: { kind: 'fixed', amount: profile.amount },
      materialTerms: [{
        termId: 'sandbox_only', label: 'Environment',
        value: 'Sandbox only; no real supplier order, payment, or fulfilment.',
      }],
      commercialRelationship: {
        kind: 'none', summary: 'Sandbox verification has no commercial relationship.',
        influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
        evidenceRefs: ['seed:sandbox-commercial-neutrality'],
      },
    },
    searchTerms: [profile.cohortLabel, profile.capabilityName, 'workplace catering supplier recommendation'],
    registrationEvidenceRefs: ['seed:sandbox-labelled-workflow-business'],
  })
  if (
    business === null || offering === null || binding === null
    || offering.businessId !== business._id
    || offering.networkId !== 'ae:public'
    || offering.capabilityId !== contractRef.capabilityId
    || offering.version !== contractRef.version
    || offering.contractDigest !== contractRef.contractDigest
    || offering.registrationHash !== expectedOfferingRegistrationHash
    || binding.offeringId !== profile.priorOfferingId
    || binding.networkId !== 'ae:public'
    || binding.capabilityId !== contractRef.capabilityId
    || binding.version !== contractRef.version
    || binding.contractDigest !== contractRef.contractDigest
    || binding.endpointUrl !== new URL(profile.endpointPath, historicalOrigin).href
    || binding.authority.kind !== 'keyless'
    || binding.adapterId !== 'http-json:v1'
    || binding.configJson !== '{"method":"POST","requestTimeoutMs":5000}'
    || binding.configDigest !== canonicalDigest({ method: 'POST', requestTimeoutMs: 5_000 })
    || binding.continuation.kind !== 'single_response'
    || binding.continuation.evidenceRefs.length !== 1
    || binding.continuation.evidenceRefs[0] !== 'seed:sandbox-single-response'
    || binding.cancellation.kind !== 'unsupported'
    || binding.cancellation.evidenceRefs.length !== 1
    || binding.cancellation.evidenceRefs[0] !== 'seed:sandbox-no-cancellation'
    || binding.registrationEvidenceRefs.length !== 1
    || binding.registrationEvidenceRefs[0] !== 'seed:production-v2-registration-path'
  ) throw new Error(`sandbox_itinerary_builder_historical_identity_mismatch_${profile.priorBindingId}`)
  const evidenceRef = 'seed:sandbox-itinerary-builder-contract-replaced'
  const result = await setCapabilitySupplyEligibilityCommand(db, {
    actor: { kind: 'system', ref: 'system:dev-seed' },
    context: {
      operationKey: `seed:capability-workflow-binding-retire:${profile.priorBindingId}`,
      correlationId: `seed:capability-supply:${profile.slug}`,
      reasonCode: 'labelled_sandbox_workflow_contract_replaced', evidenceRefs: [evidenceRef],
    },
    eligibility: {
      offeringId: offering.offeringId, bindingId: binding.bindingId, contractRef,
      decision: 'revoke',
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: [evidenceRef], conformanceEvidenceRefs: [evidenceRef],
    },
  }, retiredAt)
  if (result.kind !== 'ineligible') {
    throw new Error(`sandbox_itinerary_builder_historical_retirement_${result.kind}`)
  }
  return [binding.bindingId]
}

export async function retireSupersededSandboxV2Supply(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  registrations: readonly SandboxV2SupplyRegistration[],
  retiredAt: number,
): Promise<string[]> {
  const retired: string[] = []
  const siteUrl = process.env.AE_SITE_URL?.trim() || 'https://agentic-economy-phi.vercel.app'
  const legacyContractRef = encodeCapabilityContractDocument(SANDBOX_V2_LEGACY_CAPABILITY_CONTRACT_DOCUMENT).contract.ref
  const priorContractRef = encodeCapabilityContractDocument(SANDBOX_V2_PRIOR_CAPABILITY_CONTRACT_DOCUMENT).contract.ref
  for (const [profileKey, profile] of Object.entries(SANDBOX_PROVIDER_PROFILES)) {
    const corrected = registrations.find((registration) => registration.slug === profile.slug)
    if (corrected === undefined) throw new Error(`sandbox_v2_corrected_registration_missing_${profile.slug}`)
    const offering = await db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.priorOfferingId))
      .unique()
    const business = await db.query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', profile.slug))
      .unique()
    const legacyBindings = [
      {
        bindingId: profile.legacyV2BindingId,
        endpointUrl: new URL(`/api/sandbox/capability?profile=${profileKey}`, siteUrl).href,
        authority: sandboxAuthority(profileKey),
      },
      {
        bindingId: profile.priorV2BindingId,
        endpointUrl: new URL(`/api/sandbox/capability?profile=${profileKey}&binding=v2`, siteUrl).href,
        authority: sandboxAuthority(profileKey),
      },
    ]
    for (const expected of legacyBindings) {
      const binding = await db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', expected.bindingId))
        .unique()
      if (binding === null) continue
      if (
        offering === null
        || business === null
        || offering.businessId !== business._id
        || binding.offeringId !== profile.priorOfferingId
        || binding.networkId !== 'ae:public'
        || binding.capabilityId !== legacyContractRef.capabilityId
        || binding.version !== legacyContractRef.version
        || binding.contractDigest !== legacyContractRef.contractDigest
        || offering.capabilityId !== legacyContractRef.capabilityId
        || offering.version !== legacyContractRef.version
        || offering.contractDigest !== legacyContractRef.contractDigest
        || binding.endpointUrl !== expected.endpointUrl
        || binding.authority.kind !== 'keyless'
        || binding.adapterId !== 'http-json:v1'
        || binding.configJson !== '{"method":"POST","requestTimeoutMs":5000}'
        || binding.configDigest !== canonicalDigest({ method: 'POST', requestTimeoutMs: 5_000 })
        || binding.continuation.kind !== 'single_response'
        || binding.continuation.evidenceRefs.length !== 1
        || binding.continuation.evidenceRefs[0] !== 'seed:sandbox-single-response'
        || binding.cancellation.kind !== 'unsupported'
        || binding.cancellation.evidenceRefs.length !== 1
        || binding.cancellation.evidenceRefs[0] !== 'seed:sandbox-no-cancellation'
        || binding.registrationEvidenceRefs.length !== 1
        || binding.registrationEvidenceRefs[0] !== 'seed:production-v2-registration-path'
      ) throw new Error(`sandbox_v2_legacy_binding_identity_mismatch_${expected.bindingId}`)
      const isOriginalLegacyBinding = expected.bindingId === profile.legacyV2BindingId
      const retirementEvidenceRef = isOriginalLegacyBinding
        ? 'seed:sandbox-shared-provider-credential'
        : 'seed:sandbox-capability-contract-upgraded'
      const result = await setCapabilitySupplyEligibilityCommand(db, {
        actor: { kind: 'system', ref: 'system:dev-seed' },
        context: {
          operationKey: `seed:capability-binding-retire:${expected.bindingId}`,
          correlationId: `seed:capability-supply:${profile.slug}`,
          reasonCode: 'labelled_sandbox_binding_replaced',
          evidenceRefs: [retirementEvidenceRef],
        },
        eligibility: {
          offeringId: offering.offeringId,
          bindingId: binding.bindingId,
          contractRef: legacyContractRef,
          decision: 'revoke',
          expectedOfferingRegistrationHash: offering.registrationHash,
          expectedBindingRegistrationHash: binding.registrationHash,
          admissionEvidenceRefs: [retirementEvidenceRef],
          conformanceEvidenceRefs: [retirementEvidenceRef],
        },
      }, retiredAt)
      if (result.kind !== 'ineligible') {
        throw new Error(`sandbox_v2_legacy_binding_retirement_${result.kind}`)
      }
      retired.push(binding.bindingId)
    }
    const priorOffering = await db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.priorV2OfferingId))
      .unique()
    const priorBinding = await db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', profile.v2BindingId))
      .unique()
    if (priorOffering !== null || priorBinding !== null) {
      if (
        priorOffering === null
        || priorBinding === null
        || business === null
        || priorOffering.businessId !== business._id
        || priorBinding.offeringId !== profile.priorV2OfferingId
        || priorBinding.networkId !== 'ae:public'
        || priorBinding.capabilityId !== priorContractRef.capabilityId
        || priorBinding.version !== priorContractRef.version
        || priorBinding.contractDigest !== priorContractRef.contractDigest
        || priorOffering.capabilityId !== priorContractRef.capabilityId
        || priorOffering.version !== priorContractRef.version
        || priorOffering.contractDigest !== priorContractRef.contractDigest
        || priorBinding.endpointUrl !== new URL(`/api/sandbox/capability?profile=${profileKey}&binding=v3`, siteUrl).href
        || priorBinding.authority.kind !== 'keyless'
        || priorBinding.adapterId !== 'http-json:v1'
        || priorBinding.configJson !== '{"method":"POST","requestTimeoutMs":5000}'
        || priorBinding.configDigest !== canonicalDigest({ method: 'POST', requestTimeoutMs: 5_000 })
        || priorBinding.continuation.kind !== 'single_response'
        || priorBinding.continuation.evidenceRefs.length !== 1
        || priorBinding.continuation.evidenceRefs[0] !== 'seed:sandbox-single-response'
        || priorBinding.cancellation.kind !== 'unsupported'
        || priorBinding.cancellation.evidenceRefs.length !== 1
        || priorBinding.cancellation.evidenceRefs[0] !== 'seed:sandbox-no-cancellation'
        || priorBinding.registrationEvidenceRefs.length !== 1
        || priorBinding.registrationEvidenceRefs[0] !== 'seed:production-v2-registration-path'
      ) throw new Error(`sandbox_v2_prior_binding_identity_mismatch_${profile.v2BindingId}`)
      const priorResult = await setCapabilitySupplyEligibilityCommand(db, {
        actor: { kind: 'system', ref: 'system:dev-seed' },
        context: {
          operationKey: `seed:capability-binding-retire:${profile.v2BindingId}`,
          correlationId: `seed:capability-supply:${profile.slug}`,
          reasonCode: 'labelled_sandbox_contract_replaced',
          evidenceRefs: ['seed:sandbox-capability-contract-upgraded'],
        },
        eligibility: {
          offeringId: priorOffering.offeringId,
          bindingId: priorBinding.bindingId,
          contractRef: priorContractRef,
          decision: 'revoke',
          expectedOfferingRegistrationHash: priorOffering.registrationHash,
          expectedBindingRegistrationHash: priorBinding.registrationHash,
          admissionEvidenceRefs: ['seed:sandbox-capability-contract-upgraded'],
          conformanceEvidenceRefs: ['seed:sandbox-capability-contract-upgraded'],
        },
      }, retiredAt)
      if (priorResult.kind !== 'ineligible') {
        throw new Error(`sandbox_v2_prior_binding_retirement_${priorResult.kind}`)
      }
      retired.push(priorBinding.bindingId)
    }
    const supersededOffering = await db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.priorV3OfferingId))
      .unique()
    const supersededBinding = await db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', profile.priorV3BindingId))
      .unique()
    if (supersededOffering === null && supersededBinding === null) continue
    if (
      supersededOffering === null
      || supersededBinding === null
      || business === null
      || supersededOffering.businessId !== business._id
      || supersededBinding.offeringId !== profile.priorV3OfferingId
      || supersededBinding.networkId !== 'ae:public'
      || supersededBinding.capabilityId !== corrected.contractRef.capabilityId
      || supersededBinding.version !== corrected.contractRef.version
      || supersededBinding.contractDigest !== corrected.contractRef.contractDigest
      || supersededOffering.capabilityId !== corrected.contractRef.capabilityId
      || supersededOffering.version !== corrected.contractRef.version
      || supersededOffering.contractDigest !== corrected.contractRef.contractDigest
      || supersededBinding.endpointUrl !== new URL(`/api/sandbox/capability?profile=${profileKey}&binding=v4`, siteUrl).href
      || supersededBinding.authority.kind !== 'keyless'
      || supersededBinding.adapterId !== 'http-json:v1'
      || supersededBinding.configJson !== '{"method":"POST","requestTimeoutMs":5000}'
      || supersededBinding.configDigest !== canonicalDigest({ method: 'POST', requestTimeoutMs: 5_000 })
      || supersededBinding.continuation.kind !== 'single_response'
      || supersededBinding.continuation.evidenceRefs.length !== 1
      || supersededBinding.continuation.evidenceRefs[0] !== 'seed:sandbox-single-response'
      || supersededBinding.cancellation.kind !== 'unsupported'
      || supersededBinding.cancellation.evidenceRefs.length !== 1
      || supersededBinding.cancellation.evidenceRefs[0] !== 'seed:sandbox-no-cancellation'
      || supersededBinding.registrationEvidenceRefs.length !== 1
      || supersededBinding.registrationEvidenceRefs[0] !== 'seed:production-v2-registration-path'
    ) throw new Error(`sandbox_v2_superseded_binding_identity_mismatch_${profile.priorV3BindingId}`)
    const supersededResult = await setCapabilitySupplyEligibilityCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: {
        operationKey: `seed:capability-binding-retire:${profile.priorV3BindingId}`,
        correlationId: `seed:capability-supply:${profile.slug}`,
        reasonCode: 'labelled_sandbox_registration_replaced',
        evidenceRefs: ['seed:sandbox-registration-identity-rotated'],
      },
      eligibility: {
        offeringId: supersededOffering.offeringId,
        bindingId: supersededBinding.bindingId,
        contractRef: corrected.contractRef,
        decision: 'revoke',
        expectedOfferingRegistrationHash: supersededOffering.registrationHash,
        expectedBindingRegistrationHash: supersededBinding.registrationHash,
        admissionEvidenceRefs: ['seed:sandbox-registration-identity-rotated'],
        conformanceEvidenceRefs: ['seed:sandbox-registration-identity-rotated'],
      },
    }, retiredAt)
    if (supersededResult.kind !== 'ineligible') {
      throw new Error(`sandbox_v2_superseded_binding_retirement_${supersededResult.kind}`)
    }
    retired.push(supersededBinding.bindingId)
  }
  return retired
}

/**
 * Publishes one machine-callable access path on an existing offering so the agent
 * pathway can be walked end to end. Uses the internal authority available to dev
 * seeds; the public authoring mutation still requires signed source-write admission.
 */
export const seedCallableOffering = internalMutation({
  args: {
    slug: v.string(),
    name: v.string(),
    summary: v.string(),
    url: v.string(),
    pricingSummary: v.string(),
    method: v.optional(v.string()),
    documentationUrl: v.optional(v.string()),
    authenticationSummary: v.optional(v.string()),
    provenance: v.optional(v.union(v.literal('business_declared'), v.literal('publicly_observed'))),
  },
  returns: v.object({ kind: v.string(), accessPathRef: v.optional(v.string()), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const business = await ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', args.slug)).unique()
    if (business === null) return { kind: 'error', reason: 'business_not_found' }

    const offeringRows = await ctx.db
      .query('businessOfferings')
      .withIndex('by_businessId_and_status', (query) => query.eq('businessId', business._id).eq('status', 'published'))
      .take(1)
    const offering = offeringRows[0]
    if (offering === undefined) return { kind: 'error', reason: 'published_offering_not_found' }

    const revision = await ctx.db
      .query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => query.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision))
      .unique()
    if (revision === null) return { kind: 'error', reason: 'offering_revision_not_found' }

    const accessPathRef = `access:${args.slug}:callable`
    const descriptor: OfferingAccessPathDescriptor = {
      kind: 'external_operation',
      name: args.name,
      summary: args.summary,
      url: args.url,
      method: args.method ?? 'POST',
      ...(args.documentationUrl === undefined ? {} : { documentationUrl: args.documentationUrl }),
      ...(args.authenticationSummary === undefined ? {} : { authenticationSummary: args.authenticationSummary }),
      pricingSummary: args.pricingSummary,
      provenance: args.provenance ?? 'business_declared',
    }
    const owner = await ctx.db.get(business.ownerId)
    if (owner === null) return { kind: 'error', reason: 'owner_not_found' }
    const sourceDb = ctx.db
    const accessPath = await upsertOfferingAccessPathCommand(sourceDb, {
      actorRef: owner.clerkUserId,
      businessId: business._id,
      offeringRef: offering.offeringRef,
      accessPathRef,
      expectedRevision: revision.revision,
      operationKey: `seed:access-path:${accessPathRef}:${revision.revision}:${canonicalDigest(descriptor)}`,
      descriptor,
    }, now)
    if (accessPath.kind === 'error') return { kind: 'error', reason: `access_path:${accessPath.code}` }

    const support = await deriveBusinessOfferingSupportFromCapabilitySupply(sourceDb, business._id, now)
    const rebuilt = await rebuildBusinessSupplyProjectionSnapshotCommand({
      db: sourceDb,
      sourceDb,
      businessId: business._id,
      support,
      now,
    })
    if (rebuilt.kind === 'error') return { kind: 'error', reason: `projection:${rebuilt.code}` }
    return { kind: 'ok', accessPathRef, reason: 'offering_projection_rebuilt' }
  },
})
