import { ANSWER_THREAD_AGENT_ENTRYPOINT } from '@/modules/answer-thread/agent-entry'
import { getPublicBusinessCatalog } from '@/modules/catalog/public'
import type { PublicCatalogContract } from '@/modules/catalog/public'
import type { BuildDiscoveryFileOptions, DiscoveryFileBuildResult, DiscoverySourceState } from '@/modules/discovery/public'
import {
  CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES,
} from '@/modules/customer-request/public-comprehension'
import {
  CUSTOMER_REQUEST_AGENT_ENTRYPOINT,
  CUSTOMER_REQUEST_AGENT_SCOPE,
  CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES,
  CUSTOMER_REQUEST_NAVIGATION_RELATION_VALUES,
  CUSTOMER_REQUEST_STATE_VALUES,
} from '@/modules/customer-request/agent-contract'
import { readCatalogHealth } from '@/modules/registry/public'
import { readDiscoveryHealth } from './manifest-attempts'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

const staticSitemapPaths = ['/', '/claim', '/registry', '/for-agents', '/privacy/remove-business'] as const
export const DiscoveryPublicSurfacePaths = [
  '/',
  '/claim',
  '/registry',
  '/for-agents',
  '/privacy/remove-business',
  '/.well-known/ucp',
  '/api/businesses',
  '/api/businesses/search?q=',
  CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path,
  CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath,
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

/** One sentence, one place: listing endpoints publish facts, Customer Requests
 * are the only public path that can compare, confirm, and start an option.
 * Every assistant-facing surface quotes this identically. */
export const DiscoveryListingBoundaryLine =
  'Listing endpoints publish business facts; they do not select or execute routes. A Customer Request is the only public path that can compare, confirm, and start a registered option.'

function servicesApiLines(): readonly string[] {
  return [
    '## Services API',

    '- GET /api/v1/services: ONE PAGE; fields `summary`, `pricingSummary`, `price`.',
    '- GET /api/v1/services/search?q={query}; follow `pagination.nextCursor` while `pagination.hasMore`.',
    '- Provenance `business_declared`/`publicly_observed`; quote response carries provenance `ae_sandbox_provider`; open sandbox.',
    '- Example: POST /api/sandbox/adelaide-dental-clinic/checkup-quote: priced, time-bounded quote JSON.',
  ]
}

export function buildLlmsTxt(
  state: DiscoverySourceState,
  options: BuildDiscoveryFileOptions
): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlash(options.canonicalBaseUrl)
  const catalogs = readEligibleCatalogs(state)
  const urls = [
    ...DiscoveryPublicSurfacePaths.map((path) => `${canonicalBaseUrl}${path}`),
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
    ...CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES.map((line) => `- ${line}`),
    `- Human entry=${canonicalBaseUrl}/`,
    '',
    'Public surfaces:',
    ...DiscoveryPublicSurfacePaths.map((path) => `- ${canonicalBaseUrl}${path}`),
    '',
    ...servicesApiLines(),
    '',
    'Assistant setup:',
    `- ${canonicalBaseUrl}/SKILL.md`,
    `- MCP: ${canonicalBaseUrl}/mcp`,
    'Customer Request API:',
    `- schema=${canonicalBaseUrl}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath}`,
    `- submit=${canonicalBaseUrl}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path}`,
    `- device_authorization=${canonicalBaseUrl}/oauth/device_authorization`,
    `- token=${canonicalBaseUrl}/oauth/token`,
    `- human_approval=${canonicalBaseUrl}/agent-access/authorize?user_code=...`,
    `- auth=Bearer ${CUSTOMER_REQUEST_AGENT_SCOPE} plus exactly one mode: ${CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES.join(', ')}`,
    `- protected_resource_metadata=${canonicalBaseUrl}/.well-known/oauth-protected-resource`,
    `- lifecycle=${CUSTOMER_REQUEST_STATE_VALUES.join(' | ')}`,
    `- navigation.actions=${CUSTOMER_REQUEST_NAVIGATION_RELATION_VALUES.join(' | ')}`,
    '',
    'Request recipe:',
    `1. Read ${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath}, then POST a natural-language request to ${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path} with one opaque requestRef.`,
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
    `- ${DiscoveryListingBoundaryLine}`,
    '',
    'Privacy and correction:',
    `- ${canonicalBaseUrl}/privacy/remove-business`,
    '',
  ].join('\n')

  return { body, urls }
}

/** How many business lines the index samples, and the byte ceiling the whole
 * document stays under. The index is a front door, not a catalog dump: an agent
 * reader that truncates loses the entry contract before it reaches it, so the
 * full set moves to `/api/businesses` and only a bounded sample stays inline.
 * The byte ceiling binds first, which keeps the document small for long slugs
 * as well as for large catalogs. */
const offeringLlmsSampleLimit = 12
const offeringLlmsByteCeiling = 4096

/** Durable Offering-based assistant index. It intentionally publishes only
 * business identity, public routes, and a bounded sample from the shared safe
 * projection; access-path internals and support diagnostics never enter it.
 * `urls` stays complete for sitemap and route-parity consumers even though the
 * body samples. */
export function buildOfferingLlmsTxt(
  businesses: readonly PublicBusinessCatalogApiV2Dto[],
  options: BuildDiscoveryFileOptions,
): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlash(options.canonicalBaseUrl)
  const urls = [
    ...DiscoveryPublicSurfacePaths.map((path) => `${canonicalBaseUrl}${path}`),
    ...businesses.flatMap((business) => [
      `${canonicalBaseUrl}/${business.slug}`,
      `${canonicalBaseUrl}/${business.slug}/ucp`,
      `${canonicalBaseUrl}/api/businesses/${business.slug}`,
    ]),
  ]
  const beforeSample = [
    '# Agentic Economy',
    '',
    'Customer journey:',
    `- ${CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES[0]}`,
    `- ${CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES[1]}`,
    `- ${CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES[3]}`,
    `- Human entry=${canonicalBaseUrl}/`,
    '',
    'Public surfaces:',
    `- origin=${canonicalBaseUrl}`,
    ...DiscoveryPublicSurfacePaths.map((path) => `- ${path}`),
    '',
    ...servicesApiLines(),
    '',
    'Assistant setup:',
    `- ${canonicalBaseUrl}/SKILL.md`,
    `- MCP: ${canonicalBaseUrl}/mcp`,
    '',
    'Start here (no key needed):',
    `- ${ANSWER_THREAD_AGENT_ENTRYPOINT.method} ${canonicalBaseUrl}${ANSWER_THREAD_AGENT_ENTRYPOINT.path}`,
    `- auth=${ANSWER_THREAD_AGENT_ENTRYPOINT.authentication}; no key and no credential are required`,
    `- body=${JSON.stringify(ANSWER_THREAD_AGENT_ENTRYPOINT.body)}`,
    `- response=${ANSWER_THREAD_AGENT_ENTRYPOINT.responseMediaType}`,
    `- boundary=${ANSWER_THREAD_AGENT_ENTRYPOINT.boundary}`,
    '',
    'Customer Request API:',
    `- schema=${canonicalBaseUrl}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath}`,
    `- submit=${canonicalBaseUrl}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path}`,
    `- device_authorization=${canonicalBaseUrl}/oauth/device_authorization`,
    `- auth=Bearer AE API key with customer_requests:create, issued to a signed-in account at ${canonicalBaseUrl}/agent-access`,
    `- token=${canonicalBaseUrl}/oauth/token`,
    `- human_approval=${canonicalBaseUrl}/agent-access/authorize?user_code=...`,
    `- auth=Bearer ${CUSTOMER_REQUEST_AGENT_SCOPE} plus exactly one mode: ${CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES.join(', ')}`,
    '- escalate=take this path only when the customer wants to confirm and start an option',
    'Request recipe:',
    `- ${canonicalBaseUrl}/SKILL.md carries the full procedure: relation-following, stop rules, and confirmation.`,
    '',
    'Business entries:',
  ]
  const afterSample = [
    `- full list=${canonicalBaseUrl}/api/businesses search=${canonicalBaseUrl}/api/businesses/search?q=`,
    `- total=${businesses.length}; the lines above are a sample, not the catalog`,
    '',
    'Listing boundary:',
    `- ${DiscoveryListingBoundaryLine}`,
    '',
    'Privacy and correction:',
    `- ${canonicalBaseUrl}/privacy/remove-business`,
    '',
  ]
  const encoder = new TextEncoder()
  const framingBytes = encoder.encode([...beforeSample, ...afterSample].join('\n')).length
  const sample: string[] = []
  let sampleBytes = 0
  for (const business of businesses.slice(0, offeringLlmsSampleLimit)) {
    const line = `- slug=${business.slug} url=${canonicalBaseUrl}/${business.slug}`
    const cost = encoder.encode(line).length + 1
    /** One entry always survives the ceiling: an entries section that names no
     * entry would misreport a catalog that has them. */
    if (sample.length > 0 && framingBytes + sampleBytes + cost > offeringLlmsByteCeiling) break
    sampleBytes += cost
    sample.push(line)
  }
  const body = [...beforeSample, ...(sample.length === 0 ? ['- none'] : sample), ...afterSample].join('\n')
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
