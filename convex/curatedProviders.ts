import { v } from 'convex/values'

import {
  defineCapabilityContract,
  type CapabilityContract,
} from '@/modules/capability-contract/public'
import type { OfferingAccessPathDescriptor } from '@/modules/catalog/public'
import { brandNonEmpty, type Slug } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { normalizeSlug } from '@/modules/common/normalize-slug'
import {
  buildExaSearchContentsMapping,
  createRegisteredOperationMappingRef,
  CURATED_PROVIDER_PUBLICATIONS,
  EXA_BUSINESS_SLUG,
  parseAdmittedTransportCatalogMetadata,
  decodeConvexPublicationSource,
  preparePublicationDraft,
  type PreparedPublicationMaterial,
  type CapabilityPublicationImport,
} from '@/modules/capability-supply/public'
import type { PricingConfig } from '@/modules/money/public'
import {
  createProviderConnection,
  type ProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import {
  buildDevSeedCatalogState,
  DEV_SEED_BUSINESS_FIXTURES,
  DEV_SEED_OWNER_CLERK_USER_ID,
  type DevSeedBusinessFixture,
} from '@/modules/dev/public'

import { internalMutation, type MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import {
  publishCuratedCapability,
  registerCuratedMapping,
  setCapabilitySupplyEligibilityCommand,
  withdrawCuratedCapability,
} from './capabilitySupply'
import {
  ensureCatalogProjectionControlsCommand,
  publishBusinessCatalogCommand,
  upsertOfferingAccessPathCommand,
} from './catalog'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './capabilitySupplyProjection'
import { claimBusinessCommand } from './business'

const CURATED_PUBLISHER_REF = 'system:curated-provider-bootstrap'
const CURATED_RETIREMENT_EVIDENCE = ['source:migration:curated-source-drift-retirement']

const CURATED_PROVIDER_CREDENTIAL_REFS: Readonly<Record<string, string>> = {
  'provider:exa': 'env:EXA_API_KEY',
  'provider:openweathermap': 'env:OPENWEATHER_API_KEY',
  'provider:tavily': 'env:TAVILY_API_KEY',
  'provider:serpapi': 'env:SERPAPI_API_KEY',
  'provider:coingecko': 'env:COINGECKO_DEMO_API_KEY',
}
const DEMO_OR_DEVELOPMENT_KEY_MARKER = /(?:^|[-_:])(?:demo|dev)(?:[-_:]|$)/iu

function isDemoOrDevelopmentKeyedPublication(
  entry: (typeof CURATED_PROVIDER_PUBLICATIONS)[number],
): boolean {
  const publication = entry.publication
  if (!('commercial' in publication) || publication.commercial.authority.kind !== 'provider_connection') {
    return false
  }
  const authority = publication.commercial.authority
  const credentialRef = CURATED_PROVIDER_CREDENTIAL_REFS[authority.providerRef]
  return [authority.connectionRef, authority.providerRef, credentialRef]
    .some((value) => value !== undefined && DEMO_OR_DEVELOPMENT_KEY_MARKER.test(value))
}

type ConnectionSeed = Readonly<{
  connectionRef: string
  businessId: Id<'businesses'>
  providerRef: string
  providerAccountRef: string
  adapterId: string
  credentialRef: string | null
  grantedScopes: readonly string[]
  grantedResources: readonly string[]
  evidenceRefs: readonly string[]
}>

function sourceEndpointUrl(publication: (typeof CURATED_PROVIDER_PUBLICATIONS)[number]['publication']): string | undefined {
  if (publication.kind === 'x402') {
    const resource = publication.resource
    if (typeof resource !== 'object' || resource === null || !('resourceUrl' in resource)
      || typeof resource.resourceUrl !== 'string') return undefined
    return resource.resourceUrl
  }
  if (publication.kind !== 'openapi_http') return undefined
  const document = publication.document
  if (typeof document !== 'object' || document === null || !('servers' in document)
    || !Array.isArray(document.servers) || document.servers.length < 1) return undefined
  const server = document.servers[0]
  return typeof server === 'object' && server !== null && 'url' in server && typeof server.url === 'string'
    ? server.url
    : undefined
}

function curatedConnectionSeed(
  entry: (typeof CURATED_PROVIDER_PUBLICATIONS)[number],
  businessId: Id<'businesses'>,
): ConnectionSeed | undefined {
  const publication = entry.publication
  if (!('commercial' in publication) || publication.commercial.authority.kind !== 'provider_connection'
    || !('contract' in publication)) return undefined
  const endpointUrl = sourceEndpointUrl(publication)
  if (endpointUrl === undefined) return undefined
  const authority = publication.commercial.authority
  return {
    connectionRef: authority.connectionRef,
    businessId,
    providerRef: authority.providerRef,
    providerAccountRef: `account:${authority.providerRef}`,
    adapterId: publication.kind === 'x402' ? 'x402-fetch:v2' : 'http-json:v1',
    credentialRef: CURATED_PROVIDER_CREDENTIAL_REFS[authority.providerRef] ?? null,
    grantedScopes: [`capability:${publication.contract.capabilityId}`],
    grantedResources: [`endpoint:${endpointUrl}`],
    evidenceRefs: [...new Set(['seed:curated-provider-connection', ...publication.evidenceRefs])],
  }
}

function mergeConnectionSeed(current: ConnectionSeed | undefined, next: ConnectionSeed): ConnectionSeed {
  if (current === undefined) return next
  if (current.connectionRef !== next.connectionRef || current.businessId !== next.businessId
    || current.providerRef !== next.providerRef || current.adapterId !== next.adapterId
    || current.credentialRef !== next.credentialRef) {
    throw new Error(`curated_provider_connection_identity_conflict:${next.connectionRef}`)
  }
  return {
    ...current,
    grantedScopes: [...new Set([...current.grantedScopes, ...next.grantedScopes])],
    grantedResources: [...new Set([...current.grantedResources, ...next.grantedResources])],
    evidenceRefs: [...new Set([...current.evidenceRefs, ...next.evidenceRefs])],
  }
}
async function registerCuratedProviderBusinesses(
  db: MutationCtx['db'],
  fixtures: readonly DevSeedBusinessFixture[],
  registeredAt: number,
): Promise<{ seededSlugs: string[]; businessIdsBySlug: Record<string, string> }> {
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
        businessContext: fixture.stateTerritory === 'External'
          ? {
            kind: 'programmable_provider',
            website: curatedProviderWebsite(fixture.sourceLabel),
            providerIdentifier: fixture.businessName,
          }
          : {
            kind: 'local_human',
            suburb: fixture.suburb,
            stateTerritory: fixture.stateTerritory,
            ...(fixture.publishedPhone === undefined ? {} : { publishedPhone: fixture.publishedPhone }),
          },
        requestedSlug: fixture.requestedSlug,
        ownerMessage: fixture.ownerMessage,
        sourceRefs: [{
          label: fixture.sourceLabel,
          evidenceRef: `private:evidence:dev-seed:${fixture.requestedSlug}`,
          sourceHash: canonicalDigest(`dev-seed:${fixture.requestedSlug}`),
        }],
      },
      operationKey: `curated-provider:claim:${fixture.requestedSlug}`,
      correlationId: `curated-provider:claim:${fixture.requestedSlug}`,
    }, now)
    if (claim.kind !== 'ok') {
      throw new Error(`curated_provider_business_claim_${claim.code}:${fixture.requestedSlug}:${claim.reason}`)
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
    const catalogOperationKey = `curated-provider:catalog:${fixture.requestedSlug}:${canonicalDigest(services)}`
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
      throw new Error(`curated_provider_business_publish_${published.code}:${fixture.requestedSlug}:${published.reason}`)
    }
  }
  return { seededSlugs: fixtures.map((fixture) => fixture.requestedSlug), businessIdsBySlug }
}
function curatedProviderWebsite(sourceLabel: string): string {
  const matched = sourceLabel.match(/https:\/\/\S+/u)?.[0]
  if (matched === undefined) throw new Error('curated_provider_source_url_missing')
  const website = new URL(matched)
  website.search = ''
  website.hash = ''
  return website.href
}

function parseProviderSlug(value: string): Slug {
  const normalized = normalizeSlug(value)
  return brandNonEmpty(normalized, 'Slug')
}

async function ensureCuratedProviderConnections(
  ctx: MutationCtx,
  businesses: ReadonlyMap<string, string>,
  entries: readonly (typeof CURATED_PROVIDER_PUBLICATIONS)[number][],
  now: number,
): Promise<void> {
  const seeds = new Map<string, ConnectionSeed>()
  for (const entry of entries) {
    const businessId = businesses.get(entry.businessSlug)
    if (businessId === undefined) throw new Error(`curated_provider_business_missing:${entry.businessSlug}`)
    const seed = curatedConnectionSeed(entry, businessId as Id<'businesses'>)
    if (seed !== undefined) seeds.set(seed.connectionRef, mergeConnectionSeed(seeds.get(seed.connectionRef), seed))
  }
  for (const seed of seeds.values()) {
    const commandId = `seed:curated-provider-connection:${seed.connectionRef}`
    const existing = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', seed.connectionRef))
      .unique()
    const result = createProviderConnection({
      commandId,
      connectionRef: seed.connectionRef,
      businessId: seed.businessId,
      providerRef: seed.providerRef,
      providerAccountRef: seed.providerAccountRef,
      adapterId: seed.adapterId,
      credentialRef: seed.credentialRef,
      requestedScopes: seed.grantedScopes,
      grantedScopes: seed.grantedScopes,
      requestedResources: seed.grantedResources,
      grantedResources: seed.grantedResources,
      evidenceRefs: seed.evidenceRefs,
    }, now, existing === null ? undefined : existing as ProviderConnection)
    if (result.kind === 'refused') throw new Error(`curated_provider_connection_refused:${seed.connectionRef}:${result.code}`)
    if (existing !== null || result.kind !== 'applied') continue
    const connection = result.connection
    await ctx.db.insert('capabilityProviderConnections', {
      connectionRef: connection.connectionRef,
      businessId: connection.businessId as Id<'businesses'>,
      providerRef: connection.providerRef,
      providerAccountRef: connection.providerAccountRef,
      adapterId: connection.adapterId,
      credentialRef: connection.credentialRef,
      grantedScopes: [...connection.grantedScopes],
      grantedResources: [...connection.grantedResources],
      authorityGeneration: connection.authorityGeneration,
      authorityDigest: connection.authorityDigest,
      lifecycle: connection.lifecycle,
      observedAt: connection.observedAt,
      ...(connection.expiresAt === undefined ? {} : { expiresAt: connection.expiresAt }),
      ...(connection.revokedAt === undefined ? {} : { revokedAt: connection.revokedAt }),
      ...(connection.reasonCode === undefined ? {} : { reasonCode: connection.reasonCode }),
      evidenceRefs: [...connection.evidenceRefs],
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
      lastCommandId: connection.lastCommandId ?? commandId,
      lastCommandDigest: connection.lastCommandDigest ?? result.commandDigest,
    })
  }
}

const LEGACY_EXA_PUBLICATION_REFS = [
  'offering:agentic-market-exa:search:v1',
  'offering:agentic-market-exa:contents:v1',
] as const
const publicationResult = v.object({
  businessSlug: v.string(),
  capabilityId: v.string(),
  operationRef: v.string(),
  publicationRef: v.string(),
  readiness: v.union(
    v.literal('active'),
    v.literal('pending'),
    v.literal('unavailable'),
  ),
})

/**
 * Idempotently ports the source-owned real-provider records into the generic
 * Contract -> Offering -> Binding -> Publication path. Readiness remains a
 * separate live observation; this mutation never fabricates it.
 */
export const seed = internalMutation({
  args: { runtimeEnvironment: v.union(v.literal('sandbox'), v.literal('production')) },
  returns: v.object({
    kind: v.union(v.literal('seeded'), v.literal('source_drift_requires_migration')),
    sourceDrift: v.array(v.string()),
    businessSlugs: v.array(v.string()),
    publications: v.array(publicationResult),
    mappingRef: v.string(),
  }),
  handler: async (ctx, args) => {
    const seedEntries = args.runtimeEnvironment === 'production'
      ? CURATED_PROVIDER_PUBLICATIONS.filter((entry) => !isDemoOrDevelopmentKeyedPublication(entry))
      : CURATED_PROVIDER_PUBLICATIONS
    const providerSlugs = [...new Set(seedEntries.map(({ businessSlug }) => parseProviderSlug(businessSlug)))]

    const now = Date.now()
    await ensureCatalogProjectionControlsCommand(ctx.db, {
      actorRef: 'system:dev-seed',
      operationKey: 'seed:operator-control',
      correlationId: 'seed:operator-control',
      reasonCode: 'dev_seed_enable',
      evidenceRefs: ['seed:operator-control'],
    }, now)
    const currentPublicationRefs = new Set(
      seedEntries.map(({ publication }) => publication.commercial.offering.offeringId),
    )
    const removedPublications = (await ctx.db.query('capabilityPublications')
      .withIndex('by_networkId_and_disposition', (query) => query.eq('networkId', 'ae:public').eq('disposition', 'current'))
      .take(100)).filter((publication) => (
      publication.networkId === 'ae:public'
      && publication.publisherRef === CURATED_PUBLISHER_REF
      && !currentPublicationRefs.has(publication.publicationRef)
    ))
    for (const [index, publication] of removedPublications.entries()) {
      await retireStaleCuratedSupply(ctx, {
        capabilityId: publication.capabilityId,
        version: publication.version,
        offeringId: publication.offeringId,
        bindingId: publication.bindingId,
        now: now + index,
      })
    }
    const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter(({ requestedSlug }) => (
      providerSlugs.some((slug) => slug === parseProviderSlug(requestedSlug))
    ))
    if (fixtures.length !== providerSlugs.length) {
      throw new Error('curated_provider_business_fixture_missing')
    }
    const seedCatalog = buildDevSeedCatalogState(fixtures)
    const sourceOfferingRefBySlug = new Map(seedCatalog.state.businesses.map((business) => {
      const offering = seedCatalog.state.offerings.find((candidate) => candidate.businessId === business.businessId)
      if (offering === undefined) throw new Error(`curated_provider_catalog_offering_fixture_missing:${business.slug}`)
      return [business.slug, offering.offeringRef] as const
    }))
    const existing = await Promise.all(providerSlugs.map(async (slug) => (
      await ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', slug)).unique()
    )))
    const missing = fixtures.filter(({ requestedSlug }) => (
      existing.every((business) => business?.slug !== requestedSlug)
    ))
    if (missing.length > 0) {
      await registerCuratedProviderBusinesses(ctx.db, missing, now)
    }

    const businesses = new Map<string, string>()
    for (const slug of providerSlugs) {
      const business = await ctx.db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', slug))
        .unique()
      if (business === null || business.publicStatus !== 'published' || business.claimStatus !== 'published') {
        throw new Error(`curated_provider_business_unavailable:${slug}`)
      }
      businesses.set(slug, business._id)
    }
    await ensureCuratedProviderConnections(ctx, businesses, seedEntries, now)

    // Resolve each curated business's published catalog offering so every seeded
    // capability can carry a `catalog_offering` origin pointing at it (the W1
    // business→capability seam). The origin's offeringRef MUST equal the catalog
    // offering's offeringRef for the services surface to enrich `endpoints[]`.
    const catalogOfferingByBusiness = new Map<string, {
      offeringRef: string
      revision: number
      sourceHash: string
    }>()
    for (const slug of providerSlugs) {
      const businessId = businesses.get(slug)
      if (businessId === undefined) throw new Error(`curated_provider_business_missing:${slug}`)
      const sourceOfferingRef = sourceOfferingRefBySlug.get(parseProviderSlug(slug))
      if (sourceOfferingRef === undefined) throw new Error(`curated_provider_catalog_offering_fixture_missing:${slug}`)
      const sourceOffering = await ctx.db.query('businessOfferings')
        .withIndex('by_offeringRef', (query) => query.eq('offeringRef', sourceOfferingRef))
        .unique()
      const publishedOfferings = await ctx.db.query('businessOfferings')
        .withIndex('by_businessId_and_status', (query) => (
          query.eq('businessId', businessId as Id<'businesses'>).eq('status', 'published')
        ))
        .take(2)
      const offering = sourceOffering?.businessId === businessId && sourceOffering.status === 'published'
        ? sourceOffering
        : publishedOfferings.length === 1
          ? publishedOfferings[0]
          : undefined
      if (offering === undefined) throw new Error(`curated_provider_catalog_offering_unresolved:${slug}`)
      const revision = await ctx.db.query('businessOfferingRevisions')
        .withIndex('by_offeringRef_and_revision', (query) => (
          query.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision)
        ))
        .unique()
      if (revision === null) throw new Error(`curated_provider_catalog_revision_missing:${slug}`)
      catalogOfferingByBusiness.set(slug, {
        offeringRef: offering.offeringRef,
        revision: offering.currentRevision,
        sourceHash: revision.sourceHash,
      })
    }

    type CatalogOfferingLineage = Readonly<{
      offeringRef: string
      revision: number
      sourceHash: string
    }>
    type StagedCuratedPublication = Readonly<{
      index: number
      entry: typeof CURATED_PROVIDER_PUBLICATIONS[number]
      businessId: string
      prepared: PreparedPublicationMaterial
      contract: CapabilityContract
      catalogOffering: CatalogOfferingLineage
      accessPathRef: string
      accessPath: OfferingAccessPathDescriptor
    }>

    // Admit every source descriptor before mutating either capability supply
    // or catalog state. The prepared material is the single source of truth
    // for the operation-specific path linked to its publication below.
    const stagedPublications: StagedCuratedPublication[] = []
    const contracts = new Map<string, CapabilityContract>()
    for (const [index, entry] of seedEntries.entries()) {
      const businessId = businesses.get(entry.businessSlug)
      if (businessId === undefined) throw new Error(`curated_provider_business_missing:${entry.businessSlug}`)
      const sourceOffering = entry.publication.commercial.offering
      const price = sourceOffering.presentation.price
      if (price.kind !== 'fixed') {
        throw new Error(`curated_provider_publication_price_unavailable:${entry.businessSlug}`)
      }
      const preparedResult = await preparePublicationDraft({
        source: decodeConvexPublicationSource(entry.publication) as CapabilityPublicationImport,
        sourceRevision: `system:curated-provider-bootstrap:${sourceOffering.offeringId}:v1`,
        pricingConfig: {
          version: 'pricing:v2',
          unit: 'call',
          paidAmount: price.amount,
        } satisfies PricingConfig,
        evidenceRefs: entry.publication.evidenceRefs,
      })
      if (preparedResult.kind !== 'prepared') {
        throw new Error(`curated_provider_publication_${preparedResult.reason}`)
      }
      const prepared = preparedResult.prepared
      const contract = defineCapabilityContract(JSON.parse(prepared.documentJson))
      const catalogOffering = catalogOfferingByBusiness.get(entry.businessSlug)
      if (catalogOffering === undefined) {
        throw new Error(`curated_provider_catalog_offering_unresolved:${entry.businessSlug}`)
      }
      const configJson = JSON.stringify(prepared.binding.adapter.config)
      if (configJson === undefined) throw new Error('curated_provider_transport_config_unserializable')
      const transport = parseAdmittedTransportCatalogMetadata(
        prepared.binding.adapter.adapterId,
        configJson,
      )
      if (transport === undefined) {
        throw new Error(`curated_provider_transport_unresolved:${entry.businessSlug}`)
      }
      const accessPathRef = `access:${catalogOffering.offeringRef}:curated-operation:${prepared.offering.offeringId}`
      const accessPath: OfferingAccessPathDescriptor = {
        kind: 'external_operation',
        name: prepared.offering.presentation.label,
        summary: prepared.offering.presentation.summary,
        url: prepared.binding.endpointUrl,
        method: transport.method,
        provenance: 'publicly_observed',
      }
      stagedPublications.push({
        index,
        entry,
        businessId,
        prepared,
        contract,
        catalogOffering,
        accessPathRef,
        accessPath,
      })
      contracts.set(contract.ref.capabilityId, contract)
    }

    // Catalog access paths are source-owned and must exist before a capability
    // can be admitted against them. Upsert every path first, then read back the
    // persisted lineage (including its canonical source hash) rather than
    // trusting the in-memory descriptor.
    const accessPathLineageByRef = new Map<string, Readonly<{
      offeringRef: string
      offeringRevision: number
      offeringSourceHash: string
      accessPathRef: string
      accessPathSourceHash: string
    }>>()
    for (const staged of stagedPublications) {
      const ownerRow = await ctx.db.get(staged.businessId as Id<'businesses'>)
      if (ownerRow === null) throw new Error(`curated_provider_owner_missing:${staged.entry.businessSlug}`)
      const owner = await ctx.db.get(ownerRow.ownerId)
      if (owner === null) throw new Error(`curated_provider_owner_missing:${staged.entry.businessSlug}`)
      const operationKey = `seed:offering-access-path:${staged.entry.businessSlug}:${staged.catalogOffering.offeringRef}:${staged.catalogOffering.revision}:${staged.catalogOffering.sourceHash}:${staged.accessPathRef}:${canonicalDigest(staged.accessPath)}`
      const upserted = await upsertOfferingAccessPathCommand(ctx.db, {
        actorRef: owner.clerkUserId,
        businessId: staged.businessId as Id<'businesses'>,
        offeringRef: staged.catalogOffering.offeringRef,
        accessPathRef: staged.accessPathRef,
        expectedRevision: staged.catalogOffering.revision,
        operationKey,
        descriptor: staged.accessPath,
      }, now + 100_000 + staged.index)
      if (upserted.kind !== 'ok') {
        throw new Error(`curated_provider_access_path_${upserted.code}:${staged.entry.businessSlug}`)
      }
      const persisted = await ctx.db.query('offeringAccessPaths')
        .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', staged.accessPathRef))
        .unique()
      if (
        persisted === null
        || persisted.status !== 'published'
        || String(persisted.businessId) !== staged.businessId
        || persisted.offeringRef !== staged.catalogOffering.offeringRef
        || persisted.offeringRevision !== staged.catalogOffering.revision
        || persisted.offeringSourceHash !== staged.catalogOffering.sourceHash
        || canonicalDigest(persisted.descriptor) !== canonicalDigest(staged.accessPath)
      ) {
        throw new Error(`curated_provider_access_path_lineage_invalid:${staged.entry.businessSlug}`)
      }
      accessPathLineageByRef.set(staged.accessPathRef, {
        offeringRef: persisted.offeringRef,
        offeringRevision: persisted.offeringRevision,
        offeringSourceHash: persisted.offeringSourceHash,
        accessPathRef: persisted.accessPathRef,
        accessPathSourceHash: persisted.sourceHash,
      })
    }

    const publications: Array<{
      businessSlug: string
      capabilityId: string
      operationRef: string
      publicationRef: string
      readiness: 'active' | 'pending' | 'unavailable'
    }> = []
    for (const staged of stagedPublications) {
      const path = accessPathLineageByRef.get(staged.accessPathRef)
      if (path === undefined) {
        throw new Error(`curated_provider_access_path_lineage_missing:${staged.entry.businessSlug}`)
      }
      const publishInput = {
        businessId: staged.businessId,
        runtimeEnvironment: args.runtimeEnvironment,
        prepared: staged.prepared,
        operationKey: `curated-provider:publish:${staged.prepared.offering.offeringId}`,
        correlationId: `curated-provider:${staged.entry.businessSlug}`,
        reasonCode: 'source_owned_curated_provider_publication',
        evidenceRefs: [...staged.prepared.evidenceRefs],
        origin: {
          kind: 'catalog_offering' as const,
          offeringRef: path.offeringRef,
          offeringRevision: path.offeringRevision,
          offeringSourceHash: path.offeringSourceHash,
          declaredAccessPathRef: path.accessPathRef,
          accessPathSourceHash: path.accessPathSourceHash,
        },
        now: now + staged.index,
      } as const
      const published = await publishCuratedCapability(ctx, publishInput)
      if (published.kind === 'refused') {
        if (
          published.reason === 'contract_identity_conflict'
          || published.reason === 'offering_identity_conflict'
        ) {
          await retireStaleCuratedSupply(ctx, {
            capabilityId: staged.contract.ref.capabilityId,
            version: staged.contract.ref.version,
            offeringId: staged.prepared.offering.offeringId,
            bindingId: staged.prepared.binding.bindingId,
            now: now + staged.index,
          })
          return {
            kind: 'source_drift_requires_migration' as const,
            sourceDrift: [`${staged.entry.businessSlug}:${staged.prepared.offering.offeringId}:${published.reason}`],
            businessSlugs: [...providerSlugs],
            publications: [],
            mappingRef: '',
          }
        }
        throw new Error(`curated_provider_publication_${published.reason}`)
      }

      const [offering, binding] = await Promise.all([
        ctx.db.query('capabilityOfferings')
          .withIndex('by_offeringId', (query) => query.eq('offeringId', published.offeringId))
          .unique(),
        ctx.db.query('capabilityTransportBindings')
          .withIndex('by_bindingId', (query) => query.eq('bindingId', published.bindingId))
          .unique(),
      ])
      if (offering === null || binding === null) throw new Error('curated_provider_supply_registration_missing')
      const eligibility = await setCapabilitySupplyEligibilityCommand(ctx.db, {
        actor: { kind: 'system', ref: 'system:curated-provider-bootstrap' },
        context: {
          operationKey: `curated-provider:eligibility:${published.bindingId}`,
          correlationId: `curated-provider:${staged.entry.businessSlug}`,
          reasonCode: 'source_owned_contract_and_transport_conformance',
          evidenceRefs: [...staged.prepared.evidenceRefs],
        },
        eligibility: {
          offeringId: published.offeringId,
          bindingId: published.bindingId,
          contractRef: published.contractRef,
          decision: 'admit',
          expectedOfferingRegistrationHash: offering.registrationHash,
          expectedBindingRegistrationHash: binding.registrationHash,
          admissionEvidenceRefs: [...staged.prepared.evidenceRefs],
          conformanceEvidenceRefs: ['source:tests:provider-conformance', ...staged.prepared.evidenceRefs],
        },
      }, now + staged.index + 100)
      if (eligibility.kind !== 'eligible') {
        throw new Error(`curated_provider_eligibility_${eligibility.kind}`)
      }

      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', published.publicationRef).eq('revision', 1)
        ))
        .unique()
      if (publication === null) throw new Error('curated_provider_publication_missing')
      publications.push({
        businessSlug: staged.entry.businessSlug,
        capabilityId: published.contractRef.capabilityId,
        operationRef: publication.operationRef,
        publicationRef: publication.publicationRef,
        readiness: publication.credentialState === 'unavailable'
          ? 'unavailable'
          : publication.credentialState === 'ready' && publication.healthState === 'healthy'
            ? 'active'
            : 'pending',
      })
    }

    // Rebuild each business after every exact origin has been admitted. The
    // projection can therefore expose one independent endpoint per declared
    // access path without falling back to an offering-level link.
    for (const slug of providerSlugs) {
      const businessId = businesses.get(slug)
      if (businessId === undefined) throw new Error(`curated_provider_endpoint_wiring_missing:${slug}`)
      const support = await deriveBusinessOfferingSupportFromCapabilitySupply(
        ctx.db,
        businessId as Id<'businesses'>,
        now + 100_100,
      )
      const rebuilt = await rebuildBusinessSupplyProjectionSnapshotCommand({
        db: ctx.db,
        sourceDb: ctx.db,
        businessId: businessId as Id<'businesses'>,
        support,
        now: now + 100_200,
      })
      if (rebuilt.kind !== 'ok') {
        throw new Error(`curated_provider_projection_${rebuilt.code}:${slug}`)
      }
    }

    const searchContract = contracts.get('exa.search')
    const contentsContract = contracts.get('exa.contents')
    if (searchContract === undefined || contentsContract === undefined) {
      throw new Error('curated_exa_mapping_contract_missing')
    }
    const mapping = buildExaSearchContentsMapping(
      searchContract,
      contentsContract,
      createRegisteredOperationMappingRef,
    )
    const mappingEvidenceRefs = [...new Set(
      seedEntries
        .flatMap(({ businessSlug, publication }) => businessSlug === EXA_BUSINESS_SLUG ? publication.evidenceRefs : []),
    )]
    const mappingResult = await registerCuratedMapping(ctx, {
      networkId: 'ae:public',
      mapping,
      registrationEvidenceRefs: mappingEvidenceRefs,
    })
    if (mappingResult.kind !== 'registered') {
      throw new Error(`curated_exa_mapping_${mappingResult.reason}`)
    }

    return {
      kind: 'seeded' as const,
      sourceDrift: [],
      businessSlugs: [...providerSlugs],
      publications,
      mappingRef: mappingResult.mappingRef,
    }
  },
})

/**
 * Withdraws current source-owned supply when a curated source identity drifts.
 * Historical rows remain readable; the caller reports migration required rather
 * than deleting/re-registering the same logical identity in one seed run.
 */
async function retireStaleCuratedSupply(
  ctx: MutationCtx,
  input: Readonly<{
    capabilityId: string
    version: number
    offeringId: string
    bindingId: string
    now: number
  }>,
): Promise<{ retired: number }> {
  const colliding = (await ctx.db.query('capabilityPublications')
    .withIndex('by_networkId_and_disposition', (query) => query.eq('networkId', 'ae:public').eq('disposition', 'current'))
    .take(1000)).filter((publication) => (
      publication.publisherRef === CURATED_PUBLISHER_REF
      && (
        (publication.capabilityId === input.capabilityId && publication.version === input.version)
        || publication.publicationRef === input.offeringId
        || publication.bindingId === input.bindingId
      )
    ))
  let retired = 0
  for (const publication of colliding) {
    const withdrawn = await withdrawCuratedCapability(ctx, {
      publicationRef: publication.publicationRef,
      expectedRevision: publication.revision,
      evidenceRefs: [...CURATED_RETIREMENT_EVIDENCE],
      now: input.now,
    })
    if (withdrawn.kind !== 'withdrawn') {
      throw new Error(`curated_provider_stale_retirement_${withdrawn.reason}`)
    }
    retired += 1
  }
  return { retired }
}


export const retireLegacyExaV1 = internalMutation({
  args: {},
  returns: v.array(v.object({
    publicationRef: v.string(),
    status: v.union(v.literal('withdrawn'), v.literal('already_retired')),
  })),
  handler: async (ctx) => {
    const now = Date.now()
    const results = []
    for (const [index, publicationRef] of LEGACY_EXA_PUBLICATION_REFS.entries()) {
      const result = await withdrawCuratedCapability(ctx, {
        publicationRef,
        expectedRevision: 1,
        evidenceRefs: ['source:migration:curated-exa-v2'],
        now: now + index,
      })
      if (result.kind === 'refused' && (
        result.reason === 'publication_not_found'
        || result.reason === 'revision_changed'
      )) {
        results.push({ publicationRef, status: 'already_retired' as const })
        continue
      }
      if (result.kind !== 'withdrawn') {
        throw new Error(`curated_exa_v1_retirement_${result.reason}`)
      }
      results.push({ publicationRef, status: 'withdrawn' as const })
    }
    return results
  },
})
