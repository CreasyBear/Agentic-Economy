import type { BuildDiscoveryFileOptions, DiscoveryFileBuildResult } from '@/modules/discovery/public'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_DETAIL_PATH,
  OPERATION_MARKET_INSPECT_PLAN_PATH,
  OPERATION_MARKET_SEARCH_PATH,
} from '@/modules/registry/operation-paths'

export const DiscoveryPublicSurfacePaths = [
  '/',
  '/for-agents',
  '/for-providers',
  '/privacy/remove-business',
  '/.well-known/ucp',
  '/api/businesses',
  OPERATION_MARKET_SEARCH_PATH,
  OPERATION_MARKET_DETAIL_PATH,
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_INSPECT_PLAN_PATH,
] as const

/** Published business portfolios remain facts only; Operation execution has a separate exact-detail boundary. */
export const DiscoveryListingBoundaryLine =
  'Provider and publication facts are supporting metadata. Only independently callable Operations appear in the capability catalogue.'

/** Public loop copy shared by the machine-readable discovery surfaces. */
export const OperationMarketAnonymousBoundaryLine =
  'Public: search, inspect, and eligible free keyless read calls. Connect only when a call reports agent_access_key_required.'
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
    `2. Inspect one exact result: \`${cli} inspect "$AE_OPERATION_REF" --base-url "${canonicalBaseUrl}" --json\` (\`POST ${canonicalBaseUrl}${OPERATION_MARKET_DETAIL_PATH}\`).`,
    `3. Call it: \`${cli} call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --base-url "${canonicalBaseUrl}" --wait\`. Eligible free keyless reads use the official MCP client.`,
    `4. Connect only if the call reports \`agent_access_key_required\`: \`npx @agentic-economy/cli connect --base-url "${canonicalBaseUrl}" --mcp\`, then repeat the same call through \`${invoke.method} ${canonicalBaseUrl}${invoke.path}\`.`,
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

const offeringLlmsSampleLimit = 12
const offeringLlmsByteCeiling = 4096

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
      `${canonicalBaseUrl}/api/businesses/${slug}`,
    ]),
  ])]
}

/** Durable Offering-based assistant index with a bounded inline sample. */
export function buildOfferingLlmsTxt(
  businesses: readonly PublicBusinessCatalogApiV2Dto[],
  options: BuildDiscoveryFileOptions & { totalBusinesses?: number },
): DiscoveryFileBuildResult {
  const canonicalBaseUrl = trimTrailingSlashes(options.canonicalBaseUrl)
  const urls = buildOfferingLlmsUrlsFromSlugs(businesses.map((business) => business.slug), options)
  const beforeSample = [
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
    'Published businesses (business catalog; never Agent Services):',
  ]
  const afterSample = [
    `- full list=${canonicalBaseUrl}/api/businesses`,
    `- total=${options.totalBusinesses ?? businesses.length}; the lines above are a bounded sample`,
    '',
    'Boundary:',
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
    if (sample.length > 0 && framingBytes + sampleBytes + cost > offeringLlmsByteCeiling) break
    sampleBytes += cost
    sample.push(line)
  }
  return {
    body: [...beforeSample, ...(sample.length === 0 ? ['- none'] : sample), ...afterSample].join('\n'),
    urls,
  }
}
