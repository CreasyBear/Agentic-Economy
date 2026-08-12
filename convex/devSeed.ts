import { internalMutation, type MutationCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { internal } from './_generated/api'
import { v } from 'convex/values'

import {
  buildDevSeedCatalogState,
  DEV_SEED_BUSINESS_FIXTURES,
  DEV_SEED_OWNER_CLERK_USER_ID,
  type DevSeedBusinessFixture,
} from '../src/modules/dev/public'
import { persistDevSeedCatalogState } from './devSeedStore'
import { claimBusinessCommand } from './business'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import type { JsonValue } from '@/modules/capability-contract/public'
import {
  MAX_ACCESS_PATHS_PER_OFFERING,
  MAX_OFFERINGS_PER_BUSINESS,
  type OfferingPrice,
} from '@/modules/catalog/public'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  ensureCatalogProjectionControlsCommand,
  publishBusinessCatalogCommand,
  readCatalogDescriptor,
  rebuildBusinessSupplyProjectionSnapshotCommand,
  reviseBusinessOfferingCommand,
  upsertOfferingAccessPathCommand,
  withdrawOfferingAccessPathCommand,
} from './catalog'
import { seedDiscoveryManifestForBusinessCommand } from './discovery'
import { encodeCapabilityContractDocument } from '@/modules/capability-contract-registry/public'
import {
  publicationPorts,
  setCapabilitySupplyEligibilityCommand,
} from './capabilitySupply'
import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import {
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  type CapabilityOfferingRegistration,
  type CapabilityTransportBindingRegistration,
  withdrawCapabilityCommand,
} from '@/modules/capability-supply/public'
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

type SeedDevCatalogResult = Readonly<{
  kind: 'seeded' | 'source_drift_requires_migration'
  sourceDrift: string[]
  seededSlugs: string[]
  ownerClerkUserId: string
  ownerId: string
  supportRecordId: string
  businessIdsBySlug: Record<string, string>
}>

type CuratedSeedResult = Readonly<{
  kind: 'seeded' | 'source_drift_requires_migration'
  sourceDrift: readonly string[]
}>

export const seedDevCatalog = internalMutation({
  args: {},
  returns: v.object({
    kind: v.union(v.literal('seeded'), v.literal('source_drift_requires_migration')),
    sourceDrift: v.array(v.string()),
    seededSlugs: v.array(v.string()),
    ownerClerkUserId: v.string(),
    ownerId: v.string(),
    supportRecordId: v.string(),
    businessIdsBySlug: v.record(v.string(), v.string()),
  }),
  handler: async (ctx): Promise<SeedDevCatalogResult> => {
    // Persist the source catalog before linking curated capabilities to its offerings.
    const bundle = buildDevSeedCatalogState(DEV_SEED_BUSINESS_FIXTURES)
    const result = await persistDevSeedCatalogState(ctx.db, bundle)
    // Then port the AE-curated Exa + Frankfurter capabilities through the generic
    // Contract -> Offering -> Binding -> Publication path.
    const curated: CuratedSeedResult = await ctx.runMutation(internal.curatedProviders.seed, {
      runtimeEnvironment: 'sandbox',
    })
    if (curated.kind !== 'seeded') {
      return {
        ...result,
        kind: curated.kind,
        sourceDrift: [...curated.sourceDrift],
        seededSlugs: [...result.seededSlugs],
      }
    }
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
      kind: 'seeded' as const,
      sourceDrift: [],
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
type SandboxSupplyRetirementTarget = Readonly<{
  slug: string
  offeringId: string
  bindingId: string
  contractRef: CapabilityContractRef
  endpointUrl: string
  offeringRegistration: Omit<CapabilityOfferingRegistration, 'businessId'>
  bindingRegistrationHash: string
  binding: CapabilityTransportBindingRegistration
}>

type SandboxSupplyTargetInput = Readonly<{
  slug: string
  offeringId: string
  bindingId: string
  contractRef: CapabilityContractRef
  endpointUrl: string
  label: string
  summary: string
  amount: Readonly<{ currency: string; units: string; exponent: number }>
  searchTerms: readonly string[]
  cancellation?: CapabilityTransportBindingRegistration['cancellation']
  config?: JsonValue
}>

function sandboxSupplyTarget(input: SandboxSupplyTargetInput): SandboxSupplyRetirementTarget {
  const config = input.config ?? { method: 'POST', requestTimeoutMs: 5_000 }
  const configJson = JSON.stringify(config)
  const configDigest = canonicalDigest(config)
  const registrationEvidenceRefs = ['seed:sandbox-labelled-business']
  const offeringRegistration: Omit<CapabilityOfferingRegistration, 'businessId'> = {
    offeringId: input.offeringId,
    networkId: 'ae:public',
    contractRef: input.contractRef,
    presentation: {
      label: input.label,
      summary: input.summary,
      price: { kind: 'fixed', amount: input.amount },
      materialTerms: [{
        termId: 'sandbox_only',
        label: 'Environment',
        value: 'Sandbox only; not real supply.',
      }],
      commercialRelationship: {
        kind: 'none',
        summary: 'Sandbox verification has no payment, sponsorship, rebate, or ownership relationship.',
        influencesEligibility: false,
        influencesInclusion: false,
        influencesOrder: false,
        evidenceRefs: ['seed:sandbox-commercial-neutrality'],
      },
    },
    searchTerms: [...input.searchTerms],
    registrationEvidenceRefs,
  }
  const binding: CapabilityTransportBindingRegistration = {
    bindingId: input.bindingId,
    offeringId: input.offeringId,
    networkId: 'ae:public',
    contractRef: input.contractRef,
    endpointUrl: input.endpointUrl,
    authority: { kind: 'keyless' },
    continuation: { kind: 'single_response', evidenceRefs: ['seed:sandbox-single-response'] },
    cancellation: input.cancellation ?? { kind: 'unsupported', evidenceRefs: ['seed:sandbox-no-cancellation'] },
    adapter: { adapterId: 'http-json:v1', config },
    registrationEvidenceRefs: ['seed:production-v2-registration-path'],
  }
  return {
    slug: input.slug,
    offeringId: input.offeringId,
    bindingId: input.bindingId,
    contractRef: input.contractRef,
    endpointUrl: input.endpointUrl,
    offeringRegistration,
    bindingRegistrationHash: capabilityBindingRegistrationHash(binding, { configJson, configDigest }),
    binding,
  }
}

function sandboxContractRef(document: Parameters<typeof encodeCapabilityContractDocument>[0]): CapabilityContractRef {
  return encodeCapabilityContractDocument(document).contract.ref
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

function historicalSandboxSupplyTargets(): readonly SandboxSupplyRetirementTarget[] {
  const siteUrl = process.env.AE_SITE_URL?.trim() || 'https://agentic-economy-phi.vercel.app'
  const priorProviderOrigin = process.env.AE_SANDBOX_PROVIDER_ORIGIN?.trim() || siteUrl
  const v1Contract = sandboxContractRef(SANDBOX_V2_LEGACY_CAPABILITY_CONTRACT_DOCUMENT)
  const v2Contract = sandboxContractRef(SANDBOX_V2_PRIOR_CAPABILITY_CONTRACT_DOCUMENT)
  const v3Contract = sandboxContractRef(SANDBOX_V2_CAPABILITY_CONTRACT_DOCUMENT)
  const options = Object.entries(SANDBOX_PROVIDER_PROFILES).flatMap(([profileKey, profile]) => [
    sandboxSupplyTarget({
      slug: profile.slug, offeringId: profile.priorOfferingId, bindingId: profile.legacyV2BindingId,
      contractRef: v1Contract,
      endpointUrl: new URL(`/api/sandbox/capability?profile=${profileKey}`, siteUrl).href,
      label: profile.label, summary: 'Labelled sandbox supply for source and contract verification only.',
      amount: profile.amount, searchTerms: profile.queryTerms,
    }),
    sandboxSupplyTarget({
      slug: profile.slug, offeringId: profile.priorOfferingId, bindingId: profile.priorV2BindingId,
      contractRef: v1Contract,
      endpointUrl: new URL(`/api/sandbox/capability?profile=${profileKey}&binding=v2`, siteUrl).href,
      label: profile.label, summary: 'Labelled sandbox supply for source and contract verification only.',
      amount: profile.amount, searchTerms: profile.queryTerms,
    }),
    sandboxSupplyTarget({
      slug: profile.slug, offeringId: profile.priorV2OfferingId, bindingId: profile.v2BindingId,
      contractRef: v2Contract,
      endpointUrl: new URL(`/api/sandbox/capability?profile=${profileKey}&binding=v3`, siteUrl).href,
      label: profile.label, summary: 'Labelled sandbox supply for source and contract verification only.',
      amount: profile.amount, searchTerms: profile.queryTerms,
    }),
    sandboxSupplyTarget({
      slug: profile.slug, offeringId: profile.priorV3OfferingId, bindingId: profile.priorV3BindingId,
      contractRef: v3Contract,
      endpointUrl: new URL(`/api/sandbox/capability?profile=${profileKey}&binding=v4`, siteUrl).href,
      label: profile.label, summary: 'Labelled sandbox supply for source and contract verification only.',
      amount: profile.amount, searchTerms: profile.queryTerms,
    }),
    sandboxSupplyTarget({
      slug: profile.slug, offeringId: profile.offeringId, bindingId: profile.v4BindingId,
      contractRef: v3Contract,
      endpointUrl: new URL(`/api/sandbox/capability?profile=${profileKey}&binding=v5`, siteUrl).href,
      label: profile.label, summary: 'Labelled sandbox supply for source and contract verification only.',
      amount: profile.amount, searchTerms: profile.queryTerms,
    }),
  ])
  const routeTargets = Object.entries(SANDBOX_ROUTE_PROVIDER_PROFILES).flatMap(([routeKey, profile]) => {
    const contractRef = sandboxContractRef(profile.contract)
    const v4Origin = profile === SANDBOX_ROUTE_PROVIDER_PROFILES.resolver
      ? process.env.AE_SANDBOX_ROUTE_RESOLVER_V4_ORIGIN?.trim() || priorProviderOrigin
      : process.env.AE_SANDBOX_ROUTE_QUOTER_V4_ORIGIN?.trim() || priorProviderOrigin
    const currentConfig = profile === SANDBOX_ROUTE_PROVIDER_PROFILES.resolver
      ? {
          method: 'POST',
          requestTimeoutMs: 5_000,
          cancellation: { path: profile.endpointPath, requestTimeoutMs: 3_000 },
        }
      : undefined
    const currentCancellation = profile === SANDBOX_ROUTE_PROVIDER_PROFILES.resolver
      ? { kind: 'adapter_managed' as const, evidenceRefs: ['seed:sandbox-adapter-cancellation'] }
      : undefined
    const historical = [
      [profile.priorOfferingId, profile.priorBindingId, new URL(`/api/sandbox/capability?route=${routeKey}`, siteUrl).href],
      [profile.priorV2OfferingId, profile.priorV2BindingId, new URL(profile.endpointPath, siteUrl).href],
      [profile.priorV3OfferingId, profile.priorV3BindingId, new URL(profile.endpointPath, priorProviderOrigin).href],
      [profile.priorV4OfferingId, profile.priorV4BindingId, new URL(profile.endpointPath, v4Origin).href],
      ...('priorV5OfferingId' in profile
        ? [[profile.priorV5OfferingId, profile.priorV5BindingId, new URL(
            profile.endpointPath,
            process.env.AE_SANDBOX_ROUTE_RESOLVER_ORIGIN?.trim()
              || process.env.AE_SANDBOX_PROVIDER_ORIGIN?.trim()
              || siteUrl,
          ).href] as const]
        : []),
    ] as const
    return [
      ...historical.map(([offeringId, bindingId, endpointUrl]) => sandboxSupplyTarget({
        slug: profile.slug, offeringId, bindingId, contractRef, endpointUrl,
        label: profile.label, summary: 'Labelled sandbox route supply for source and contract verification only.',
        amount: profile.amount, searchTerms: profile.queryTerms,
      })),
      sandboxSupplyTarget({
        slug: profile.slug, offeringId: profile.offeringId, bindingId: profile.bindingId,
        contractRef, endpointUrl: new URL(profile.endpointPath, sandboxRouteProviderOrigin(profile)).href,
        label: profile.label, summary: 'Labelled sandbox route supply for source and contract verification only.',
        amount: profile.amount, searchTerms: profile.queryTerms,
        ...(currentConfig === undefined ? {} : { config: currentConfig }),
        ...(currentCancellation === undefined ? {} : { cancellation: currentCancellation }),
      }),
    ]
  })
  const workflowOrigin = process.env.AE_SANDBOX_WORKFLOW_ORIGIN?.trim()
    || process.env.AE_SANDBOX_ROUTE_RESOLVER_ORIGIN?.trim()
    || siteUrl
  const workflows = Object.entries(SANDBOX_WORKFLOW_PROVIDER_PROFILES).flatMap(([providerKey, profile]) => {
    const currentContract = sandboxContractRef(
      sandboxWorkflowCapabilityContractDocument(providerKey as SandboxWorkflowProviderKey),
    )
    const priorDocument = providerKey === 'procurement-brief'
      ? historicalProcurementBriefCapabilityContractDocument()
      : providerKey === 'itinerary-builder'
        ? historicalItineraryBuilderCapabilityContractDocument()
        : sandboxWorkflowCapabilityContractDocument(providerKey as SandboxWorkflowProviderKey)
    const priorOrigin = providerKey === 'procurement-brief' || providerKey === 'itinerary-builder'
      ? workflowOrigin
      : siteUrl
    const make = (offeringId: string, bindingId: string, contractRef: CapabilityContractRef, endpointUrl: string) => (
      sandboxSupplyTarget({
        slug: profile.slug, offeringId, bindingId, contractRef, endpointUrl,
        label: profile.capabilityName,
        summary: `Labelled sandbox ${profile.cohortLabel.toLowerCase()} workflow evidence only.`,
        amount: profile.amount,
        searchTerms: [profile.cohortLabel, profile.capabilityName, 'workplace catering supplier recommendation'],
      })
    )
    return [
      make(profile.priorOfferingId, profile.priorBindingId, sandboxContractRef(priorDocument), new URL(profile.endpointPath, priorOrigin).href),
      make(profile.offeringId, profile.bindingId, currentContract, new URL(profile.endpointPath, workflowOrigin).href),
    ]
  })
  return [...options, ...routeTargets, ...workflows]
}

function sandboxTargetMismatch(
  target: SandboxSupplyRetirementTarget,
  businessId: string,
  offering: {
    businessId: string
    networkId: string
    capabilityId: string
    version: number
    contractDigest: string
    registrationHash: string
  },
  binding: {
    offeringId: string
    networkId: string
    capabilityId: string
    version: number
    contractDigest: string
    endpointUrl: string
    authority: { kind: string }
    adapterId: string
    configJson: string
    configDigest: string
    registrationHash: string
  },
): string | undefined {
  const expectedOfferingRegistrationHash = capabilityOfferingRegistrationHash({
    ...target.offeringRegistration,
    businessId,
  })
  if (
    offering.businessId !== businessId
    || offering.networkId !== 'ae:public'
    || offering.capabilityId !== target.contractRef.capabilityId
    || offering.version !== target.contractRef.version
    || offering.contractDigest !== target.contractRef.contractDigest
    || offering.registrationHash !== expectedOfferingRegistrationHash
    || binding.offeringId !== target.offeringId
    || binding.networkId !== 'ae:public'
    || binding.capabilityId !== target.contractRef.capabilityId
    || binding.version !== target.contractRef.version
    || binding.contractDigest !== target.contractRef.contractDigest
    || binding.endpointUrl !== target.endpointUrl
    || binding.authority.kind !== 'keyless'
    || binding.adapterId !== 'http-json:v1'
    || binding.configJson !== JSON.stringify(target.binding.adapter.config)
    || binding.configDigest !== canonicalDigest(target.binding.adapter.config)
    || binding.registrationHash !== target.bindingRegistrationHash
  ) return `sandbox_retirement_identity_mismatch:${target.bindingId}`
  return undefined
}

async function retireHistoricalSandboxSupplyNow(ctx: MutationCtx, retiredAt: number): Promise<string[]> {
  const retired: string[] = []
  const ports = publicationPorts(ctx)
  for (const target of historicalSandboxSupplyTargets()) {
    const business = await ctx.db.query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', target.slug))
      .unique()
    const [offering, binding] = await Promise.all([
      ctx.db.query('capabilityOfferings').withIndex('by_offeringId', (query) => query.eq('offeringId', target.offeringId)).unique(),
      ctx.db.query('capabilityTransportBindings').withIndex('by_bindingId', (query) => query.eq('bindingId', target.bindingId)).unique(),
    ])
    if (offering === null && binding === null) continue
    if (business === null || offering === null || binding === null) {
      throw new Error(`sandbox_retirement_identity_mismatch:${target.bindingId}`)
    }
    const mismatch = sandboxTargetMismatch(target, business._id, offering, binding)
    if (mismatch !== undefined) throw new Error(mismatch)
    const publications = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => query.eq('publicationRef', target.offeringId))
      .take(20)
    let currentPublication = false
    for (const row of publications) {
      if (
        row.businessId !== business._id
        || row.networkId !== 'ae:public'
        || row.capabilityId !== target.contractRef.capabilityId
        || row.version !== target.contractRef.version
        || row.contractDigest !== target.contractRef.contractDigest
        || row.offeringId !== target.offeringId
        || row.bindingId !== target.bindingId
        || row.publisherRef !== 'system:dev-seed'
        || row.authorityMode !== 'ae_curated_external'
      ) throw new Error(`sandbox_retirement_publication_identity_mismatch:${target.bindingId}`)
      if (row.disposition !== 'current') continue
      currentPublication = true
      const publication = await ports.loadPublicationAtRevision(row.publicationRef, row.revision)
      if (publication === null) throw new Error(`sandbox_retirement_publication_missing:${target.bindingId}`)
      const withdrawn = await withdrawCapabilityCommand({
        publication,
        evidenceRefs: ['seed:sandbox-history-retirement'],
        now: retiredAt,
      }, ports)
      if (withdrawn.kind !== 'withdrawn') {
        throw new Error(`sandbox_retirement_withdrawal_${withdrawn.reason}:${target.bindingId}`)
      }
      retired.push(target.bindingId)
    }
    if (!currentPublication) {
      const eligibility = await setCapabilitySupplyEligibilityCommand(ctx.db, {
        actor: { kind: 'system', ref: 'system:dev-seed' },
        context: {
          operationKey: `seed:sandbox-history-retirement:${target.bindingId}`,
          correlationId: `seed:sandbox-history-retirement:${target.slug}`,
          reasonCode: 'sandbox_supply_retired',
          evidenceRefs: ['seed:sandbox-history-retirement'],
        },
        eligibility: {
          offeringId: target.offeringId,
          bindingId: target.bindingId,
          contractRef: target.contractRef,
          decision: 'revoke',
          expectedOfferingRegistrationHash: offering.registrationHash,
          expectedBindingRegistrationHash: target.bindingRegistrationHash,
          admissionEvidenceRefs: ['seed:sandbox-history-retirement'],
          conformanceEvidenceRefs: ['seed:sandbox-history-retirement'],
        },
      }, retiredAt)
      if (eligibility.kind !== 'ineligible') {
        throw new Error(`sandbox_retirement_eligibility_${eligibility.kind}:${target.bindingId}`)
      }
      retired.push(target.bindingId)
    }
  }

  const accessPath = await ctx.db.query('offeringAccessPaths')
    .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', 'access:adelaide-dental-clinic:callable'))
    .unique()
  if (accessPath !== null) {
    const business = await ctx.db.query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', 'adelaide-dental-clinic'))
      .unique()
    const offering = await ctx.db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', accessPath.offeringRef))
      .unique()
    if (business === null || offering === null || accessPath.businessId !== business._id || offering.businessId !== business._id) {
      throw new Error('sandbox_retirement_access_path_identity_mismatch')
    }
    const descriptor = readCatalogDescriptor(accessPath.descriptor)
    const expectedUrl = new URL(
      '/api/sandbox/adelaide-dental-clinic/checkup-quote',
      process.env.AE_SITE_URL?.trim() || 'https://agentic-economy-phi.vercel.app',
    ).href
    if (
      descriptor.kind !== 'external_operation'
      || descriptor.url !== expectedUrl
      || descriptor.method !== 'POST'
      || descriptor.provenance !== 'business_declared'
      || descriptor.summary !== 'Quotes this published offering through the labelled sandbox provider.'
    ) throw new Error('sandbox_retirement_access_path_identity_mismatch')
    if (accessPath.status !== 'withdrawn') {
      const owner = await ctx.db.get(business.ownerId)
      if (owner === null) throw new Error('sandbox_retirement_access_path_owner_missing')
      const withdrawn = await withdrawOfferingAccessPathCommand(ctx.db, {
        actorRef: owner.clerkUserId,
        businessId: business._id,
        accessPathRef: accessPath.accessPathRef,
        expectedRevision: offering.currentRevision,
        operationKey: 'seed:sandbox-history-retirement:adelaide-checkup',
      }, retiredAt)
      if (withdrawn.kind === 'error') throw new Error(`sandbox_retirement_access_path_${withdrawn.code}`)
      retired.push(accessPath.accessPathRef)
      const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, business._id, retiredAt)
      const rebuilt = await rebuildBusinessSupplyProjectionSnapshotCommand({
        db: ctx.db, sourceDb: ctx.db, businessId: business._id, support, now: retiredAt,
      })
      if (rebuilt.kind === 'error') throw new Error(`sandbox_retirement_access_path_projection_${rebuilt.code}`)
    }
  }
  return retired
}

export const retireHistoricalSandboxSupply = internalMutation({
  args: {},
  returns: v.object({ retired: v.array(v.string()) }),
  handler: async (ctx) => ({ retired: await retireHistoricalSandboxSupplyNow(ctx, Date.now()) }),
})















