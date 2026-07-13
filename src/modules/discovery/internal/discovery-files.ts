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
  '/api/v1/requests',
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
  options: BuildDiscoveryFileOptions
): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlash(options.canonicalBaseUrl)
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
    'Assistant setup:',
    `- ${canonicalBaseUrl}/SKILL.md`,
    '',
    'Customer Request API:',
    `- submit=${canonicalBaseUrl}/api/v1/requests`,
    `- clarify=${canonicalBaseUrl}/api/v1/requests/:requestRef/messages`,
    `- facts=${canonicalBaseUrl}/api/v1/requests/:requestRef/facts`,
    `- prepare=${canonicalBaseUrl}/api/v1/requests/:requestRef/options`,
    '- auth=Bearer AE API key with customer_requests:create',
    '- lifecycle=needs_information | needs_authorization | ready_to_compare | preparing_options | options_ready | no_options | unsupported | needs_attention',
    '',
    'Request recipe:',
    '1. POST a natural-language request to /api/v1/requests with one opaque requestRef.',
    '2. If clarification.answerKind is natural_language, POST the answer to /api/v1/requests/:requestRef/messages.',
    '3. If clarification.answerKind is typed_value, POST only the requested fact to /api/v1/requests/:requestRef/facts.',
    '4. POST /api/v1/requests/:requestRef/options with the current revision and a new idempotencyKey.',
    '5. If needs_authorization, show the disclosure review and stop. The customer must approve that exact review in AE; an API key cannot approve on the customer\'s behalf.',
    '6. GET /api/v1/requests/:requestRef to resume after interruption or waiting.',
    '7. Read optionSet.ordering: recommended includes its objective, reasons, tradeoffs and influence status; unranked means no defensible ordering. Treat every option as a proposal only. Nothing has been selected, purchased, or booked.',
    '',
    'Catalog entries:',
    ...(catalogLines.length === 0 ? ['- none'] : catalogLines),
    '',
    'Listing boundary:',
    '- Listing endpoints publish business facts; they do not select or execute routes.',
    '',
    'Privacy and correction:',
    `- ${canonicalBaseUrl}/privacy/remove-business`,
    '',
  ].join('\n')

  return { body, urls }
}

export function buildSitemapXml(
  state: DiscoverySourceState,
  options: BuildDiscoveryFileOptions
): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlash(options.canonicalBaseUrl)
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

export function buildRobotsTxt(options: BuildDiscoveryFileOptions): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlash(options.canonicalBaseUrl)
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
