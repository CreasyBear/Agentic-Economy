import { stableHash } from '@/modules/common/stable-hash'
import type {
  BuildCatalogDiscoveryManifestInput,
  BuildCatalogDiscoveryManifestResult,
  DiscoveryManifestCapabilityContract,
  DiscoveryManifestContract,
  DiscoveryManifestRouteContract,
  DiscoveryManifestServiceContract,
} from '@/modules/discovery/public'

export function buildCatalogDiscoveryManifest(
  input: BuildCatalogDiscoveryManifestInput
): BuildCatalogDiscoveryManifestResult {
  if (input.catalog === undefined) {
    return { kind: 'hidden', reason: 'no_public_catalog' }
  }

  const catalog = input.catalog
  if (catalog.publicStatus !== 'published') {
    return { kind: 'hidden', reason: 'not_public' }
  }

  const canonicalBaseUrl = trimTrailingSlash(input.canonicalBaseUrl ?? 'https://ae.example')
  const publicUrl = `${canonicalBaseUrl}/${catalog.slug}`
  const manifestUrl = `${publicUrl}/ucp`
  const routes = buildRoutes(canonicalBaseUrl, publicUrl, manifestUrl, catalog.slug)
  const services = catalog.services.map(
    (service): DiscoveryManifestServiceContract => ({
      slug: service.serviceSlug,
      name: safePublicText(service.name),
      category: safePublicText(service.category),
      summary: safePublicText(service.summary),
      serviceArea: safePublicText(service.serviceArea),
      hoursOrUnknown: safePublicText(service.hoursOrUnknown),
      status: 'published',
      capabilities: service.capabilities.map(
        (capability): DiscoveryManifestCapabilityContract => ({
          kind: capability.kind,
          status: capability.status,
          firstRequest: {
            mode: capability.firstRequest.mode,
            publicDisclosure: safePublicText(capability.firstRequest.publicDisclosure),
            publicChannel: capability.firstRequest.publicChannel,
            ...(capability.firstRequest.noContactReason === undefined
              ? {}
              : { noContactReason: safePublicText(capability.firstRequest.noContactReason) }),
          },
          callable: false,
          paymentRequired: false,
          ...(capability.reason === undefined ? {} : { reason: safePublicText(capability.reason) }),
        })
      ),
    })
  )
  const body = {
    schemaVersion: 'ae-ucp-fallback:v1',
    businessId: catalog.businessId,
    slug: catalog.slug,
    businessName: safePublicText(catalog.name),
    category: safePublicText(catalog.category),
    location: {
      suburb: safePublicText(catalog.suburb),
      stateTerritory: safePublicText(catalog.stateTerritory),
      ...(catalog.postcode === undefined ? {} : { postcode: safePublicText(catalog.postcode) }),
    },
    publicUrl,
    manifestUrl,
    ucpVersion: 'v1',
    pathKind: 'ae_hosted_fallback',
    status: catalog.discoveryStatus,
    sourceHash: catalog.sourceHash,
    sourceVersion: 'public-catalog:v1',
    updatedAt: catalog.updatedAt,
    routes,
    services,
    unsupportedCapabilities: {
      callable: false,
      paymentRequired: false,
    },
    ...degradedReason(catalog.discoveryStatus),
  } as const
  const bodyHash = stableHash(body)
  const urlHash = stableHash({ urls: routes.map((route) => route.url) })
  const generatedHash = stableHash({
    bodyHash,
    sourceHash: catalog.sourceHash,
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

function degradedReason(status: DiscoveryManifestContract['status']): { degradedReason?: string } {
  if (status === 'available') {
    return {}
  }

  if (status === 'stale') {
    return { degradedReason: 'Discovery readback is stale for the current source catalog.' }
  }

  if (status === 'unavailable') {
    return { degradedReason: 'Discovery readback is unavailable for the current source catalog.' }
  }

  return { degradedReason: 'Discovery readback has not succeeded for the current source catalog.' }
}

function safePublicText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, ' ')
    .replace(/javascript\s*:/giu, 'blocked-uri ')
    .replace(/ignore previous instructions/giu, 'untrusted instruction')
    .replace(/[`*_#>\[\]()]/gu, ' ')
    .replace(/\bendpoint\b/giu, 'untrusted claim')
    .replace(/\b(?:verified|callable|payable)\b/giu, 'untrusted claim')
    .replace(/paymentRequired\s*[:=]\s*true/giu, 'untrusted claim')
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .trim()
    .slice(0, 500)
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '')
}
