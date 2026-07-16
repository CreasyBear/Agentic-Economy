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
    'Customer journey:',
    '- Use AE when a customer needs to compare available business options before deciding what happens next.',
    '- Start with the outcome in the customer’s own words. AE asks only for details that change the decision.',
    '- Nothing is confirmed, shared, or started until the customer explicitly decides.',
    `- Human entry=${canonicalBaseUrl}/`,
    '',
    'Public surfaces:',
    ...publicSurfacePaths.map((path) => `- ${canonicalBaseUrl}${path}`),
    '',
    'Assistant setup:',
    `- ${canonicalBaseUrl}/SKILL.md`,
    '',
    'Customer Request API:',
    `- submit=${canonicalBaseUrl}/api/v1/requests`,
    '- continue=follow exactly one matching navigation.actions relation from the latest response',
    '- relations=answer_clarification | prepare_options | change_request | confirm_option | start_confirmed_option | inspect_progress | inspect_evidence | report_problem | cancel',
    '- auth=Bearer AE API key with customer_requests:create',
    '- lifecycle=needs_information | ready_to_compare | routes_ready | route_confirmed | in_progress | needs_attention | outcome_unknown | completed | failed | cancelled',
    '',
    'Request recipe:',
    '1. POST a natural-language request to /api/v1/requests with one opaque requestRef.',
    '2. Continue only through the method, href, and input template advertised by one matching navigation.actions relation.',
    '3. Never construct a later path, sequence, business, step, limit, recipient, purpose, effect, or authority field.',
    '4. Stop if a needed relation is missing, duplicated, changes origin, crosses into another Request, or asks for authority AE did not display.',
    '5. Show routes_ready options without inferring a choice. If the customer changes what matters, follow change_request and review the new revision before confirmation.',
    '6. Follow confirm_option only after explicit approval; confirmation does not start work.',
    '7. Resume the same Request using advertised relations. Never create a replacement or retry an outcome_unknown effect.',
    '',
    'Catalog entries:',
    ...(catalogLines.length === 0 ? ['- none'] : catalogLines),
    '',
    'Listing boundary:',
    '- Listing endpoints publish business facts; they do not select or execute routes. A Customer Request is the only public path that can compare, confirm, and start a registered option.',
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
