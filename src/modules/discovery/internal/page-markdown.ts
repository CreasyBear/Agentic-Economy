import { MCP_LATEST_PROTOCOL_VERSION } from '@/lib/mcp-protocol'
import type { BusinessContext } from '@/modules/business/public'
import { ANSWER_THREAD_AGENT_ENTRYPOINT } from '@/modules/answer-thread/agent-entry'
import { formatOfferingPrice } from '@/modules/catalog/public'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { DiscoveryListingBoundaryLine } from './discovery-files'
import {
  OperationMarketAnonymousBoundaryLine,
  OperationMarketIdempotencyLine,
  OperationMarketInvokeScopeLine,
} from './offering-discovery-file'
import { safePublicText } from './manifest-projection'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { AGENT_ACCESS_OAUTH_PATHS } from '@/modules/agent-access/oauth-state'
import { operationRouteExamples } from './operation-contract'
import {
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_DETAIL_PATH,
  OPERATION_MARKET_INSPECT_PLAN_PATH,
  OPERATION_MARKET_SEARCH_PATH,
} from '@/modules/registry/operation-entry'

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
  const routes = operationRouteExamples()
  const routeFor = (actionId: string) => {
    const route = routes.find((candidate) => candidate.route.actionId === actionId)
    if (route === undefined) throw new Error(`Operation route is not registered: ${actionId}`)
    return route
  }
  const invoke = routeFor(OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId)
  const status = routeFor(OPERATION_INVOKE_ROUTE_CONTRACT.status.actionId)
  const reconcile = routeFor(OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.actionId)
  const cli = 'npm run -s ae --'
  return [
    '# Agentic Economy — Operation market loop',
    '',
    '1. No-install Step 1: read the raw machine handshake.',
    `   \`curl -fsSL ${base}/.well-known/ucp\``,
    '2. Search a job anonymously with the repo-local CLI or the public POST route.',
    `   Set \`AE_CLI_BASE_URL=${base}\`, then run \`${cli} search "<job>" --json\` or \`POST ${base}${OPERATION_MARKET_SEARCH_PATH}\`.`,
    `3. Inspect one exact result with \`${cli} inspect "$AE_OPERATION_REF" --json\` or \`POST ${base}${OPERATION_MARKET_DETAIL_PATH}\`; read its inputs, terms, price, effects, availability, and evidence.`,
    `4. Optionally compare exact candidates with \`${cli} compare "$AE_OPERATION_REF_1" "$AE_OPERATION_REF_2" --json\` or \`POST ${base}${OPERATION_MARKET_COMPARE_PATH}\`; inspect a bounded composition with \`${cli} inspect-plan "$AE_OPERATION_REF_1" "$AE_OPERATION_REF_2" --json\` or \`POST ${base}${OPERATION_MARKET_INSPECT_PLAN_PATH}\`.`,
    '5. After exact detail, choose the qualified direct-keyless MCP lane only when that current Operation advertises the anonymous execute continuation; no caller key is needed for that lane.',
    `6. Otherwise run \`${cli} connect --json\` and complete the OAuth device flow.`,
    `7. Invoke with \`${cli} invoke "$AE_OPERATION_REF" "$AE_INPUT_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json\` (\`${invoke.route.method} ${base}${invoke.route.path}\`).`,
    `8. Read \`${cli} status "$AE_INVOCATION_REF" --json\` (\`${status.route.method} ${base}${status.route.path}\`).`,
    `9. Recover uncertain work with \`${cli} recover "$AE_INVOCATION_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json\` (\`${reconcile.route.method} ${base}${reconcile.route.path}\`).`,
    '',
    OperationMarketAnonymousBoundaryLine,
    'The controlled invoke, status, and recovery path requires one owner-approved AE caller key; qualified direct-keyless MCP execution does not.',
    `Connect uses \`${base}${AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization}\`, owner approval at \`${base}${AGENT_ACCESS_OAUTH_PATHS.deviceVerification}?user_code=...\`, and \`${base}${AGENT_ACCESS_OAUTH_PATHS.token}\`.`,
    'The key identifies the caller; it never contains provider credentials or silently grants payment or consequential authority.',
    OperationMarketInvokeScopeLine,
    OperationMarketIdempotencyLine,
    '',
    '## Boundary',
    '',
    DiscoveryListingBoundaryLine,
    'Never infer fulfilment, payment, deployment, or a receipt from discovery, a caller key, or a pending invocation.',
    'Business reads are business-only: `/api/businesses`, `registry.search`, and `registry.detail` describe published businesses and offering portfolios. They do not select an admitted Market Operation. An Agent Service means one admitted Market Operation.',
    '',
    '## Problem responses and retry rules',
    '',
    '- Errors use `application/problem+json` with `type`, `title`, `status`, `kind`, `code`, and optional `retryable`.',
    '- If `retryable` is true, respect `Retry-After` when present and retry only the same material command identity.',
    '- A timeout, `outcome_unknown`, or `reconciliation_required` is not permission to create a new invocation; read status, then recover with the same key.',
    '- Never retry authentication, validation, authority, or idempotency-conflict problems without changing the invalid input or authority state.',
    '',
    '## More',
    '',
    `- \`${base}/llms.txt\` — the public Operation index`,
    `- \`${base}/SKILL.md\` — the full Operation procedure`,
    `- \`${base}/.well-known/ucp\` — the raw no-install machine handshake`,
    `- \`${base}/for-agents\` — the machine guide when requested as markdown`,
    '',
  ].join('\n')
}

export function buildForAgentsMarkdown(options: AgentPageMarkdownOptions): string {
  const base = trimTrailingSlashes(options.canonicalBaseUrl)
  const cli = 'npm run -s ae --'
  const invoke = operationRouteExamples().find(({ route }) => route.actionId === OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId)
  if (invoke === undefined) throw new Error('Operation invoke route is not registered')
  return [
    '# Agentic Economy — machine guide',
    '',
    '## Step 1 — no install',
    '',
    `Read the raw machine handshake first: \`curl -fsSL ${base}/.well-known/ucp\`.`,
    'It is the canonical source for current routes, action IDs, POST inputJsonSchema values, and schema-valid examples. Do not infer a request body from prose.',
    OperationMarketAnonymousBoundaryLine,
    OperationMarketInvokeScopeLine,
    '',
    '## MCP lifecycle',
    '',
    `Use the installed Streamable HTTP MCP SDK with protocol \`${MCP_LATEST_PROTOCOL_VERSION}\`: connect to \`${base}/mcp\`, complete \`initialize\` then \`notifications/initialized\`, call \`tools/list\` before \`tools/call\`, and close the transport when finished.`,
    '',
    '## Step 2 — use the repo-local CLI',
    '',
    `The executable entrypoint in this repository is \`${cli}\`; no bare \`ae\` command is assumed.`,
    '',
    '```sh',
    `export AE_CLI_BASE_URL="${base}"`,
    `${cli} search "weather forecast" --json`,
    `${cli} inspect "$AE_OPERATION_REF" --json`,
    `${cli} compare "$AE_OPERATION_REF_1" "$AE_OPERATION_REF_2" --json`,
    `${cli} inspect-plan "$AE_OPERATION_REF_1" "$AE_OPERATION_REF_2" --json`,
    `${cli} connect --json`,
    `export AE_IDEMPOTENCY_KEY="invoice-extract-2026-08-11-001"`,
    `${cli} invoke "$AE_OPERATION_REF" "$AE_INPUT_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json`,
    `${cli} status "$AE_INVOCATION_REF" --json`,
    `${cli} recover "$AE_INVOCATION_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json`,
    '```',
    '',
    `POST body example (action-derived): \`${JSON.stringify(invoke.example.http.body)}\`.`,
    OperationMarketIdempotencyLine,
    '',
    '## Problem responses and retry rules',
    '',
    '- Parse `application/problem+json`; use `kind` and `code` for branching, not human text.',
    '- Retry only when `retryable: true`, respecting `Retry-After`, and preserve the same operation, input, and idempotency key.',
    '- On an unknown outcome, read status and then recover; never create a second invocation to guess.',
    '',
    '## Advanced only',
    '',
    `Cancellation is an advanced operator action: use \`${cli} advanced cancel\` only when the manifest and current status direct you there. Use the root \`${cli} recover\` command for reconciliation.`,
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
    ? '# Published businesses'
    : `# Published businesses matching "${oneLine(options.query)}"`

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
    `Start a request with \`${ANSWER_THREAD_AGENT_ENTRYPOINT.method} ${base}${ANSWER_THREAD_AGENT_ENTRYPOINT.path}\` — no key needed; send a fresh opaque \`X-AE-Turn-Key\` for every turn.`,
    '',
  ].join('\n')
}

export function buildBusinessMarkdown(
  business: PublicBusinessCatalogApiV2Dto,
  options: AgentPageMarkdownOptions,
): string {
  const context = businessContextLabel(business.businessContext)
  const base = trimTrailingSlashes(options.canonicalBaseUrl)
  return [
    `# ${oneLine(business.name)}`,
    '',
    `- Category: ${oneLine(business.category)}`,
    `- Where: ${oneLine(context)}`,
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
    `To act on this, start at \`${ANSWER_THREAD_AGENT_ENTRYPOINT.method} ${base}${ANSWER_THREAD_AGENT_ENTRYPOINT.path}\` — no key needed; send a fresh opaque \`X-AE-Turn-Key\` for every turn.`,
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
    `- \`${ANSWER_THREAD_AGENT_ENTRYPOINT.method} ${base}${ANSWER_THREAD_AGENT_ENTRYPOINT.path}\` — ask for an outcome, no key needed; send a fresh opaque \`X-AE-Turn-Key\` for every turn`,
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
  const context = businessContextLabel(business.businessContext)
  const price = business.offerings.find((offering) => offering.price !== undefined)?.price
  return `| ${oneLine(business.name)} | ${oneLine(business.category)} | ${oneLine(context)} | ${offerings.length === 0 ? '—' : offerings.join(', ')} | ${price === undefined ? '—' : oneLine(formatOfferingPrice(price))} | ${base}/${business.slug} |`
}

/** Table cells and headings break on a newline or a stray pipe. */
function oneLine(value: string): string {
  return safePublicText(value).replace(/\s+/gu, ' ').replaceAll('|', '/').trim()
}
function businessContextLabel(context: BusinessContext): string {
  return context.kind === 'local_human'
    ? `${context.suburb}, ${context.stateTerritory}`
    : `${context.providerIdentifier} (${context.website})`
}
