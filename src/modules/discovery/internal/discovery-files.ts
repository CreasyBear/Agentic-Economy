import { ANSWER_THREAD_AGENT_ENTRYPOINT } from '@/modules/answer-thread/agent-entry'
import { getPublicBusinessCatalog } from '@/modules/catalog/public'
import type { BuildDiscoveryFileOptions, DiscoveryFileBuildResult, DiscoverySourceState } from '@/modules/discovery/public'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import {
  CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES,
} from '@/modules/customer-request/public-comprehension'
import {
  CUSTOMER_REQUEST_AGENT_AUTHENTICATION_SUMMARY,
  CUSTOMER_REQUEST_AGENT_ENTRYPOINT,
  CUSTOMER_REQUEST_AGENT_REQUIRED_SCOPES,
  CUSTOMER_REQUEST_NAVIGATION_RELATION_VALUES,
  CUSTOMER_REQUEST_STATE_VALUES,
} from '@/modules/customer-request/agent-contract'
import { readCatalogHealth } from '@/modules/registry/public'
import { readDiscoveryHealth } from './manifest-attempts'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

const staticSitemapPaths = ['/', '/claim', '/for-agents', '/privacy/remove-business'] as const
export const DiscoveryPublicSurfacePaths = [
  '/',
  '/claim',
  '/for-agents',
  '/privacy/remove-business',
  '/.well-known/ucp',
  '/api/businesses',
  '/api/businesses/search?q=',
  '/api/v1/services',
  '/api/v1/services/search?q=',
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
    '',
    '- GET /api/v1/services (ONE PAGE): `serviceName`, `tags[]`, `endpoints[]`; list `continueCursor`/`isDone`.',
    '- GET /api/v1/services/search?q={query}: `pagination.nextCursor`/`pagination.hasMore`.',
    '- GET /api/v1/services/{id}: detail; `service` equals list item.',
    '- `ae.offerings[]`: `summary`, `pricingSummary`, `price`; `priceSummary`.',
    '- `ae.provenance`: `business_declared`/`publicly_observed`; `ae.authentication`, `ae.execution` are public classifications.',
    '- `ae.access`: open sandbox.',
    '- Invalid URLs omitted; never infer from documentation.',
    '- POST /api/sandbox/adelaide-dental-clinic/checkup-quote: priced, time-bounded quote JSON; quote response carries provenance `ae_sandbox_provider`.',
  ]
}

function customerRequestScopeSummary(): string {
  return `${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope} plus exactly one mode: ${CUSTOMER_REQUEST_AGENT_REQUIRED_SCOPES.slice(1).join(', ')}`
}
export function buildLlmsTxt(
  state: DiscoverySourceState,
  options: BuildDiscoveryFileOptions
): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlashes(options.canonicalBaseUrl)
  const catalogs = readEligibleCatalogs(state)
  const urls = buildOfferingLlmsUrlsFromSlugs(catalogs.map((catalog) => catalog.slug), options)
  const catalogLines = catalogs.map(
    (catalog) =>
      `- slug=${catalog.slug} publicUrl=${canonicalBaseUrl}/${catalog.slug} ucpUrl=${canonicalBaseUrl}/${catalog.slug}/ucp apiUrl=${canonicalBaseUrl}/api/businesses/${catalog.slug} serviceApiUrl=${canonicalBaseUrl}/api/v1/services/${catalog.slug} disposition=${catalog.disposition}`
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
    `- ${ANSWER_THREAD_AGENT_ENTRYPOINT.method} ${canonicalBaseUrl}${ANSWER_THREAD_AGENT_ENTRYPOINT.path} uses a fresh opaque X-AE-Turn-Key for every turn; it is not a credential`,
    `- MCP: ${canonicalBaseUrl}/mcp`,
    'Customer Request API:',
    `- schema=${canonicalBaseUrl}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath}`,
    `- submit=${canonicalBaseUrl}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path}`,
    `- device_authorization=${canonicalBaseUrl}/oauth/device_authorization`,
    `- token=${canonicalBaseUrl}/oauth/token`,
    `- human_approval=${canonicalBaseUrl}/agent-access/authorize?user_code=...`,
    `- auth=${CUSTOMER_REQUEST_AGENT_AUTHENTICATION_SUMMARY}; scopes=${customerRequestScopeSummary()}`,
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
export function buildOfferingLlmsUrlsFromSlugs(
  slugs: readonly string[],
  options: BuildDiscoveryFileOptions,
): readonly string[] {
  const canonicalBaseUrl = trimTrailingSlashes(options.canonicalBaseUrl)
  return [...new Set([
    ...DiscoveryPublicSurfacePaths.map((path) => `${canonicalBaseUrl}${path}`),
    ...slugs.flatMap((slug) => [
      `${canonicalBaseUrl}/${slug}`,
      `${canonicalBaseUrl}/${slug}/ucp`,
      `${canonicalBaseUrl}/api/v1/services/${slug}`,
      `${canonicalBaseUrl}/api/businesses/${slug}`,
    ]),
  ])]
}

export function buildOfferingLlmsTxt(
  businesses: readonly PublicBusinessCatalogApiV2Dto[],
  options: BuildDiscoveryFileOptions & { totalBusinesses?: number },
): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlashes(options.canonicalBaseUrl)
  const urls = buildOfferingLlmsUrlsFromSlugs(businesses.map((business) => business.slug), options)
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
    ...DiscoveryPublicSurfacePaths.map((path) => `- ${path}`),
    '',
    ...servicesApiLines(),
    '',
    'Assistant setup:',
    `- MCP: ${canonicalBaseUrl}/mcp`,
    '',
    'Start here (no key needed):',
    `- ${ANSWER_THREAD_AGENT_ENTRYPOINT.method} ${canonicalBaseUrl}${ANSWER_THREAD_AGENT_ENTRYPOINT.path}`,
    `- auth=${ANSWER_THREAD_AGENT_ENTRYPOINT.authentication}; no key and no credential are required`,
    `- body=${JSON.stringify(ANSWER_THREAD_AGENT_ENTRYPOINT.body)}`,
    `- header=X-AE-Turn-Key: fresh opaque value for every turn; it is an idempotency/correlation value, not a credential`,
    `- response=${ANSWER_THREAD_AGENT_ENTRYPOINT.responseMediaType}`,
    `- boundary=${ANSWER_THREAD_AGENT_ENTRYPOINT.boundary}`,
    'Customer Request API:',
    `- schema=${canonicalBaseUrl}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath} submit=${canonicalBaseUrl}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path} device_authorization=${canonicalBaseUrl}/oauth/device_authorization token=${canonicalBaseUrl}/oauth/token`,
    `- auth=${CUSTOMER_REQUEST_AGENT_AUTHENTICATION_SUMMARY}; issued through OAuth after signed-in owner approval at ${canonicalBaseUrl}/agent-access/authorize?user_code=...; scopes=${customerRequestScopeSummary()}`,
    '- escalate=take this path only when the customer wants to confirm and start an option',
    'Request recipe:',
    `- ${canonicalBaseUrl}/SKILL.md carries the full procedure: relation-following, stop rules, and confirmation.`,
    '',
    'Business entries:',
  ]
  const afterSample = [
    `- full list=${canonicalBaseUrl}/api/businesses search=${canonicalBaseUrl}/api/businesses/search?q=`,
    `- total=${options.totalBusinesses ?? businesses.length}; the lines above are a sample, not the catalog`,
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
    const line = `- slug=${business.slug} path=/${business.slug}`
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

