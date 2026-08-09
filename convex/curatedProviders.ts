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
  FRANKFURTER_BUSINESS_SLUG,
  normalizeCapabilityPublication,
  parseAdmittedTransportCatalogMetadata,
  type CapabilityPublicationImportResult,
} from '@/modules/capability-supply/public'
import {
  createProviderConnection,
  type ProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import { buildDevSeedCatalogState, DEV_SEED_BUSINESS_FIXTURES } from '@/modules/dev/public'

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
  upsertOfferingAccessPathCommand,
} from './catalog'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './capabilitySupplyProjection'
import { registerSandboxBusinesses } from './devSeed'

const CURATED_PUBLISHER_REF = 'system:curated-provider-bootstrap'
const CURATED_RETIREMENT_EVIDENCE = ['source:migration:curated-source-drift-retirement']

const CURATED_PROVIDER_CREDENTIAL_REFS: Readonly<Record<string, string>> = {
  'provider:exa': 'env:EXA_API_KEY',
  'provider:openweathermap': 'env:OPENWEATHER_API_KEY',
  'provider:tavily': 'env:TAVILY_API_KEY',
  'provider:serpapi': 'env:SERPAPI_API_KEY',
  'provider:coingecko': 'env:COINGECKO_DEMO_API_KEY',
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
function parseProviderSlug(value: string): Slug {
  const normalized = normalizeSlug(value)
  return brandNonEmpty(normalized, 'Slug')
}

async function ensureCuratedProviderConnections(
  ctx: MutationCtx,
  businesses: ReadonlyMap<string, string>,
  now: number,
): Promise<void> {
  const seeds = new Map<string, ConnectionSeed>()
  for (const entry of CURATED_PROVIDER_PUBLICATIONS) {
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

const PROVIDER_SLUGS: readonly Slug[] = [
  EXA_BUSINESS_SLUG,
  FRANKFURTER_BUSINESS_SLUG,
  // Cluster A (keyless) — 6
  'open-meteo-forecast',
  'open-meteo-geocoding',
  'wikipedia-rest-summary',
  'thecatapi-image-search',
  'coingecko-simple-price-keyless',
  'ipify',
  // Cluster B (keyed) — 4
  'openweathermap-current-weather',
  'tavily-search',
  'serpapi-google-search',
  'coingecko-simple-price-demo',
  // Cluster C (observed x402) — 7
  'agentic-market-exa-x402',
  'agentic-market-timezone-x402',
  'agentic-market-wolframalpha-x402',
  'agentic-market-coinmarketcap-x402',
  'agentic-market-flightaware-x402',
  'agentic-market-bizintel-x402',
  'agentic-market-tavily-x402',
].map(parseProviderSlug)
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
  args: {},
  returns: v.object({
    businessSlugs: v.array(v.string()),
    publications: v.array(publicationResult),
    mappingRef: v.string(),
  }),
  handler: async (ctx) => {
    const now = Date.now()
    await ensureCatalogProjectionControlsCommand(ctx.db, {
      actorRef: 'system:dev-seed',
      operationKey: 'seed:operator-control',
      correlationId: 'seed:operator-control',
      reasonCode: 'dev_seed_enable',
      evidenceRefs: ['seed:operator-control'],
    }, now)
    const currentPublicationRefs = new Set(
      CURATED_PROVIDER_PUBLICATIONS.map(({ publication }) => publication.commercial.offering.offeringId),
    )
    const removedPublications = (await ctx.db.query('capabilityPublications').collect()).filter((publication) => (
      publication.networkId === 'ae:public'
      && publication.publisherRef === CURATED_PUBLISHER_REF
      && !currentPublicationRefs.has(publication.publicationRef)
    ))
    for (const [index, publication] of removedPublications.entries()) {
      await retireStaleCuratedSupply(ctx, {
        capabilityId: publication.capabilityId,
        version: publication.version,
        contractDigest: '',
        offeringId: publication.offeringId,
        bindingId: publication.bindingId,
        now: now + index,
      })
    }
    const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter(({ requestedSlug }) => (
      PROVIDER_SLUGS.some((slug) => slug === parseProviderSlug(requestedSlug))
    ))
    if (fixtures.length !== PROVIDER_SLUGS.length) {
      throw new Error('curated_provider_business_fixture_missing')
    }

    const seedCatalog = buildDevSeedCatalogState(fixtures)
    const sourceOfferingRefBySlug = new Map(seedCatalog.state.businesses.map((business) => {
      const offering = seedCatalog.state.offerings.find((candidate) => candidate.businessId === business.businessId)
      if (offering === undefined) throw new Error(`curated_provider_catalog_offering_fixture_missing:${business.slug}`)
      return [business.slug, offering.offeringRef] as const
    }))
    const existing = await Promise.all(PROVIDER_SLUGS.map(async (slug) => (
      await ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', slug)).unique()
    )))
    const missing = fixtures.filter(({ requestedSlug }) => (
      existing.every((business) => business?.slug !== requestedSlug)
    ))
    if (missing.length > 0) {
      await registerSandboxBusinesses(ctx.db, missing, now)
    }

    const businesses = new Map<string, string>()
    for (const slug of PROVIDER_SLUGS) {
      const business = await ctx.db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', slug))
        .unique()
      if (business === null || business.publicStatus !== 'published' || business.claimStatus !== 'published') {
        throw new Error(`curated_provider_business_unavailable:${slug}`)
      }
      businesses.set(slug, business._id)
    }
    await ensureCuratedProviderConnections(ctx, businesses, now)


    // Resolve each curated business's published catalog offering so every seeded
    // capability can carry a `catalog_offering` origin pointing at it (the W1
    // business→capability seam). The origin's offeringRef MUST equal the catalog
    // offering's offeringRef for the services surface to enrich `endpoints[]`.
    const catalogOfferingByBusiness = new Map<string, {
      offeringRef: string
      revision: number
      sourceHash: string
    }>()
    for (const slug of PROVIDER_SLUGS) {
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

    type NormalizedCuratedPublication = Extract<
      CapabilityPublicationImportResult,
      { kind: 'normalized' }
    >
    type CatalogOfferingLineage = Readonly<{
      offeringRef: string
      revision: number
      sourceHash: string
    }>
    type StagedCuratedPublication = Readonly<{
      index: number
      entry: typeof CURATED_PROVIDER_PUBLICATIONS[number]
      businessId: string
      normalized: NormalizedCuratedPublication
      contract: CapabilityContract
      catalogOffering: CatalogOfferingLineage
      accessPathRef: string
      accessPath: OfferingAccessPathDescriptor
    }>

    // Normalize every source descriptor before mutating either capability
    // supply or catalog state. The stage is the single source of truth for the
    // operation-specific path that will be linked to its publication below.
    const stagedPublications: StagedCuratedPublication[] = []
    const contracts = new Map<string, CapabilityContract>()
    for (const [index, entry] of CURATED_PROVIDER_PUBLICATIONS.entries()) {
      const businessId = businesses.get(entry.businessSlug)
      if (businessId === undefined) throw new Error(`curated_provider_business_missing:${entry.businessSlug}`)
      const normalized = await normalizeCapabilityPublication(entry.publication)
      if (normalized.kind !== 'normalized') {
        throw new Error(`curated_provider_publication_${normalized.reason}`)
      }
      const contract = defineCapabilityContract(JSON.parse(normalized.draft.documentJson))
      const catalogOffering = catalogOfferingByBusiness.get(entry.businessSlug)
      if (catalogOffering === undefined) {
        throw new Error(`curated_provider_catalog_offering_unresolved:${entry.businessSlug}`)
      }
      const configJson = JSON.stringify(normalized.draft.binding.adapter.config)
      if (configJson === undefined) throw new Error('curated_provider_transport_config_unserializable')
      const transport = parseAdmittedTransportCatalogMetadata(
        normalized.draft.binding.adapter.adapterId,
        configJson,
      )
      if (transport === undefined) {
        throw new Error(`curated_provider_transport_unresolved:${entry.businessSlug}`)
      }
      const accessPathRef = `access:${catalogOffering.offeringRef}:curated-operation:${normalized.draft.offering.offeringId}`
      const accessPath: OfferingAccessPathDescriptor = {
        kind: 'external_operation',
        name: normalized.draft.offering.presentation.label,
        summary: normalized.draft.offering.presentation.summary,
        url: normalized.draft.binding.endpointUrl,
        method: transport.method,
        provenance: 'publicly_observed',
      }
      stagedPublications.push({
        index,
        entry,
        businessId,
        normalized,
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
      const source = staged.entry.publication
      const path = accessPathLineageByRef.get(staged.accessPathRef)
      if (path === undefined) {
        throw new Error(`curated_provider_access_path_lineage_missing:${staged.entry.businessSlug}`)
      }
      const publishInput = {
        businessId: staged.businessId,
        source,
        operationKey: `curated-provider:publish:${staged.normalized.draft.offering.offeringId}`,
        correlationId: `curated-provider:${staged.entry.businessSlug}`,
        reasonCode: 'source_owned_curated_provider_publication',
        evidenceRefs: [...source.evidenceRefs],
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
      let published = await publishCuratedCapability(ctx, publishInput)
      if (
        published.kind === 'refused'
        && (published.reason === 'contract_identity_conflict'
          || published.reason === 'offering_identity_conflict')
      ) {
        // The local deployment still holds state registered by an earlier source
        // revision whose content no longer matches the source-authoritative
        // content for the same identity. contract_identity_conflict means an
        // earlier contract revision's digest differs for the same
        // capabilityId+version; offering_identity_conflict means the stored
        // offering/publication registered for the same offeringId carries a
        // different offering registrationHash (e.g. enriched searchTerms) or
        // source digest than the current source produces. The canonical seed is
        // idempotent across its own source drift by retiring that stale
        // source-owned state and re-admitting the current content. This is
        // retire-and-replace, NOT a weakened identity guard: a capabilityId+
        // version (and an offeringId) still maps to exactly one content, the
        // source-authoritative one.
        await retireStaleCuratedSupply(ctx, {
          capabilityId: staged.contract.ref.capabilityId,
          version: staged.contract.ref.version,
          contractDigest: staged.contract.ref.contractDigest,
          offeringId: staged.normalized.draft.offering.offeringId,
          bindingId: staged.normalized.draft.binding.bindingId,
          now: now + staged.index,
        })
        published = await publishCuratedCapability(ctx, publishInput)
      }
      if (published.kind !== 'published') {
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
          evidenceRefs: [...source.evidenceRefs],
        },
        eligibility: {
          offeringId: published.offeringId,
          bindingId: published.bindingId,
          contractRef: published.contractRef,
          decision: 'admit',
          expectedOfferingRegistrationHash: offering.registrationHash,
          expectedBindingRegistrationHash: binding.registrationHash,
          admissionEvidenceRefs: [...source.evidenceRefs],
          conformanceEvidenceRefs: ['source:tests:provider-conformance', ...source.evidenceRefs],
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
    for (const slug of PROVIDER_SLUGS) {
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
      CURATED_PROVIDER_PUBLICATIONS
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
      businessSlugs: [...PROVIDER_SLUGS],
      publications,
      mappingRef: mappingResult.mappingRef,
    }
  },
})

/**
 * Retires the stale source-owned supply state for one curated publication whose
 * content has drifted from an earlier seed revision (either the contract
 * digest for a capabilityId+version, or the offering registrationHash / source
 * digest for an offeringId, e.g. enriched searchTerms), so the reseed can
 * re-admit the source-authoritative content. Only ever touches rows owned by
 * the curated provider bootstrap (publisherRef ownership); it never touches
 * other workstreams' data and it never weakens the
 * contract_identity_conflict / offering_identity_conflict guards (a
 * capabilityId+version and an offeringId still map to exactly one content — we
 * are replacing stale curated content with the current source content,
 * deliberately).
 */
async function retireStaleCuratedSupply(
  ctx: MutationCtx,
  input: Readonly<{
    capabilityId: string
    version: number
    contractDigest: string
    offeringId: string
    bindingId: string
    now: number
  }>,
): Promise<{ retired: number }> {
  const existingPublications = await ctx.db.query('capabilityPublications').collect()
  const colliding = existingPublications.filter((publication) => (
    publication.networkId === 'ae:public'
    && publication.publisherRef === CURATED_PUBLISHER_REF
    && (
      (publication.capabilityId === input.capabilityId && publication.version === input.version)
      || publication.publicationRef === input.offeringId
      || publication.bindingId === input.bindingId
    )
  ))
  if (colliding.length === 0) return { retired: 0 }

  const offeringIds = new Set<string>([input.offeringId])
  const bindingIds = new Set<string>([input.bindingId])
  const bindingToOffering = new Map<string, string>([[input.bindingId, input.offeringId]])
  for (const publication of colliding) {
    if (publication.disposition === 'current') {
      const withdrawn = await withdrawCuratedCapability(ctx, {
        publicationRef: publication.publicationRef,
        expectedRevision: publication.revision,
        evidenceRefs: [...CURATED_RETIREMENT_EVIDENCE],
        now: input.now,
      })
      if (withdrawn.kind !== 'withdrawn') {
        throw new Error(`curated_provider_stale_retirement_${withdrawn.reason}`)
      }
    }
    offeringIds.add(publication.offeringId)
    bindingIds.add(publication.bindingId)
    bindingToOffering.set(publication.bindingId, publication.offeringId)
  }


  // Delete the retired publication rows (any revision/disposition) and the
  // stale offering rows, all scoped to the curated offeringIds collected above.
  for (const offeringId of offeringIds) {
    const publicationRows = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => (
        query.eq('publicationRef', offeringId)
      ))
      .collect()
    for (const row of publicationRows) {
      if (row.publisherRef !== CURATED_PUBLISHER_REF) continue
      await ctx.db.delete(row._id)
    }
    await deleteCuratedOperationKey(
      ctx,
      'publishCapability',
      `curated-provider:publish:${offeringId}`,
    )
    const offering = await ctx.db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', offeringId))
      .unique()
    if (offering !== null) await ctx.db.delete(offering._id)
  }

  for (const bindingId of bindingIds) {
    const binding = await ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', bindingId))
      .unique()
    if (binding !== null) await ctx.db.delete(binding._id)
    await deleteCuratedOperationKey(
      ctx,
      'setCapabilitySupplyEligibility',
      `curated-provider:eligibility:${bindingId}`,
    )
  }

  // Only retire the stored contract when it is NOT the source-authoritative
  // content; a matching contract must never be deleted.
  const contractDocument = await ctx.db.query('capabilityContractDocuments')
    .withIndex('by_capabilityId_and_version', (query) => (
      query.eq('capabilityId', input.capabilityId).eq('version', input.version)
    ))
    .unique()
  if (contractDocument !== null && contractDocument.contractDigest !== input.contractDigest) {
    await ctx.db.delete(contractDocument._id)
  }

  // The curated operation mapping refs embed the drifted contract digests, so
  // the stale mapping + its ledger entry are retired; the seed re-registers the
  // mapping with the current refs.
  const staleMappings = await ctx.db.query('registeredOperationMappings')
    .withIndex('by_networkId_and_mappingRef', (query) => query.eq('networkId', 'ae:public'))
    .collect()
  for (const mapping of staleMappings) {
    if (mapping.publisherRef !== CURATED_PUBLISHER_REF) continue
    await ctx.db.delete(mapping._id)
  }
  const staleMappingKeys = await ctx.db.query('operationKeys')
    .withIndex('by_actor_operation_key', (query) => (
      query.eq('actorRef', CURATED_PUBLISHER_REF).eq('operationName', 'registerMapping')
    ))
    .collect()
  for (const operation of staleMappingKeys) {
    await ctx.db.delete(operation._id)
  }

  // Retire the supply-audit events written by the earlier source revision for
  // the purged operations (their event ids are deterministic). The re-admit
  // rewrites them with the current source content.
  const staleAuditEventIds = new Set<string>()
  for (const offeringId of offeringIds) {
    staleAuditEventIds.add(curatedSupplyAuditEventId({
      action: 'publish_capability',
      eventType: 'capability_publication.published',
      targetType: 'capability_publication',
      targetRef: offeringId,
      operationKey: `curated-provider:publish:${offeringId}`,
    }))
  }
  for (const [bindingId, offeringId] of bindingToOffering) {
    const operationKey = `curated-provider:eligibility:${bindingId}`
    staleAuditEventIds.add(curatedSupplyAuditEventId({
      action: 'set_eligibility',
      eventType: 'capability_supply.eligibility_changed',
      targetType: 'capability_offering',
      targetRef: offeringId,
      operationKey,
    }))
    staleAuditEventIds.add(curatedSupplyAuditEventId({
      action: 'set_eligibility',
      eventType: 'capability_supply.eligibility_changed',
      targetType: 'capability_binding',
      targetRef: bindingId,
      operationKey,
    }))
  }
  for (const eventId of staleAuditEventIds) {
    const existing = await ctx.db.query('auditEvents')
      .withIndex('by_eventId', (query) => query.eq('eventId', eventId))
      .unique()
    if (existing !== null) await ctx.db.delete(existing._id)
  }

  return { retired: colliding.length }
}

/** Mirrors the deterministic supply-audit event id (src/modules/capability-supply/internal/shared/supply-audit.ts). */
function curatedSupplyAuditEventId(input: Readonly<{
  action: string
  eventType: string
  targetType: string
  targetRef: string
  operationKey: string
}>): string {
  return `audit:capability_supply:${canonicalDigest({
    action: input.action,
    eventType: input.eventType,
    targetType: input.targetType,
    targetRef: input.targetRef,
    actorKind: 'system',
    actorRef: CURATED_PUBLISHER_REF,
    operationKey: input.operationKey,
  })}`
}

async function deleteCuratedOperationKey(
  ctx: MutationCtx,
  operationName: string,
  key: string,
): Promise<void> {
  const operation = await ctx.db.query('operationKeys')
    .withIndex('by_actor_operation_key', (query) => (
      query.eq('actorRef', CURATED_PUBLISHER_REF)
        .eq('operationName', operationName)
        .eq('key', key)
    ))
    .unique()
  if (operation !== null) await ctx.db.delete(operation._id)
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
