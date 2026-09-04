import { ABOUT } from '@/content/brand-copy'
import { MCP_LATEST_PROTOCOL_VERSION } from '@/lib/mcp-protocol'
import {
  AE_MCP_WHOAMI_TOOL_NAME,
  aeMcpAuthenticateInstruction,
  aeMcpInstallCommand,
} from '@/lib/cli-distribution'
import type { BusinessContext } from '@/modules/business/public'
import { formatOfferingPrice } from '@/modules/catalog/public'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { DiscoveryListingBoundaryLine } from './discovery-files'
import {
  OperationMarketInvokeScopeLine,
} from './offering-discovery-file'
import { safePublicText } from './manifest-projection'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { AGENT_ACCESS_OAUTH_PATHS } from '@/modules/agent-access/oauth-state'
import { operationRouteExamples } from './operation-contract'
import {
  OPERATION_MARKET_DESCRIBE_PATH,
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
  const cli = 'ae'
  return [
    '# Agentic Economy',
    '',
    `1. Search by outcome: \`${cli} search "<job>" --base-url "${base}" --json\` or \`POST ${base}${OPERATION_MARKET_SEARCH_PATH}\`.`,
    `2. Describe one result: \`${cli} describe "$AE_OPERATION_REF" --base-url "${base}" --json\` or \`POST ${base}${OPERATION_MARKET_DESCRIBE_PATH}\`. Catalog health and price are indicative.`,
    `3. Call \`operation.inspect\` with the exact input. If challenged, the official MCP client completes native OAuth; direct CLI callers run \`${cli} connect --base-url "${base}"\` once. Then repeat the inspection.`,
    `4. Invoke only with the returned Commitment through \`${invoke.route.method} ${base}${invoke.route.path}\`.`,
    `5. Keep the receipt: \`${cli} status "$AE_INVOCATION_REF" --base-url "${base}" --json\` (\`${status.route.method} ${base}${status.route.path}\`). If the receipt explicitly requires reconciliation, use \`${cli} recover\` against \`${reconcile.route.method} ${base}${reconcile.route.path}\`.`,
    '',
    'List, search, describe, compare, and eligible free keyless reads are public. Caller-specific inspection and invocation use one owner-approved connection.',
    `Connect uses \`${base}${AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization}\`, owner approval at \`${base}${AGENT_ACCESS_OAUTH_PATHS.deviceVerification}?user_code=...\`, and \`${base}${AGENT_ACCESS_OAUTH_PATHS.token}\`.`,
    'The key identifies the caller; it never contains provider credentials or silently grants payment or consequential authority.',
    OperationMarketInvokeScopeLine,
    'The low-level API requires an `idempotencyKey` in write request bodies; the CLI creates and retains it automatically.',
    '',
    '## Boundary',
    '',
    'Provider and publication records are supporting metadata. Only independently callable Operations appear as capabilities.',
    'Never infer fulfilment, payment, deployment, or a receipt from discovery, a caller key, or a pending invocation.',
    'An Operation is the callable unit. Provider and publication records do not select or execute work.',
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
    `- \`${base}/.well-known/ucp\` — the raw machine contract`,
    `- \`${base}/for-agents\` — the machine guide when requested as markdown`,
    `- \`${base}/about\` — what AE is, for people`,
    `- \`${base}/market\` — the live Operation catalogue`,
    '',
  ].join('\n')
}

export function buildForAgentsMarkdown(options: AgentPageMarkdownOptions): string {
  const base = trimTrailingSlashes(options.canonicalBaseUrl)
  const cli = 'ae'
  const invoke = operationRouteExamples().find(({ route }) => route.actionId === OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId)
  if (invoke === undefined) throw new Error('Operation invoke route is not registered')
  return [
    '# Agentic Economy — machine guide',
    '',
    '## Native MCP connection',
    '',
    'Codex:',
    '```sh',
    aeMcpInstallCommand(base, 'codex'),
    '```',
    aeMcpAuthenticateInstruction('codex'),
    '',
    'Claude Code:',
    '```sh',
    aeMcpInstallCommand(base, 'claude-code'),
    '```',
    aeMcpAuthenticateInstruction('claude-code'),
    '',
    'Cursor:',
    '```sh',
    aeMcpInstallCommand(base, 'cursor'),
    '```',
    aeMcpAuthenticateInstruction('cursor'),
    '',
    `Public discovery works before authentication. After approval, call \`${AE_MCP_WHOAMI_TOOL_NAME}\` and report the connected Agent Principal and Account. Never ask the human to copy a key.`,
    '',
    '## One-command activation',
    '',
    `Run \`ae call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --base-url "${base}"\` after public search and inspect. Eligible free keyless reads execute immediately through the official MCP client. If the CLI returns \`agent_access_key_required\`, run \`ae connect --base-url "${base}"\` once and repeat the same call.`,
    'No account or funding is required for an eligible anonymous call. Browser approval stores one origin-bound key only when the selected capability requires it.',
    '',
    '## MCP lifecycle',
    '',
    `Use the installed official MCP SDK with protocol \`${MCP_LATEST_PROTOCOL_VERSION}\` at \`${base}/mcp\`. Client connect performs initialization. This server is stateless and may omit \`Mcp-Session-Id\`; call \`tools/list\` before \`tools/call\`, then close the client transport. Malformed JSON-RPC requests return protocol errors; valid tool calls with invalid tool arguments return \`isError\` tool results.`,
    '',
    '## Search, inspect, call, receipt',
    '',
    `The canonical executable is \`${cli}\`.`,
    '',
    '```sh',
    `${cli} search "weather forecast" --base-url "${base}" --json`,
    `${cli} inspect "$AE_OPERATION_REF" --base-url "${base}" --json`,
    `${cli} call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --base-url "${base}" --wait`,
    `${cli} status "$AE_INVOCATION_REF" --base-url "${base}" --json`,
    '```',
    '',
    `POST body example (action-derived): \`${JSON.stringify(invoke.example.http.body)}\`.`,
    'The low-level POST body carries `idempotencyKey`; the CLI creates and retains it automatically.',
    '',
    '## Problem responses and retry rules',
    '',
    '- Parse `application/problem+json`; use `kind` and `code` for branching, not human text.',
    '- Retry only when `retryable: true`, respecting `Retry-After`, and preserve the same operation, input, and idempotency key.',
    '- On an unknown outcome, read status and then recover; never create a second invocation to guess.',
    '',
    '## Safe recovery',
    '',
    `Use \`${cli} cancel\` only when the current receipt offers cancellation. Use \`${cli} recover\` only when that receipt requires reconciliation.`,
    '',
  ].join('\n')
}

export function buildAboutMarkdown(options: AgentPageMarkdownOptions): string {
  const base = trimTrailingSlashes(options.canonicalBaseUrl)
  return [
    '# About Agentic Economy',
    '',
    ABOUT.heading,
    '',
    ABOUT.subhead,
    '',
    '## Agents and suppliers',
    '',
    `- Agents: \`${base}/for-agents\``,
    `- Suppliers: \`${base}/for-providers\``,
    `- Live catalog: \`${base}/market\``,
    '',
    ABOUT.suppliersBody,
    '',
    '## Machine files',
    '',
    `- \`${base}/llms.txt\``,
    `- \`${base}/SKILL.md\``,
    `- \`${base}/.well-known/ucp\``,
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
    `Find callable Operations in the catalogue at \`${base}/market\`, through \`POST ${base}${OPERATION_MARKET_SEARCH_PATH}\`, with MCP at \`${base}/mcp\`, or with \`ae search "<job>" --base-url "${base}" --json\`.`,
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
    `Find callable Operations in the catalogue at \`${base}/market\`, through \`POST ${base}${OPERATION_MARKET_SEARCH_PATH}\`, with MCP at \`${base}/mcp\`, or with \`ae search "<job>" --base-url "${base}" --json\`.`,
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
    `- \`GET ${base}/market\` — browse the Operation catalogue`,
    `- \`POST ${base}${OPERATION_MARKET_SEARCH_PATH}\` — search callable Operations`,
    `- \`POST ${base}${OPERATION_MARKET_DESCRIBE_PATH}\` — describe one Operation`,
    `- \`${base}/mcp\` — use the Operation MCP surface`,
    `- \`ae search "<job>" --base-url "${base}" --json\` — use the Operation CLI`,
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
