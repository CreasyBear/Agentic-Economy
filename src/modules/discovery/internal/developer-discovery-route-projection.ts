import type { BusinessContext } from '@/modules/business/public'
import { getPublicBusinessCatalog } from '@/modules/registry/public'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import { readCatalogHealth } from '@/modules/registry/public'
import { sanitizeText } from '@/modules/common/sanitize-text'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import type { DiscoverySourceState, DiscoveryStatus } from '@/modules/discovery/public'
import {
  DeveloperDiscoveryArtifacts,
  DeveloperDiscoveryPublicRoutes,
  DeveloperDiscoverySchemaVersion,
  DeveloperDiscoveryUnsupportedCapabilities,
  type DeveloperDiscoveryArtifact,
  type DeveloperDiscoveryArtifactBase,
  type DeveloperDiscoveryArtifactKind,
  type DeveloperDiscoveryArtifactState,
  type DeveloperDiscoveryBotClass,
  type DeveloperDiscoveryCanonicalFunnelEvent,
  type DeveloperDiscoveryExamplesArtifact,
  type DeveloperDiscoveryFetchEvent,
  type DeveloperDiscoveryFetchKind,
  type DeveloperDiscoveryFetchReadback,
  type DeveloperDiscoveryFetchStatus,
  type DeveloperDiscoveryFreshness,
  type DeveloperDiscoveryFreshnessReadback,
  type DeveloperDiscoveryPublicCatalogFact,
  type DeveloperDiscoveryRouteExecution,
  type DeveloperDiscoveryRouteHealth,
  type DeveloperDiscoveryRouteHealthErrorCode,
  type DeveloperDiscoveryRouteReadback,
  type DeveloperDiscoveryRouteSnapshot,
  type DeveloperDiscoverySchemaArtifact,
  type DeveloperDiscoverySchemaField,
  type DeveloperDiscoverySchemaVersion as DeveloperDiscoverySchemaVersionType,
  type ReadDeveloperDiscoveryRouteOptions,
} from './developer-discovery-types'
import {
  evaluateDeveloperDiscoveryLaunchSupport,
  readDeveloperDiscoveryGatedExclusions,
  readDeveloperDiscoverySupportMatrix,
} from './developer-discovery-support-matrix'

const developerDiscoverySchemaFields = [
  'businessId',
  'slug',
  'name',
  'category',
  'businessContext.kind',
  'businessContext.suburb',
  'businessContext.stateTerritory',
  'businessContext.postcode',
  'businessContext.publishedPhone',
  'businessContext.website',
  'businessContext.providerIdentifier',
  'publicUrl',
  'trustTier',
  'responseTimeMinutes',
  'photos[].url',
  'photos[].alt',
  'observedAt',
  'disposition',
  'offerings[].offeringRef',
  'offerings[].revision',
  'offerings[].name',
  'offerings[].category',
  'offerings[].summary',
  'offerings[].serviceAreaSummary',
  'offerings[].availabilitySummary',
  'offerings[].pricingSummary',
  'offerings[].price',
  'offerings[].accessPaths',
  'offerings[].support',
  'accessSummary',
  'schemaVersion',
] as const

const developerDiscoveryCacheVersion = 'public-catalog-readonly-cache:v1' as const
const developerDiscoverySchemaFieldDefinitions: readonly DeveloperDiscoverySchemaField[] = [
  { path: 'businessId', required: true, nullable: false },
  { path: 'slug', required: true, nullable: false },
  { path: 'name', required: true, nullable: false },
  { path: 'category', required: true, nullable: false },
  { path: 'businessContext.kind', required: true, nullable: false, values: ['local_human', 'programmable_provider'] },
  { path: 'businessContext.suburb', required: false, nullable: false },
  { path: 'businessContext.stateTerritory', required: false, nullable: false },
  { path: 'businessContext.postcode', required: false, nullable: false },
  { path: 'businessContext.publishedPhone', required: false, nullable: false },
  { path: 'businessContext.website', required: false, nullable: false },
  { path: 'businessContext.providerIdentifier', required: false, nullable: false },
  { path: 'publicUrl', required: true, nullable: false },
  { path: 'trustTier', required: true, nullable: false, values: ['claimed', 'contact_confirmed', 'listed', 'registry_verified'] },
  { path: 'responseTimeMinutes', required: false, nullable: false },
  { path: 'photos[].url', required: true, nullable: false },
  { path: 'photos[].alt', required: true, nullable: false },
  { path: 'observedAt', required: true, nullable: false },
  { path: 'disposition', required: true, nullable: false, values: ['current', 'partial', 'stale'] },
  { path: 'offerings[].offeringRef', required: true, nullable: false },
  { path: 'offerings[].revision', required: true, nullable: false },
  { path: 'offerings[].name', required: true, nullable: false },
  { path: 'offerings[].category', required: true, nullable: false },
  { path: 'offerings[].summary', required: true, nullable: false },
  { path: 'offerings[].serviceAreaSummary', required: false, nullable: false },
  { path: 'offerings[].availabilitySummary', required: false, nullable: false },
  { path: 'offerings[].pricingSummary', required: false, nullable: false },
  { path: 'offerings[].price', required: false, nullable: false },
  { path: 'offerings[].accessPaths', required: true, nullable: false },
  { path: 'offerings[].support', required: true, nullable: false },
  { path: 'accessSummary', required: true, nullable: false },
  { path: 'schemaVersion', required: true, nullable: false, values: ['public-business-catalog-api:v2'] },
]

export function mapDeveloperDiscoveryRouteExecutions(
  executions: readonly DeveloperDiscoveryRouteExecution[]
): readonly DeveloperDiscoveryRouteHealth[] {
  return executions.map((execution) => {
    const errorCode = routeExecutionErrorCode(execution)
    const status = routeStatusFromErrorCode(errorCode)
    const freshness = routeFreshnessFromStatus(status)
    const reason = normalizePublicReason(execution.reason) ?? routeExecutionReason(errorCode, execution)

    return {
      route: execution.route,
      label: execution.label,
      status,
      freshness,
      reason,
      ...(execution.httpStatus === undefined ? {} : { httpStatus: execution.httpStatus }),
      checkedAt: execution.checkedAt,
      ...(execution.cacheControl === undefined ? {} : { cacheControl: execution.cacheControl }),
      ...(execution.schemaVersion === undefined ? {} : { schemaVersion: execution.schemaVersion }),
      ...(errorCode === undefined ? {} : { errorCode }),
    }
  })
}

export function readDeveloperDiscoveryRoute(
  state: DiscoverySourceState | undefined,
  options: ReadDeveloperDiscoveryRouteOptions = {}
): DeveloperDiscoveryRouteReadback {
  const canonicalBaseUrl = trimTrailingSlashes(options.canonicalBaseUrl ?? 'https://ae.example')
  const routeSnapshot = options.routeSnapshot
  let routeHealth: readonly DeveloperDiscoveryRouteHealth[]
  let publicFacts: readonly DeveloperDiscoveryPublicCatalogFact[]

  if (routeSnapshot !== undefined) {
    routeHealth = mapDeveloperDiscoveryRouteExecutions(routeSnapshot.routeExecutions)
    publicFacts = readDeveloperDiscoveryCatalogFactsFromSnapshot(routeSnapshot)
  } else {
    if (state === undefined) {
      throw new Error('Discovery source state or route snapshot is required.')
    }
    publicFacts = readDeveloperDiscoveryCatalogFacts(state)
    routeHealth = deriveDeveloperDiscoveryRouteHealth(
      canonicalBaseUrl,
      options.now ?? 0,
      readDeveloperDiscoveryFreshnessFromFacts(publicFacts),
    )
  }

  const sourceFreshness =
    routeSnapshot === undefined
      ? readDeveloperDiscoveryFreshnessFromFacts(publicFacts)
      : readDeveloperDiscoveryFreshnessFromRouteReadback(publicFacts, routeHealth)
  const freshness = sourceFreshness
  const supportReadiness = evaluateDeveloperDiscoveryLaunchSupport({
    requiredFunnelEvent: 'developer_docs_viewed',
    ...(options.supportRecord === undefined ? {} : { supportRecord: options.supportRecord }),
  })

  return {
    schemaVersion: DeveloperDiscoverySchemaVersion,
    generatedAt: options.now ?? 0,
    canonicalBaseUrl,
    catalogCount: publicFacts.length,
    supportReadiness,
    freshness,
    supportMatrix: readDeveloperDiscoverySupportMatrix({
      freshness,
      ...(options.projectionGates === undefined ? {} : { projectionGates: options.projectionGates }),
    }),
    gatedExclusions: readDeveloperDiscoveryGatedExclusions(),
    publicFacts,
    routeHealth,
    artifacts: DeveloperDiscoveryArtifacts.map((artifact) => ({
      kind: artifact.kind,
      label: artifact.label,
      downloadLabel: artifact.downloadLabel,
      route: artifact.route,
      state: freshness.state === 'current' ? 'available' : freshness.state,
      freshness: freshness.state,
      reason: freshness.reason,
      schemaFields: developerDiscoverySchemaFields,
    })),
    unsupportedCapabilities: DeveloperDiscoveryUnsupportedCapabilities,
    copy: {
      eyebrow: 'Builder readbacks',
      title: 'Read-only public catalog files',
      description: 'Source-owned catalog facts, schema shape, examples, freshness, and unavailable capability reasons for builders.',
      readOnlyNotice:
        'Read-only public facts. This page does not grant mutation, booking, commercial, or owner-action authority.',
    },
  }
}

export function readDeveloperDiscoveryFreshness(state: DiscoverySourceState): DeveloperDiscoveryFreshnessReadback {
  return readDeveloperDiscoveryFreshnessFromFacts(readDeveloperDiscoveryCatalogFacts(state))
}

export function readDeveloperDiscoveryRouteHealth(
  state: DiscoverySourceState,
  options: ReadDeveloperDiscoveryRouteOptions = {}
): readonly DeveloperDiscoveryRouteHealth[] {
  return readDeveloperDiscoveryRoute(state, options).routeHealth
}

export function generateDeveloperDiscoverySchema(
  state: DiscoverySourceState | undefined,
  options: ReadDeveloperDiscoveryRouteOptions = {}
): DeveloperDiscoverySchemaArtifact {
  const readback = readDeveloperDiscoveryRoute(state, options)
  const base = artifactBase('public_catalog_schema', readback, '/api/discovery/schema')
  const artifact: DeveloperDiscoverySchemaArtifact = {
    ...base,
    fields: developerDiscoverySchemaFieldDefinitions,
    statusVariants: {
      disposition: ['current', 'partial', 'stale'],
      offeringAccessPathKind: ['human_request', 'external_operation'],
      offeringSupport: ['integrated', 'ae_supported_action'],
    },
    pagination: {
      listRoutes: ['/api/businesses', '/api/businesses/search'],
      cursorSupported: true,
      limitSupported: true,
    },
  }

  return artifact
}

export function generateDeveloperDiscoveryExamples(
  state: DiscoverySourceState | undefined,
  options: ReadDeveloperDiscoveryRouteOptions = {}
): DeveloperDiscoveryExamplesArtifact {
  const readback = readDeveloperDiscoveryRoute(state, options)
  const base = artifactBase('public_catalog_examples', readback, '/api/discovery/examples')
  const examples =
    base.state === 'unavailable'
      ? []
      : options.routeSnapshot !== undefined
        ? readDeveloperDiscoveryPublicRouteCatalogsFromSnapshot(options.routeSnapshot)
        : state === undefined
          ? []
          : readDeveloperDiscoveryPublicRouteCatalogs(state)
  const artifact: DeveloperDiscoveryExamplesArtifact = {
    ...base,
    examples,
    emptyExample: {
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v2',
      page: [],
      isDone: true,
      continueCursor: '',
    },
  }

  return artifact
}

export function withholdDeveloperDiscoveryArtifact(
  artifact: DeveloperDiscoverySchemaArtifact,
  reason: string
): DeveloperDiscoverySchemaArtifact
export function withholdDeveloperDiscoveryArtifact(
  artifact: DeveloperDiscoveryExamplesArtifact,
  reason: string
): DeveloperDiscoveryExamplesArtifact
export function withholdDeveloperDiscoveryArtifact(
  artifact: DeveloperDiscoveryArtifact,
  reason: string
): DeveloperDiscoveryArtifact {
  const freshness: DeveloperDiscoveryFreshnessReadback = {
    state: 'unavailable',
    label: 'Artifact withheld',
    reason: normalizePublicReason(reason) ?? 'Artifact withheld by source-owned parity gate.',
  }
  const sharedBase = {
    state: 'unavailable' as const,
    freshness,
    parityStatus: 'withheld' as const,
    parityReason: freshness.reason,
  }

  switch (artifact.kind) {
    case 'public_catalog_schema':
      return {
        ...artifact,
        ...sharedBase,
        fields: [],
        statusVariants: artifact.statusVariants,
        pagination: artifact.pagination,
      }
    case 'public_catalog_examples':
      return { ...artifact, ...sharedBase, examples: [], emptyExample: artifact.emptyExample }
    default: {
      const _exhaustive: never = artifact
      return _exhaustive
    }
  }
}

export function recordDeveloperDiscoveryFetch(input: {
  kind: DeveloperDiscoveryFetchKind
  route: string
  status: DeveloperDiscoveryFetchStatus
  schemaVersion?: DeveloperDiscoverySchemaVersionType
  cacheVersion?: string
  freshness: DeveloperDiscoveryFreshness
  errorCode?: string
  botClass?: DeveloperDiscoveryBotClass
  publicBusinessId?: string
  publicServiceId?: string
  correlationId?: string
  timestamp: number
}): DeveloperDiscoveryFetchReadback {
  const telemetry: DeveloperDiscoveryFetchEvent = {
    route: normalizePublicReason(input.route) ?? '/developers/discovery',
    status: input.status,
    schemaVersion: input.schemaVersion ?? DeveloperDiscoverySchemaVersion,
    cacheVersion: input.cacheVersion ?? developerDiscoveryCacheVersion,
    freshness: input.freshness,
    ...(input.errorCode === undefined ? {} : { errorCode: normalizePublicReason(input.errorCode) ?? 'redacted_error' }),
    botClass: input.botClass ?? 'human',
    ...(input.publicBusinessId === undefined ? {} : { publicBusinessId: normalizePublicReason(input.publicBusinessId) ?? 'redacted' }),
    ...(input.publicServiceId === undefined ? {} : { publicServiceId: normalizePublicReason(input.publicServiceId) ?? 'redacted' }),
    correlationId: normalizePublicReason(input.correlationId) ?? `corr:developer-discovery:${input.kind}:${input.status}`,
    timestamp: input.timestamp,
  }
  const operatorState = fetchOperatorState(input.status)

  return {
    telemetry,
    requiredFunnelEvent: funnelEventForFetchKind(input.kind),
    operatorState,
  }
}

export function renderDeveloperDiscoveryRouteCopy(readback: DeveloperDiscoveryRouteReadback): string {
  const formatContext = (context: BusinessContext): string => context.kind === 'local_human'
    ? `${context.suburb}, ${context.stateTerritory}`
    : `${context.providerIdentifier} (${context.website})`
  return [
    readback.copy.eyebrow,
    readback.copy.title,
    readback.copy.description,
    readback.copy.readOnlyNotice,
    readback.freshness.label,
    readback.freshness.reason,
    `Developer discovery support: ${readback.supportReadiness.status}; ${readback.supportReadiness.reason}`,
    ...readback.supportMatrix.map(
      (row) => `${row.label}: ${row.state}; route=${row.routeReadbackStatus}; blocker=${row.blocker}; next=${row.nextAction}`
    ),
    ...readback.gatedExclusions.map(
      (exclusion) => `${exclusion.label}: ${exclusion.state}; ${exclusion.reason}; next=${exclusion.nextAction}`
    ),
    ...readback.publicFacts.map(
      (fact) =>
        `${fact.name} (${fact.slug}) — ${fact.category} in ${formatContext(fact.businessContext)}; disposition=${fact.disposition}; offerings=${fact.offeringCount}`
    ),
    ...readback.artifacts.map(
      (artifact) =>
        `${artifact.label}: ${artifact.state}; ${artifact.downloadLabel}; freshness=${artifact.freshness}; ${artifact.reason}`
    ),
    ...readback.routeHealth.map(
      (health) => `${health.label}: ${health.status}; freshness=${health.freshness}; ${health.reason}`
    ),
    ...readback.unsupportedCapabilities.map(
      (capability) => `${capability.label}: ${capability.state}; ${capability.reason}`
    ),
  ].join('\n')
}

function deriveDeveloperDiscoveryRouteHealth(
  canonicalBaseUrl: string,
  checkedAt: number,
  freshness: DeveloperDiscoveryFreshnessReadback
): readonly DeveloperDiscoveryRouteHealth[] {
  const errorCode =
    freshness.state === 'current' ? undefined : freshness.state === 'degraded' ? ('stale' as const) : ('unavailable' as const)

  return mapDeveloperDiscoveryRouteExecutions(
    DeveloperDiscoveryPublicRoutes.map((route) => ({
      route: `${canonicalBaseUrl}${route.path}`,
      label: route.label,
      ok: freshness.state === 'current',
      checkedAt,
      ...(errorCode === undefined ? {} : { errorCode }),
      reason: freshness.reason,
    }))
  )
}

function routeExecutionErrorCode(
  execution: DeveloperDiscoveryRouteExecution
): DeveloperDiscoveryRouteHealthErrorCode | undefined {
  if (execution.errorCode !== undefined) {
    return execution.errorCode
  }

  if (
    execution.expectedSchemaVersion !== undefined &&
    execution.schemaVersion !== undefined &&
    execution.expectedSchemaVersion !== execution.schemaVersion
  ) {
    return 'schema_version_mismatch'
  }

  if (execution.stale === true) {
    return 'stale'
  }

  if (!execution.ok) {
    return execution.httpStatus === 404 ? 'not_found' : 'route_outage'
  }

  return undefined
}

function routeStatusFromErrorCode(errorCode: DeveloperDiscoveryRouteHealthErrorCode | undefined): DiscoveryStatus {
  switch (errorCode) {
    case undefined:
      return 'available'
    case 'stale':
      return 'stale'
    case 'schema_version_mismatch':
      return 'degraded'
    case 'not_found':
    case 'route_outage':
    case 'unavailable':
    case 'withheld':
      return 'unavailable'
    default: {
      const _exhaustive: never = errorCode
      return _exhaustive
    }
  }
}

function routeFreshnessFromStatus(status: DiscoveryStatus): DeveloperDiscoveryFreshness {
  switch (status) {
    case 'available':
      return 'current'
    case 'degraded':
    case 'stale':
      return 'degraded'
    case 'unavailable':
      return 'unavailable'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

function routeExecutionReason(
  errorCode: DeveloperDiscoveryRouteHealthErrorCode | undefined,
  execution: DeveloperDiscoveryRouteExecution
): string {
  switch (errorCode) {
    case undefined:
      return 'Route returned current public readback.'
    case 'not_found':
      return 'Route returned not found for the selected public readback.'
    case 'route_outage':
      return 'Route handler could not be read back.'
    case 'stale':
      return 'Route readback is stale or degraded.'
    case 'schema_version_mismatch':
      return `Route schema version ${
        execution.schemaVersion ?? 'unknown'
      } did not match expected ${execution.expectedSchemaVersion ?? 'known public schema'}.`
    case 'unavailable':
      return 'Required public route input is unavailable.'
    case 'withheld':
      return 'Route output is withheld by source-owned parity gate.'
    default: {
      const _exhaustive: never = errorCode
      return _exhaustive
    }
  }
}

function normalizePublicReason(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const normalized = sanitizeText(value, 240)
  return normalized.length === 0 ? undefined : normalized
}

function readDeveloperDiscoveryCatalogFacts(state: DiscoverySourceState): readonly DeveloperDiscoveryPublicCatalogFact[] {
  return state.businesses
    .map((business) => {
      const catalogHealth = readCatalogHealth(state, business.businessId)
      if (catalogHealth.sourceState !== 'published') {
        return undefined
      }

      const result = getPublicBusinessCatalog(state, {
        slug: business.slug,
        indexStatus: catalogHealth.indexStatus,
        discoveryStatus: 'available',
      })

      return result.kind === 'available'
        ? toDeveloperDiscoveryFactFromApi(result.catalog)
        : undefined
    })
    .filter((catalog): catalog is DeveloperDiscoveryPublicCatalogFact => catalog !== undefined)
    .sort((left, right) => left.slug.localeCompare(right.slug))
}

function readDeveloperDiscoveryCatalogFactsFromSnapshot(
  snapshot: DeveloperDiscoveryRouteSnapshot
): readonly DeveloperDiscoveryPublicCatalogFact[] {
  return readDeveloperDiscoveryPublicRouteCatalogsFromSnapshot(snapshot)
    .map((catalog) => toDeveloperDiscoveryFactFromApi(catalog))
    .sort((left, right) => left.slug.localeCompare(right.slug))
}

function readDeveloperDiscoveryPublicRouteCatalogs(state: DiscoverySourceState): readonly PublicBusinessCatalogApiV2Dto[] {
  return state.businesses
    .map((business) => {
      const catalogHealth = readCatalogHealth(state, business.businessId)
      if (catalogHealth.sourceState !== 'published') {
        return undefined
      }

      const result = getPublicBusinessCatalog(state, {
        slug: business.slug,
        indexStatus: catalogHealth.indexStatus,
        discoveryStatus: 'available',
      })

      return result.kind === 'available' ? result.catalog : undefined
    })
    .filter((catalog): catalog is PublicBusinessCatalogApiV2Dto => catalog !== undefined)
    .sort((left, right) => left.slug.localeCompare(right.slug))
}

type DeveloperDiscoveryRouteCatalog = PublicBusinessCatalogApiV2Dto

function readDeveloperDiscoveryPublicRouteCatalogsFromSnapshot(
  snapshot: DeveloperDiscoveryRouteSnapshot
): readonly DeveloperDiscoveryRouteCatalog[] {
  const bySlug = new Map<string, DeveloperDiscoveryRouteCatalog>()
  const add = (catalog: DeveloperDiscoveryRouteCatalog): void => {
    bySlug.set(catalog.slug, catalog)
  }

  if (snapshot.list.body?.kind === 'ok' && Array.isArray(snapshot.list.body.page)) {
    for (const catalog of snapshot.list.body.page) {
      add(catalog)
    }
  }

  if (snapshot.search.body?.kind === 'ok' && Array.isArray(snapshot.search.body.items)) {
    for (const catalog of snapshot.search.body.items) {
      add(catalog)
    }
  }

  if (snapshot.detail?.body?.kind === 'found') {
    add(snapshot.detail.body.business)
  }

  return Array.from(bySlug.values()).sort((left, right) => left.slug.localeCompare(right.slug))
}
function toDeveloperDiscoveryFactFromApi(
  catalog: DeveloperDiscoveryRouteCatalog,
): DeveloperDiscoveryPublicCatalogFact {
  const accessPathKinds = uniqueSorted(
    catalog.offerings.flatMap((offering) => offering.accessPaths.map((path) => path.kind)),
  ) as readonly PublicBusinessCatalogApiV2Dto['offerings'][number]['accessPaths'][number]['kind'][]
  const supportStates = uniqueSorted(
    catalog.offerings.flatMap((offering) => [
      ...(offering.support.integrated ? ['integrated' as const] : []),
      ...(offering.support.aeSupportedAction ? ['ae_supported_action' as const] : []),
    ]),
  ) as readonly ('integrated' | 'ae_supported_action')[]

  return {
    slug: catalog.slug,
    name: catalog.name,
    category: catalog.category,
    businessContext: catalog.businessContext,
    publicUrl: catalog.publicUrl,
    schemaVersion: catalog.schemaVersion,
    disposition: catalog.disposition,
    observedAt: catalog.observedAt,
    offeringCount: catalog.offerings.length,
    accessPathKinds,
    supportStates,
  }
}

function readDeveloperDiscoveryFreshnessFromFacts(
  publicFacts: readonly DeveloperDiscoveryPublicCatalogFact[]
): DeveloperDiscoveryFreshnessReadback {
  if (publicFacts.length === 0) {
    return {
      state: 'unavailable',
      label: 'Artifacts unavailable',
      reason: 'No source-owned public catalog facts are published.',
    }
  }

  if (publicFacts.every((fact) => fact.disposition === 'stale')) {
    return {
      state: 'degraded',
      label: 'Discovery degraded',
      reason: 'Every public catalog is stale for the current source readback.',
    }
  }

  if (publicFacts.some((fact) => fact.disposition !== 'current')) {
    return {
      state: 'degraded',
      label: 'Discovery degraded',
      reason: 'At least one public catalog is missing a current discovery readback.',
    }
  }

  return {
    state: 'current',
    label: 'Discovery current',
    reason: 'Public catalog, read path status, schema, and examples match current source state.',
  }
}

function readDeveloperDiscoveryFreshnessFromRouteReadback(
  publicFacts: readonly DeveloperDiscoveryPublicCatalogFact[],
  routeHealth: readonly DeveloperDiscoveryRouteHealth[]
): DeveloperDiscoveryFreshnessReadback {
  if (publicFacts.length === 0) {
    const listHealth = routeHealth.find((health) => health.route.endsWith('/api/businesses'))
    return {
      state: 'unavailable',
      label: 'Artifacts unavailable',
      reason: listHealth?.reason ?? 'No route-derived public catalog facts are published.',
    }
  }

  const criticalFailingHealth = routeHealth.find(
    (health) => health.status !== 'available' && isDeveloperDiscoveryCriticalCatalogRoute(health.route)
  )
  if (criticalFailingHealth !== undefined) {
    return {
      state:
        criticalFailingHealth.status === 'stale' || criticalFailingHealth.status === 'degraded'
          ? 'degraded'
          : 'unavailable',
      label:
        criticalFailingHealth.status === 'stale' || criticalFailingHealth.status === 'degraded'
          ? 'Route readback degraded'
          : 'Route readback unavailable',
      reason: `${criticalFailingHealth.label}: ${criticalFailingHealth.reason}`,
    }
  }

  const nonCriticalFailingHealth = routeHealth.find((health) => health.status !== 'available')
  if (nonCriticalFailingHealth !== undefined) {
    return {
      state: 'degraded',
      label: 'Route readback degraded',
      reason: `${nonCriticalFailingHealth.label}: ${nonCriticalFailingHealth.reason}`,
    }
  }

  if (publicFacts.every((fact) => fact.disposition === 'stale')) {
    return {
      state: 'degraded',
      label: 'Discovery degraded',
      reason: 'Every route-derived public catalog is stale for the current source readback.',
    }
  }

  if (publicFacts.some((fact) => fact.disposition !== 'current')) {
    return {
      state: 'degraded',
      label: 'Discovery degraded',
      reason: 'At least one route-derived public catalog is missing a current discovery readback.',
    }
  }

  return {
    state: 'current',
    label: 'Discovery current',
    reason: 'Public routes, schema versions, and examples match current route readback.',
  }
}

function isDeveloperDiscoveryCriticalCatalogRoute(route: string): boolean {
  let pathname = route
  try {
    pathname = new URL(route, 'https://ae.example').pathname
  } catch {
    pathname = route.split('?')[0] ?? route
  }

  return (
    pathname === '/api/businesses' ||
    pathname === '/api/businesses/search' ||
    (pathname.startsWith('/api/businesses/') && !pathname.includes('__missing_discovery_slug__'))
  )
}

function artifactBase<K extends DeveloperDiscoveryArtifactKind>(
  kind: K,
  readback: DeveloperDiscoveryRouteReadback,
  route: string
): DeveloperDiscoveryArtifactBase & { kind: K } {
  const state: DeveloperDiscoveryArtifactState = readback.freshness.state === 'current' ? 'available' : readback.freshness.state

  return {
    kind,
    schemaVersion: DeveloperDiscoverySchemaVersion,
    cacheVersion: developerDiscoveryCacheVersion,
    generatedAt: readback.generatedAt,
    sourceRoute: `${readback.canonicalBaseUrl}${route}`,
    state,
    freshness: readback.freshness,
    parityStatus: state === 'unavailable' ? 'withheld' : 'matched',
    parityReason: readback.freshness.reason,
    nonAuthority: true,
    unsupported: {
      mutation: false,
      payment: false,
      protectedAction: false,
      providerOperation: false,
      requestMarket: false,
    },
  }
}

function funnelEventForFetchKind(kind: DeveloperDiscoveryFetchKind): DeveloperDiscoveryCanonicalFunnelEvent {
  switch (kind) {
    case 'docs':
      return 'developer_docs_viewed'
    case 'schema':
      return 'schema_downloaded'
    case 'examples':
      return 'example_fixture_downloaded'
    case 'health':
      return 'discovery_health_viewed'
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

function fetchOperatorState(status: DeveloperDiscoveryFetchStatus): DeveloperDiscoveryFetchReadback['operatorState'] {
  switch (status) {
    case 'successful':
    case 'cached':
      return 'shipped'
    case 'stale':
    case 'schema_version_mismatch':
      return 'degraded'
    case 'invalid':
    case 'not_found':
    case 'route_outage':
      return status === 'invalid' ? 'withheld' : 'unavailable'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}
