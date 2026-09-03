import type { BuildDiscoveryFileOptions, DiscoveryFileBuildResult } from '@/modules/discovery/public'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_DESCRIBE_PATH,
  OPERATION_MARKET_LIST_PATH,
  OPERATION_MARKET_SEARCH_PATH,
} from '@/modules/registry/operation-paths'

export const DiscoveryPublicSurfacePaths = [
  '/',
  '/market',
  '/for-agents',
  '/for-providers',
  '/about',
  '/support',
  '/status',
  '/privacy/remove-business',
  '/.well-known/ucp',
  '/SKILL.md',
  '/llms.txt',
  '/robots.txt',
  '/sitemap.xml',
  OPERATION_MARKET_SEARCH_PATH,
  OPERATION_MARKET_LIST_PATH,
  OPERATION_MARKET_DESCRIBE_PATH,
  OPERATION_MARKET_COMPARE_PATH,
] as const

/** Supporting provider facts never become executable merely because they are published. */
export const DiscoveryListingBoundaryLine =
  'Provider and publication facts are supporting metadata. The Operation catalogue is the canonical market.'

/** Public loop copy shared by the machine-readable discovery surfaces. */
export const OperationMarketAnonymousBoundaryLine =
  'Public: list, search, describe, and compare. Connect only when operation.inspect returns the OAuth challenge.'
export const OperationMarketIdempotencyLine =
  'The low-level write API requires `idempotencyKey`; the CLI creates and retains it automatically.'
export const OperationMarketInvokeScopeLine = `Required invoke scope: \`${OPERATION_INVOKE_ROUTE_CONTRACT.scope}\`.`

/** Public route order and authority boundary for the machine-readable index. */
export function operationMarketLines(canonicalBaseUrl: string): readonly string[] {
  const { invoke, status } = OPERATION_INVOKE_ROUTE_CONTRACT
  const cli = 'ae'
  return [
    '## Capability market loop',
    '',
    `1. Search by outcome: \`${cli} search "weather forecast" --base-url "${canonicalBaseUrl}" --json\` (\`POST ${canonicalBaseUrl}${OPERATION_MARKET_SEARCH_PATH}\`).`,
    `2. Describe one exact result: \`${cli} describe "$AE_OPERATION_REF" --base-url "${canonicalBaseUrl}" --json\` (\`POST ${canonicalBaseUrl}${OPERATION_MARKET_DESCRIBE_PATH}\`).`,
    `3. Call \`operation.inspect\` with the exact Operation and input. Complete its continuation or required action, then inspect again.`,
    `4. Invoke only with the returned Commitment through \`${invoke.method} ${canonicalBaseUrl}${invoke.path}\`.`,
    `5. Keep the receipt: \`${cli} status "$AE_INVOCATION_REF" --base-url "${canonicalBaseUrl}" --json\` (\`${status.method} ${canonicalBaseUrl}${status.path}\`). Use cancel or recover only when that receipt offers the action.`,
    '',
    OperationMarketAnonymousBoundaryLine,
    'The AE key identifies the caller. It never contains provider credentials or silently grants payment or consequential authority.',
    OperationMarketInvokeScopeLine,
    'The low-level write API requires `idempotencyKey`; the CLI creates and retains it automatically.',
    'Never infer fulfilment, payment, deployment, or a receipt from discovery, a caller key, or a pending invocation.',
    '',
    'Retry only when retryable=true; unknown outcomes require status then reconcile.',
  ]
}

export function buildOfferingLlmsUrlsFromSlugs(
  slugs: readonly string[],
  options: BuildDiscoveryFileOptions,
): readonly string[] {
  const canonicalBaseUrl = trimTrailingSlashes(options.canonicalBaseUrl)
  return [...new Set([
    ...DiscoveryPublicSurfacePaths.map((path) => `${canonicalBaseUrl}${path}`),
    ...slugs.map((slug) => `${canonicalBaseUrl}/${slug}`),
  ])]
}

/** Compact Operation-first assistant index. Business pages remain human-readable supporting facts. */
export function buildOfferingLlmsTxt(
  businesses: readonly PublicBusinessCatalogApiV2Dto[],
  options: BuildDiscoveryFileOptions & { totalBusinesses?: number },
): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlashes(options.canonicalBaseUrl)
  const urls = buildOfferingLlmsUrlsFromSlugs(businesses.map((business) => business.slug), options)
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
    'Canonical catalogue:',
    `- Human: ${canonicalBaseUrl}/market`,
    `- Machine search: POST ${canonicalBaseUrl}${OPERATION_MARKET_SEARCH_PATH}`,
    `- Browse: POST ${canonicalBaseUrl}${OPERATION_MARKET_LIST_PATH}`,
    `- Exact description: POST ${canonicalBaseUrl}${OPERATION_MARKET_DESCRIBE_PATH}`,
    '',
    'Boundary:',
    `- ${DiscoveryListingBoundaryLine}`,
    '',
    'Privacy and correction:',
    `- ${canonicalBaseUrl}/privacy/remove-business`,
    '',
  ]
  return {
    body: body.join('\n'),
    urls,
  }
}
