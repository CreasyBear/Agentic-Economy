import { getPublicBusinessCatalog } from '@/modules/catalog/public'
import { readCatalogHealth, type PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import type { BuildDiscoveryFileOptions, DiscoveryFileBuildResult, DiscoverySourceState } from '@/modules/discovery/public'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import { readDiscoveryHealth } from './manifest-attempts'
import {
  buildOfferingLlmsTxt,
  buildOfferingLlmsUrlsFromSlugs,
  DiscoveryListingBoundaryLine,
  DiscoveryPublicSurfacePaths,
  operationMarketLines,
} from './offering-discovery-file'
export {
  buildOfferingLlmsTxt,
  buildOfferingLlmsUrlsFromSlugs,
  DiscoveryListingBoundaryLine,
  DiscoveryPublicSurfacePaths,
}

const staticSitemapPaths = ['/', '/claim', '/for-agents', '/privacy/remove-business'] as const
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
  options: BuildDiscoveryFileOptions
): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlashes(options.canonicalBaseUrl)
  const businesses = readEligibleCatalogs(state)
  const urls = buildOfferingLlmsUrlsFromSlugs(businesses.map((business) => business.slug), options)
  const businessLines = businesses.map(
    (business) =>
      `- slug=${business.slug} publicUrl=${canonicalBaseUrl}/${business.slug} ucpUrl=${canonicalBaseUrl}/${business.slug}/ucp apiUrl=${canonicalBaseUrl}/api/businesses/${business.slug} disposition=${business.disposition}`
  )
  const body = [
    '# Agentic Economy',
    '',
    ...operationMarketLines(canonicalBaseUrl),
    '',
    'Public instructions:',
    `- Skill: ${canonicalBaseUrl}/SKILL.md`,
    `- Deployment manifest: ${canonicalBaseUrl}/.well-known/ucp`,
    `- Human guide: ${canonicalBaseUrl}/for-agents`,
    `- MCP: ${canonicalBaseUrl}/mcp`,
    '',
    'Published businesses (secondary directory):',
    ...(businessLines.length === 0 ? ['- none'] : businessLines),
    '',
    'Boundary:',
    `- ${DiscoveryListingBoundaryLine}`,
    '',
    'Privacy and correction:',
    `- ${canonicalBaseUrl}/privacy/remove-business`,
    '',
  ].join('\n')

  return { body, urls }
}


export function buildSitemapXmlFromSlugs(
  slugs: readonly string[],
  options: BuildDiscoveryFileOptions,
): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlashes(options.canonicalBaseUrl)
  const now = new Date(options.now ?? 0).toISOString()
  const urls = [...new Set([
    ...staticSitemapPaths.map((path) => `${canonicalBaseUrl}${path}`),
    ...slugs.map((slug) => `${canonicalBaseUrl}/${slug}`),
  ])]
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc><lastmod>${now}</lastmod></url>`),
    '</urlset>',
    '',
  ].join('\n')

  return { body, urls }
}

export function buildSitemapXml(
  state: DiscoverySourceState,
  options: BuildDiscoveryFileOptions
): DiscoveryFileBuildResult {
  return buildSitemapXmlFromSlugs(
    readEligibleCatalogs(state).map((catalog) => catalog.slug),
    options,
  )
}

export function buildRobotsTxt(options: BuildDiscoveryFileOptions): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlashes(options.canonicalBaseUrl)
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

function readEligibleCatalogs(state: DiscoverySourceState): readonly PublicBusinessCatalogApiV2Dto[] {
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
    .filter((catalog): catalog is PublicBusinessCatalogApiV2Dto => catalog !== undefined)
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

