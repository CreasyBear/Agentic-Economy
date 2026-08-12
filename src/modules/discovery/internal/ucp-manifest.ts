import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import type {
  BuildCatalogDiscoveryManifestInput,
  BuildCatalogDiscoveryManifestResult,
  DiscoveryManifestContract,
  DiscoveryManifestRouteContract,
} from '@/modules/discovery/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { projectManifestCatalog, safePublicText } from './manifest-projection'
export { safePublicText } from './manifest-projection'

export function buildCatalogDiscoveryManifest(
  input: BuildCatalogDiscoveryManifestInput
): BuildCatalogDiscoveryManifestResult {
  if (input.catalog === undefined) {
    return { kind: 'hidden', reason: 'no_public_catalog' }
  }

  const catalog = input.catalog
  const catalogProjection = projectManifestCatalog(catalog, (offering, projection) => ({
    ...projection,
    accessPaths: offering.accessPaths.map(sanitizeAccessPath),
    support: offering.support,
  }))
  const businessId = brandNonEmpty(catalogProjection.businessId, 'BusinessId')
  const slug = brandNonEmpty(catalogProjection.slug, 'Slug')
  const canonicalBaseUrl = trimTrailingSlashes(input.canonicalBaseUrl)
  const publicUrl = `${canonicalBaseUrl}/${slug}`
  const manifestUrl = `${publicUrl}/ucp`
  const routes = buildRoutes(canonicalBaseUrl, publicUrl, manifestUrl, slug)
  const offerings = catalogProjection.offerings
  const body = {
    schemaVersion: 'ae-ucp-fallback:v1',
    businessCatalogSchemaVersion: catalog.schemaVersion,
    businessId,
    slug,
    businessName: catalogProjection.businessName,
    category: catalogProjection.category,
    businessContext: catalogProjection.businessContext,
    publicUrl,
    manifestUrl,
    ucpVersion: 'v1',
    pathKind: 'ae_hosted_fallback',
    disposition: catalog.disposition,
    ...(input.sourceHash === undefined ? {} : { sourceHash: input.sourceHash }),
    sourceVersion: 'public-catalog:v1',
    observedAt: catalog.observedAt,
    routes,
    offerings,
    ...degradedReason(catalog.disposition),
  } as const
  const bodyHash = canonicalDigest(body)
  const urlHash = canonicalDigest({ urls: routes.map((route) => route.url) })
  const generatedHash = canonicalDigest({
    bodyHash,
    ...(input.sourceHash === undefined ? {} : { sourceHash: input.sourceHash }),
    sourceVersion: 'public-catalog:v1',
    urlHash,
  })
  const manifest: DiscoveryManifestContract = {
    ...body,
    generatedHash,
    bodyHash,
    urlHash,
    generatedAt: input.now,
  }

  return { kind: 'available', manifest }
}

function sanitizeAccessPath(
  path: PublicBusinessCatalogApiV2Dto['offerings'][number]['accessPaths'][number],
): PublicBusinessCatalogApiV2Dto['offerings'][number]['accessPaths'][number] {
  return path.kind === 'human_request'
    ? {
        ...path,
        disclosure: safePublicText(path.disclosure),
        ...(path.url === undefined ? {} : { url: safePublicText(path.url) }),
      }
    : {
        ...path,
        name: safePublicText(path.name),
        summary: safePublicText(path.summary),
        url: safePublicText(path.url),
        ...(path.method === undefined ? {} : { method: safePublicText(path.method) }),
        ...(path.documentationUrl === undefined ? {} : { documentationUrl: safePublicText(path.documentationUrl) }),
        ...(path.interfaceDescription === undefined
          ? {}
          : {
              interfaceDescription: {
                format: safePublicText(path.interfaceDescription.format),
                ...(path.interfaceDescription.url === undefined
                  ? {}
                  : { url: safePublicText(path.interfaceDescription.url) }),
              },
            }),
        ...(path.authenticationSummary === undefined
          ? {}
          : { authenticationSummary: safePublicText(path.authenticationSummary) }),
        ...(path.pricingSummary === undefined
          ? {}
          : { pricingSummary: safePublicText(path.pricingSummary) }),
      }
}

function buildRoutes(
  canonicalBaseUrl: string,
  publicUrl: string,
  manifestUrl: string,
  slug: string
): readonly DiscoveryManifestRouteContract[] {
  return [
    { kind: 'business_page', url: publicUrl, routeTested: true },
    { kind: 'ucp_manifest', url: manifestUrl, routeTested: true },
    { kind: 'api_detail', url: `${canonicalBaseUrl}/api/businesses/${slug}`, routeTested: true },
  ]
}

function degradedReason(
  disposition: PublicBusinessCatalogApiV2Dto['disposition'],
): { degradedReason?: string } {
  if (disposition === 'current') {
    return {}
  }

  if (disposition === 'stale') {
    return { degradedReason: 'Discovery readback is stale for the current source catalog.' }
  }

  return { degradedReason: 'Discovery readback has not succeeded for the current source catalog.' }
}


