import { getPublicBusinessCatalog } from '@/modules/catalog/public'
import type { PublicCatalogContract } from '@/modules/catalog/public'
import type { BuildDiscoveryFileOptions, DiscoveryFileBuildResult, DiscoverySourceState } from '@/modules/discovery/public'
import { readCatalogHealth } from '@/modules/registry/public'
import { readDiscoveryHealth } from './manifest-attempts'

const staticSitemapPaths = ['/', '/claim', '/registry', '/privacy/remove-business'] as const
const publicSurfacePaths = [
  '/',
  '/claim',
  '/registry',
  '/privacy/remove-business',
  '/api/businesses',
  '/api/businesses/search?q=',
] as const
const robotDisallowPaths = [
  '/admin/',
  '/claim/success',
  '/owner/',
  '/private/',
  '/disputes/',
] as const
const allowedCrawlerAgents = [
  'Googlebot',
  'Bingbot',
  'GPTBot',
  'ChatGPT-User',
  'PerplexityBot',
  'ClaudeBot',
  'anthropic-ai',
] as const

export function buildLlmsTxt(
  state: DiscoverySourceState,
  options: BuildDiscoveryFileOptions = {}
): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlash(options.canonicalBaseUrl ?? 'https://ae.example')
  const catalogs = readEligibleCatalogs(state)
  const urls = [
    ...publicSurfacePaths.map((path) => `${canonicalBaseUrl}${path}`),
    ...catalogs.flatMap((catalog) => [
      `${canonicalBaseUrl}/${catalog.slug}`,
      `${canonicalBaseUrl}/${catalog.slug}/ucp`,
      `${canonicalBaseUrl}/api/businesses/${catalog.slug}`,
    ]),
  ]
  const catalogLines = catalogs.map(
    (catalog) =>
      `- slug=${catalog.slug} publicUrl=${canonicalBaseUrl}/${catalog.slug} ucpUrl=${canonicalBaseUrl}/${catalog.slug}/ucp apiUrl=${canonicalBaseUrl}/api/businesses/${catalog.slug} publicStatus=${catalog.publicStatus} indexStatus=${catalog.indexStatus} discoveryStatus=${catalog.discoveryStatus}`
  )
  const body = [
    '# Agentic Economy',
    '',
    'Public surfaces:',
    ...publicSurfacePaths.map((path) => `- ${canonicalBaseUrl}${path}`),
    '',
    'Catalog entries:',
    ...(catalogLines.length === 0 ? ['- none'] : catalogLines),
    '',
    'Unsupported capability flags:',
    '- callable=false',
    '- paymentRequired=false',
    '',
    'Privacy and correction:',
    `- ${canonicalBaseUrl}/privacy/remove-business`,
    '',
  ].join('\n')

  return { body, urls }
}

export function buildSitemapXml(
  state: DiscoverySourceState,
  options: BuildDiscoveryFileOptions = {}
): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlash(options.canonicalBaseUrl ?? 'https://ae.example')
  const now = new Date(options.now ?? 0).toISOString()
  const urls = [
    ...staticSitemapPaths.map((path) => `${canonicalBaseUrl}${path}`),
    ...readEligibleCatalogs(state).map((catalog) => `${canonicalBaseUrl}/${catalog.slug}`),
  ]
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc><lastmod>${now}</lastmod></url>`),
    '</urlset>',
    '',
  ].join('\n')

  return { body, urls }
}

export function buildRobotsTxt(options: BuildDiscoveryFileOptions = {}): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlash(options.canonicalBaseUrl ?? 'https://ae.example')
  const sitemapUrl = `${canonicalBaseUrl}/sitemap.xml`
  const body = [
    'User-agent: *',
    'Allow: /',
    ...robotDisallowPaths.map((path) => `Disallow: ${path}`),
    '',
    ...allowedCrawlerAgents.flatMap((agent) => [`User-agent: ${agent}`, 'Allow: /', '']),
    `Sitemap: ${sitemapUrl}`,
    '',
  ].join('\n')

  return { body, urls: [sitemapUrl] }
}

function readEligibleCatalogs(state: DiscoverySourceState): readonly PublicCatalogContract[] {
  return state.businesses
    .map((business) => {
      const registryHealth = readCatalogHealth(state, business.businessId)
      if (registryHealth.sourceState !== 'published') {
        return undefined
      }

      const discoveryHealth = readDiscoveryHealth(state, business.businessId)
      const result = getPublicBusinessCatalog(state, {
        slug: business.slug,
        indexStatus: registryHealth.indexStatus,
        discoveryStatus: discoveryHealth.discoveryStatus,
      })

      return result.kind === 'available' ? result.catalog : undefined
    })
    .filter((catalog): catalog is PublicCatalogContract => catalog !== undefined)
    .sort((left, right) => left.slug.localeCompare(right.slug))
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '')
}
