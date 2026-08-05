import { ANSWER_THREAD_AGENT_ENTRYPOINT, AGENT_KEY_ISSUANCE_PATH } from '@/modules/answer-thread/agent-entry'
import { formatOfferingPrice } from '@/modules/catalog/public'
import { CUSTOMER_REQUEST_AGENT_ENTRYPOINT } from '@/modules/customer-request/agent-contract'
import { CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES } from '@/modules/customer-request/public-comprehension'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { DiscoveryListingBoundaryLine } from './discovery-files'
import { safePublicText } from './ucp-manifest'

/**
 * Markdown projections of the public page routes, for a caller that asked for
 * something other than HTML. They publish the same facts the HTML page shows —
 * no extra field, no narrower boundary, no separate product surface.
 */

export type AgentPageMarkdownOptions = Readonly<{ canonicalBaseUrl: string }>

/** How many businesses one markdown page lists before pointing at the API. */
export const AgentCatalogMarkdownLimit = 25

export function buildSiteBriefMarkdown(options: AgentPageMarkdownOptions): string {
  const base = trimTrailingSlashes(options.canonicalBaseUrl)
  return [
    '# Agentic Economy',
    '',
    ...CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES,
    '',
    '## Start here (no key needed)',
    '',
    `\`${ANSWER_THREAD_AGENT_ENTRYPOINT.method} ${base}${ANSWER_THREAD_AGENT_ENTRYPOINT.path}\``,
    '',
    '```json',
    '{ "query": "emergency plumber in Adelaide" }',
    '```',
    '',
    `No credential. The response is a \`${ANSWER_THREAD_AGENT_ENTRYPOINT.responseMediaType}\` stream.`,
    ANSWER_THREAD_AGENT_ENTRYPOINT.boundary,
    '',
    '## Read the catalog',
    '',
    `- \`GET ${base}/api/businesses\` — every published business`,
    `- \`GET ${base}/api/businesses/search?q=\` — search the catalog`,
    `- \`GET ${base}/api/businesses/{slug}\` — one business`,
    `- \`GET ${base}/{slug}/ucp\` — one business as a discovery manifest`,
    '',
    '## Confirm and start an option',
    '',
    `\`${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.method} ${base}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path}\` carries a Customer Request from comparison`,
    'through confirmation, start, progress, evidence, problem reporting, and cancellation.',
    `It needs a Bearer key with \`${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope}\`, issued to a signed-in account at`,
    `${base}${AGENT_KEY_ISSUANCE_PATH}. Read \`GET ${base}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath}\` first.`,
    '',
    '## Boundary',
    '',
    DiscoveryListingBoundaryLine,
    '',
    '## More',
    '',
    `- \`${base}/llms.txt\` — the public surface index`,
    `- \`${base}/SKILL.md\` — the full assistant procedure`,
    `- \`${base}/privacy/remove-business\` — listing correction or removal`,
    '',
  ].join('\n')
}

export function buildCatalogMarkdown(
  businesses: readonly PublicBusinessCatalogApiV2Dto[],
  options: AgentPageMarkdownOptions & Readonly<{ query?: string; total?: number }>,
): string {
  const base = trimTrailingSlashes(options.canonicalBaseUrl)
  const shown = businesses.slice(0, AgentCatalogMarkdownLimit)
  const heading = options.query === undefined || options.query.length === 0
    ? '# Listed businesses'
    : `# Listed businesses matching "${oneLine(options.query)}"`

  return [
    heading,
    '',
    ...(shown.length === 0
      ? ['No published business matched this read.', '', `Browse everything with \`GET ${base}/api/businesses\`.`]
      : [
          '| Business | Category | Where | Offerings | Price | Page |',
          '| --- | --- | --- | --- | --- | --- |',
          ...shown.map((business) => catalogRow(business, base)),
          '',
          ...(options.total !== undefined && options.total > shown.length
            ? [`Showing ${shown.length} of ${options.total}. Read the rest with \`GET ${base}/api/businesses\`.`]
            : []),
        ]),
    '',
    DiscoveryListingBoundaryLine,
    '',
    `Start a request with \`${ANSWER_THREAD_AGENT_ENTRYPOINT.method} ${base}${ANSWER_THREAD_AGENT_ENTRYPOINT.path}\` — no key needed.`,
    '',
  ].join('\n')
}

export function buildBusinessMarkdown(
  business: PublicBusinessCatalogApiV2Dto,
  options: AgentPageMarkdownOptions,
): string {
  const base = trimTrailingSlashes(options.canonicalBaseUrl)
  return [
    `# ${oneLine(business.name)}`,
    '',
    `- Category: ${oneLine(business.category)}`,
    `- Where: ${oneLine(business.suburb)}, ${oneLine(business.stateTerritory)}`,
    `- Listing standing: ${business.trustTier}`,
    `- Slug: \`${business.slug}\``,
    `- JSON: \`GET ${base}/api/businesses/${business.slug}\``,
    `- Discovery manifest: \`GET ${base}/${business.slug}/ucp\``,
    '',
    '## Offerings',
    '',
    ...(business.offerings.length === 0
      ? ['No published offering.']
      : business.offerings.flatMap((offering) => [
          `### ${oneLine(offering.name)}`,
          '',
          oneLine(offering.summary),
          ...(offering.serviceAreaSummary === undefined ? [] : [`- Service area: ${oneLine(offering.serviceAreaSummary)}`]),
          ...(offering.availabilitySummary === undefined ? [] : [`- Availability: ${oneLine(offering.availabilitySummary)}`]),
          ...(offering.price === undefined ? [] : [`- Price: ${oneLine(formatOfferingPrice(offering.price))}`]),
          ...(offering.pricingSummary === undefined ? [] : [`- Published price note: ${oneLine(offering.pricingSummary)}`]),
          `- AE can act on this offering: ${offering.support.aeSupportedAction ? 'yes' : 'no'}`,
          '',
        ])),
    DiscoveryListingBoundaryLine,
    '',
    `To act on this, start at \`${ANSWER_THREAD_AGENT_ENTRYPOINT.method} ${base}${ANSWER_THREAD_AGENT_ENTRYPOINT.path}\` — no key needed.`,
    '',
  ].join('\n')
}

export function buildUnknownPageMarkdown(
  path: string,
  options: AgentPageMarkdownOptions,
): string {
  const base = trimTrailingSlashes(options.canonicalBaseUrl)
  return [
    '# No markdown projection for this path',
    '',
    `\`${oneLine(path)}\` is served as HTML only. These paths answer machines:`,
    '',
    `- \`GET ${base}/\` — what AE is and how to start`,
    `- \`GET ${base}/llms.txt\` — the public surface index`,
    `- \`GET ${base}/SKILL.md\` — the full assistant procedure`,
    `- \`GET ${base}/api/businesses\` — every published business`,
    `- \`${ANSWER_THREAD_AGENT_ENTRYPOINT.method} ${base}${ANSWER_THREAD_AGENT_ENTRYPOINT.path}\` — ask for an outcome, no key needed`,
    '',
  ].join('\n')
}

export function buildMissingBusinessMarkdown(
  slug: string,
  options: AgentPageMarkdownOptions,
): string {
  const base = trimTrailingSlashes(options.canonicalBaseUrl)
  return [
    '# No published listing',
    '',
    `No public listing exists for \`${oneLine(slug)}\`. Do not invent provider details.`,
    '',
    `Browse with \`GET ${base}/api/businesses\` or search with \`GET ${base}/api/businesses/search?q=\`.`,
    '',
  ].join('\n')
}

function catalogRow(business: PublicBusinessCatalogApiV2Dto, base: string): string {
  const offerings = business.offerings.reduce<string[]>((acc, offering) => {
    const name = oneLine(offering.name)
    if (name.length > 0) acc.push(name)
    return acc
  }, [])
  // The first published price, not a computed cheapest: a row is a pointer to
  // the listing, and inventing a business-level minimum would publish a number
  // no offering carries.
  const price = business.offerings.find((offering) => offering.price !== undefined)?.price
  return `| ${oneLine(business.name)} | ${oneLine(business.category)} | ${oneLine(business.suburb)}, ${oneLine(business.stateTerritory)} | ${offerings.length === 0 ? '—' : offerings.join(', ')} | ${price === undefined ? '—' : oneLine(formatOfferingPrice(price))} | ${base}/${business.slug} |`
}

/** Table cells and headings break on a newline or a stray pipe. */
function oneLine(value: string): string {
  return safePublicText(value).replace(/\s+/gu, ' ').replaceAll('|', '/').trim()
}

